# Kalika v2: manual schema preparation

The local API environment was checked read-only on 2026-09-04. It targets:

**`ktpaupxmlbtpjgvigmpb.supabase.co`**

Check that exact project reference in Supabase before running SQL. Do not use the Gajkesari project, and do not infer the project from a similar display name.

## Apply once

Run the complete contents of `supabase/migrations/20260904072147_bank_local_pipeline_v2.sql` in that project's SQL editor, including `begin` and `commit`.

The migration adds service-only v2 run/checkpoint tables and transactional functions, restricts direct browser access to bank-job event topics, and excludes v2 jobs from the existing legacy worker's claiming/stale-job handling. It does not delete historical imports or accounting rows. It is transactional and includes prerequisite-column checks.

Do not run the files under `scripts/fixtures` on Supabase. Those create fake test tables and belong only in a disposable local database.

If the editor reports any error, stop and share it. Do not remove statements or run fragments to work around it. If it reports an existing v2 table/function, do not drop it; first check whether this migration was already applied.

## Read-only confirmation

After success, run:

```sql
select
  to_regclass('public.bank_local_pipeline_runs') as runs,
  to_regclass('public.bank_local_pipeline_checkpoints') as checkpoints,
  to_regprocedure('public.bank_local_v2_create(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,text,integer)') as create_job,
  to_regprocedure('public.bank_local_v2_finalize(uuid,jsonb,text,jsonb)') as finalize_job;
```

All four values should be non-null. This query does not create jobs or modify records.

## What this does not enable

V2 still requires the backend feature flag, advertised agent capability and readiness function. They remain disabled/absent until integrated verification is complete. Applying this schema is preparation for those checks, not a production rollout or a claim that every release gate passed.

Do not reinstall the agent or enable flags yet. After confirming the migration, the remaining connected-path tests can proceed; installer/activation instructions will follow separately.
