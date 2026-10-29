-- Kalika only. Prepared locally; apply manually after review.
-- One reminder per customer listing their unpaid invoices, next to the
-- existing one-reminder-per-invoice rows. Customer rows use the same send
-- claim, attempt and verification flow; "invoices" holds what the message lists.
-- Their invoice_key is derived from the customer, so the existing unique index
-- allows one unfinished reminder per customer. Safe to run more than once.
begin;
alter table public.invoice_followup_pipelines
  add column if not exists kind text not null default 'invoice',
  add column if not exists invoices jsonb;
alter table public.invoice_followup_pipelines
  drop constraint if exists invoice_followup_kind;
alter table public.invoice_followup_pipelines
  add constraint invoice_followup_kind check (
    (kind = 'invoice' and invoices is null)
    or (kind = 'customer' and not automatic and jsonb_typeof(invoices) = 'array' and jsonb_array_length(invoices) between 1 and 200)
  );
create index if not exists invoice_followup_customer_open
  on public.invoice_followup_pipelines(organization_id, company_id, installation_id, company_guid, financial_year, customer)
  where kind = 'customer' and status not in ('settled','finished','stopped');
commit;
