-- Recycle bin auto-purge: permanently remove cases that have been in the bin for
-- more than the retention window (30 days by default), without any extra worker.
--
-- * Storage files are NOT deleted here (SQL cannot call the Storage API). Each
--   file is queued in storage_cleanup_queue; the API worker drains that queue and
--   its reference counting skips files still used by other cases.
-- * Cases with purchase, approval or ERP history are never auto-purged. They are
--   skipped explicitly, and the access_guard_resource_deletion trigger is a
--   second line of defence.
-- * Safe to re-run.

begin;

create extension if not exists pg_cron;

create or replace function public.purge_expired_recycled_cases(
  retention_days integer default 30,
  batch_size integer default 200
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  candidate record;
  purged integer := 0;
  has_postings boolean := to_regclass('public.purchase_invoice_tally_postings') is not null;
  protected boolean;
begin
  if retention_days < 1 then
    raise exception 'retention_days must be at least 1' using errcode = '22023';
  end if;

  for candidate in
    select id, owner_user_id
    from public.packet_cases
    where deleted_at is not null
      and deleted_at < now() - make_interval(days => retention_days)
    order by deleted_at
    limit greatest(batch_size, 1)
  loop
    protected := false;
    if has_postings then
      execute 'select exists(select 1 from public.purchase_invoice_tally_postings where case_id = $1)'
        into protected using candidate.id;
    end if;
    if protected then
      continue;
    end if;

    begin
      insert into public.storage_cleanup_queue (owner_user_id, storage_asset_id, storage_bucket, storage_path)
      select candidate.owner_user_id, f.storage_asset_id, coalesce(f.storage_bucket, 'packet-files'), f.storage_path
      from public.packet_case_files f
      where f.case_id = candidate.id
      on conflict (storage_bucket, storage_path) do nothing;

      delete from public.packet_cases where id = candidate.id;
      purged := purged + 1;
    exception
      -- Approval/ERP history guard: leave the case in the bin, roll back its queue rows.
      when sqlstate '55000' then
        null;
    end;
  end loop;

  return purged;
end $$;

revoke all on function public.purge_expired_recycled_cases(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_expired_recycled_cases(integer, integer) to service_role;

comment on function public.purge_expired_recycled_cases(integer, integer) is
  'Hard-deletes recycled cases older than retention_days and queues their stored files for Storage cleanup. Skips cases with purchase/approval/ERP history.';

-- Daily at 03:00 UTC. cron.schedule upserts by job name, so re-running is safe.
select cron.schedule(
  'purge-expired-recycled-cases',
  '0 3 * * *',
  $cron$select public.purge_expired_recycled_cases(30, 200);$cron$
);

commit;
