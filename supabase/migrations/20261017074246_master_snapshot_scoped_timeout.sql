-- Large Kalika ledger/group snapshots exceed PostgREST's inherited 8s limit.
-- Bound this read-only Tally snapshot save to 45s without changing role/global
-- timeouts or any command, installation, company, permission or replay checks.
begin;
set local lock_timeout = '5s';
alter function public.access_save_master_snapshot(uuid,uuid,text,jsonb,text[],jsonb)
  set statement_timeout = '45s';
notify pgrst, 'reload schema';
commit;
