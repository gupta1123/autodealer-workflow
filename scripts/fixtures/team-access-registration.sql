\set ON_ERROR_STOP on
\ir team-access-dispatch.sql
create table packet_cases(id uuid primary key,owner_user_id uuid,access_organization_id text,access_company_id uuid);
\ir ../../supabase/migrations/20260904161958_team_access_resource_registration.sql
do $$ declare cid uuid:='cccccccc-cccc-cccc-cccc-ccccccccc200';actor uuid:='44444444-4444-4444-4444-444444444444';begin
 insert into packet_cases values(cid,actor,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 if not exists(select 1 from access_resource_scopes where resource_id=cid and resource_type='case' and organization_id='org-a') then raise exception 'Resource mapping not registered';end if;
 begin insert into packet_cases values(gen_random_uuid(),actor,'org-b','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');raise exception 'Cross-org registration allowed';exception when insufficient_privilege then null;end;
 update access_members set status='suspended' where user_id=actor and organization_id='org-a';
 begin insert into packet_cases values(gen_random_uuid(),actor,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');raise exception 'Suspended creator allowed';exception when insufficient_privilege then null;end;
 begin insert into packet_cases values(gen_random_uuid(),actor,'org-a',null);raise exception 'Partial mapping allowed';exception when check_violation then null;end;
 if (select count(*) from packet_cases)<>1 then raise exception 'Rejected insert left partial data';end if;
 if has_function_privilege('authenticated','access_register_created_resource()','execute') then raise exception 'Browser can register resources';end if;
end $$;
select 'Resource registration tests passed' as result;
