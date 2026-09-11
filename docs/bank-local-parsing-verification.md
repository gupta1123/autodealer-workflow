# Bank statement local parsing — 2026-09-03

## Scope

Bank statement Analyze now uses a non-persisting `ledger_masters` read. It still
reads current ledger data from Tally; it no longer waits for a full cloud master
upsert. Other workflows retain their existing master-sync behaviour.

For Local Agent connections, the API resolves the parsing toggle from a recent
authenticated heartbeat and snapshots the connection/installation/company GUID/
financial year identity. Local mode queues `agent_parse_document`. The installed
agent receives the PDF directly from the same-PC browser and parses it afresh,
and uploads compressed Markdown to the token-protected document-result endpoint.
That endpoint feeds Markdown directly to cloud AI and saves only the structured
result/audit metadata. The bank worker performs normal balance validation and
preview persistence without downloading or parsing the source PDF itself.

Local mode does not silently fall back when the agent is unavailable, disabled,
or the pairing changes. Legacy connectors and an explicitly disabled local
toggle retain backend parsing. Settings reach the backend on heartbeat; wait for
the updated connection state before uploading after changing a setting.

New local-mode PDFs never use the backend PDF upload, PDF-unlock/preview endpoint,
or Supabase Storage. Preview uses a browser object URL. The metadata-only import
contains filename, size, checksum and a hash of a four-minute upload ticket.
The authenticated command registers that ticket on `127.0.0.1:17843`, restricted
to the initiating browser origin and exact selected connection identity. The
browser waits for readiness before sending PDF bytes. The receiver enforces
one-use tickets, size/hash checks, expiry, host validation and temporary cleanup.
Only compressed Markdown goes to cloud AI; this is not local AI inference.

Empty `storage_bucket` / `storage_path` and null `storage_asset_id` explicitly
represent no cloud object, while `sourceRetention: local_only` records the mode.
No database migration is required. Existing cloud documents are not deleted.
Backend mode still retains its previous upload and parsing behaviour.

Install the rebuilt agent (capability `browser-document-upload-v1`) before testing.
Chrome/Edge may ask for local-network access; allow it for the Kalika site.
The browser and selected connector must be on the same PC. Unsupported/old agents,
blocked permissions and wrong-machine selections fail without cloud PDF fallback.
Encrypted PDFs must first be unlocked locally; no password or original is sent to
the backend in local mode. Reopening an original on another device is unavailable.

## Direct-upload verification

The main status banner uses neutral phase labels. The loopback upload response
streams `preparing_document`, `parsing_document`, `analyzing_document`, then
`complete` from the worker's actual lifecycle; only `parsing_document` displays
"Document parsing". Progress does not add Supabase writes. Old agents without
this stream display "Processing document", never an inferred parsing state.
Local/cloud success badges and the local "Statement uploaded" label are removed.

- Frontend and API TypeScript checks pass.
- Real PDF → local HTTP receiver → isolated AnyDoc worker → Markdown-only mock
  backend callback passes; the temporary directory is empty afterwards.
- Tests cover origin/host/ticket rejection, checksum mismatch, expiry and replay.
- Local parsing remains uncached; existing Tally data cache is unchanged.
- Full browser/installed-agent/cloud-AI validation requires the rebuilt installer;
  the isolated transport test does not contact Supabase, Tally, or paid AI.

Document caching is disabled: no Markdown cache reads or writes. Persistent job
results exclude Markdown and compressed Markdown; temporary originals are deleted
by the parser worker. Existing document-cache rows are left untouched but unused.
Tally-data caches, settings, attachment vault and posting receipts are unchanged.
The parser result includes `parseMs` (AnyDoc loading/conversion only, excluding
download and the backend AI callback). Install the rebuilt agent to use this change.

## Verification before disabling document caching

- Frontend and backend TypeScript checks passed.
- 24 routing, AI input, and bank balance/resilience tests passed.
- Installed Local Agent 1.0.0, DESKTOP-ORM8A2U, Solution Nyx:
  - Import `2aaf3075-425f-4e58-92fe-224d3d1d8fb4`: 53.7 seconds; 19 rows;
    19 suggestions; balance valid. Agent receipt `cached: false`, uploaded true.
  - Import `e4663e1a-ef10-4d52-9b19-9fba2d35b0d7`: 47.7 seconds; same checks;
    agent receipt `cached: true`, uploaded true. AI duration 28.6 seconds.
- Both are labelled LOCAL-PARSE-TEST review records referencing the pre-existing
  source PDF. Neither confirmed bank transactions nor posted Tally vouchers.
- These are queue-to-review integration tests, not full browser timing tests.

## Remaining scope / limits

AI still receives the full allowed ledger-name list; candidate shortlisting is
not part of this change. The installed agent has a 60-second result-upload limit,
so the new AI callback uses a 45-second provider timeout to leave room for DB work.
No migration was applied and no production deployment was made.

Run unit checks:

```powershell
node --experimental-strip-types --test apps/api/src/lib/processing/local-bank-parsing.test.mjs
npm run typecheck:api
npm run typecheck:web
```

The integration script creates a labelled test import/job, not a voucher:

```powershell
node --use-system-ca --env-file=apps/api/.env scripts/test-bank-local-agent.mjs <source-import-id> <connection-id>
```
