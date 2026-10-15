-- Collection deadlines also apply to regular 30-day Sales invoices.
begin;
alter table public.invoice_followup_pipelines
  drop constraint invoice_followup_automatic_category;
alter table public.invoice_followup_pipelines
  add constraint invoice_followup_automatic_category
  check (payment_category is null or payment_category in ('advance_rtgs','same_day_rtgs','regular_credit'));
commit;
