-- Accepting or rejecting a case must update the case status and all of its
-- mismatch resolutions together. The API used to do this in two separate calls,
-- so a failure in between left a decided case with pending mismatches.
-- Recycled cases are refused (returns false). Safe to re-run.

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
    and deleted_at is null;
  if not found then
    return false;
  end if;

  update public.packet_mismatches
  set resolution_status = p_resolution_status,
      resolved_at = p_resolved_at
  where case_id = p_case_id;

  return true;
end $$;

revoke all on function public.packet_case_decide(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.packet_case_decide(uuid, text, text, timestamptz) to service_role;

comment on function public.packet_case_decide(uuid, text, text, timestamptz) is
  'Atomically sets a non-recycled case to accepted/rejected and resolves all of its mismatches.';

commit;
