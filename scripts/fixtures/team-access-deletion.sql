\set ON_ERROR_STOP on
\ir team-access-registration.sql
create table packet_case_files(id uuid primary key,case_id uuid,storage_path text);
create table packet_mismatches(id uuid primary key,case_id uuid,resolution_status text);
\ir ../../supabase/migrations/20260904164026_team_access_resource_deletion.sql
do $$ declare cid uuid:='cccccccc-cccc-cccc-cccc-ccccccccc200';begin
 delete from packet_cases where id=cid;
 if exists(select 1 from access_resource_scopes where resource_type='case' and resource_id=cid) then raise exception 'Deleted draft left an authorization mapping';end if;
 if has_function_privilege('authenticated','access_cleanup_deleted_resource()','execute') then raise exception 'Browser can delete scope';end if;
 select case_id into cid from access_purchase_workflows where state<>'draft' limit 1;
 if cid is null then raise exception 'Protected-purchase fixture missing';end if;
 insert into packet_cases(id) values(cid);
 begin delete from packet_cases where id=cid;raise exception 'Protected purchase was deleted';exception when sqlstate '55000' then null;end;
 if not exists(select 1 from packet_cases where id=cid) then raise exception 'Protected purchase disappeared';end if;
 begin insert into packet_case_files values(gen_random_uuid(),cid,'fixture-only');raise exception 'Submitted source file was replaced';exception when sqlstate '55000' then null;end;
 begin insert into packet_mismatches values(gen_random_uuid(),cid,'resolved');raise exception 'Submitted mismatch was changed';exception when sqlstate '55000' then null;end;
end $$;
select 'Deletion cleanup tests passed' as result;
