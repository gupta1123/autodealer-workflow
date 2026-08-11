-- Cash Discount workflow hardening
-- 1. Database-enforced idempotency for active Tally debit-note commands.
-- 2. Owner-scoped RLS for all Collections workflow tables in public.

alter table if exists public.tally_bridge_commands
  add column if not exists idempotency_key text;

create unique index if not exists tally_bridge_commands_active_idempotency_idx
  on public.tally_bridge_commands (owner_user_id, command_type, idempotency_key)
  where idempotency_key is not null and status in ('queued', 'claimed');

create unique index if not exists debit_note_proposals_tally_guid_owner_idx
  on public.debit_note_proposals (owner_user_id, connection_id, tally_voucher_guid)
  where tally_voucher_guid is not null and status = 'created_in_tally';

create unique index if not exists debit_note_proposals_tally_id_owner_idx
  on public.debit_note_proposals (owner_user_id, connection_id, tally_voucher_id)
  where tally_voucher_id is not null and status = 'created_in_tally';

alter table if exists public.cash_discount_rules enable row level security;
alter table if exists public.debit_note_proposals enable row level security;
alter table if exists public.collections_analysis_cache enable row level security;

drop policy if exists cash_discount_rules_owner_select on public.cash_discount_rules;
drop policy if exists cash_discount_rules_owner_insert on public.cash_discount_rules;
drop policy if exists cash_discount_rules_owner_update on public.cash_discount_rules;
drop policy if exists cash_discount_rules_owner_delete on public.cash_discount_rules;

create policy cash_discount_rules_owner_select
  on public.cash_discount_rules for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy cash_discount_rules_owner_insert
  on public.cash_discount_rules for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy cash_discount_rules_owner_update
  on public.cash_discount_rules for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy cash_discount_rules_owner_delete
  on public.cash_discount_rules for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

drop policy if exists debit_note_proposals_owner_select on public.debit_note_proposals;
drop policy if exists debit_note_proposals_owner_insert on public.debit_note_proposals;
drop policy if exists debit_note_proposals_owner_update on public.debit_note_proposals;
drop policy if exists debit_note_proposals_owner_delete on public.debit_note_proposals;

create policy debit_note_proposals_owner_select
  on public.debit_note_proposals for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy debit_note_proposals_owner_insert
  on public.debit_note_proposals for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy debit_note_proposals_owner_update
  on public.debit_note_proposals for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy debit_note_proposals_owner_delete
  on public.debit_note_proposals for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

drop policy if exists collections_analysis_cache_owner_select on public.collections_analysis_cache;
drop policy if exists collections_analysis_cache_owner_insert on public.collections_analysis_cache;
drop policy if exists collections_analysis_cache_owner_update on public.collections_analysis_cache;
drop policy if exists collections_analysis_cache_owner_delete on public.collections_analysis_cache;

create policy collections_analysis_cache_owner_select
  on public.collections_analysis_cache for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy collections_analysis_cache_owner_insert
  on public.collections_analysis_cache for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);
create policy collections_analysis_cache_owner_update
  on public.collections_analysis_cache for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy collections_analysis_cache_owner_delete
  on public.collections_analysis_cache for delete to authenticated
  using ((select auth.uid()) = owner_user_id);
