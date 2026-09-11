-- Disposable database only. Synthetic data; no hosted database access.
\set ON_ERROR_STOP on
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
create table public.packet_cases (
 id uuid primary key, owner_user_id uuid not null references auth.users(id),
 display_name text, buyer_name text, po_number text, invoice_number text, slug text,
 created_at timestamptz not null, status text, processing_meta jsonb not null default '{}'
);
insert into public.packet_cases
select md5(i::text)::uuid, '11111111-1111-1111-1111-111111111111',
 'Synthetic case '||i, 'Buyer '||i, 'PO-'||i, 'INV-'||i, 'case-'||i,
 timestamptz '2026-01-01' + i * interval '1 minute', 'draft',
 case when i % 10 = 0 then '{"recycleBin":{"deletedAt":"2026-08-01T00:00:00Z","deletedByUserId":"11111111-1111-1111-1111-111111111111"}}'::jsonb else '{}'::jsonb end
from generate_series(1,10000) i;
\ir ../../supabase/migrations/20260904125720_case_list_query_indexes.sql
-- Applying twice must preserve data and be safe.
\ir ../../supabase/migrations/20260904125720_case_list_query_indexes.sql
do $$ begin
 if (select count(*) from packet_cases) <> 10000 then raise exception 'Lost cases'; end if;
 if (select count(*) from packet_cases where deleted_at is not null and deleted_by_user_id is not null) <> 1000 then raise exception 'Recycle backfill failed'; end if;
 if (select count(*) from packet_cases where deleted_at is null) <> 9000 then raise exception 'Active count incorrect'; end if;
 if (select count(*) from packet_cases where search_text like '%inv-1234%') <> 1 then raise exception 'Search failed'; end if;
end $$;
explain (analyze, buffers) select id,display_name from packet_cases
where owner_user_id='11111111-1111-1111-1111-111111111111' and deleted_at is null
order by created_at desc,id desc limit 10;
explain (analyze, buffers) select id from packet_cases
where owner_user_id='11111111-1111-1111-1111-111111111111' and deleted_at is null and search_text ilike '%inv-1234%'
order by created_at desc,id desc limit 10;
