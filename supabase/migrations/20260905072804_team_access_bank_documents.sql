-- Kalika only. Requires the existing local-bank-v2 schema; never applies itself.
begin;
create table public.access_bank_document_jobs (
 job_id uuid primary key, import_id uuid not null, command_id uuid unique,
 organization_id text not null, company_id uuid not null, initiating_user_id uuid not null references auth.users(id),
 resource_type text not null default 'bank_import' check(resource_type='bank_import'),
 completed_digest text,
 foreign key(resource_type,import_id) references public.access_resource_scopes(resource_type,resource_id),
 foreign key(organization_id,company_id) references public.access_companies(organization_id,id)
);
create index access_bank_document_actor on public.access_bank_document_jobs(organization_id,initiating_user_id,job_id);
alter table public.access_bank_document_jobs enable row level security;
revoke all on public.access_bank_document_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.access_bank_document_jobs to service_role;

create function public.access_assert_bank_document(p_job uuid) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare scope record; identity jsonb;
begin
 select * into scope from public.access_bank_document_jobs where job_id=p_job;
 if not found then return;end if; -- Legacy jobs retain their original checks.
 perform 1 from public.access_organizations where id=scope.organization_id for update;
 perform public.access_assert_permission(scope.initiating_user_id,scope.organization_id,'bank.prepare',scope.company_id);
 if not exists(select 1 from public.access_resource_scopes where resource_type='bank_import' and resource_id=scope.import_id
  and organization_id=scope.organization_id and company_id=scope.company_id) then
  raise exception 'Document company scope changed' using errcode='42501';end if;
 if scope.command_id is not null and not exists(select 1 from public.tally_bridge_commands cmd join public.access_company_links l
  on l.organization_id=cmd.organization_id and l.connection_id=cmd.connection_id and l.installation_id=cmd.installation_id
  and l.company_guid=cmd.company_guid and l.financial_year=cmd.financial_year
  where cmd.id=scope.command_id and l.organization_id=scope.organization_id and l.company_id=scope.company_id) then
  raise exception 'Document dataset mapping changed' using errcode='42501';end if;
 if scope.command_id is null then
  select processing_meta#>'{selectedContext,accessDataset}' into identity from public.bank_statement_imports where id=scope.import_id;
  if not exists(select 1 from public.tally_connections c join public.access_company_links l
   on l.connection_id=c.id and l.installation_id=c.installation_id and l.organization_id=c.organization_id
   where c.id=(identity->>'connectionId')::uuid and c.revoked_at is null and c.installation_id=identity->>'installationId'
    and c.session_generation::text=identity->>'sessionGeneration' and l.organization_id=scope.organization_id
    and l.company_id=scope.company_id and l.company_guid=identity->>'companyGuid' and l.financial_year=identity->>'financialYear') then
   raise exception 'Document pairing or dataset changed' using errcode='42501';end if;
 end if;
end $$;

create function public.access_bank_local_create(p_actor uuid,p_org text,p_company uuid,p_import_id uuid,p_job_id uuid,p_command_id uuid,p_identity jsonb,
 p_file jsonb,p_upload jsonb,p_result_url text,p_result_token text,p_global_limit integer default 1)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare created jsonb; link record; link_count integer;
