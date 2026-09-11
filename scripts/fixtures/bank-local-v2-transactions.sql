-- Run only against bank-local-v2-schema.sql in a disposable database.
-- Every DO block uses generated identities; no real organization is accessed.
do $$ begin
  perform set_config('test.realtime_topic','bank-jobs:owner:connection',true);
  set local role authenticated;
  assert (select count(*) from realtime.messages)=0,'bank event topic can be read directly';
  begin
    insert into realtime.messages values(2);
    raise exception 'bank event spoofing was allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('test.realtime_topic','unrelated-topic',true);
  assert (select count(*) from realtime.messages)=1,'unrelated existing policy changed';
  reset role;
  raise notice 'v2 private event topic denies direct reads/writes without changing unrelated topics';
end $$;
do $$
#variable_conflict use_variable
declare
 owner_id uuid:=gen_random_uuid(); connection_id uuid:=gen_random_uuid();
 import_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); command_id uuid:=gen_random_uuid();
 identity jsonb; upload jsonb; file_meta jsonb; result jsonb; prepared jsonb; account_id uuid:=gen_random_uuid();
begin
 insert into auth.users values(owner_id);
 insert into public.tally_connections values(connection_id,owner_id,'test-org','test-installation',3,null,
   '[{"guid":"test-company","companyName":"Test Company","financialYear":"2026-27"}]');
 identity:=jsonb_build_object('organizationId','test-org','ownerUserId',owner_id,'connectionId',connection_id,
   'installationId','test-installation','sessionGeneration',3,'companyGuid','test-company','companyName','Test Company','financialYear','2026-2027');
 upload:=jsonb_build_object('tokenHash',repeat('a',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000);
 file_meta:=jsonb_build_object('name','test.pdf','size',100,'sha256',repeat('b',64));
 result:=public.bank_local_v2_create(import_id,job_id,command_id,identity,file_meta,upload,'http://localhost:3001/result','test-token');
 assert result->>'state'='created','atomic creation failed';
 assert not exists(select 1 from public.bank_statement_imports where id=import_id and processing_meta::text like '%ledgerNames%');
 result:=public.bank_local_v2_create(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),identity,file_meta,upload,'http://localhost:3001/result','test-token');
 assert result->>'state'='busy','organization admission not bounded';
 update public.tally_bridge_commands set status='claimed' where id=command_id;
 result:=public.bank_local_v2_claim(job_id,command_id,identity,repeat('b',64),repeat('c',64),2);
 assert result->>'state'='accepted','claim failed';
 result:=public.bank_local_v2_claim(job_id,command_id,identity,repeat('b',64),repeat('c',64),2);
 assert result->>'state'='analyzing','duplicate claim should not accept AI';
 insert into public.bank_accounts values(account_id,owner_id,'AB1234');
 update public.bank_statement_imports set extracted_account_number='AB-1234' where id=import_id;
 prepared:='{"account":{"accountNumber":"wrong"},"rows":[{"transaction_date":"2026-09-01","description":"Receipt","credit_amount":20,"transaction_type":"unknown","category":"unknown"}],"extractionIncomplete":false,"metadata":{}}';
 result:=public.bank_local_v2_finalize(job_id,identity,repeat('d',64),prepared);
 assert result->>'state'='completed','finalization failed';
 assert (select count(*) from public.bank_statement_import_preview_transactions where import_id=bank_statement_import_preview_transactions.import_id and owner_user_id=owner_id)=1;
 assert exists(select 1 from public.bank_statement_imports where id=import_id and bank_account_id=account_id),'manual account override lost';
 result:=public.bank_local_v2_finalize(job_id,identity,repeat('d',64),prepared);
 assert result->>'state'='completed','idempotent finalization failed';
 begin
   perform public.bank_local_v2_finalize(job_id,identity,repeat('e',64),prepared);
   raise exception 'conflicting digest accepted';
 exception when unique_violation then null; end;
 result:=public.bank_local_v2_cancel(job_id,owner_id,'test-org');
 assert result->>'state'='completed','cancel overwrote completion';
 assert not has_function_privilege('authenticated','public.bank_local_v2_finalize(uuid,jsonb,text,jsonb)','EXECUTE');
 assert not has_table_privilege('authenticated','public.bank_local_pipeline_checkpoints','SELECT');
 raise notice 'v2 atomic creation/claim/finalization/idempotency/admission/account/permissions checks passed';
end $$;

do $$
#variable_conflict use_variable
declare
 owner_id uuid:=gen_random_uuid(); connection_id uuid:=gen_random_uuid();
 import_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); command_id uuid:=gen_random_uuid();
 identity jsonb; upload jsonb; file_meta jsonb; prepared jsonb; result jsonb;
