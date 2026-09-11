-- Schema preparation for local v2 integration testing. Apply manually to Kalika only.
-- Applying this file does NOT enable v2 or advertise the agent capability.
-- No capability RPC is exposed until all v2 integration/recovery gates pass.
-- Accounting rows remain in the existing preview table; no document content here.
begin;

-- Fail before creating anything if prerequisite Local Agent/bank migrations
-- are missing. The enclosing transaction rolls back all changes on error.
do $$
declare missing text;
begin
  select string_agg(required.table_name || '.' || required.column_name, ', ')
    into missing
  from (values
    ('tally_connections','organization_id'), ('tally_connections','installation_id'),
    ('tally_connections','session_generation'), ('tally_connections','last_companies_snapshot'),
    ('tally_bridge_commands','protocol_version'), ('tally_bridge_commands','job_class'),
    ('tally_bridge_commands','deadline_at'), ('tally_bridge_commands','external_result_reference'),
    ('bank_statement_imports','processing_meta'), ('bank_statement_imports','content_sha256'),
    ('bank_statement_extraction_jobs','result'), ('bank_statement_extraction_jobs','locked_by'),
    ('bank_statement_import_preview_transactions','raw_payload'),
    ('bank_accounts','account_number_normalized')
  ) as required(table_name,column_name)
  where not exists(select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name);
  if missing is not null then
    raise exception 'Kalika v2 prerequisites missing: %. No changes were applied.', missing;
  end if;
end $$;

-- The gateway is the only subscriber for bank-job notifications. Existing
-- broad Realtime policies must not allow browsers to subscribe/publish directly
-- to another installation's topic. Service-role broker access bypasses RLS.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$create policy bank_local_v2_gateway_only on realtime.messages as restrictive
      for all to anon, authenticated
      using (coalesce(realtime.topic(),'') not like 'bank-jobs:%')
      with check (coalesce(realtime.topic(),'') not like 'bank-jobs:%')$policy$;
  end if;
end $$;

