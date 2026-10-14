-- Kalika: apply after invoice follow-up pipelines and stable installation identity.
begin;
alter table public.invoice_followup_pipelines
  add column automatic boolean not null default false,
  add column payment_category text;
alter table public.invoice_followup_pipelines add constraint invoice_followup_automatic_category
  check (payment_category is null or payment_category in ('advance_rtgs','same_day_rtgs'));
alter table public.invoice_followup_pipelines add constraint invoice_followup_automatic_mode
  check (not automatic or (mode='pipeline' and payment_category is not null));
-- A stopped, settled or completed automatic schedule is never rediscovered
-- into a second automatic sequence. Manual restart remains an explicit action.
create unique index invoice_followup_one_automatic
  on public.invoice_followup_pipelines(organization_id,company_id,installation_id,company_guid,financial_year,invoice_key)
  where automatic;
create index invoice_followup_automatic_due
  on public.invoice_followup_pipelines(organization_id,company_id,installation_id,company_guid,financial_year,next_due_at,id)
  where automatic and mode='pipeline' and status='active';
-- Existing RLS and service-role-only grants continue to apply. No client grants.
commit;