begin
 insert into auth.users values(owner_id);
 insert into public.tally_connections values(connection_id,owner_id,'test-org-rollback','installation',1,null,
   '[{"guid":"company","companyName":"Company","financialYear":"2026-27"}]');
 identity:=jsonb_build_object('organizationId','test-org-rollback','ownerUserId',owner_id,'connectionId',connection_id,
   'installationId','installation','sessionGeneration',1,'companyGuid','company','companyName','Company','financialYear','2026-2027');
 upload:=jsonb_build_object('tokenHash',repeat('a',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000);
 file_meta:=jsonb_build_object('name','test.pdf','size',100,'sha256',repeat('b',64));
 perform public.bank_local_v2_create(import_id,job_id,command_id,identity,file_meta,upload,'http://localhost:3001/result','test-token');
 update public.tally_bridge_commands set status='claimed' where id=command_id;
 perform public.bank_local_v2_claim(job_id,command_id,identity,repeat('b',64),repeat('c',64),2);
 assert (public.bank_local_v2_fail(job_id,identity,'PREPARATION_FAILED')->>'state')='analyzing',
   'a late agent transport error discarded an accepted AI call';
 insert into public.bank_statement_import_preview_transactions(import_id,owner_user_id,row_index,transaction_date,description) values(import_id,owner_id,1,'2026-09-01','Before');
 prepared:='{"account":{},"rows":[{"transaction_date":"2026-09-01","description":"After","credit_amount":20,"transaction_type":"unknown","category":"unknown"},{"transaction_date":"invalid","description":"bad"}],"extractionIncomplete":false,"metadata":{}}';
 begin
   perform public.bank_local_v2_finalize(job_id,identity,repeat('d',64),prepared);
   raise exception 'invalid preview accepted';
 exception when invalid_datetime_format then null; end;
 assert exists(select 1 from public.bank_statement_import_preview_transactions where owner_user_id=owner_id and description='Before'),'failed transaction destroyed previous preview';
 assert (select status from public.bank_statement_extraction_jobs where id=job_id)='running';
 prepared:=jsonb_set(prepared,'{rows}',jsonb_build_array(prepared#>'{rows,0}'));
 perform public.bank_local_v2_checkpoint(job_id,identity,repeat('d',64),prepared);
 assert exists(select 1 from public.bank_local_pipeline_checkpoints where bank_local_pipeline_checkpoints.job_id=job_id);
 -- A cancellation and a finalization serialize on the same extraction-job row.
 result:=public.bank_local_v2_cancel(job_id,owner_id,'test-org-rollback');
 assert result->>'state'='cancelled';
 begin
   perform public.bank_local_v2_finalize(job_id,identity,repeat('d',64),prepared);
   raise exception 'cancelled job finalized';
 exception when object_not_in_prerequisite_state then null; end;
 assert not exists(select 1 from public.bank_local_pipeline_checkpoints where bank_local_pipeline_checkpoints.job_id=job_id),'cancelled checkpoint retained';
 raise notice 'v2 rollback/cancellation/checkpoint checks passed';
end $$;

do $$
#variable_conflict use_variable
declare
 owner_id uuid:=gen_random_uuid(); connection_id uuid:=gen_random_uuid();
 import_id uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); command_id uuid:=gen_random_uuid();
 identity jsonb; upload jsonb; file_meta jsonb; prepared jsonb; result jsonb;
begin
 insert into auth.users values(owner_id);
 insert into public.tally_connections values(connection_id,owner_id,'test-recovery','installation',1,null,
   '[{"guid":"company","companyName":"Company","financialYear":"2026-27"}]');
 identity:=jsonb_build_object('organizationId','test-recovery','ownerUserId',owner_id,'connectionId',connection_id,
   'installationId','installation','sessionGeneration',1,'companyGuid','company','companyName','Company','financialYear','2026-2027');
 upload:=jsonb_build_object('tokenHash',repeat('a',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000);
 file_meta:=jsonb_build_object('name','test.pdf','size',100,'sha256',repeat('b',64));
 result:=public.bank_local_v2_create(import_id,job_id,command_id,identity,file_meta,upload,'http://localhost:3001/result','test-token');
 assert result#>>'{import,id}'=import_id::text,'creation response requires an extra import read';
 update public.tally_bridge_commands set status='claimed' where id=command_id;
 perform public.bank_local_v2_claim(job_id,command_id,identity,repeat('b',64),repeat('c',64),2);
 begin
   perform public.bank_local_v2_claim(job_id,command_id,identity,repeat('b',64),repeat('e',64),2);
   raise exception 'changed context accepted';
 exception when unique_violation then null; end;
 prepared:='{"account":{},"rows":[{"transaction_date":"2026-09-01","description":"Recovered","credit_amount":20,"transaction_type":"unknown","category":"unknown"}],"extractionIncomplete":false,"metadata":{}}';
 perform public.bank_local_v2_checkpoint(job_id,identity,repeat('d',64),prepared);
 result:=public.bank_local_v2_recover_next();
 assert result->>'state'='completed' and result->>'jobId'=job_id::text,'checkpoint was not recovered';
 assert not exists(select 1 from public.bank_local_pipeline_checkpoints c where c.job_id=job_id),'successful checkpoint retained';
 assert (public.bank_local_v2_status(command_id,owner_id,connection_id)->>'state')='completed';
 assert (public.bank_local_v2_recover_next()->>'state')='idle','recovery repeated a completed result';
 -- A never-accepted attempt expires without any replay or AI invocation.
 import_id:=gen_random_uuid(); job_id:=gen_random_uuid(); command_id:=gen_random_uuid();
 perform public.bank_local_v2_create(import_id,job_id,command_id,identity,file_meta,upload,'http://localhost:3001/result','test-token');
 update public.bank_local_pipeline_runs r set deadline_at=now()-interval '1 minute' where r.job_id=job_id;
 result:=public.bank_local_v2_recover_next();
 assert result->>'state'='failed','abandoned preparation was not expired';
 assert not has_function_privilege('authenticated','public.bank_local_v2_recover_next()','EXECUTE');
 import_id:=gen_random_uuid(); job_id:=gen_random_uuid(); command_id:=gen_random_uuid();
 perform public.bank_local_v2_create(import_id,job_id,command_id,identity,file_meta,upload,'http://localhost:3001/result','test-token');
 assert (public.bank_local_v2_fail(job_id,identity,'PREPARATION_FAILED')->>'state')='failed',
   'a parser failure did not terminate its unaccepted analysis job';
 raise notice 'v2 structured recovery/expiry/context conflict/status checks passed';
end $$;
