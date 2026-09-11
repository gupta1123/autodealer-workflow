-- Kalika only; unapplied. Keep legacy uniqueness, add shared company identity.
begin;
set local lock_timeout='5s';
do $$declare constraint_row record;begin
 if to_regclass('public.bank_accounts') is null then return;end if;
 if not exists(select 1 from pg_attribute where attrelid='public.bank_accounts'::regclass and attname='account_number_normalized' and not attisdropped) then
  raise exception 'Bank account normalization migration is required';
 end if;
 for constraint_row in
  select c.conname from pg_constraint c where c.conrelid='public.bank_accounts'::regclass and c.contype='u'
   and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid=c.conrelid and a.attnum=any(c.conkey))
       =array['account_number_normalized','owner_user_id']::text[]
 loop
  execute format('alter table public.bank_accounts drop constraint %I',constraint_row.conname);
 end loop;
 -- Conflicting existing mapped accounts fail this transaction for reconciliation;
 -- they are never silently merged or deleted.
 create unique index bank_accounts_legacy_identity on public.bank_accounts(owner_user_id,account_number_normalized)
  where access_organization_id is null and access_company_id is null;
 create unique index bank_accounts_team_identity on public.bank_accounts(access_organization_id,access_company_id,account_number_normalized)
  where access_organization_id is not null and access_company_id is not null;
 alter table public.bank_accounts add constraint bank_accounts_complete_access_scope
  check((access_organization_id is null)=(access_company_id is null)) not valid;
end$$;
commit;
