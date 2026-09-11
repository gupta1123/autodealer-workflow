\set ON_ERROR_STOP on
\ir team-access.sql
\ir ../../supabase/packet_settings_backend_v6.sql
insert into field_settings(organization_id,doc_type,field_key,enabled) values('default','invoice','amount',true);
insert into doc_type_settings(organization_id,doc_type,enabled) values('default','invoice',true);
\ir ../../supabase/migrations/20260904171430_team_access_organization_defaults.sql
do $$begin
 if exists(select 1 from field_settings where organization_id='org-a') then raise exception 'Existing organizations changed without review';end if;
 insert into access_organizations(id,name) values('settings-fixture','Fixture');
 if not exists(select 1 from field_settings where organization_id='settings-fixture' and enabled) then raise exception 'Defaults not initialized';end if;
 update field_settings set enabled=false where organization_id='settings-fixture';
 perform access_initialize_organization_settings('settings-fixture');
 if exists(select 1 from field_settings where organization_id='settings-fixture' and enabled) then raise exception 'Initialization overwrote customized settings';end if;
 if (select count(distinct id) from field_settings)<>2 then raise exception 'Copied source ID';end if;
 if has_function_privilege('authenticated','access_initialize_organization_settings(text)','execute') then raise exception 'Client settings write bypass';end if;
 begin perform access_initialize_organization_settings('absent');raise exception 'Missing organization accepted';exception when insufficient_privilege then null;end;
end$$;
select 'Organization defaults preserve customization and tolerate optional tables' as result;
