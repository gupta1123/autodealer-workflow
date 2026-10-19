-- Case detail integrity:
--  1. packet_case_decide only decides a completed case and keeps mismatch
--     decisions the reviewer already made (only pending ones are resolved).
--  2. packet_case_replace_analysis swaps a case's documents and mismatches in
--     one transaction, so a failure can no longer leave a case with none.
--  3. At most one queued/running analysis job per case (skipped with a notice
--     if existing data already violates it).
-- Safe to re-run.

begin;

create or replace function public.packet_case_decide(
  p_case_id uuid,
  p_case_status text,
  p_resolution_status text,
  p_resolved_at timestamptz default now()
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_case_status not in ('accepted', 'rejected')
     or p_resolution_status not in ('accepted', 'rejected') then
    raise exception 'Unsupported case decision' using errcode = '22023';
  end if;

  update public.packet_cases
  set status = p_case_status
  where id = p_case_id
    and deleted_at is null
    and status = 'completed';
  if not found then
    return false;
  end if;

  -- Keep decisions already made one by one on the mismatch review page.
  update public.packet_mismatches
  set resolution_status = p_resolution_status,
      resolved_at = p_resolved_at
  where case_id = p_case_id
    and coalesce(resolution_status, 'pending') = 'pending';

  return true;
end $$;

revoke all on function public.packet_case_decide(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.packet_case_decide(uuid, text, text, timestamptz) to service_role;

comment on function public.packet_case_decide(uuid, text, text, timestamptz) is
  'Atomically accepts/rejects a completed, non-recycled case and resolves its still-pending mismatches.';

create or replace function public.packet_case_replace_analysis(
  p_case_id uuid,
  p_documents jsonb,
  p_mismatches jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  delete from public.packet_documents where case_id = p_case_id;
  delete from public.packet_mismatches where case_id = p_case_id;

  insert into public.packet_documents (
    case_id, client_document_id, source_file_name, source_hint,
    document_type, title, page_count, extracted_fields, markdown
  )
  select
    p_case_id, r.client_document_id, r.source_file_name, r.source_hint,
    r.document_type, r.title, r.page_count, r.extracted_fields, r.markdown
  from jsonb_populate_recordset(null::public.packet_documents, coalesce(p_documents, '[]'::jsonb)) as r;

  insert into public.packet_mismatches (
    case_id, client_mismatch_id, field_name, values_json, analysis, fix_plan
  )
  select
    p_case_id, r.client_mismatch_id, r.field_name, r.values_json, r.analysis, r.fix_plan
  from jsonb_populate_recordset(null::public.packet_mismatches, coalesce(p_mismatches, '[]'::jsonb)) as r;
end $$;

revoke all on function public.packet_case_replace_analysis(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.packet_case_replace_analysis(uuid, jsonb, jsonb) to service_role;

comment on function public.packet_case_replace_analysis(uuid, jsonb, jsonb) is
  'Replaces all documents and mismatches of a case in a single transaction.';

do $$
begin
  create unique index if not exists packet_processing_jobs_one_active_per_case
    on public.packet_processing_jobs (case_id)
    where status in ('queued', 'running');
exception when others then
  raise notice 'Skipped packet_processing_jobs_one_active_per_case: %', sqlerrm;
end $$;

commit;
