\set ON_ERROR_STOP on
\ir team-access-dispatch-identity.sql
update tally_bridge_commands set command_type='create_purchase_voucher' where command_type is null;
\ir ../../supabase/migrations/20260904174928_team_access_command_visibility.sql
do $$ declare cmd uuid;before_count integer;begin
 if has_table_privilege('authenticated','access_visible_commands','select') or has_table_privilege('anon','access_visible_commands','select') then raise exception 'Public command results';end if;
 if not has_table_privilege('service_role','access_visible_commands','select') then raise exception 'Backend projection unavailable';end if;
 select count(*) into before_count from access_visible_commands;
 if before_count=0 then raise exception 'Valid shared results not visible';end if;
 if exists(select 1 from access_visible_commands where visibility_permission<>'purchases.view') then raise exception 'Financial visibility classification failed';end if;
 select id into cmd from access_visible_commands limit 1;
 update access_command_authority set permission='purchases.export' where command_id=cmd;
 if (select visibility_permission from access_visible_commands where id=cmd)<>'purchases.export' then raise exception 'Exports downgraded to view';end if;
 update tally_bridge_commands set command_type='agent_parse_document' where id=cmd;
 if exists(select 1 from access_visible_commands where id=cmd) then raise exception 'Document job inputs exposed';end if;
 update tally_connections set session_generation=session_generation+1;
 if exists(select 1 from access_visible_commands) then raise exception 'Stale pairing results visible';end if;
end $$;
select 'Command visibility tests passed' as result;
