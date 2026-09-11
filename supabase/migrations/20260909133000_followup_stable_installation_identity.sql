-- Kalika only. Prepared locally; apply manually after review.
-- Reminder schedules belong to a verified Tally company on one installation,
-- and must survive replacement connection rows created by reconnecting.
begin;

do $$
begin
  if exists (
    select 1
      from public.invoice_followup_pipelines
     where mode = 'pipeline' and status not in ('settled','finished','stopped')
     group by organization_id, company_id, installation_id, company_guid, financial_year, invoice_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate unfinished reminder schedules require review before applying stable installation identity';
  end if;
end $$;

drop index if exists public.invoice_followup_one_unfinished;
create unique index invoice_followup_one_unfinished
  on public.invoice_followup_pipelines
    (organization_id, company_id, installation_id, company_guid, financial_year, invoice_key)
  where mode = 'pipeline' and status not in ('settled','finished','stopped');

drop index if exists public.invoice_followup_due;
create index invoice_followup_due
  on public.invoice_followup_pipelines
    (organization_id, company_id, installation_id, company_guid, financial_year, status, next_due_at, id);

commit;