begin
 perform 1 from public.access_organizations where id=p_org for update;
 perform public.access_assert_permission(p_actor,p_org,'bank.prepare',p_company);
 if p_identity->>'organizationId' is distinct from p_org then raise exception 'Wrong document organization' using errcode='42501';end if;
 select count(*) into link_count from public.access_company_links where organization_id=p_org and company_id=p_company
  and connection_id=(p_identity->>'connectionId')::uuid and installation_id=p_identity->>'installationId' and company_guid=p_identity->>'companyGuid'
  and left(financial_year,4)=left(p_identity->>'financialYear',4) and right(financial_year,2)=right(p_identity->>'financialYear',2);
 if link_count<>1 then raise exception 'One verified document dataset required' using errcode='42501';end if;
 select * into link from public.access_company_links where organization_id=p_org and company_id=p_company
  and connection_id=(p_identity->>'connectionId')::uuid and installation_id=p_identity->>'installationId' and company_guid=p_identity->>'companyGuid'
  and left(financial_year,4)=left(p_identity->>'financialYear',4) and right(financial_year,2)=right(p_identity->>'financialYear',2) for share;
 created:=public.bank_local_v2_create(p_import_id,p_job_id,p_command_id,p_identity,p_file,p_upload,p_result_url,p_result_token,p_global_limit);
 if created->>'state'<>'created' then return created;end if;
 -- Financial record attribution is the initiating teammate, not the paired PC owner.
 update public.bank_statement_imports set owner_user_id=p_actor where id=p_import_id;
 update public.bank_statement_extraction_jobs set owner_user_id=p_actor where id=p_job_id;
 update public.bank_local_pipeline_runs set owner_user_id=p_actor where job_id=p_job_id;
 update public.tally_bridge_commands set financial_year=link.financial_year where id=p_command_id;
 insert into public.access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence)
 values('bank_import',p_import_id,p_org,p_company,p_actor,'Authenticated local document creation; verified connector dataset');
 insert into public.access_bank_document_jobs(job_id,import_id,command_id,organization_id,company_id,initiating_user_id)
 values(p_job_id,p_import_id,p_command_id,p_org,p_company,p_actor);
 insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission)
 values(p_command_id,p_org,p_company,p_actor,'bank.prepare');
 select jsonb_set(created,'{import}',to_jsonb(i)) into created from public.bank_statement_imports i where id=p_import_id;
 return created;
end $$;

