\set ON_ERROR_STOP on
\ir team-access-dataset-masters.sql
alter table tally_bridge_commands add column result jsonb;
alter table bank_accounts add column tally_connection_id uuid,add column tally_ledger_name text;
create table bank_transactions(id uuid primary key,owner_user_id uuid,bank_account_id uuid,statement_import_id uuid,
 transaction_date date,description text,reference_number text,debit_amount numeric,credit_amount numeric,transaction_type text,
 fingerprint text,tally_status text,confirmed_ledger_name text,ledger_mapping_source text,tally_posted_at timestamptz,tally_voucher_id text);
create table bank_transaction_posting_log(owner_user_id uuid,bank_account_id uuid,connection_id uuid,source_transaction_id uuid,
 fingerprint text,transaction_date date,reference_number text,description text,debit_amount numeric,credit_amount numeric,amount numeric,
 voucher_type text,bank_ledger_name text,counterparty_ledger_name text,command_id uuid,status text,error text,result jsonb,tally_voucher_id text,tally_posted_at timestamptz,
 unique(owner_user_id,bank_account_id,fingerprint));
\ir ../../supabase/migrations/20260905071727_team_access_bank_queue.sql
do $$ declare actor uuid:='44444444-4444-4444-4444-444444444444'; creator uuid:='22222222-2222-2222-2222-222222222222';
 company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100';
 acct uuid:='aaaaaaaa-1111-1111-1111-111111111111'; tx uuid:='aaaaaaaa-2222-2222-2222-222222222222'; tx2 uuid:='aaaaaaaa-2222-2222-2222-222222222223';
 ds uuid; payload jsonb; batch jsonb; bad jsonb; output jsonb; outcome jsonb; cmd uuid; count_before integer;
begin
 update tally_connections set session_generation=7 where id=conn;
 update access_roles set permissions=array['connections.manage','bank.view','bank.prepare','bank.post'] where id='66666666-6666-6666-6666-666666666666';
 update access_members set status='active',modules=array['bank'] where user_id=actor and organization_id='org-a';
 select id into ds from access_master_datasets where connection_id=conn and financial_year='2026-27';
 insert into access_dataset_masters(dataset_id,master_type,master_key,tally_name,parent_name) values(ds,'ledger','ledger:bank','Bank A','Bank Accounts');
 insert into bank_accounts(id,owner_user_id,tally_ledger_name) values(acct,creator,'Bank A');
 insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence)
 values('bank_account',acct,'org-a',company,creator,'Synthetic reviewed account');
 insert into bank_transactions values(tx,creator,acct,null,'2026-09-05','Payment fixture','TEST',100,0,'payment','fingerprint-1','pending',null,null,null,null);
 payload:=jsonb_build_object('transactionId',tx,'bankAccountId',acct,'fingerprint','fingerprint-1','voucherDate','2026-09-05','companyName','Company A',
  'narration','Payment fixture','referenceNumber','TEST','bankLedgerName','Bank A','counterpartyLedgerName','Supplier A','amount',100,
  'expectedDirection','outgoing','voucherType','Payment','bankLedgerEntryIsDebit',false,'billAllocations','[]'::jsonb);
 batch:=jsonb_build_array(jsonb_build_object('command_type','post_bank_voucher','payload',payload));
 begin perform access_enqueue_bank_batch(actor,'org-b',company,ds,7,batch,'[]');raise exception 'Cross-org queue accepted';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_bank_batch(actor,'org-a',company,ds,8,batch,'[]');raise exception 'Wrong session queued';exception when insufficient_privilege then null;end;
 bad:=jsonb_build_array(jsonb_build_object('command_type','post_bank_voucher','payload',payload||'{"voucherType":"Receipt","bankLedgerEntryIsDebit":true}'));
 begin perform access_enqueue_bank_batch(actor,'org-a',company,ds,7,bad,'[]');raise exception 'Swapped direction queued';exception when invalid_parameter_value then null;end;
 -- The second invalid command must roll back the first command and posting log.
 select count(*) into count_before from tally_bridge_commands;
 begin perform access_enqueue_bank_batch(actor,'org-a',company,ds,7,batch||bad,'[]');raise exception 'Invalid mixed batch accepted';exception when serialization_failure or invalid_parameter_value then null;end;
 if (select count(*) from tally_bridge_commands)<>count_before or exists(select 1 from bank_transaction_posting_log where source_transaction_id=tx) then raise exception 'Partial queue visible';end if;
 output:=access_enqueue_bank_batch(actor,'org-a',company,ds,7,batch,'[]');cmd:=(output->0->>'id')::uuid;
 if (select owner_user_id from tally_bridge_commands where id=cmd)=actor or (select owner_user_id from bank_transaction_posting_log where command_id=cmd)<>creator then raise exception 'Actor/paired/creator namespaces mixed';end if;
 begin perform access_enqueue_bank_batch(actor,'org-a',company,ds,7,batch,'[]');raise exception 'Duplicate queue accepted';exception when serialization_failure then null;end;
 begin update bank_transactions set debit_amount=200 where id=tx;raise exception 'Queued financial edit allowed';exception when object_not_in_prerequisite_state then null;end;
 update tally_bridge_commands set status='claimed' where id=cmd;
 update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
 outcome:='{"success":true,"status":"posted","voucherId":"v-1","result":{"voucherId":"v-1"}}';
 perform access_complete_bank_command(cmd,conn,'synthetic-hash',outcome);
 perform access_complete_bank_command(cmd,conn,'synthetic-hash',outcome);
 begin perform access_complete_bank_command(cmd,conn,'synthetic-hash',outcome||'{"voucherId":"v-2"}');raise exception 'Conflicting result accepted';exception when serialization_failure then null;end;
 if (select tally_status from bank_transactions where id=tx)<>'posted' or (select status from bank_transaction_posting_log where command_id=cmd)<>'posted' then raise exception 'Result lost after suspension';end if;
 if (select count(*) from access_audit where action='bank.result' and target_id=tx::text)<>1 then raise exception 'Duplicate audit';end if;
 -- Suspension before dispatch blocks a second entry.
 update access_members set status='active' where organization_id='org-a' and user_id=actor;
 insert into bank_transactions values(tx2,creator,acct,null,'2026-09-05','Payment fixture','TEST',100,0,'payment','fingerprint-2','pending',null,null,null,null);
 payload:=payload||jsonb_build_object('transactionId',tx2,'fingerprint','fingerprint-2');
 output:=access_enqueue_bank_batch(actor,'org-a',company,ds,7,jsonb_build_array(jsonb_build_object('command_type','post_bank_voucher','payload',payload)),'[]');cmd:=(output->0->>'id')::uuid;
 update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
 begin update tally_bridge_commands set status='claimed' where id=cmd;raise exception 'Revoked bank post dispatched';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','access_bank_queue_transactions','select') or has_function_privilege('authenticated','access_enqueue_bank_batch(uuid,text,uuid,uuid,bigint,jsonb,jsonb)','execute') then raise exception 'Public bank bypass';end if;
end $$;
select 'Shared bank queue atomicity, source lock, direction, revocation and completion tests passed' as result;
