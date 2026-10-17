begin;
set local lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.access_enqueue_bank_batch(p_actor uuid, p_org text, p_company uuid, p_dataset uuid, p_generation bigint, p_commands jsonb, p_mappings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare ds record; c record; l record; t record; account record; item jsonb; payload jsonb; cmd record;
 output jsonb:='[]'; m jsonb; target record; existing record; amount numeric; outgoing boolean; wanted text; name text; tid uuid;
begin
 if jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 200
  or pg_column_size(p_commands)>1048576 or jsonb_typeof(p_mappings) is distinct from 'array'
  or jsonb_array_length(p_mappings)>200 or pg_column_size(p_mappings)>1048576 then
  raise exception 'Invalid bounded bank batch' using errcode='22023';end if;
 perform 1 from public.access_organizations where id=p_org for update;
 perform public.access_assert_permission(p_actor,p_org,'bank.post',p_company);
 select * into ds from public.access_master_datasets where id=p_dataset and organization_id=p_org for share;
 if not found then raise exception 'Dataset not available' using errcode='42501';end if;
 select * into c from public.tally_connections where id=ds.connection_id for share;
 if not found or c.revoked_at is not null or c.installation_id is distinct from ds.installation_id or c.session_generation is distinct from p_generation then
  raise exception 'Pairing changed' using errcode='42501';end if;
 perform 1 from public.access_company_links where organization_id=p_org and company_id=p_company and connection_id=c.id
  and installation_id=c.installation_id and company_guid=ds.company_guid and financial_year=ds.financial_year for share;
 if not found then raise exception 'Company mapping changed' using errcode='42501';end if;
 select access_companies.name into name from public.access_companies where organization_id=p_org and id=p_company;
 for item in select value from jsonb_array_elements(p_commands) loop
  payload:=item->'payload';wanted:=item->>'command_type';
  if jsonb_typeof(payload) is distinct from 'object' or payload->>'companyName' is distinct from name
   or wanted not in ('create_ledger','post_bank_voucher','verify_bank_transaction') then
   raise exception 'Invalid bank command' using errcode='22023';end if;
  tid:=null;
  if wanted='create_ledger' then
   perform public.access_assert_permission(p_actor,p_org,'connections.manage',p_company);
   if coalesce(length(payload->>'name'),0) not between 1 and 500 or not exists(select 1 from public.access_dataset_masters
    where dataset_id=ds.id and master_type='group' and tally_name=payload->>'parentName' and is_active) then
    raise exception 'Invalid ledger creation' using errcode='22023';end if;
  else
   tid:=(payload->>'transactionId')::uuid;
   select * into t from public.bank_transactions where id=tid for update;
   if not found then raise exception 'Transaction unavailable' using errcode='42501';end if;
   select * into account from public.bank_accounts where id=t.bank_account_id for update;
   if not found or not exists(select 1 from public.access_resource_scopes where resource_type='bank_account' and resource_id=account.id
    and organization_id=p_org and company_id=p_company) or (t.statement_import_id is not null and not exists(select 1 from public.access_resource_scopes
     where resource_type='bank_import' and resource_id=t.statement_import_id and organization_id=p_org and company_id=p_company)) then
    raise exception 'Bank source belongs to another company' using errcode='42501';end if;
   if payload->>'bankAccountId' is distinct from account.id::text or payload->>'fingerprint' is distinct from t.fingerprint
    or payload->>'voucherDate' is distinct from t.transaction_date::text or payload->>'narration' is distinct from t.description
    or t.tally_status not in ('pending','failed','missing_in_tally','verification_failed') then
    raise exception 'Bank source changed; reload before posting' using errcode='55000';end if;
   if exists(select 1 from public.access_bank_command_sources s join public.access_command_authority a on a.command_id=s.command_id
    where s.transaction_id=tid and a.state in ('queued','issued','uncertain')) or exists(select 1 from public.bank_transaction_posting_log
     where bank_account_id=account.id and fingerprint=t.fingerprint and status in ('posted','verified','needs_tally_review')) then
    raise exception 'Transaction already active or needs verification' using errcode='55000';end if;
   outgoing:=coalesce(t.debit_amount,0)>0 and coalesce(t.credit_amount,0)=0;
   if not outgoing and not(coalesce(t.credit_amount,0)>0 and coalesce(t.debit_amount,0)=0) then
    raise exception 'Ambiguous transaction direction' using errcode='22023';end if;
   amount:=case when outgoing then t.debit_amount else t.credit_amount end;
   if (payload->>'amount')::numeric is distinct from amount or payload->>'expectedDirection' is distinct from (case when outgoing then 'outgoing' else 'incoming' end)
    or (wanted='post_bank_voucher' and ((payload->>'bankLedgerEntryIsDebit')::boolean is distinct from (not outgoing)
     or payload->>'voucherType' not in (case when outgoing then 'Payment' else 'Receipt' end,'Contra'))) then
    raise exception 'Voucher direction or amount disagrees with statement' using errcode='22023';end if;
   if not exists(select 1 from public.access_dataset_masters where dataset_id=ds.id and master_type='ledger' and tally_name=payload->>'bankLedgerName' and is_active) then
    raise exception 'Bank ledger not present in selected dataset' using errcode='55000';end if;
   if wanted='post_bank_voucher' and not exists(select 1 from public.access_dataset_masters where dataset_id=ds.id and master_type='ledger' and tally_name=payload->>'counterpartyLedgerName' and is_active)
    and not exists(select 1 from jsonb_array_elements(p_commands) x where x->>'command_type'='create_ledger' and x->'payload'->>'name'=payload->>'counterpartyLedgerName') then
    raise exception 'Counterparty ledger not present in selected dataset' using errcode='55000';end if;
   if jsonb_array_length(coalesce(payload->'billAllocations','[]'))>0 and abs((select sum((b->>'amount')::numeric) from jsonb_array_elements(payload->'billAllocations') b)-amount)>=0.005 then
    raise exception 'Bill allocation amount disagrees with statement' using errcode='22023';end if;
  end if;
  insert into public.tally_bridge_commands(connection_id,owner_user_id,organization_id,installation_id,session_generation,company_guid,financial_year,
   command_type,status,priority,payload,protocol_version,job_class,max_attempts,deadline_at)
  values(c.id,c.owner_user_id,p_org,c.installation_id,c.session_generation,ds.company_guid,ds.financial_year,wanted,'queued',
   case when wanted='create_ledger' then 30 else 20 end,payload||jsonb_build_object('companyGuid',ds.company_guid,'financialYear',ds.financial_year),
   1,case when wanted='verify_bank_transaction' then 'tally_read' else 'tally_write' end,1,now()+interval '10 minutes') returning * into cmd;
  insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission)
  values(cmd.id,p_org,p_company,p_actor,case when wanted='create_ledger' then 'connections.manage' else 'bank.post' end);
  insert into public.access_bank_command_sources(command_id,transaction_id,dataset_id,source_digest)
  values(cmd.id,tid,ds.id,case when tid is null then null else public.access_bank_source_digest(to_jsonb(t)) end);
  if tid is not null then
   insert into public.bank_transaction_posting_log(owner_user_id,bank_account_id,connection_id,source_transaction_id,fingerprint,transaction_date,
    reference_number,description,debit_amount,credit_amount,amount,voucher_type,bank_ledger_name,counterparty_ledger_name,command_id,status,error,result)
   values(account.owner_user_id,account.id,c.id,t.id,t.fingerprint,t.transaction_date,t.reference_number,t.description,t.debit_amount,t.credit_amount,amount,
    coalesce(payload->>'voucherType','Payment'),payload->>'bankLedgerName',payload->>'counterpartyLedgerName',cmd.id,'queued',null,'{}')
   on conflict(owner_user_id,bank_account_id,fingerprint) do update set command_id=excluded.command_id,status='queued',error=null,result='{}',connection_id=c.id,
    bank_ledger_name=excluded.bank_ledger_name,counterparty_ledger_name=excluded.counterparty_ledger_name;
   update public.bank_transactions set tally_status=case when wanted='verify_bank_transaction' then 'checking_in_tally' else 'pending' end,
    confirmed_ledger_name=coalesce(nullif(payload->>'counterpartyLedgerName',''),confirmed_ledger_name),ledger_mapping_source='queue_confirmation' where id=t.id;
   update public.bank_accounts set tally_connection_id=c.id,tally_ledger_name=payload->>'bankLedgerName' where id=account.id;
  end if;
  output:=output||jsonb_build_array(to_jsonb(cmd));
 end loop;
 for m in select value from jsonb_array_elements(p_mappings) loop
  if m->>'mapping_type' not in ('bank_account_ledger','bank_narration_ledger') then raise exception 'Invalid bank mapping' using errcode='22023';end if;
  select * into target from public.access_dataset_masters where dataset_id=ds.id and master_type='ledger' and tally_name=m->>'target_master_name' and is_active;
  -- Newly-created ledgers can be mapped after the next verified master sync.
  if not found then continue;end if;
  select * into existing from public.access_dataset_mappings where dataset_id=ds.id and mapping_type=m->>'mapping_type' and source_key=m->>'source_key' for update;
  if found and existing.target_master_key<>target.master_key then raise exception 'Shared mapping changed; review it before posting' using errcode='55000';end if;
  insert into public.access_dataset_mappings(dataset_id,mapping_type,source_key,source_label,target_master_type,target_master_key,target_master_name,status,notes,updated_by)
  values(ds.id,m->>'mapping_type',m->>'source_key',m->>'source_label','ledger',target.master_key,target.tally_name,'active',m->>'notes',p_actor)
  on conflict(dataset_id,mapping_type,source_key) do nothing;
 end loop;
 insert into public.access_audit(organization_id,actor_id,action,target_id,revision,details)
 values(p_org,p_actor,'bank.queued',ds.id::text,0,jsonb_build_object('commandCount',jsonb_array_length(output)));
 return output;
end $function$
;
notify pgrst,'reload schema';
commit;
