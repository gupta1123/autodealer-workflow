\set ON_ERROR_STOP on
\ir team-access-dispatch.sql
\ir ../../supabase/migrations/20260904174716_team_access_dispatch_identity.sql
do $$
declare cmd uuid; field text;
 actor uuid:='44444444-4444-4444-4444-444444444444';
 conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100';
begin
 foreach field in array array['organization_id','owner_user_id','installation_id','session_generation','company_guid','financial_year','revoked','mapping'] loop
  insert into tally_bridge_commands(connection_id,owner_user_id,organization_id,installation_id,session_generation,company_guid,financial_year,status,payload)
  values(conn,'11111111-1111-1111-1111-111111111111','org-a','install-a',7,'guid-a','2026-27','queued','{}') returning id into cmd;
  insert into access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission)
  values(cmd,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',actor,'purchases.post');
  -- Changes and failed dispatch roll back together inside the subtransaction.
  begin
   case field
   when 'organization_id' then update tally_bridge_commands set organization_id='org-b' where id=cmd;
   when 'owner_user_id' then update tally_bridge_commands set owner_user_id=actor where id=cmd;
   when 'installation_id' then update tally_connections set installation_id='replacement' where id=conn;
   when 'session_generation' then update tally_connections set session_generation=8 where id=conn;
   when 'company_guid' then update tally_bridge_commands set company_guid='other' where id=cmd;
   when 'financial_year' then update tally_bridge_commands set financial_year='2025-26' where id=cmd;
   when 'revoked' then update tally_connections set revoked_at=now() where id=conn;
   when 'mapping' then delete from access_company_links where connection_id=conn;
   end case;
   update tally_bridge_commands set status='claimed' where id=cmd;
   raise exception 'Invalid routing allowed: %',field;
  exception when insufficient_privilege then null;
  end;
  if (select state from access_command_authority where command_id=cmd)<>'queued' then raise exception 'Failed dispatch issued receipt';end if;
  update tally_bridge_commands set status='claimed' where id=cmd;
  if (select state from access_command_authority where command_id=cmd)<>'issued' then raise exception 'Valid command not issued';end if;
  -- Revocation after dispatch must not discard an already-issued outcome.
  update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
  update tally_bridge_commands set status='completed' where id=cmd;
  if (select state from access_command_authority where command_id=cmd)<>'completed' then raise exception 'Issued result lost';end if;
  update access_members set status='active' where organization_id='org-a' and user_id=actor;
 end loop;
end $$;
select 'Dispatch identity and issued-result tests passed' as result;
