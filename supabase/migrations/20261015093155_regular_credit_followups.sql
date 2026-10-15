-- Collection deadlines also apply to regular 30-day Sales invoices.
-- Also repairs installations where the earlier RTGS automation migration
-- has not been applied. Safe to run more than once; existing rows stay intact.
begin;
alter table public.invoice_followup_pipelines
  add column if not exists automatic boolean not null default false,
  add column if not exists payment_category text;
alter table public.invoice_followup_pipelines
  drop constraint if exists invoice_followup_automatic_category;
alter table public.invoice_followup_pipelines
  add constraint invoice_followup_automatic_category
  check (payment_category is null or payment_category in ('advance_rtgs','same_day_rtgs','regular_credit'));
alter table public.invoice_followup_pipelines
  drop constraint if exists invoice_followup_automatic_mode;
alter table public.invoice_followup_pipelines
  add constraint invoice_followup_automatic_mode
  check (not automatic or (mode='pipeline' and payment_category is not null));
create unique index if not exists invoice_followup_one_automatic
  on public.invoice_followup_pipelines(organization_id,company_id,installation_id,company_guid,financial_year,invoice_key)
  where automatic;
create index if not exists invoice_followup_automatic_due
  on public.invoice_followup_pipelines(organization_id,company_id,installation_id,company_guid,financial_year,next_due_at,id)
  where automatic and mode='pipeline' and status='active';
commit;
