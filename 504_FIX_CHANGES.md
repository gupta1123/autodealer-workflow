# 504 Fix Changes

Scope: Bank Statement Send to Tally.

## Goal

Avoid deploy gateway 504s while keeping the same ledger matching, Tally command creation, mapping saves, posting logs, and frontend outcome.

## What Was Happening Earlier

`POST /api/bank-statements/tally/queue` did all queue preparation inside one browser-facing request.

That single request could:

- load pending bank transactions
- load Tally ledgers
- run the same ledger suggestion/matching logic
- create Tally bridge commands
- write posting logs
- update bank transaction statuses
- save ledger mappings
- update bank account Tally ledger links

For large statements or slow DB responses, the request could run long enough for the deploy gateway to return 504.

## What Changed

The same endpoint now supports async mode.

When the frontend sends:

```json
{ "async": true }
```

the API creates a `bank_statement_tally_queue_jobs` row and immediately returns:

```json
{
  "async": true,
  "jobId": "...",
  "job": { "status": "queued" }
}
```

The frontend then polls:

```text
POST /api/bank-statements/tally/queue-jobs/[id]/run
```

Each poll advances a small backend batch using the existing queue logic. When complete, the job returns the same final shape the frontend already used:

```json
{
  "queuedCount": 10,
  "verificationCount": 2,
  "commands": []
}
```

After that, the existing Tally command polling continues as before.

## Why This Keeps Functionality Same

The original queue endpoint logic is still used for the actual work.
In `autodealer-workflow`, the existing live Tally company validation is also preserved before an async job is created.

The change is only how the browser waits:

```text
Earlier:
Browser waited for one long queue request.

Now:
Browser creates a job quickly, then polls while the backend prepares the same queue work.
```

Ledger matching, AI/stored suggestions used by the queue flow, Tally command payloads, posting logs, and mappings are not removed.

## New Files

- `supabase/migrations/202607210001_bank_statement_tally_queue_jobs.sql`
- `apps/api/src/app/api/bank-statements/tally/queue-jobs/[id]/route.ts`
- `apps/api/src/app/api/bank-statements/tally/queue-jobs/[id]/run/route.ts`

## Updated Files

- `apps/api/src/app/api/bank-statements/tally/queue/route.ts`
- `apps/web/src/components/bank-statements/BankStatementsPage.tsx`

## Important Deployment Note

Run the new Supabase migration before deploying this change. Without the `bank_statement_tally_queue_jobs` table, async queue creation will fail.

## What Was Not Changed

- Cases / packet processing
- `apps/api/worker/process-packet-jobs.mjs`
- Tally bridge command execution
- Cash/Discount read behavior
- Bank statement confirm behavior
- Tally master read behavior
