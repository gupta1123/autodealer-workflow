-- Kalika only. Optional historical proposal tables are checked at execution.
begin;
create table public.access_discount_commands(
 command_id uuid primary key,proposal_id uuid not null,source_digest text not null,
 organization_id text not null,company_id uuid not null,
 foreign key(organization_id,company_id) references public.access_companies(organization_id,id)
);
create index access_discount_commands_proposal on public.access_discount_commands(proposal_id,command_id);
alter table public.access_discount_commands enable row level security;
revoke all on public.access_discount_commands from public,anon,authenticated;
grant select,insert,update,delete on public.access_discount_commands to service_role;

create function public.access_discount_digest(p jsonb) returns text language sql immutable set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_array(p->'party_ledger_name',p->'linked_invoice_number',p->'linked_invoice_date',
 p->'recoverable_amount',p->'debit_note_date',p->'narration',p->'gst_mode',p->'reason_code',p->'connection_id',p->'company_name',
 p#>'{customer_snapshot,sourceSalesLedgerName}')::text,'UTF8')),'hex')
$$;

create function public.access_enqueue_discount(p_actor uuid,p_org text,p_company uuid,p_connection uuid,p_installation text,
 p_generation bigint,p_guid text,p_year text,p_payload jsonb,p_proposal uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c record; p record; cmd public.tally_bridge_commands; cname text; payload jsonb; pid uuid:=coalesce(p_proposal,gen_random_uuid()); amount numeric;
begin
 if to_regclass('public.debit_note_proposals') is null then raise exception 'Discount schema is unavailable' using errcode='55000';end if;
 perform 1 from public.access_organizations where id=p_org for update;
 perform public.access_assert_permission(p_actor,p_org,'discounts.post',p_company);
 if p_proposal is not null then perform public.access_assert_permission(p_actor,p_org,'discounts.approve',p_company);end if;
 select * into c from public.tally_connections where id=p_connection for share;
 if not found or c.revoked_at is not null or c.organization_id is distinct from p_org or c.installation_id is distinct from p_installation
  or c.session_generation is distinct from p_generation then raise exception 'Pairing changed' using errcode='42501';end if;
 if not exists(select 1 from public.access_company_links where organization_id=p_org and company_id=p_company and connection_id=c.id
  and installation_id=p_installation and company_guid=p_guid and financial_year=p_year) then raise exception 'Verified discount dataset required' using errcode='42501';end if;
 select name into cname from public.access_companies where organization_id=p_org and id=p_company;
 if p_proposal is not null then
  if not exists(select 1 from public.access_resource_scopes where resource_type='proposal' and resource_id=pid and organization_id=p_org and company_id=p_company) then
   raise exception 'Proposal is outside company scope' using errcode='42501';end if;
  select * into p from public.debit_note_proposals where id=pid for update;
  if not found or p.connection_id is distinct from c.id or p.company_name is distinct from cname or p.status not in ('draft','pending_approval','failed') then
   raise exception 'Proposal changed or cannot be queued' using errcode='40001';end if;
  payload:=jsonb_build_object('partyLedgerName',p.party_ledger_name,'partyGstin',p.party_gstin,'linkedInvoiceNumber',p.linked_invoice_number,
   'linkedInvoiceDate',p.linked_invoice_date,'voucherDate',p.debit_note_date,'amount',p.recoverable_amount,
   'salesLedgerName',p.customer_snapshot->>'sourceSalesLedgerName','referenceNumber',left('DN-CD-'||coalesce(p.linked_invoice_number,p.id::text),120),
   'narration',p.narration,'reasonCode',p.reason_code,'gstMode',p.gst_mode);
 else
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then raise exception 'Invalid discount payload' using errcode='22023';end if;
  payload:=p_payload - array['xml','tallyUrl','ownerUserId','organizationId','agentIdentity','companyName','proposalId'];
 end if;
 amount:=(payload->>'amount')::numeric;
 if amount is null or amount<=0 or amount>100000000000 or coalesce(length(payload->>'partyLedgerName'),0) not between 1 and 500
  or coalesce(length(payload->>'linkedInvoiceNumber'),0) not between 1 and 120 or coalesce(length(payload->>'salesLedgerName'),0) not between 1 and 500
  or coalesce(length(payload->>'referenceNumber'),0) not between 1 and 120 or (payload->>'voucherDate')::date is null then
  raise exception 'Incomplete discount accounting data' using errcode='22023';end if;
 if exists(select 1 from public.access_discount_commands s join public.access_command_authority a on a.command_id=s.command_id
  join public.debit_note_proposals old on old.id=s.proposal_id where s.organization_id=p_org and s.company_id=p_company
  and lower(old.party_ledger_name)=lower(payload->>'partyLedgerName') and lower(old.linked_invoice_number)=lower(payload->>'linkedInvoiceNumber')
  and a.state in ('queued','issued','uncertain')) then raise exception 'An existing debit note needs completion or verification' using errcode='40001';end if;
 if p_proposal is null then
  if exists(select 1 from public.debit_note_proposals old join public.access_resource_scopes r on r.resource_type='proposal' and r.resource_id=old.id
   where r.organization_id=p_org and r.company_id=p_company and old.status='created_in_tally' and old.connection_id=c.id
    and old.customer_snapshot->>'agentReference'=payload->>'referenceNumber') then
   raise exception 'This discount reversal was already created' using errcode='40001';end if;
  insert into public.debit_note_proposals(id,owner_user_id,connection_id,company_name,financial_year,party_ledger_name,party_gstin,
   linked_invoice_number,linked_invoice_date,original_invoice_amount,recoverable_amount,reason_code,narration,gst_mode,debit_note_date,
   status,customer_snapshot,party_email,party_phone,party_contact_person,party_address,cash_discount_rule_name,discount_deadline,receipt_date,amount_received)
  values(pid,p_actor,c.id,cname,p_year,payload->>'partyLedgerName',payload->>'partyGstin',payload->>'linkedInvoiceNumber',(payload->>'linkedInvoiceDate')::date,
   (payload#>>'{sourceProposal,originalInvoiceAmount}')::numeric,amount,coalesce(payload->>'reasonCode','cash_discount_expired'),payload->>'narration',
   coalesce(payload->>'gstMode','finance_review'),(payload->>'voucherDate')::date,'draft',
   coalesce(payload#>'{sourceProposal,customerSnapshot}','{}')||jsonb_build_object('sourceSalesLedgerName',payload->>'salesLedgerName','agentReference',payload->>'referenceNumber'),
   payload#>>'{sourceProposal,partyEmail}',payload#>>'{sourceProposal,partyPhone}',payload#>>'{sourceProposal,partyContactPerson}',payload#>>'{sourceProposal,partyAddress}',
   payload#>>'{sourceProposal,cashDiscountRuleName}',(payload#>>'{sourceProposal,discountDeadline}')::date,(payload#>>'{sourceProposal,receiptDate}')::date,
   (payload#>>'{sourceProposal,amountReceived}')::numeric) returning * into p;
  insert into public.access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence)
   values('proposal',pid,p_org,p_company,p_actor,'Authenticated scoped discount revalidation');
 end if;
 payload:=(payload-'sourceProposal')||jsonb_build_object('proposalId',pid,'companyName',cname,'financialYear',p_year,'adjustOriginalInvoice',false);
 insert into public.tally_bridge_commands(connection_id,owner_user_id,organization_id,installation_id,session_generation,company_guid,financial_year,
  command_type,status,priority,protocol_version,job_class,deadline_at,max_attempts,payload)
 values(c.id,c.owner_user_id,p_org,p_installation,p_generation,p_guid,p_year,'create_debit_note','queued',35,1,'write',now()+interval '5 minutes',1,payload) returning * into cmd;
 insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission)
  values(cmd.id,p_org,p_company,p_actor,'discounts.post');
 insert into public.access_discount_commands values(cmd.id,pid,public.access_discount_digest(to_jsonb(p)),p_org,p_company);
 update public.debit_note_proposals set status='queued_in_tally',tally_command_id=cmd.id,approval_by=p_actor,approved_at=now(),last_error=null,updated_at=now() where id=pid;
 insert into public.access_audit(organization_id,actor_id,action,target_id,revision,details) values(p_org,p_actor,'discount.queued',pid::text,
  (select revision from public.access_organizations where id=p_org),jsonb_build_object('commandId',cmd.id));
 return jsonb_build_object('command',to_jsonb(cmd),'proposalId',pid);
end $$;

create function public.access_check_discount_dispatch() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s record; p record;
begin
 if new.command_type<>'create_debit_note' or new.status<>'claimed' or old.status='claimed' then return new;end if;
 select * into s from public.access_discount_commands where command_id=new.id;
 if not found then return new;end if;
 select * into p from public.debit_note_proposals where id=s.proposal_id for share;
 if not found or public.access_discount_digest(to_jsonb(p)) is distinct from s.source_digest or p.status<>'queued_in_tally'
  or p.tally_command_id is distinct from new.id or not exists(select 1 from public.access_resource_scopes where resource_type='proposal'
   and resource_id=p.id and organization_id=s.organization_id and company_id=s.company_id) then
  raise exception 'Discount source changed before dispatch' using errcode='42501';end if;
 return new;
end $$;
create trigger access_00_discount_dispatch before update of status on public.tally_bridge_commands for each row execute function public.access_check_discount_dispatch();

create function public.access_complete_discount(p_command uuid,p_connection uuid,p_token_hash text,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.access_command_authority; s public.access_discount_commands; c record; cmd public.tally_bridge_commands; digest text; ok boolean;
begin
 if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>32768 then raise exception 'Invalid result' using errcode='22023';end if;
 select * into s from public.access_discount_commands where command_id=p_command;
 if not found then raise exception 'Issued discount required' using errcode='42501';end if;
 perform 1 from public.access_organizations where id=s.organization_id for update;
 select * into a from public.access_command_authority where command_id=p_command for update;
 select * into cmd from public.tally_bridge_commands where id=p_command and connection_id=p_connection for update;
 select * into c from public.tally_connections where id=p_connection for share;
 if a.command_id is null or a.permission<>'discounts.post' or a.organization_id<>s.organization_id or a.company_id<>s.company_id
  or cmd.id is null or cmd.command_type<>'create_debit_note' or c.id is null or c.revoked_at is not null or c.bridge_token_hash is distinct from p_token_hash
  or cmd.owner_user_id is distinct from c.owner_user_id or cmd.installation_id is distinct from c.installation_id or cmd.session_generation is distinct from c.session_generation then
  raise exception 'Invalid issued discount pairing' using errcode='42501';end if;
 digest:=encode(sha256(convert_to(p_result::text,'UTF8')),'hex');
 if a.result_digest is not null then
  if a.result_digest<>digest then raise exception 'Conflicting discount result' using errcode='40001';end if;
  return to_jsonb(cmd);
 end if;
 if a.state not in ('issued','uncertain') or cmd.status not in ('claimed','failed') then raise exception 'Discount not issued' using errcode='55000';end if;
 ok:=coalesce((p_result->>'success')::boolean,false) and coalesce(length(p_result->>'voucherId'),0)>0
  and not coalesce((p_result->>'possibleDuplicateInTally')::boolean,false);
 update public.debit_note_proposals set status=case when ok then 'created_in_tally' else 'failed' end,
  tally_voucher_id=p_result->>'voucherId',tally_voucher_guid=p_result->>'voucherGuid',tally_voucher_number=p_result->>'voucherNumber',
  tally_voucher_date=(p_result->>'voucherDate')::date,tally_open_reference_name=p_result->>'openReferenceName',
  remaining_recoverable_amount=case when ok then recoverable_amount else remaining_recoverable_amount end,
  created_in_tally_at=case when ok then now() else created_in_tally_at end,last_synced_from_tally_at=case when ok then now() else last_synced_from_tally_at end,
  last_error=case when ok then null else coalesce(left(p_result->>'error',2000),'Verify the existing Tally voucher before retrying.') end,updated_at=now()
  where id=s.proposal_id and tally_command_id=p_command;
 if not found then raise exception 'Issued proposal missing' using errcode='55000';end if;
 update public.tally_bridge_commands set status=case when ok then 'succeeded' else 'failed' end,result=p_result,
  error=case when ok then null else coalesce(left(p_result->>'error',2000),'Verify the existing Tally voucher before retrying.') end,completed_at=now()
  where id=p_command returning * into cmd;
 update public.access_command_authority set state=case when ok then 'completed' else 'uncertain' end,result_digest=digest,completed_at=now() where command_id=p_command;
 insert into public.access_audit(organization_id,actor_id,action,target_id,revision,details) values(s.organization_id,a.initiating_user_id,'discount.result',s.proposal_id::text,
  (select revision from public.access_organizations where id=s.organization_id),
  jsonb_build_object('commandId',p_command,'verified',ok,'resultDigest',digest));
 return to_jsonb(cmd);
end $$;
revoke all on function public.access_discount_digest(jsonb),public.access_check_discount_dispatch(),public.access_enqueue_discount(uuid,text,uuid,uuid,text,bigint,text,text,jsonb,uuid),public.access_complete_discount(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.access_discount_digest(jsonb),public.access_check_discount_dispatch(),public.access_enqueue_discount(uuid,text,uuid,uuid,text,bigint,text,text,jsonb,uuid),public.access_complete_discount(uuid,uuid,text,jsonb) to service_role;
commit;
