-- Run ONLY in a fresh disposable PostgreSQL database.
\set ON_ERROR_STOP on
create schema auth;
create table auth.users(id uuid primary key);
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
\ir ../../supabase/migrations/20260904145334_team_access_foundation.sql
insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('33333333-3333-3333-3333-333333333333');
select access_provision('org-a','A','11111111-1111-1111-1111-111111111111','Owner','owner@example.test','administrator',true,false,'[{"key":"administrator","name":"Administrator","permissions":["team.manage","roles.manage"]},{"key":"operator","name":"Operator","permissions":["purchases.view","purchases.prepare"]}]');
select access_provision('org-a','A','22222222-2222-2222-2222-222222222222','Operator','operator@example.test','operator',false,false,'[]');
select access_provision('org-b','B','33333333-3333-3333-3333-333333333333','Other Owner','other@example.test','administrator',true,false,'[{"key":"administrator","name":"Administrator","permissions":["team.manage","roles.manage"]}]');
do $$ declare owner uuid:='11111111-1111-1111-1111-111111111111'; op uuid:='22222222-2222-2222-2222-222222222222'; roleid uuid; rev bigint; before_rev bigint;
begin
 if has_table_privilege('authenticated','public.access_members','select') then raise exception 'Client can read memberships directly'; end if;
 if has_function_privilege('authenticated','public.access_change(uuid,text,text,text,bigint,jsonb)','execute') then raise exception 'Client can call privileged mutation'; end if;
 if not (select relrowsecurity from pg_class where oid='access_members'::regclass) then raise exception 'Missing RLS'; end if;
 if (access_snapshot(owner,'org-a')->>'sharingEnabled')::boolean then raise exception 'Sharing activated unexpectedly'; end if;
 begin perform access_snapshot(owner,'org-b');raise exception 'Cross-organization access allowed';exception when insufficient_privilege then null;end;
 begin perform access_change(owner,'org-a','member.update',owner::text,1,'{"status":"suspended"}');raise exception 'Last owner suspended';exception when invalid_parameter_value then null;end;
 begin perform access_change(op,'org-a','member.update',op::text,1,'{"allCompanies":true}');raise exception 'Self elevation allowed';exception when insufficient_privilege then null;end;
 select id into roleid from access_roles where organization_id='org-a' and template_key='operator';
 begin perform access_change(owner,'org-a','role.update',roleid::text,1,'{"name":"Oops","permissions":[]}');raise exception 'Template changed';exception when invalid_parameter_value then null;end;
 begin perform access_change(owner,'org-a','role.create',null,0,jsonb_build_object('cloneId',roleid,'name','Bad','permissions',jsonb_build_array('purchases.post')));raise exception 'Dependency bypass';exception when invalid_parameter_value then null;end;
 roleid:=(access_change(owner,'org-a','role.create',null,0,jsonb_build_object('cloneId',roleid,'name','Custom','permissions',jsonb_build_array('purchases.view')))->>'id')::uuid;
 perform access_change(owner,'org-a','member.update',op::text,1,jsonb_build_object('roleId',roleid));
 begin perform access_change(owner,'org-a','role.archive',roleid::text,1,'{}');raise exception 'Assigned role archived';exception when invalid_parameter_value then null;end;
 begin perform access_change(owner,'org-a','member.update',op::text,1,'{"status":"suspended"}');raise exception 'Stale update accepted';exception when serialization_failure then null;end;
 begin perform access_change(owner,'org-a','member.update',op::text,2,'{"companyIds":["99999999-9999-9999-9999-999999999999"]}');raise exception 'Invalid scope accepted';exception when invalid_parameter_value then null;end;
 perform access_change(owner,'org-a','member.update',op::text,2,'{"status":"suspended"}');
 begin perform access_snapshot(op,'org-a');raise exception 'Suspended membership accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from access_audit where organization_id='org-a')<>5 then raise exception 'Audit count incorrect';end if;
end $$;
select 'Team access transactional safety checks passed' as result;
