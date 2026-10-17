-- No background process may claim a WhatsApp submission for an automatically
-- discovered invoice. Existing history remains intact; operator-created sends
-- continue through the scoped, verified followup_claim_send transaction.
begin;
create function public.followup_guard_manual_send() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare automatic_schedule boolean;
begin
 select automatic into automatic_schedule from public.invoice_followup_pipelines
  where id=new.pipeline_id for share;
 if automatic_schedule then
  raise exception 'Automatic reminder delivery is disabled. Select invoices and confirm sending in Payment Follow-ups.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.followup_guard_manual_send() from public,anon,authenticated;
grant execute on function public.followup_guard_manual_send() to service_role;
create trigger followup_manual_send_only before insert on public.invoice_followup_attempts
 for each row execute function public.followup_guard_manual_send();
commit;
