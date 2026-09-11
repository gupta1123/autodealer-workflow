\set ON_ERROR_STOP on
\ir bank-local-v2-schema.sql
alter table public.bank_statement_imports add column storage_asset_id uuid;
\ir ../../supabase/migrations/20260904072147_bank_local_pipeline_v2.sql
\ir ../../supabase/migrations/20260904145334_team_access_foundation.sql
\ir ../../supabase/migrations/20260904151552_team_access_workflow_authority.sql
\ir ../../supabase/migrations/20260904174716_team_access_dispatch_identity.sql
\ir ../../supabase/migrations/20260905072804_team_access_bank_documents.sql
do $$ declare paired uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); teammate uuid:=gen_random_uuid(); role_id uuid:=gen_random_uuid();
 company uuid:=gen_random_uuid(); other_company uuid:=gen_random_uuid(); conn uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); jid uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid();
 identity jsonb; file_meta jsonb; upload jsonb; result jsonb; prepared jsonb; account_id uuid:=gen_random_uuid(); other_account uuid:=gen_random_uuid();
begin
 insert into auth.users values(paired),(actor),(teammate);
 insert into access_organizations(id,name) values('org-a','Team A');
 insert into access_roles(id,organization_id,name,permissions) values(role_id,'org-a','Bank preparer',array['bank.view','bank.prepare']);
 insert into access_companies(id,organization_id,name,erp_identity) values(company,'org-a','Company','guid:2026-27'),(other_company,'org-a','Other','other:2026-27');
 insert into access_members(organization_id,user_id,role_id,display_name,email,modules,company_ids) values
  ('org-a',actor,role_id,'Actor','actor@example.test',array['bank'],array[company]),('org-a',teammate,role_id,'Teammate','team@example.test',array['bank'],array[company]);
 insert into tally_connections(id,owner_user_id,organization_id,installation_id,session_generation,last_companies_snapshot)
 values(conn,paired,'org-a','machine',3,'[{"guid":"guid","companyName":"Company","financialYear":"2026-27"}]');
 insert into access_company_links values('org-a',company,conn,'machine','guid','2026-27',now(),'Synthetic verified dataset');
 identity:=jsonb_build_object('organizationId','org-a','ownerUserId',paired,'connectionId',conn,'installationId','machine','sessionGeneration',3,'companyGuid','guid','companyName','Company','financialYear','2026-2027');
 file_meta:=jsonb_build_object('name','test.pdf','size',100,'sha256',repeat('b',64));
 upload:=jsonb_build_object('tokenHash',repeat('a',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000);
 result:=access_bank_local_create(actor,'org-a',company,iid,jid,cid,identity,file_meta,upload,'http://localhost:3001/result','synthetic');
 assert result->>'state'='created','shared job creation failed';
 assert (select owner_user_id from bank_statement_imports where id=iid)=actor,'financial creator replaced by paired owner';
 assert (select owner_user_id from tally_bridge_commands where id=cid)=paired,'paired owner replaced by actor';
 assert exists(select 1 from access_command_authority where command_id=cid and initiating_user_id=actor),'parse authority missing';
 assert exists(select 1 from access_resource_scopes where resource_id=iid and creator_user_id=actor and company_id=company),'import not classified';
 update tally_bridge_commands set status='claimed' where id=cid;
 result:=bank_local_v2_claim(jid,cid,identity,repeat('b',64),repeat('c',64),1);
 assert result->>'state'='accepted','shared claim failed';
 result:=bank_local_v2_status(cid,paired,conn);assert result->>'state'='analyzing','paired token could not read compact status';
 -- The matching account is owned by a teammate. A same-number account outside
 -- this company must neither be selected nor cause ambiguous selection.
 insert into bank_accounts(id,owner_user_id,account_number_normalized) values(account_id,teammate,'AB123'),(other_account,actor,'AB123');
 insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence) values
  ('bank_account',account_id,'org-a',company,teammate,'Synthetic'),('bank_account',other_account,'org-a',other_company,actor,'Synthetic');
 prepared:='{"account":{"accountNumber":"AB123"},"rows":[{"transaction_date":"2026-09-05","description":"Receipt","credit_amount":100,"transaction_type":"receipt","category":"unknown"}],"extractionIncomplete":false,"metadata":{}}';
 update access_members set status='suspended' where user_id=actor;
 begin perform bank_local_v2_finalize(jid,identity,repeat('d',64),prepared);raise exception 'Revoked finalization succeeded';exception when insufficient_privilege then null;end;
 begin perform bank_local_v2_checkpoint(jid,identity,repeat('d',64),prepared);raise exception 'Revoked checkpoint succeeded';exception when insufficient_privilege then null;end;
 begin perform bank_local_v2_status(cid,paired,conn);raise exception 'Revoked job status accepted';exception when insufficient_privilege then null;end;
 assert not exists(select 1 from bank_statement_import_preview_transactions where import_id=iid),'revoked rows persisted';
 update access_members set status='active' where user_id=actor;
 result:=bank_local_v2_finalize(jid,identity,repeat('d',64),prepared);
 assert result->>'state'='completed','shared finalization failed';
 assert (select bank_account_id from bank_statement_imports where id=iid)=account_id,'company-scoped teammate account not selected';
 assert (select owner_user_id from bank_statement_import_preview_transactions where import_id=iid)=actor,'preview creator lost';
 update bank_statement_imports set bank_account_id=null where id=iid;
 perform bank_local_v2_finalize(jid,identity,repeat('d',64),prepared);
 assert (select bank_account_id is null from bank_statement_imports where id=iid),'duplicate completion overwrote edited selection';
 -- A teammate may cancel unfinished shared work, but not overwrite completion.
 result:=access_cancel_bank_document(teammate,'org-a',jid);assert result->>'state'='completed','cancel overwrote completion';
 iid:=gen_random_uuid();jid:=gen_random_uuid();cid:=gen_random_uuid();
 result:=access_bank_local_create(actor,'org-a',company,iid,jid,cid,identity,file_meta,upload,'http://localhost:3001/result','synthetic');
 result:=access_cancel_bank_document(teammate,'org-a',jid);assert result->>'state'='cancelled','shared cancellation failed';
 begin perform bank_local_v2_claim(jid,cid,identity,repeat('b',64),repeat('c',64),1);exception when object_not_in_prerequisite_state then null;end;
 assert not has_table_privilege('authenticated','access_bank_document_jobs','select'),'document authority exposed';
 assert not has_function_privilege('authenticated','access_bank_local_create(uuid,text,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer)','execute'),'direct job creation allowed';
 -- Backend-parser publication is one transaction, with a current worker lease.
 result:=access_bank_backend_create(actor,'org-a',company,
  jsonb_build_object('connectionId',conn,'installationId','machine','sessionGeneration',3,'companyGuid','guid','financialYear','2026-27'),
  jsonb_build_object('owner_user_id',actor,'original_file_name','backend.pdf','storage_bucket','synthetic','storage_path','synthetic/backend.pdf',
   'processing_meta','{"selectedContext":{}}'::jsonb),'{}');
 iid:=(result->>'id')::uuid;
 select job_id into jid from access_bank_document_jobs where import_id=iid;
 update bank_statement_extraction_jobs set status='running',attempt_count=1,locked_by='synthetic-worker' where id=jid;
 prepared:='{"status":"ready_to_review","extracted_account_number":"AB123","processing_meta":{}}';
 begin
  perform access_bank_backend_finalize(jid,1,'wrong-worker',prepared,'[]','{}');raise exception 'Wrong worker published';
 exception when serialization_failure then null;end;
 begin
  perform access_bank_backend_finalize(jid,1,'synthetic-worker',prepared,'[{"transaction_date":"2026-09-05","description":"Valid","credit_amount":100,"transaction_type":"receipt"},{"transaction_date":"not-a-date"}]','{}');
  raise exception 'Malformed preview published';
 exception when invalid_datetime_format then null;end;
 assert not exists(select 1 from bank_statement_import_preview_transactions where import_id=iid),'partial backend preview persisted';
 assert (select status from bank_statement_extraction_jobs where id=jid)='running','failed save completed job';
 update access_members set status='suspended' where user_id=actor;
 begin perform access_bank_backend_finalize(jid,1,'synthetic-worker',prepared,'[]','{}');raise exception 'Revoked worker published';
 exception when insufficient_privilege then null;end;
 update access_members set status='active' where user_id=actor;
 result:=access_bank_backend_finalize(jid,1,'synthetic-worker',prepared,'[{"transaction_date":"2026-09-05","description":"Receipt","credit_amount":100,"transaction_type":"receipt"}]','{}');
 assert result->>'transactionCount'='1','backend preview missing';
 assert (select bank_account_id from bank_statement_imports where id=iid)=account_id,'backend account scope failed';
 perform access_bank_backend_finalize(jid,1,'synthetic-worker',prepared,'[{"transaction_date":"2026-09-05","description":"Receipt","credit_amount":100,"transaction_type":"receipt"}]','{}');
 assert (select count(*) from bank_statement_import_preview_transactions where import_id=iid)=1,'duplicate backend preview';
 begin perform access_bank_backend_finalize(jid,1,'synthetic-worker',prepared,'[]','{}');raise exception 'Different completed result overwritten';
 exception when serialization_failure then null;end;
end $$;
select 'Shared local document creator, scope, revocation, account selection, retry and cancellation tests passed' as result;
