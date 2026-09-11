\set ON_ERROR_STOP on
\ir team-access-dispatch-identity.sql
alter table public.tally_connections add column if not exists bridge_token_hash text;
alter table public.tally_connections add column if not exists organization_id text;
alter table public.tally_bridge_commands add column if not exists result jsonb;
alter table public.tally_bridge_commands add column if not exists completed_at timestamptz;
-- The optional historical table may be absent while additive SQL is installed.
\ir ../../supabase/migrations/20260905074815_team_access_discount_writes.sql
create table public.debit_note_proposals(
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null,connection_id uuid,company_name text,financial_year text,
 party_ledger_name text not null,party_gstin text,linked_invoice_number text,linked_invoice_date date,original_invoice_amount numeric,
 recoverable_amount numeric not null,reason_code text,narration text,gst_mode text,debit_note_date date,status text,
 customer_snapshot jsonb,party_email text,party_phone text,party_contact_person text,party_address text,cash_discount_rule_name text,
 discount_deadline date,receipt_date date,amount_received numeric,approval_by uuid,approved_at timestamptz,tally_command_id uuid,
 tally_voucher_guid text,tally_voucher_id text,tally_voucher_number text,tally_voucher_date date,tally_open_reference_name text,
 remaining_recoverable_amount numeric,created_in_tally_at timestamptz,last_synced_from_tally_at timestamptz,last_error text,
 created_at timestamptz default now(),updated_at timestamptz default now(),access_organization_id text,access_company_id uuid
);
do $$ declare actor uuid:=gen_random_uuid(); paired uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); company uuid:=gen_random_uuid();conn uuid:=gen_random_uuid();
 result jsonb; payload jsonb; command uuid; proposal uuid; outcome jsonb; before_count integer;
begin
 insert into auth.users values(actor),(paired);
 insert into access_organizations(id,name) values('discount-org','Synthetic discounts');
 insert into access_roles(id,organization_id,name,permissions) values(r,'discount-org','Poster',array['discounts.view','discounts.prepare','discounts.approve','discounts.post']);
 insert into access_companies(id,organization_id,name,erp_identity) values(company,'discount-org','Same name','guid:2026-27');
 insert into access_members(organization_id,user_id,role_id,display_name,email,modules,company_ids)
 values('discount-org',actor,r,'Poster','poster@example.test',array['discounts'],array[company]);
 insert into tally_connections(id,owner_user_id,organization_id,installation_id,session_generation,bridge_token_hash)
 values(conn,paired,'discount-org','discount-pc',3,'synthetic-hash');
 insert into access_company_links values('discount-org',company,conn,'discount-pc','guid','2026-27',now(),'Synthetic');
 payload:='{"partyLedgerName":"Party","linkedInvoiceNumber":"INV1","linkedInvoiceDate":"2026-08-01","voucherDate":"2026-09-05","salesLedgerName":"Sales","amount":100,"referenceNumber":"DN-1","narration":"Synthetic"}';
 begin perform access_enqueue_discount(actor,'discount-org',company,conn,'wrong-pc',3,'guid','2026-27',payload);raise exception 'Wrong PC accepted';exception when insufficient_privilege then null;end;
 result:=access_enqueue_discount(actor,'discount-org',company,conn,'discount-pc',3,'guid','2026-27',payload);
 command:=(result#>>'{command,id}')::uuid;proposal:=(result->>'proposalId')::uuid;
 assert (select owner_user_id from tally_bridge_commands where id=command)=paired,'paired owner changed';
 assert (select owner_user_id from debit_note_proposals where id=proposal)=actor,'financial creator changed';
 assert exists(select 1 from access_resource_scopes where resource_id=proposal and company_id=company),'proposal scope missing';
 begin perform access_enqueue_discount(actor,'discount-org',company,conn,'discount-pc',3,'guid','2026-27',payload);raise exception 'Duplicate queued';exception when serialization_failure then null;end;
 outcome:='{"success":true,"voucherId":"123","voucherNumber":"DN-1","voucherDate":"2026-09-05","possibleDuplicateInTally":false}';
 begin perform access_complete_discount(command,conn,'synthetic-hash',outcome);raise exception 'Unissued callback accepted';exception when object_not_in_prerequisite_state then null;end;
 update debit_note_proposals set recoverable_amount=200 where id=proposal;
 begin update tally_bridge_commands set status='claimed' where id=command;raise exception 'Changed financial source issued';exception when insufficient_privilege then null;end;
 update debit_note_proposals set recoverable_amount=100 where id=proposal;
 update tally_bridge_commands set status='claimed' where id=command;
 update access_members set status='suspended' where user_id=actor;
 begin perform access_complete_discount(command,conn,'wrong-hash',outcome);raise exception 'Wrong callback token accepted';exception when insufficient_privilege then null;end;
 result:=access_complete_discount(command,conn,'synthetic-hash',outcome);
 assert result->>'status'='succeeded','issued outcome lost after revocation';
 assert (select status from debit_note_proposals where id=proposal)='created_in_tally','proposal not finalized';
 perform access_complete_discount(command,conn,'synthetic-hash',outcome);
 assert (select count(*) from access_audit where action='discount.result' and target_id=proposal::text)=1,'duplicate audit';
 begin perform access_complete_discount(command,conn,'synthetic-hash',outcome||'{"voucherId":"other"}');raise exception 'Conflicting callback accepted';exception when serialization_failure then null;end;
 begin perform access_enqueue_discount(actor,'discount-org',company,conn,'discount-pc',3,'guid','2026-27',payload||'{"referenceNumber":"DN-2"}');raise exception 'Suspended actor queued';exception when insufficient_privilege then null;end;
 assert not has_function_privilege('authenticated','access_complete_discount(uuid,uuid,text,jsonb)','execute'),'client callback bypass';
 assert not has_table_privilege('authenticated','access_discount_commands','select'),'client authority disclosure';
end $$;
select 'Discount scope, source revision, idempotency, dispatch and post-revocation completion passed' as result;
