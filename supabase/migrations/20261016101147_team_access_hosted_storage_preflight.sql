-- Kalika only. Fix activation preparation without enabling sharing or changing
-- any Data API grants, Storage policies, account access or business records.
-- Supabase owns storage.objects and already enables RLS; postgres may manage
-- its policies but must not ALTER the managed table.
begin;
set local lock_timeout='2s';
do $$
declare
 definition text;
 old_statement constant text := 'execute ''alter table storage.objects enable row level security'';';
 replacement constant text := 'if not (select relrowsecurity from pg_catalog.pg_class where oid=''storage.objects''::regclass) then raise exception ''Supabase Storage RLS must already be enabled'' using errcode=''55000'';end if;';
begin
 select pg_get_functiondef('public.access_harden_data_api(text)'::regprocedure)
 into definition;
 if position(old_statement in definition)>0 then
  execute replace(definition,old_statement,replacement);
 elsif position(replacement in definition)=0 then
  raise exception 'Unexpected hardening function: review before upgrading' using errcode='55000';
 end if;
end $$;
commit;
