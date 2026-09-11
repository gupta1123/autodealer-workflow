\set ON_ERROR_STOP on
\ir team-access-deletion.sql
-- Representative permissive legacy surface, including owner-executed views,
-- column-only grants and a definer RPC. No production credentials are used.
create table public.legacy_secret(id integer primary key,secret text);
insert into public.legacy_secret values(1,'synthetic');
grant select(secret) on public.legacy_secret to authenticated;
create view public.legacy_secret_view as select * from public.legacy_secret;
grant select on public.legacy_secret_view to anon,authenticated;
create function public.legacy_secret_rpc() returns text language sql security definer as $$select secret from public.legacy_secret limit 1$$;
create schema storage;
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(id integer,bucket_id text);
insert into storage.buckets values('packet-files',true),('unrelated',true);
insert into storage.objects values(1,'packet-files'),(2,'unrelated');
grant usage on schema storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
alter table storage.objects enable row level security;
create policy legacy_allow on storage.objects for all to anon,authenticated using(true) with check(true);
create schema realtime;
create table realtime.messages(id integer);
create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
grant usage on schema realtime to anon,authenticated;
grant execute on function realtime.topic() to anon,authenticated;
grant select,insert on realtime.messages to anon,authenticated;
insert into realtime.messages values(1);
alter table realtime.messages enable row level security;
create policy legacy_allow on realtime.messages for all to anon,authenticated using(true) with check(true);
\ir ../../supabase/migrations/20260904170147_team_access_data_api_hardening.sql
do $$begin
 if not has_function_privilege('authenticated','legacy_secret_rpc()','execute') then raise exception 'Preparation unexpectedly hardened legacy access';end if;
 if has_function_privilege('service_role','access_harden_data_api(text)','execute') then raise exception 'HTTP backend can activate hardening';end if;
 begin perform access_harden_data_api('wrong');raise exception 'Confirmation bypass';exception when invalid_parameter_value then null;end;
 if jsonb_array_length(access_data_api_exposure()->'relations')=0 then raise exception 'Column/view exposure missed';end if;
end$$;
select access_harden_data_api('KALIKA_REVIEWED_API_ONLY_ACTIVATION');
do $$begin
 if has_any_column_privilege('authenticated','legacy_secret','SELECT') then raise exception 'Column access retained';end if;
 if has_table_privilege('anon','legacy_secret_view','SELECT') then raise exception 'Owner-view bypass';end if;
 if has_function_privilege('authenticated','legacy_secret_rpc()','EXECUTE') then raise exception 'RPC bypass';end if;
 if not has_function_privilege('service_role','legacy_secret_rpc()','EXECUTE') then raise exception 'Existing backend RPC authority lost';end if;
 if has_table_privilege('service_role','access_audit','UPDATE') or has_any_column_privilege('service_role','access_audit','UPDATE') then raise exception 'Audit made mutable';end if;
 if (select public from storage.buckets where id='packet-files') then raise exception 'Public PDF bucket';end if;
 if not (select public from storage.buckets where id='unrelated') then raise exception 'Unrelated bucket changed';end if;
 if (select sharing_enabled from access_organizations where id='org-a') then raise exception 'Sharing activated';end if;
end$$;
set role authenticated;
set test.topic='access:org-a';
do $$begin
 if exists(select 1 from realtime.messages) then raise exception 'Private access events visible directly';end if;
 begin insert into realtime.messages values(2);raise exception 'Client can spoof access event';exception when insufficient_privilege then null;end;
 if (select count(*) from storage.objects)<>1 then raise exception 'Storage policy leaks protected objects or blocks unrelated bucket';end if;
 begin insert into storage.objects values(3,'packet-files');raise exception 'Protected storage upload allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Repeat safely and exercise defaults for the migration role's future objects.
select access_harden_data_api('KALIKA_REVIEWED_API_ONLY_ACTIVATION');
create function public.future_rpc() returns boolean language sql as $$select true$$;
do $$begin
 if has_function_privilege('authenticated','future_rpc()','execute') then raise exception 'Future RPC publicly executable';end if;
end$$;
select 'Data API, column grants, owner views, definer RPC and Storage checks passed' as result;
