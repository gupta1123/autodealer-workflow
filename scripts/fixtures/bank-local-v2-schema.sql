-- Isolated PostgreSQL test fixture, never a production migration.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create schema realtime;
create function realtime.topic() returns text language sql stable as $$select current_setting('test.realtime_topic',true)$$;
create table realtime.messages(id integer primary key);
alter table realtime.messages enable row level security;
create policy fixture_existing_broad_policy on realtime.messages for all to authenticated using(true) with check(true);
grant usage on schema realtime to authenticated,anon,service_role;
grant select,insert on realtime.messages to authenticated,anon;
insert into realtime.messages values(1);
create table auth.users(id uuid primary key);
create table public.tally_connections (
 id uuid primary key, owner_user_id uuid references auth.users, organization_id text,
 installation_id text, session_generation bigint, revoked_at timestamptz,
 last_companies_snapshot jsonb
);
create table public.bank_accounts (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users,
 account_number_normalized text
);
create table public.bank_statement_imports (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users,
 bank_account_id uuid references public.bank_accounts,
 original_file_name text not null, storage_bucket text not null, storage_path text not null unique,
 content_sha256 text, mime_type text, size_bytes bigint,
 statement_period_start date, statement_period_end date,
 extracted_bank_name text, extracted_account_number text, extracted_account_holder_name text, extracted_ifsc_code text,
 status text not null, processing_meta jsonb not null default '{}'::jsonb
);
create table public.bank_statement_extraction_jobs (
 id uuid primary key default gen_random_uuid(), import_id uuid references public.bank_statement_imports,
 owner_user_id uuid references auth.users, status text not null default 'queued',
 attempt_count integer not null default 0, max_attempts integer not null default 3,
 progress integer not null default 0, stage text, error text, result jsonb not null default '{}'::jsonb,
 locked_at timestamptz, locked_by text, next_run_at timestamptz not null default now(),
 started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tally_bridge_commands (
 id uuid primary key default gen_random_uuid(), connection_id uuid references public.tally_connections,
 owner_user_id uuid references auth.users, organization_id text, installation_id text, session_generation bigint,
 company_guid text, company_name text, financial_year text, protocol_version integer, command_type text,
 job_class text, status text, priority integer, max_attempts integer, payload jsonb,
 deadline_at timestamptz, external_result_reference text, completed_at timestamptz
);
create table public.bank_statement_import_preview_transactions (
 id uuid primary key default gen_random_uuid(), import_id uuid not null references public.bank_statement_imports,
 owner_user_id uuid not null references auth.users, row_index integer not null,
 transaction_date date not null, value_date date, description text not null, reference_number text,
 debit_amount numeric, credit_amount numeric, balance_amount numeric, transaction_type text not null default 'unknown',
 category text not null default 'unknown', counterparty_name text, suggested_ledger_name text, suggestion_confidence numeric,
 suggestion_reason text, confirmed_ledger_name text, additional_charges jsonb not null default '[]'::jsonb,
 confidence numeric, raw_payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(import_id,row_index)
);
grant usage on schema public,auth to service_role;
grant all on all tables in schema public to service_role;
grant select on auth.users to service_role;
