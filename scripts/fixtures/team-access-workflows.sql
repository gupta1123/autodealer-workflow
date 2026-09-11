\set ON_ERROR_STOP on
\ir team-access.sql
-- Representative optional legacy tables verify triggers as well as an empty schema.
create table packet_documents(id uuid primary key,case_id uuid not null,document_type text,extracted_fields jsonb);
create table purchase_invoice_tally_postings(id uuid primary key,case_id uuid not null,connection_id uuid,review_patch jsonb,status text);
create table tally_bridge_commands(id uuid primary key,organization_id text,status text);
create table bank_accounts(id uuid primary key,owner_user_id uuid);
\ir ../../supabase/migrations/20260904151552_team_access_workflow_authority.sql
insert into access_companies(id,organization_id,name,erp_identity) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','org-a','Company A','guid-a:2026-27'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','org-b','Same name does not mean same company','guid-b:2026-27');
insert into auth.users values('44444444-4444-4444-4444-444444444444');
insert into access_roles(id,organization_id,name,permissions) values('55555555-5555-5555-5555-555555555555','org-a','Purchase approver and poster',array['purchases.view','purchases.prepare','purchases.submit','purchases.approve','purchases.post']);
insert into access_members(organization_id,user_id,role_id,display_name,email,modules,company_ids) values('org-a','44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','Independent approver','approver@example.test',array['purchases'],array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[]);
update access_members set status='active',role_id='55555555-5555-5555-5555-555555555555',modules=array['purchases'],company_ids=array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[] where user_id='22222222-2222-2222-2222-222222222222';
insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence) values('case','cccccccc-cccc-cccc-cccc-cccccccccccc','org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','Synthetic fixture; verified GUID');
do $$ declare prep uuid:='22222222-2222-2222-2222-222222222222'; approver uuid:='44444444-4444-4444-4444-444444444444'; cid uuid:='cccccccc-cccc-cccc-cccc-cccccccccccc'; cmd uuid:='dddddddd-dddd-dddd-dddd-dddddddddddd'; digest text:=repeat('a',64); w jsonb;
begin
 begin perform access_assert_permission(prep,'org-b','purchases.view','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');raise exception 'Cross org allowed';exception when insufficient_privilege then null;end;
 begin perform access_assert_permission(prep,'org-a','purchases.view',null);raise exception 'Unclassified allowed';exception when insufficient_privilege then null;end;
 w:=access_purchase_transition(prep,'org-a',cid,'prepare',0,digest);
 w:=access_purchase_transition(prep,'org-a',cid,'submit',1,digest);
 begin perform access_purchase_transition(prep,'org-a',cid,'approve',2,digest);raise exception 'Self approval allowed';exception when insufficient_privilege then null;end;
 begin perform access_purchase_transition(prep,'org-a',cid,'prepare',2,repeat('b',64));raise exception 'Submitted details edited';exception when object_not_in_prerequisite_state then null;end;
 begin perform access_purchase_transition(approver,'org-a',cid,'approve',1,digest);raise exception 'Stale approval allowed';exception when serialization_failure then null;end;
 begin perform access_purchase_transition(approver,'org-a',cid,'approve',2,repeat('b',64));raise exception 'Changed details approved';exception when serialization_failure then null;end;
 w:=access_purchase_transition(approver,'org-a',cid,'approve',2,digest);
 w:=access_purchase_transition(approver,'org-a',cid,'return',3,null,'Correct the invoice amount');
 w:=access_purchase_transition(prep,'org-a',cid,'prepare',4,repeat('b',64));
 if (w->>'financial_revision')::int<>2 or w->>'approved_by' is not null then raise exception 'Approval not invalidated';end if;
 w:=access_purchase_transition(prep,'org-a',cid,'submit',5,repeat('b',64));
 w:=access_purchase_transition(approver,'org-a',cid,'approve',6,repeat('b',64));
 insert into access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission,case_id,approved_revision) values(cmd,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',approver,'purchases.post',cid,2);
 update access_members set status='suspended' where user_id=approver;
 begin perform access_dispatch_command(cmd);raise exception 'Suspended user write dispatched';exception when insufficient_privilege then null;end;
 update access_members set status='active' where user_id=approver;
 perform access_dispatch_command(cmd);
 begin perform access_dispatch_command(cmd);raise exception 'Write issued twice';exception when object_not_in_prerequisite_state then null;end;
 if (select state from access_purchase_workflows where case_id=cid)<>'posting' then raise exception 'Posting transition not saved';end if;
 if has_function_privilege('authenticated','access_dispatch_command(uuid)','execute') then raise exception 'Direct dispatch possible';end if;
 if has_table_privilege('authenticated','access_purchase_workflows','update') then raise exception 'Direct approval possible';end if;
end $$;
select 'Workflow authority tests passed' as result;
do $$ declare actor uuid:='22222222-2222-2222-2222-222222222222'; cid uuid:='cccccccc-cccc-cccc-cccc-ccccccccccc2'; cmd uuid:='dddddddd-dddd-dddd-dddd-ddddddddddd2'; digest text:=repeat('f',64);
begin
 insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence) values('case',cid,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',actor,'Synthetic source race');
 insert into packet_documents values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',cid,'Invoice','{"amount":10}');
 begin perform access_purchase_transition(actor,'org-a',cid,'prepare',0,digest,null,0);raise exception 'Stale source accepted';exception when serialization_failure then null;end;
 perform access_purchase_transition(actor,'org-a',cid,'prepare',0,digest,null,1);
 update packet_documents set extracted_fields='{"amount":20}' where case_id=cid;
 begin perform access_purchase_transition(actor,'org-a',cid,'submit',1,digest,null,1);raise exception 'Changed source submitted';exception when serialization_failure then null;end;
 perform access_purchase_transition(actor,'org-a',cid,'prepare',2,digest,null,2);
 perform access_purchase_transition(actor,'org-a',cid,'submit',3,digest,null,2);
 begin update packet_documents set extracted_fields='{"amount":30}' where case_id=cid;raise exception 'Submitted source modified';exception when object_not_in_prerequisite_state then null;end;
 begin delete from packet_documents where case_id=cid;raise exception 'Submitted source deleted';exception when object_not_in_prerequisite_state then null;end;
 insert into tally_bridge_commands values(cmd,'org-a','queued');
 insert into access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission) values(cmd,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',actor,'purchases.post');
 update tally_bridge_commands set status='claimed' where id=cmd;
 if (select state from access_command_authority where command_id=cmd)<>'issued' then raise exception 'Dispatch trigger did not run';end if;
 begin update tally_bridge_commands set status='queued' where id=cmd;raise exception 'Blind retry allowed';exception when object_not_in_prerequisite_state then null;end;
 update access_members set status='suspended' where user_id=actor;
 update tally_bridge_commands set status='succeeded' where id=cmd;
 if (select state from access_command_authority where command_id=cmd)<>'completed' then raise exception 'In-flight result lost after suspension';end if;
 if not (access_mapping_report()->'resources' @> '[{"table":"bank_statement_imports","exists":false}]'::jsonb) then raise exception 'Missing optional table not reported';end if;
end $$;
select 'Financial race and database dispatch trigger tests passed' as result;
do $$ declare acct uuid:='ffffffff-ffff-ffff-ffff-ffffffffffff';begin
 insert into bank_accounts values(acct,'11111111-1111-1111-1111-111111111111');
 insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,mapping_evidence) values('bank_account',acct,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Synthetic explicit mapping');
 if not exists(select 1 from bank_accounts where id=acct and access_organization_id='org-a' and access_company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then raise exception 'Scope not mirrored to indexed listing';end if;
 begin update access_resource_scopes set company_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where resource_id=acct;raise exception 'Foreign organization company assigned';exception when foreign_key_violation then null;end;
 delete from access_resource_scopes where resource_type='bank_account' and resource_id=acct;
 if exists(select 1 from bank_accounts where id=acct and access_organization_id is not null) then raise exception 'Deleted mapping remained visible';end if;
end $$;
select 'Scope mirroring and removal tests passed' as result;
