\set ON_ERROR_STOP on
\ir team-access-discount-writes.sql
alter table public.debit_note_proposals add column tally_pdf_reference text;
\ir ../../supabase/migrations/20260905082719_team_access_client_operations.sql
do $$ declare p record;a uuid;c record;cmd jsonb;cid uuid;patch jsonb;outcome jsonb;
begin
 select * into p from debit_note_proposals where access_organization_id='discount-org' limit 1;
 a:=p.owner_user_id;
 select * into c from tally_connections where id=p.connection_id;
 update access_members set status='active' where user_id=a;
 update access_roles set permissions=permissions||array['discounts.export','connections.manage'] where organization_id='discount-org';
 begin perform access_enqueue_proposal_operation(a,'discount-org',p.id,c.id,'wrong-pc',3,'guid','2026-27','native_pdf');raise exception 'Wrong PC accepted';exception when insufficient_privilege then null;end;
 cmd:=access_enqueue_proposal_operation(a,'discount-org',p.id,c.id,c.installation_id,3,'guid','2026-27','native_pdf');cid:=(cmd->>'id')::uuid;
 assert cmd->>'owner_user_id'=c.owner_user_id::text,'paired owner changed';
 assert (access_enqueue_proposal_operation(a,'discount-org',p.id,c.id,c.installation_id,3,'guid','2026-27','native_pdf')->>'id')=cid::text,'duplicate queued';
 patch:=jsonb_build_object('tally_pdf_reference','storage://test/hash.pdf','nativeTallyPdf',jsonb_build_object('sha256',repeat('a',64)));
 outcome:='{"success":true}';
 begin perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,patch);raise exception 'Unissued accepted';exception when insufficient_privilege then null;end;
 update tally_bridge_commands set status='claimed' where id=cid;
 update access_members set status='suspended' where user_id=a;
 begin perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,patch);raise exception 'Revoked export accepted';exception when insufficient_privilege then null;end;
 update access_members set status='active' where user_id=a;
 perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,patch);
 perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,patch);
 assert (select tally_pdf_reference from debit_note_proposals where id=p.id)='storage://test/hash.pdf','PDF not saved';
 begin perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,patch||'{"other":true}');raise exception 'Conflicting accepted';exception when serialization_failure then null;end;
 cmd:=access_enqueue_proposal_operation(a,'discount-org',p.id,c.id,c.installation_id,3,'guid','2026-27','phone','919999999999');cid:=(cmd->>'id')::uuid;
 update tally_bridge_commands set status='claimed' where id=cid;
 update access_members set status='suspended' where user_id=a;
 perform access_complete_proposal_operation(cid,c.id,'synthetic-hash',outcome,'{}');
 assert (select status from tally_bridge_commands where id=cid)='succeeded','issued phone outcome discarded';
 assert not has_table_privilege('authenticated','access_proposal_operations','select'),'receipt exposure';
 assert not has_function_privilege('authenticated','access_complete_proposal_operation(uuid,uuid,text,jsonb,jsonb)','execute'),'callback bypass';
end $$;
select 'Client export/phone scope, dispatch, revocation and callback checks passed' as result;
