-- Browser crashes are otherwise invisible: they never reach the API logs.
-- Written and read only with the service role, so no row-level policies are defined.
create table if not exists public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  boundary text not null,
  error_name text,
  message text not null,
  stack text,
  digest text,
  path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists client_error_reports_created_at_idx
  on public.client_error_reports (created_at desc);

alter table public.client_error_reports enable row level security;
