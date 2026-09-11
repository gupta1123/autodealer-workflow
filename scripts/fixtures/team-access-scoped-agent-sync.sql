\set ON_ERROR_STOP on
\ir team-access-agent-reads.sql
\ir ../../supabase/migrations/20260906114629_team_access_scoped_agent_sync.sql
update access_roles set permissions=permissions||array['connections.manage'] where id='55555555-5555-5555-5555-555555555555';
update access_members set status='active' where user_id='44444444-4444-4444-4444-444444444444';
do $$
declare actor uuid:='44444444-4444-4444-4444-444444444444'; paired uuid:='11111111-1111-1111-1111-111111111111';
 company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100'; job jsonb; cmd uuid;
begin
 begin perform access_enqueue_agent_sync(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_clear_cache','{}');
  raise exception 'Global cache operation accepted';exception when invalid_parameter_value then null;end;
 begin perform access_enqueue_agent_sync(actor,'org-a',company,conn,'install-a',8,paired,'guid-a','2026-27','agent_sync_dataset','{}');
  raise exception 'Stale session accepted';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_agent_sync(actor,'org-a',company,conn,'install-a',7,paired,'wrong-guid','2026-27','agent_sync_dataset','{}');
  raise exception 'Wrong company accepted';exception when insufficient_privilege then null;end;
 job:=access_enqueue_agent_sync(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_sync_dataset','{}');
 cmd:=(job->>'id')::uuid;
 if job#>>'{payload,agentIdentity,ownerUserId}'<>paired::text then raise exception 'Wrong paired owner';end if;
 if not exists(select 1 from access_command_authority where command_id=cmd and initiating_user_id=actor and permission='connections.manage') then raise exception 'Missing authority';end if;
 update access_members set status='suspended' where user_id=actor and organization_id='org-a';
 perform access_claim_next_command(conn,'install-a',7,'1.0');
 if (select status from tally_bridge_commands where id=cmd)<>'canceled' then raise exception 'Revoked sync dispatched';end if;
 if has_function_privilege('authenticated','access_enqueue_agent_sync(uuid,text,uuid,uuid,text,bigint,uuid,text,text,text,jsonb)','execute') then raise exception 'Public function';end if;
end $$;
select 'Scoped sync rejects global maintenance, wrong identity and revoked actors' as result;