alter function public.bank_local_v2_claim(uuid,uuid,jsonb,text,text,integer) rename to bank_local_v2_claim_legacy;
create function public.bank_local_v2_claim(p_job_id uuid,p_command_id uuid,p_identity jsonb,p_source_hash text,p_context_hash text,p_ledger_count integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform public.access_assert_bank_document(p_job_id);
 return public.bank_local_v2_claim_legacy(p_job_id,p_command_id,p_identity,p_source_hash,p_context_hash,p_ledger_count);
end $$;
alter function public.bank_local_v2_finalize(uuid,jsonb,text,jsonb) rename to bank_local_v2_finalize_legacy;
create function public.bank_local_v2_finalize(p_job_id uuid,p_identity jsonb,p_digest text,p_prepared jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; scope record; i record; ids uuid[]; normalized text; was_completed boolean;
begin
 perform public.access_assert_bank_document(p_job_id);
 perform 1 from public.bank_statement_extraction_jobs where id=p_job_id for update;
 select state='completed' into was_completed from public.bank_local_pipeline_runs where job_id=p_job_id;
 result:=public.bank_local_v2_finalize_legacy(p_job_id,p_identity,p_digest,p_prepared);
 if was_completed then return result;end if;
 select * into scope from public.access_bank_document_jobs where job_id=p_job_id;
 if found and result->>'state'='completed' then
  select * into i from public.bank_statement_imports where id=scope.import_id for update;
  normalized:=upper(regexp_replace(coalesce(i.extracted_account_number,''),'[^a-zA-Z0-9]','','g'));
  select array_agg(id) into ids from (select b.id from public.bank_accounts b join public.access_resource_scopes s
   on s.resource_type='bank_account' and s.resource_id=b.id and s.organization_id=scope.organization_id and s.company_id=scope.company_id
   where b.account_number_normalized=nullif(normalized,'') order by b.id limit 5) matched;
  update public.bank_statement_imports set bank_account_id=case when cardinality(ids)=1 then ids[1] else null end,
   status=case when status='manual_review_required' then status when cardinality(ids)>1 then 'needs_account_selection' else 'ready_to_review' end where id=i.id;
 end if;
 return result;
end $$;
alter function public.bank_local_v2_checkpoint(uuid,jsonb,text,jsonb) rename to bank_local_v2_checkpoint_legacy;
create function public.bank_local_v2_checkpoint(p_job_id uuid,p_identity jsonb,p_digest text,p_prepared jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform public.access_assert_bank_document(p_job_id);
 return public.bank_local_v2_checkpoint_legacy(p_job_id,p_identity,p_digest,p_prepared);
end $$;
-- Job-token status uses the paired owner; the financial job retains its creator.
create or replace function public.bank_local_v2_status(p_command_id uuid,p_owner_id uuid,p_connection_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.bank_local_pipeline_runs; status text;
begin
 select * into r from public.bank_local_pipeline_runs where command_id=p_command_id
  and identity->>'ownerUserId'=p_owner_id::text and identity->>'connectionId'=p_connection_id::text;
 if not found then raise exception 'Document scope mismatch' using errcode='42501';end if;
 perform public.access_assert_bank_document(r.job_id);
 perform public.bank_local_v2_assert_identity(r.identity);
 select j.status into status from public.bank_statement_extraction_jobs j where id=r.job_id;
 return jsonb_build_object('state',case when status in ('cancelled','failed') then status else r.state end,'jobId',r.job_id,'importId',r.import_id,'revision',r.revision,'digest',r.result_digest);
end $$;
create function public.access_cancel_bank_document(p_actor uuid,p_org text,p_job uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare scope record; r record;
begin
 select * into scope from public.access_bank_document_jobs where job_id=p_job and organization_id=p_org;
 if not found then raise exception 'Document not found' using errcode='42501';end if;
 perform 1 from public.access_organizations where id=p_org for update;
 perform public.access_assert_permission(p_actor,p_org,'bank.prepare',scope.company_id);
 select * into r from public.bank_local_pipeline_runs where job_id=p_job;
 return public.bank_local_v2_cancel(p_job,r.owner_user_id,p_org);
end $$;
revoke all on function public.access_assert_bank_document(uuid) from public,anon,authenticated;
revoke all on function public.access_bank_local_create(uuid,text,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer) from public,anon,authenticated;
revoke all on function public.access_cancel_bank_document(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.bank_local_v2_claim(uuid,uuid,jsonb,text,text,integer) from public,anon,authenticated;
revoke all on function public.bank_local_v2_finalize(uuid,jsonb,text,jsonb) from public,anon,authenticated;
revoke all on function public.bank_local_v2_checkpoint(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.access_assert_bank_document(uuid) to service_role;
grant execute on function public.access_bank_local_create(uuid,text,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer) to service_role;
grant execute on function public.access_cancel_bank_document(uuid,text,uuid) to service_role;
grant execute on function public.bank_local_v2_claim(uuid,uuid,jsonb,text,text,integer) to service_role;
grant execute on function public.bank_local_v2_finalize(uuid,jsonb,text,jsonb) to service_role;
grant execute on function public.bank_local_v2_checkpoint(uuid,jsonb,text,jsonb) to service_role;
create function public.access_bank_backend_create(p_actor uuid,p_org text,p_company uuid,p_scope jsonb,p_import jsonb,p_job_result jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.bank_statement_imports; j uuid:=gen_random_uuid(); c record;
begin
 perform 1 from public.access_organizations where id=p_org for update;
 perform public.access_assert_permission(p_actor,p_org,'bank.prepare',p_company);
 select * into c from public.tally_connections where id=(p_scope->>'connectionId')::uuid for share;
 if not found or c.revoked_at is not null or c.installation_id is distinct from p_scope->>'installationId'
  or c.session_generation::text is distinct from p_scope->>'sessionGeneration' then raise exception 'Pairing changed' using errcode='42501';end if;
 if not exists(select 1 from public.access_company_links where organization_id=p_org and company_id=p_company and connection_id=c.id
  and installation_id=c.installation_id and company_guid=p_scope->>'companyGuid' and financial_year=p_scope->>'financialYear') then
  raise exception 'Verified document dataset required' using errcode='42501';end if;
 if p_import->>'owner_user_id' is distinct from p_actor::text or coalesce(length(p_import->>'storage_path'),0)=0
  or p_import#>>'{processing_meta,selectedContext,localParsing,mode}'='local_agent' then raise exception 'Invalid backend document' using errcode='22023';end if;
 insert into public.bank_statement_imports(owner_user_id,original_file_name,storage_bucket,storage_path,storage_asset_id,content_sha256,mime_type,size_bytes,status,processing_meta)
 values(p_actor,p_import->>'original_file_name',p_import->>'storage_bucket',p_import->>'storage_path',(p_import->>'storage_asset_id')::uuid,p_import->>'content_sha256',
  p_import->>'mime_type',(p_import->>'size_bytes')::bigint,'processing',jsonb_set(p_import->'processing_meta','{selectedContext,accessDataset}',p_scope)) returning * into i;
 insert into public.bank_statement_extraction_jobs(id,import_id,owner_user_id,status,progress,stage,result)
 values(j,i.id,p_actor,'queued',5,'Statement uploaded',p_job_result);
 insert into public.access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence)
 values('bank_import',i.id,p_org,p_company,p_actor,'Authenticated backend document creation; verified connector dataset');
 insert into public.access_bank_document_jobs(job_id,import_id,organization_id,company_id,initiating_user_id) values(j,i.id,p_org,p_company,p_actor);
 return to_jsonb(i);
end $$;
revoke all on function public.access_bank_backend_create(uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.access_bank_backend_create(uuid,text,uuid,jsonb,jsonb,jsonb) to service_role;

-- Backend-parsed documents use the same atomic publish boundary as local jobs.
create function public.access_bank_backend_finalize(p_job uuid,p_attempt integer,p_worker text,p_import jsonb,p_rows jsonb,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.access_bank_document_jobs; j public.bank_statement_extraction_jobs; i public.bank_statement_imports;
 d text; row_value jsonb; n integer:=0; account_ids uuid[]; normalized text; chosen uuid; next_status text;
begin
 select * into s from public.access_bank_document_jobs where job_id=p_job;
 if not found or s.command_id is not null then raise exception 'Backend document job required' using errcode='42501';end if;
 perform public.access_assert_bank_document(p_job);
 select * into j from public.bank_statement_extraction_jobs where id=p_job for update;
 select * into i from public.bank_statement_imports where id=s.import_id for update;
 if j.import_id is distinct from i.id or j.owner_user_id is distinct from s.initiating_user_id then
  raise exception 'Document attribution changed' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 or octet_length(p_rows::text)>16777216 then
  raise exception 'Invalid preview size' using errcode='22023';end if;
 d:=encode(sha256(convert_to(jsonb_build_array(p_attempt,p_import,p_rows,p_result)::text,'UTF8')),'hex');
 if s.completed_digest is not null then
  if s.completed_digest=d then return j.result;end if;
  raise exception 'Completed document result differs' using errcode='40001';end if;
 if j.status<>'running' or j.attempt_count is distinct from p_attempt or j.locked_by is distinct from p_worker then
  raise exception 'Document lease is no longer current' using errcode='40001';end if;
 normalized:=upper(regexp_replace(coalesce(p_import->>'extracted_account_number',''),'[^a-zA-Z0-9]','','g'));
 select array_agg(a.id order by a.id) into account_ids from public.bank_accounts a join public.access_resource_scopes r
  on r.resource_type='bank_account' and r.resource_id=a.id where r.organization_id=s.organization_id and r.company_id=s.company_id
  and normalized<>'' and a.account_number_normalized=normalized;
 chosen:=case when cardinality(account_ids)=1 then account_ids[1] else null end;
 next_status:=case when p_import->>'status'='manual_review_required' then 'manual_review_required'
  when cardinality(account_ids)>1 then 'needs_account_selection' else 'ready_to_review' end;
 delete from public.bank_statement_import_preview_transactions where import_id=i.id;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  insert into public.bank_statement_import_preview_transactions
   select (jsonb_populate_record(null::public.bank_statement_import_preview_transactions,
    jsonb_build_object('category','unknown','additional_charges','[]'::jsonb,'raw_payload','{}'::jsonb)||row_value||
    jsonb_build_object('id',gen_random_uuid(),'import_id',i.id,'owner_user_id',s.initiating_user_id,'row_index',n,'created_at',now(),'updated_at',now()))).*;
 end loop;
 update public.bank_statement_imports set bank_account_id=chosen,status=next_status,
  statement_period_start=(p_import->>'statement_period_start')::date,statement_period_end=(p_import->>'statement_period_end')::date,
  extracted_bank_name=p_import->>'extracted_bank_name',extracted_account_number=p_import->>'extracted_account_number',
  extracted_account_holder_name=p_import->>'extracted_account_holder_name',extracted_ifsc_code=p_import->>'extracted_ifsc_code',
  processing_meta=jsonb_set(coalesce(p_import->'processing_meta','{}'),'{selectedContext}',i.processing_meta->'selectedContext') where id=i.id;
 update public.bank_statement_extraction_jobs set status='succeeded',progress=100,stage='Completed',error=null,
  result=p_result||jsonb_build_object('status',next_status,'transactionCount',n),locked_at=null,locked_by=null,finished_at=now(),updated_at=now()
  where id=j.id returning * into j;
 update public.access_bank_document_jobs set completed_digest=d where job_id=j.id;
 return j.result;
end $$;
revoke all on function public.access_bank_backend_finalize(uuid,integer,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.access_bank_backend_finalize(uuid,integer,text,jsonb,jsonb,jsonb) to service_role;
commit;