create table public.bank_local_pipeline_runs (
  job_id uuid primary key references public.bank_statement_extraction_jobs(id) on delete cascade,
  import_id uuid not null references public.bank_statement_imports(id) on delete cascade,
  command_id uuid not null unique references public.tally_bridge_commands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id text not null,
  identity jsonb not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  context_hash text check (context_hash ~ '^[a-f0-9]{64}$'),
  ledger_count integer check (ledger_count >= 0),
  state text not null default 'preparing' check (state in ('preparing','analyzing','saving','completed','failed','cancelled','recovery')),
  attempt integer not null default 1 check (attempt = 1),
  revision bigint not null default 1,
  deadline_at timestamptz not null,
  claimed_at timestamptz,
  result_digest text check (result_digest ~ '^[a-f0-9]{64}$'),
  timings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bank_local_runs_admission_idx on public.bank_local_pipeline_runs (organization_id, deadline_at)
  where state in ('preparing','analyzing','saving');
create index bank_local_runs_scope_idx on public.bank_local_pipeline_runs (owner_user_id, organization_id, import_id);
alter table public.bank_local_pipeline_runs enable row level security;
revoke all on public.bank_local_pipeline_runs from public, anon, authenticated;
grant select, insert, update, delete on public.bank_local_pipeline_runs to service_role;

-- Service-only checkpoint. TTL is not permission to expose this table to clients.
create table public.bank_local_pipeline_checkpoints (
  job_id uuid primary key references public.bank_local_pipeline_runs(job_id) on delete cascade,
  result_digest text not null check (result_digest ~ '^[a-f0-9]{64}$'),
  prepared_result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (expires_at <= created_at + interval '24 hours'),
  check (not (prepared_result ?| array['markdown','pdf','ledgerNames','bankAccountCandidates','token','credentials']))
);
create index bank_local_checkpoints_expiry_idx on public.bank_local_pipeline_checkpoints (expires_at);
alter table public.bank_local_pipeline_checkpoints enable row level security;
revoke all on public.bank_local_pipeline_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on public.bank_local_pipeline_checkpoints to service_role;

-- Used by trusted routes AFTER authenticating the owner/token. Never callable by
-- anon/authenticated roles; the identity is not a substitute for route authentication.
create function public.bank_local_v2_assert_identity(p_identity jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.tally_connections;
begin
  if exists (select 1 from unnest(array['organizationId','ownerUserId','connectionId','installationId','companyGuid','companyName','financialYear','sessionGeneration']) k
             where nullif(p_identity->>k, '') is null) then
    raise exception 'Incomplete agent identity' using errcode = '42501';
  end if;
  select * into c from public.tally_connections where id = (p_identity->>'connectionId')::uuid for share;
  if c.id is null or c.revoked_at is not null
    or c.owner_user_id::text <> p_identity->>'ownerUserId'
    or coalesce(c.organization_id,c.owner_user_id::text) <> p_identity->>'organizationId'
    or c.installation_id is distinct from p_identity->>'installationId'
    or c.session_generation::text is distinct from p_identity->>'sessionGeneration'
    or not exists (select 1 from jsonb_array_elements(coalesce(c.last_companies_snapshot,'[]'::jsonb)) x
       where x->>'guid' = p_identity->>'companyGuid' and x->>'companyName' = p_identity->>'companyName'
       and left(x->>'financialYear',4) = left(p_identity->>'financialYear',4)
       and right(x->>'financialYear',2) = right(p_identity->>'financialYear',2)) then
    raise exception 'Agent scope changed' using errcode = '42501';
  end if;
end $$;

-- Claims do not reclaim an uncertain AI execution. A lost response must use a
-- status read; starting another paid call requires a new explicitly created job.
create function public.bank_local_v2_create(p_import_id uuid, p_job_id uuid, p_command_id uuid, p_identity jsonb,
  p_file jsonb, p_upload jsonb, p_result_url text, p_result_token text, p_global_limit integer default 1)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; metadata jsonb; created_import public.bank_statement_imports; deadline timestamptz:=now()+interval '10 minutes';
begin
  perform pg_advisory_xact_lock(716203042);
  perform public.bank_local_v2_assert_identity(p_identity);
  owner_id:=(p_identity->>'ownerUserId')::uuid;
  if exists (select 1 from public.bank_local_pipeline_runs where state in ('preparing','analyzing','saving')
      and deadline_at>now() and organization_id=p_identity->>'organizationId')
    or (select count(*) from public.bank_local_pipeline_runs where state in ('preparing','analyzing','saving') and deadline_at>now()) >= greatest(1,least(coalesce(p_global_limit,1),32)) then
    return jsonb_build_object('state','busy','retryAfterSeconds',5);
  end if;
  if p_import_id is null or p_job_id is null or p_command_id is null
    or p_file is null or p_upload is null
    or exists(select 1 from unnest(array['name','sha256','size']) k where nullif(p_file->>k,'') is null)
    or exists(select 1 from unnest(array['tokenHash','origin','expiresAt']) k where nullif(p_upload->>k,'') is null)
    or nullif(p_result_url,'') is null or nullif(p_result_token,'') is null
    or lower(p_file->>'sha256') !~ '^[a-f0-9]{64}$' or (p_file->>'size')::bigint not between 1 and 26214400
    or p_upload->>'tokenHash' !~ '^[a-f0-9]{64}$' or p_upload->>'origin' !~ '^https?://'
    or to_timestamp((p_upload->>'expiresAt')::double precision/1000) not between now() and deadline then
    raise exception 'Invalid upload metadata';
  end if;
  metadata:=jsonb_build_object('pipelineVersion',2,'source','bank_statement_local_document','sourceRetention','local_only',
    'selectedContext',jsonb_build_object('connectionId',p_identity->>'connectionId','companyName',p_identity->>'companyName',
      'financialYear',p_identity->>'financialYear','syncBeforeAnalysis',false),
    'tallyLedgerName',coalesce(p_file->>'bankLedgerName',''),
    'analysis',jsonb_build_object('status','queued','progress',5,'stage','Preparing document','startedAt',now(),'updatedAt',now(),
      'manualAccount',coalesce(p_file->'manualAccount','{}'::jsonb)));
  insert into public.bank_statement_imports(id,owner_user_id,original_file_name,storage_bucket,storage_path,content_sha256,mime_type,size_bytes,status,processing_meta)
    values(p_import_id,owner_id,p_file->>'name','','local-only/'||p_import_id::text,upper(p_file->>'sha256'),'application/pdf',(p_file->>'size')::bigint,'processing',metadata)
    returning * into created_import;
  insert into public.bank_statement_extraction_jobs(id,import_id,owner_user_id,status,attempt_count,max_attempts,progress,stage,result,locked_at,locked_by,started_at)
    values(p_job_id,p_import_id,owner_id,'running',1,1,5,'Preparing document',jsonb_build_object('pipelineVersion',2,'workerPool','agent-v2'),now(),'agent-v2',now());
  insert into public.tally_bridge_commands(id,connection_id,owner_user_id,organization_id,installation_id,session_generation,company_guid,company_name,financial_year,
    protocol_version,command_type,job_class,status,priority,max_attempts,payload,deadline_at)
    values(p_command_id,(p_identity->>'connectionId')::uuid,owner_id,p_identity->>'organizationId',p_identity->>'installationId',(p_identity->>'sessionGeneration')::bigint,
    p_identity->>'companyGuid',p_identity->>'companyName',p_identity->>'financialYear',1,'agent_parse_document','document_parse','queued',80,1,
    jsonb_build_object('pipelineVersion',2,'agentIdentity',p_identity,'browserUpload',p_upload,'expectedSha256',lower(p_file->>'sha256'),
      'bankStatementJobId',p_job_id,'bankStatementImportId',p_import_id,'originalName','bank-statement.pdf','resultUploadUrl',p_result_url,'resultUploadToken',p_result_token,
      'commandId',p_command_id,'resultStatusUrl',p_result_url,'documentDeadlineAt',extract(epoch from deadline)*1000),deadline);
  insert into public.bank_local_pipeline_runs(job_id,import_id,command_id,owner_user_id,organization_id,identity,source_hash,deadline_at)
    values(p_job_id,p_import_id,p_command_id,owner_id,p_identity->>'organizationId',p_identity,lower(p_file->>'sha256'),deadline);
  return jsonb_build_object('state','created','importId',p_import_id,'jobId',p_job_id,'commandId',p_command_id,'revision',1,'import',to_jsonb(created_import));
end $$;

create function public.bank_local_v2_claim(p_job_id uuid, p_command_id uuid, p_identity jsonb, p_source_hash text, p_context_hash text, p_ledger_count integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.bank_local_pipeline_runs; j public.bank_statement_extraction_jobs; c public.tally_bridge_commands;
begin
  select * into j from public.bank_statement_extraction_jobs where id = p_job_id for update;
  select * into r from public.bank_local_pipeline_runs where job_id = p_job_id for update;
  if r.job_id is null or r.command_id is distinct from p_command_id or r.identity is distinct from p_identity
    or r.source_hash is distinct from lower(p_source_hash) then raise exception 'Document scope mismatch' using errcode = '42501'; end if;
  perform public.bank_local_v2_assert_identity(p_identity);
  if r.context_hash is not null and r.context_hash is distinct from p_context_hash then
    raise exception 'Conflicting document context' using errcode = '23505';
  end if;
  if r.state = 'completed' then return jsonb_build_object('state','completed','revision',r.revision,'digest',r.result_digest); end if;
  if r.state <> 'preparing' then return jsonb_build_object('state',r.state,'revision',r.revision); end if;
  select * into c from public.tally_bridge_commands where id = p_command_id for update;
  if r.deadline_at <= now() or j.status <> 'running' or c.status <> 'claimed' or c.deadline_at <= now() then
    raise exception 'Document job expired or cancelled' using errcode = '55000';
  end if;
  if p_context_hash is null or p_context_hash !~ '^[a-f0-9]{64}$' or p_ledger_count is null or p_ledger_count not between 1 and 20000 then raise exception 'Invalid context'; end if;
  update public.bank_local_pipeline_runs set state='analyzing', claimed_at=now(), context_hash=p_context_hash,
    ledger_count=p_ledger_count, revision=revision+1, updated_at=now() where job_id=p_job_id returning * into r;
  update public.bank_statement_extraction_jobs set stage='Analyzing transactions',progress=50,locked_at=now() where id=p_job_id;
  return jsonb_build_object('state','accepted','revision',r.revision,'importId',r.import_id);
end $$;

-- The shared job lock also serializes legacy cancellation against finalization.
-- Metadata/account and rows are updated in ONE transaction, invisible until commit.
create function public.bank_local_v2_finalize(p_job_id uuid, p_identity jsonb, p_digest text, p_prepared jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.bank_local_pipeline_runs; j public.bank_statement_extraction_jobs;
  i public.bank_statement_imports; candidate_ids uuid[]; final_status text; account jsonb;
  row_value jsonb; row_number integer:=0; candidate_count integer; meta jsonb; normalized_account text;
begin
  select * into j from public.bank_statement_extraction_jobs where id=p_job_id for update;
  select * into r from public.bank_local_pipeline_runs where job_id=p_job_id for update;
  if r.job_id is null or r.identity is distinct from p_identity then raise exception 'Document scope mismatch' using errcode='42501'; end if;
  perform public.bank_local_v2_assert_identity(p_identity);
  if r.state='completed' then
    if r.result_digest is distinct from p_digest then raise exception 'Conflicting finalized result' using errcode='23505'; end if;
    return jsonb_build_object('state','completed','importId',r.import_id,'revision',r.revision,'digest',r.result_digest);
  end if;
  if j.status <> 'running' or r.state not in ('analyzing','saving','recovery') then raise exception 'Job is no longer active' using errcode='55000'; end if;
  if r.state <> 'recovery' and r.deadline_at <= now() then raise exception 'Job deadline exceeded' using errcode='55000'; end if;
  if r.state='recovery' and not exists (select 1 from public.bank_local_pipeline_checkpoints where job_id=p_job_id and expires_at>now() and result_digest=p_digest and prepared_result=p_prepared) then
    raise exception 'Recovery checkpoint unavailable' using errcode='55000'; end if;
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_prepared->'rows') is distinct from 'array' then raise exception 'Invalid prepared result'; end if;
  select * into i from public.bank_statement_imports where id=r.import_id and owner_user_id=r.owner_user_id for update;
  if i.id is null then raise exception 'Import unavailable'; end if;
  account:=jsonb_build_object('bankName',coalesce(nullif(i.extracted_bank_name,''),p_prepared#>>'{account,bankName}'),
    'accountNumber',coalesce(nullif(i.extracted_account_number,''),p_prepared#>>'{account,accountNumber}'),
    'accountHolderName',coalesce(nullif(i.extracted_account_holder_name,''),p_prepared#>>'{account,accountHolderName}'),
    'ifscCode',coalesce(nullif(i.extracted_ifsc_code,''),p_prepared#>>'{account,ifscCode}'));
  normalized_account:=upper(regexp_replace(coalesce(account->>'accountNumber',''),'[^a-zA-Z0-9]','','g'));
  select array_agg(id) into candidate_ids from (select id from public.bank_accounts
    where owner_user_id=r.owner_user_id and account_number_normalized=nullif(normalized_account,'') limit 5) candidates;
  candidate_count:=coalesce(cardinality(candidate_ids),0);
  final_status:=case when jsonb_array_length(p_prepared->'rows')=0 or coalesce((p_prepared->>'extractionIncomplete')::boolean,true)
    then 'manual_review_required' when candidate_count>1 then 'needs_account_selection' else 'ready_to_review' end;
  delete from public.bank_statement_import_preview_transactions where import_id=r.import_id and owner_user_id=r.owner_user_id;
  for row_value in select value from jsonb_array_elements(p_prepared->'rows') loop
    row_number:=row_number+1;
    insert into public.bank_statement_import_preview_transactions
      select (jsonb_populate_record(null::public.bank_statement_import_preview_transactions,
        jsonb_build_object('additional_charges','[]'::jsonb,'raw_payload','{}'::jsonb) || row_value ||
        jsonb_build_object('id',gen_random_uuid(),'import_id',r.import_id,'owner_user_id',r.owner_user_id,'row_index',row_number,'created_at',now(),'updated_at',now()))).*;
  end loop;
  meta:=i.processing_meta || coalesce(p_prepared->'metadata','{}'::jsonb);
  meta:=meta || jsonb_build_object('completedAt',now(),'normalizedAccountNumber',normalized_account,'ifscCode',account->>'ifscCode',
    'maskedAccountNumber',case when length(normalized_account)<=4 then normalized_account else repeat('*',length(normalized_account)-4)||right(normalized_account,4) end);
  meta:=jsonb_set(meta,'{analysis}',coalesce(i.processing_meta->'analysis','{}'::jsonb) || coalesce(meta->'analysis','{}'::jsonb) ||
    jsonb_build_object('status','completed','progress',100,'error',null,'completedAt',now(),'updatedAt',now(),
      'statementPeriodStart',coalesce(nullif(p_prepared->>'statementPeriodStart','')::date,i.statement_period_start),
      'statementPeriodEnd',coalesce(nullif(p_prepared->>'statementPeriodEnd','')::date,i.statement_period_end)));
  update public.bank_statement_imports set bank_account_id=case when candidate_count=1 then candidate_ids[1] else null end,
    statement_period_start=coalesce(nullif(p_prepared->>'statementPeriodStart','')::date,i.statement_period_start),
    statement_period_end=coalesce(nullif(p_prepared->>'statementPeriodEnd','')::date,i.statement_period_end),
    extracted_bank_name=account->>'bankName', extracted_account_number=account->>'accountNumber',
    extracted_account_holder_name=account->>'accountHolderName', extracted_ifsc_code=account->>'ifscCode',
    status=final_status, processing_meta=meta where id=r.import_id;
  update public.bank_statement_extraction_jobs set status='succeeded',progress=100,stage='Completed',error=null,finished_at=now(),
    result=jsonb_build_object('pipelineVersion',2,'importId',r.import_id,'transactionCount',row_number,'resultDigest',p_digest) where id=p_job_id;
  update public.bank_local_pipeline_runs set state='completed',result_digest=p_digest,revision=revision+1,updated_at=now()
    where job_id=p_job_id returning * into r;
  update public.tally_bridge_commands set external_result_reference='bank-document:' || p_digest where id=r.command_id;
  delete from public.bank_local_pipeline_checkpoints where job_id=p_job_id;
  return jsonb_build_object('state','completed','importId',r.import_id,'revision',r.revision,'digest',r.result_digest);
end $$;

create function public.bank_local_v2_cancel(p_job_id uuid, p_owner_id uuid, p_organization_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.bank_local_pipeline_runs;
begin
  perform 1 from public.bank_statement_extraction_jobs where id=p_job_id for update;
  select * into r from public.bank_local_pipeline_runs where job_id=p_job_id for update;
  if r.owner_user_id is distinct from p_owner_id or r.organization_id is distinct from p_organization_id then
    raise exception 'Job not owned' using errcode='42501'; end if;
  if r.state in ('completed','failed','cancelled') then return jsonb_build_object('state',r.state,'revision',r.revision); end if;
  update public.bank_statement_extraction_jobs set status='cancelled',stage='Cancelled',finished_at=now() where id=p_job_id;
  update public.bank_statement_imports set status='failed',processing_meta=jsonb_set(processing_meta,'{analysis}',
    coalesce(processing_meta->'analysis','{}'::jsonb) || jsonb_build_object('status','cancelled','stage','Cancelled','updatedAt',now())) where id=r.import_id;
  update public.tally_bridge_commands set status='canceled',completed_at=now() where id=r.command_id and status in ('queued','claimed');
  update public.bank_local_pipeline_runs set state='cancelled',revision=revision+1,updated_at=now() where job_id=p_job_id returning * into r;
  delete from public.bank_local_pipeline_checkpoints where job_id=p_job_id;
  return jsonb_build_object('state',r.state,'revision',r.revision);
end $$;

create function public.bank_local_v2_checkpoint(p_job_id uuid,p_identity jsonb,p_digest text,p_prepared jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.bank_local_pipeline_runs;
begin
  perform 1 from public.bank_statement_extraction_jobs where id=p_job_id and status='running' for update;
  if not found then raise exception 'Job no longer active' using errcode='55000'; end if;
  select * into r from public.bank_local_pipeline_runs where job_id=p_job_id for update;
  if r.identity is distinct from p_identity then raise exception 'Document scope mismatch' using errcode='42501'; end if;
  perform public.bank_local_v2_assert_identity(p_identity);
  if r.state not in ('analyzing','saving','recovery') then raise exception 'Cannot checkpoint terminal job' using errcode='55000'; end if;
  insert into public.bank_local_pipeline_checkpoints(job_id,result_digest,prepared_result)
    values(p_job_id,p_digest,p_prepared) on conflict(job_id) do nothing;
  if not exists(select 1 from public.bank_local_pipeline_checkpoints where job_id=p_job_id and result_digest=p_digest and prepared_result=p_prepared and expires_at>now()) then
    raise exception 'Conflicting checkpoint' using errcode='23505'; end if;
  update public.bank_local_pipeline_runs set state='recovery',revision=revision+1,updated_at=now() where job_id=p_job_id returning * into r;
  return jsonb_build_object('state',r.state,'revision',r.revision);
end $$;

create function public.bank_local_v2_fail(p_job_id uuid,p_identity jsonb,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.bank_local_pipeline_runs;
begin
  perform 1 from public.bank_statement_extraction_jobs where id=p_job_id for update;
  select * into r from public.bank_local_pipeline_runs where job_id=p_job_id for update;
  if r.identity is distinct from p_identity then raise exception 'Document scope mismatch' using errcode='42501'; end if;
  if r.state in ('completed','cancelled','failed') then return jsonb_build_object('state',r.state,'revision',r.revision); end if;
  -- A parser/transport failure reported by the agent is authoritative only
  -- before the backend accepted AI. A lost result stream must not discard an
  -- in-flight paid result or a recoverable structured checkpoint.
  if p_code='PREPARATION_FAILED' then
    perform public.bank_local_v2_assert_identity(p_identity);
    if r.state <> 'preparing' then return jsonb_build_object('state',r.state,'revision',r.revision); end if;
  end if;
  if p_code='CANCELLED' then return public.bank_local_v2_cancel(p_job_id,r.owner_user_id,r.organization_id); end if;
  update public.bank_statement_extraction_jobs set status='failed',stage='Document analysis failed',error='Analysis could not complete. Please retry.',finished_at=now() where id=p_job_id;
  update public.bank_statement_imports set status='failed',processing_meta=jsonb_set(processing_meta,'{analysis}',
    coalesce(processing_meta->'analysis','{}'::jsonb) || jsonb_build_object('status','failed','stage','Document analysis failed','error','Analysis could not complete. Please retry.','updatedAt',now())) where id=r.import_id;
  update public.bank_local_pipeline_runs set state='failed',revision=revision+1,updated_at=now() where job_id=p_job_id returning * into r;
  return jsonb_build_object('state',r.state,'revision',r.revision);
end $$;

-- Recovery owns no AI inputs and never invokes AI. SKIP LOCKED on the same
-- bank-job row preserves the cancellation/finalization lock order across workers.
create function public.bank_local_v2_recover_next()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare selected_job uuid; r public.bank_local_pipeline_runs; cp public.bank_local_pipeline_checkpoints; result jsonb;
begin
  select j.id into selected_job from public.bank_statement_extraction_jobs j
    join public.bank_local_pipeline_runs run on run.job_id=j.id
    where (run.state='recovery' or (run.state in ('preparing','analyzing','saving') and run.deadline_at<=now())
      or exists(select 1 from public.bank_local_pipeline_checkpoints c where c.job_id=j.id and c.expires_at<=now()))
    order by run.updated_at limit 1 for update of j skip locked;
  if selected_job is null then return jsonb_build_object('state','idle'); end if;
  select * into r from public.bank_local_pipeline_runs where job_id=selected_job for update;
  select * into cp from public.bank_local_pipeline_checkpoints where job_id=selected_job;
  if r.state in ('completed','failed','cancelled') then
    delete from public.bank_local_pipeline_checkpoints where job_id=selected_job;
    return jsonb_build_object('state','cleaned','jobId',selected_job);
  end if;
  if r.state='recovery' and cp.job_id is not null and cp.expires_at>now() then
    begin
      result:=public.bank_local_v2_finalize(selected_job,r.identity,cp.result_digest,cp.prepared_result);
    exception when insufficient_privilege or object_not_in_prerequisite_state then
      result:=public.bank_local_v2_fail(selected_job,r.identity,'RECOVERY_SCOPE_CHANGED');
      delete from public.bank_local_pipeline_checkpoints where job_id=selected_job;
    end;
  else
    result:=public.bank_local_v2_fail(selected_job,r.identity,'RESULT_UNAVAILABLE');
    delete from public.bank_local_pipeline_checkpoints where job_id=selected_job;
  end if;
  return result || jsonb_build_object('jobId',selected_job,'importId',r.import_id,
    'ownerUserId',r.owner_user_id,'organizationId',r.organization_id,'connectionId',r.identity->>'connectionId');
end $$;
revoke all on function public.bank_local_v2_recover_next() from public,anon,authenticated;
grant execute on function public.bank_local_v2_recover_next() to service_role;

create function public.bank_local_v2_status(p_command_id uuid,p_owner_id uuid,p_connection_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.bank_local_pipeline_runs; job_status text;
begin
  select * into r from public.bank_local_pipeline_runs where command_id=p_command_id
    and owner_user_id=p_owner_id and identity->>'connectionId'=p_connection_id::text;
  if r.job_id is null then raise exception 'Document scope mismatch' using errcode='42501'; end if;
  perform public.bank_local_v2_assert_identity(r.identity);
  select status into job_status from public.bank_statement_extraction_jobs where id=r.job_id;
  return jsonb_build_object('state',case when job_status='cancelled' then 'cancelled' when job_status='failed' then 'failed' else r.state end,
    'jobId',r.job_id,'importId',r.import_id,'revision',r.revision,'digest',r.result_digest);
end $$;
revoke all on function public.bank_local_v2_status(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bank_local_v2_status(uuid,uuid,uuid) to service_role;
revoke all on function public.bank_local_v2_checkpoint(uuid,jsonb,text,jsonb) from public,anon,authenticated;
revoke all on function public.bank_local_v2_fail(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.bank_local_v2_checkpoint(uuid,jsonb,text,jsonb) to service_role;
grant execute on function public.bank_local_v2_fail(uuid,jsonb,text) to service_role;
revoke all on function public.bank_local_v2_assert_identity(jsonb) from public, anon, authenticated;
revoke all on function public.bank_local_v2_create(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer) from public, anon, authenticated;
revoke all on function public.bank_local_v2_claim(uuid,uuid,jsonb,text,text,integer) from public, anon, authenticated;
revoke all on function public.bank_local_v2_finalize(uuid,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function public.bank_local_v2_cancel(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.bank_local_v2_assert_identity(jsonb) to service_role;
grant execute on function public.bank_local_v2_create(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer) to service_role;
grant execute on function public.bank_local_v2_claim(uuid,uuid,jsonb,text,text,integer) to service_role;
grant execute on function public.bank_local_v2_finalize(uuid,jsonb,text,jsonb) to service_role;
grant execute on function public.bank_local_v2_cancel(uuid,uuid,text) to service_role;
create or replace function public.claim_bank_statement_extraction_job(
  worker_name text default 'worker',
  stale_after interval default interval '20 minutes',
  worker_pool text default null
)
returns public.bank_statement_extraction_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.bank_statement_extraction_jobs;
  effective_worker_pool text := case
    when lower(coalesce(worker_pool, '')) in ('local', 'remote')
      then lower(worker_pool)
    when lower(coalesce(worker_name, '')) like 'local-%'
      then 'local'
    else 'remote'
  end;
  stale_message text := 'Analysis could not be completed. Please retry. If this continues, contact helpdesk.';
begin
  update public.bank_statement_extraction_jobs
  set status = 'queued',
      progress = 0,
      stage = 'Queued after stale worker run',
      error = stale_message,
      locked_at = null,
      locked_by = null,
      next_run_at = now(),
      updated_at = now()
  where coalesce(result->>'pipelineVersion','1') <> '2'
    and status = 'running'
    and locked_at < now() - stale_after
    and attempt_count < max_attempts;

  update public.bank_statement_extraction_jobs
  set status = 'failed',
      progress = 100,
      stage = 'Failed',
      error = stale_message,
      locked_at = null,
      locked_by = null,
      finished_at = coalesce(finished_at, now()),
      updated_at = now()
  where coalesce(result->>'pipelineVersion','1') <> '2'
    and status = 'running'
    and locked_at < now() - stale_after
    and attempt_count >= max_attempts;

  select *
  into claimed
  from public.bank_statement_extraction_jobs
  where coalesce(result->>'pipelineVersion','1') <> '2'
    and status = 'queued'
    and next_run_at <= now()
    and coalesce(nullif(lower(result ->> 'workerPool'), ''), 'remote') = effective_worker_pool
  order by created_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update public.bank_statement_extraction_jobs
  set status = 'running',
      attempt_count = claimed.attempt_count + 1,
      progress = 5,
      stage = 'Starting extraction',
      error = null,
      locked_at = now(),
      locked_by = worker_name,
      started_at = coalesce(claimed.started_at, now()),
      updated_at = now()
  where id = claimed.id
  returning *
  into claimed;

  return claimed;
end;
$$;
revoke all on function public.claim_bank_statement_extraction_job(text,interval,text) from public,anon,authenticated;
grant execute on function public.claim_bank_statement_extraction_job(text,interval,text) to service_role;
commit;
