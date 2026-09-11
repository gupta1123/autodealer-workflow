\set ON_ERROR_STOP on
\ir team-access-command-visibility.sql
\ir ../../supabase/migrations/20260905064256_team_access_agent_reads.sql
-- The preceding visibility fixture deliberately rotates this synthetic session.
update tally_connections set session_generation=7;
update access_roles set permissions=permissions||array['discounts.view','discounts.prepare'] where id='55555555-5555-5555-5555-555555555555';
update access_members set status='active',modules=modules||array['discounts'] where user_id='44444444-4444-4444-4444-444444444444';
do $$
declare actor uuid:='44444444-4444-4444-4444-444444444444'; paired uuid:='11111111-1111-1111-1111-111111111111';
 company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100';
 payload jsonb:='{"ledgerNames":["A"],"dateFrom":"20260401","dateTo":"20270331"}'; job jsonb; cmd uuid;
begin
 begin perform access_enqueue_agent_read(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','post_bank_voucher',payload);
  raise exception 'Write accepted';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_agent_read(actor,'org-a',company,conn,'install-a',7,actor,'guid-a','2026-27','agent_query_open_bills',payload);
  raise exception 'Initiator substituted for paired owner';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_agent_read(actor,'org-b',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_query_open_bills',payload);
  raise exception 'Cross organization accepted';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_agent_read(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_query_open_bills',payload||'{"xml":"anything"}');
  raise exception 'Arbitrary payload accepted';exception when invalid_parameter_value then null;end;
 begin perform access_enqueue_agent_read(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_query_open_bills',payload||'{"dateTo":"20280331"}');
  raise exception 'Other year accepted';exception when invalid_parameter_value then null;end;
 job:=access_enqueue_agent_read(actor,'org-a',company,conn,'install-a',7,paired,'guid-a','2026-27','agent_query_open_bills',payload);
 cmd:=(job->>'id')::uuid;
 if job->>'owner_user_id'<>paired::text or job#>>'{payload,agentIdentity,ownerUserId}'<>paired::text then raise exception 'Paired identity corrupted';end if;
 if not exists(select 1 from access_command_authority where command_id=cmd and initiating_user_id=actor and permission='discounts.prepare') then raise exception 'Missing authority';end if;
 if not exists(select 1 from access_visible_commands where id=cmd and visibility_permission='discounts.view') then raise exception 'Missing scoped result';end if;
 update access_members set status='suspended' where user_id=actor and organization_id='org-a';
 perform access_claim_next_command(conn,'install-a',7,'1.0');
 if (select status from tally_bridge_commands where id=cmd)<>'canceled' then raise exception 'Revoked job dispatched';end if;
 if has_function_privilege('authenticated','access_enqueue_agent_read(uuid,text,uuid,uuid,text,bigint,uuid,text,text,text,jsonb)','execute') then raise exception 'Public queue function';end if;
 if (select sharing_enabled from access_organizations where id='org-a') then raise exception 'Sharing enabled';end if;
end $$;
select 'Shared agent report admission, identity, visibility and revocation passed' as result;
