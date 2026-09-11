\set ON_ERROR_STOP on
\ir team-access-workflows.sql
-- Minimal representative transport columns; no hosted data or credentials.
alter table purchase_invoice_tally_postings add column owner_user_id uuid,add column master_sync_run_id uuid,add column command_id uuid,
 add column revision integer default 1,add column tally_created_at timestamptz,add column approved_at timestamptz,
 add column idempotency_key text,add column duplicate_key text,add column approved_payload_hash text,add column last_error text,add column queued_at timestamptz;
alter table tally_bridge_commands alter column id set default gen_random_uuid();
alter table tally_bridge_commands add column connection_id uuid,add column owner_user_id uuid,add column command_type text,
 add column payload jsonb,add column priority integer default 40,add column max_attempts integer default 3,
 add column attempts integer default 0,add column available_at timestamptz default now(),add column created_at timestamptz default now(),
 add column claimed_at timestamptz,add column completed_at timestamptz,add column error text,add column bridge_version text,
 add column installation_id text,add column session_generation bigint,add column company_guid text,add column financial_year text,
 add column protocol_version integer default 0,add column job_class text,add column deadline_at timestamptz;
create table tally_connections(id uuid primary key,owner_user_id uuid,installation_id text,session_generation bigint,revoked_at timestamptz);
\ir ../../supabase/migrations/202607280001_harden_purchase_voucher_verification.sql
\ir ../../supabase/migrations/20260904160936_team_access_command_dispatch.sql
do $$
declare actor uuid:='22222222-2222-2222-2222-222222222222'; approver uuid:='44444444-4444-4444-4444-444444444444';
 cid uuid:='cccccccc-cccc-cccc-cccc-ccccccccc100'; pid uuid:='eeeeeeee-eeee-eeee-eeee-eeeeeeeee100';
 conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100'; cmd uuid; again uuid; result jsonb; args jsonb; rev bigint;
begin
 update access_members set status='active' where organization_id='org-a';
 insert into tally_connections values(conn,'11111111-1111-1111-1111-111111111111','install-a',7,null);
 insert into access_company_links values('org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',conn,'install-a','guid-a','2026-27',now(),'Synthetic fixture');
 insert into access_resource_scopes(resource_type,resource_id,organization_id,company_id,creator_user_id,mapping_evidence)
 values('case',cid,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',actor,'Synthetic fixture');
 insert into purchase_invoice_tally_postings(id,case_id,owner_user_id,connection_id,review_patch,status) values(pid,cid,actor,conn,'{}','draft');
 select source_revision into rev from access_resource_scopes where resource_type='case' and resource_id=cid;
 perform access_purchase_transition(actor,'org-a',cid,'prepare',0,repeat('a',64),null,rev);
 perform access_purchase_transition(actor,'org-a',cid,'submit',1,repeat('a',64),null,rev);
 args:=jsonb_build_object('p_posting_id',pid,'p_connection_id',conn,'p_revision',1,'p_tally_payload',jsonb_build_object('companyName','Company A'),'p_duplicate_key','fixture','p_idempotency_key','fixture','p_approved_payload_hash',repeat('b',64));
 begin perform access_enqueue_purchase(actor,'org-a',cid,2,rev,repeat('a',64),args);raise exception 'Unapproved posting allowed';exception when object_not_in_prerequisite_state then null;end;
 perform access_purchase_transition(approver,'org-a',cid,'approve',2,repeat('a',64),null,rev);
 begin perform access_enqueue_purchase(actor,'org-a',cid,3,rev-1,repeat('a',64),args);raise exception 'Stale source queued';exception when serialization_failure then null;end;
 cmd:=access_enqueue_purchase(actor,'org-a',cid,3,rev,repeat('a',64),args);
 again:=access_enqueue_purchase(actor,'org-a',cid,3,rev,repeat('a',64),args);
 if cmd<>again or (select count(*) from tally_bridge_commands where id=cmd)<>1 then raise exception 'Duplicate command created';end if;
 if (select initiating_user_id from access_command_authority where command_id=cmd)<>actor then raise exception 'Initiator lost';end if;
 if (select owner_user_id from tally_bridge_commands where id=cmd)<>'11111111-1111-1111-1111-111111111111'::uuid then raise exception 'Paired connector owner changed';end if;
 update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
 result:=access_claim_next_command(conn,'install-a',7,'1.0');
 if result is not null or (select status from tally_bridge_commands where id=cmd)<>'canceled' then raise exception 'Revoked command not canceled';end if;
 if (select state from access_command_authority where command_id=cmd)<>'cancelled' then raise exception 'Authority not canceled';end if;
 -- A permitted command behind a revoked entry still runs; no queue starvation.
 insert into tally_bridge_commands(id,connection_id,installation_id,session_generation,status,payload) values(gen_random_uuid(),conn,'install-a',7,'queued','{}') returning id into cmd;
 insert into access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission) values(cmd,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',approver,'purchases.post');
 result:=access_claim_next_command(conn,'install-a',7,'1.0');
 if result->>'id'<>cmd::text or result->>'status'<>'claimed' then raise exception 'Valid command not claimed';end if;
 update tally_bridge_commands set claimed_at=now()-interval '5 minutes' where id=cmd;
 perform access_claim_next_command(conn,'install-a',7,'1.0');
 if (select state from access_command_authority where command_id=cmd)<>'uncertain' then raise exception 'Lost response was retried';end if;
 begin perform access_claim_next_command(conn,'wrong-installation',7,'1.0');raise exception 'Wrong session allowed';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','access_enqueue_purchase(uuid,text,uuid,bigint,bigint,text,jsonb)','execute') then raise exception 'Public queue access';end if;
end $$;
select 'Atomic queue and revocation tests passed' as result;
