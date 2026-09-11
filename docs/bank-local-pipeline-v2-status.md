# Bank local pipeline v2 — implementation status

Status: **local integration-test build prepared; production release gates remain open** (2026-09-04).

## Latest local handoff (supersedes earlier progress notes below)

- The user-applied Kalika migration is recognized by read-only PostgREST signature/table discovery. No additional `bank_local_v2_capabilities` RPC is needed. The backend still requires its feature flag and the selected agent's capability before creating a v2 job; failed discovery selects the supported legacy path before creation.
- API, worker and live gateway were restarted locally with `BANK_LOCAL_PIPELINE_V2=true` in their process environment only. Frontend remains on port 3000; API 3001; gateway 3002. No production environment, GitHub push, deployment or hosted migration was changed.
- Installer rebuilt locally with `--publish never` and `bank-local-pipeline-v2` capability. It is **not installed**. The currently installed old agent therefore still selects v1 until replaced/reconnected.
- Installer: `installer/tally-bridge/output/KalikaLocalAgent-1.0.0-x64.exe`. SHA-256: `6F5FE4E03583F3A36DC94126C2AFDDD84F7E2708438D3C720EAD5124D79D9585`. Unsigned; do not treat this as a signed production release. Packaged capability byte-matches source; packaged Electron/native encrypted SQLite/parser smoke passed with the original PDF unchanged.
- **110 regression tests passed**, zero failures/skips, including legacy parsing, posting balance proofs, bill-allocation helpers, scope validation, independent resource lanes, loopback ordering/retries, idempotent processing, recovery, compact broker events and immediate preview completion. Frontend and API typechecks passed.
- All ten original PDFs (five unique documents) passed a sequential real-parser → compressed v2 handler → unchanged AI implementation with deterministic provider fixtures → actual disposable PostgreSQL finalization → saved-row readback test. Expected rows: 150,19,19,19,4,16,20,20,20,20. The two unsupported layouts retain manual review. Test scripts leave originals unchanged; only disposable local database rows are written.
- Multi-session PostgreSQL race tests passed: simultaneous claims admit only one analysis; finalization/cancellation produce either 150 saved rows or zero, never a partial replacement. Tests used a minimal fixture schema, not a complete production clone.
- The earlier controlled live-AI comparison used all 12,000 ledger names, returned 19/19 rows, and produced identical request bodies and prepared output through v1/v2 replay. No new live AI calls were made for the ten-file corpus run.
- Cancellation now interrupts the underlying AI HTTP transport after checking durable cancelled/failed state; prompts/model/chunking/retry configuration remain unchanged. Browser disconnection does not abort paid analysis. Online cancellation uses broker notifications; status fallback is every 15 seconds when offline. Transport and durable-status tests passed; provider-side billing cancellation is not promised.
- Browser diagnostics use monotonic time and job IDs for preparation, context transfer, document stages, preview-fetch start and preview application/paint opportunity. Backend logs report claim/AI/validation/save measurements separately. No source text or complete ledger catalogue is logged. These measurements are not a completed end-to-end speed benchmark.

### User action to exercise the local integration build

1. Install the rebuilt executable above. Choose **No** if asked to remove local data/pairing.
2. Open/reconnect Local Agent to the local Kalika site; keep local AnyDoc parsing enabled.
3. Refresh `http://localhost:3000/bank-statements` and analyze a statement. Confirm the creation response has `pipelineVersion: 2`; older agents intentionally remain on v1.
4. Review the saved preview before posting. Installation and a connected browser/Tally run have not been performed automatically.

### Still required before declaring the full plan/release complete

Connected installed-agent/browser end-to-end verification (including reload/reconnect, completion-to-render latency, real Tally ledger timing), complete-schema account-selection/confirmation/posting regressions, physical multi-PC/4 GB-machine tests, and measured before/after non-AI overhead remain unverified. Full per-stage durable timing/byte accounting is not implemented. Do not claim all release gates, an end-to-end speedup, or production readiness from fixture results. No further SQL is currently needed for the local readiness gate.

## Earlier implementation history

The user applied the schema migration to Kalika project `ktpaupxmlbtpjgvigmpb`, and its two tables and eight coordination RPCs were verified through read-only schema discovery. No deployment, push, or installer publication has been performed. A local installer was rebuilt and smoke-tested, but it does not advertise v2 yet. The readiness RPC remains absent; this schema preparation does not enable v2. Do not replace the installed agent yet.

## Implemented foundations

- Extracted 16 existing normalization functions into `apps/api/src/lib/processing/bank-preview-normalization.mjs`. Their function bodies were compared against the pre-edit worker and are unchanged.
- Legacy worker now imports the shared normalization and ledger-recommendation helpers. The AI implementation was not edited.
- Shared local extraction/preview preparation, including coverage and running-balance checks.
- Versioned, origin- and identity-bound loopback context submission. Context can arrive before or after the PDF. Identical retries acknowledge; conflicting contexts reject.
- Duplicate upload-ticket registration rejected without replacing a pending session; cancellation after transfer closes the progress stream.
- Serialized PDF worker lane, an opt-in v2 document-service branch, NDJSON result reader and status-before-resend handling after uncertain responses.
- Dependency-injected backend coordinator preserving the complete ordered inputs to `matchBankMarkdown`. It retries transient final saves three times, not AI, then requests a structured checkpoint.
- Server-side RPC adapter and a fail-closed prerequisite gate. The ready-capabilities RPC is intentionally absent and the agent does not advertise v2.
- Draft SQL for atomic creation, admission, claim, finalization, cancellation, checkpoint storage and failure; service-only privileges; legacy worker claim/stale sweep excludes v2 jobs.
- Gated policy/import routes now create import + job + parsing command transactionally and return a scoped upload ticket without an extra import read. A requested v2 job cannot downgrade to v1.
- Frontend v2 preparation starts the existing fresh ledger request alongside import creation/upload and sends normalized ordered context directly to loopback. No ledger catalogue is attached to the v2 import.
- Outer bridge dispatch releases its Tally lane for v2 documents; the persistent SQLite scheduler has separate document and Tally lanes. Redelivery reuses the command's local job ID. Restart does not replay a volatile v2 document.
- V2 NDJSON result/status routes are wired with token and database identity checks; ambiguous responses query durable state before resending. Losing progress transport cannot discard a paid AI result.
- Compact private Supabase Realtime events connect backend/worker to the existing authenticated gateway. Browser watchers share its socket, deduplicate revisions/fetches and poll every 15 seconds only while notifications are unavailable. These paths have unit coverage, not yet a real cross-process Realtime integration test.
- Service-only recovery RPC atomically finalizes structured checkpoints without AI, expires abandoned jobs, and deletes successfully recovered/expired checkpoints. A flag-gated worker timer invokes it independently of legacy AI jobs.
- Preparation cancellation terminates the parser; v2 parser completion no longer announces AI analysis before its backend claim. Original legacy parsing behavior is retained.
- Safe backend diagnostic output records claim/AI/validation/finalization durations, RPC counts and input byte counts without source content. Full cross-process stage correlation remains pending.
- Parallel v2 ledger reads validate owner, organization, connection, installation, session, company GUID and financial year against the returned Tally profile. Their internal Tally exports are serialized; the ordered ledger inputs are unchanged.
- V2 compact status bypasses preview/account/master resolution, and resumed waiters use the saved job's connection with immediate status reads. Missing v2 jobs fail closed rather than being recreated as legacy jobs.
- Completion arriving during a stale in-flight status read now schedules one coalesced follow-up instead of being lost. A cancelled job cannot enter the successful-preview recovery branch.
- Agent preparation failures terminate only still-preparing jobs. Late agent transport failures cannot invalidate accepted AI or structured recovery; these guards share the job lock with claim/finalization.
- The standalone gateway's development command reads the API's server-only environment files, so it can use the same private broker configuration after restart. No environment values or feature flags were changed.

## Verified

- Hosted Realtime verification passed on an isolated randomly named private test topic: subscription succeeded, broadcast returned HTTP 202, and completion arrived in 918 ms. No customer documents, Tally commands or accounting rows were used. This verifies the real broker but not the entire browser/gateway reconnect flow.
- One controlled live AI comparison passed using the existing one-page statement's full 12,000-ledger context: 19 source rows, 19 returned rows, verified coverage, no extraction-review flag. Exactly one live provider call was made. Replaying its captured response through v2 produced identical request bodies and prepared preview data. No import/command/accounting writes were made; the original PDF hash remained unchanged.
- That comparison measured parser wall time 592 ms (parser measurement 523 ms) and live AI time 23,280 ms. The replay used an in-memory store; its persistence timings are not database performance measurements and cannot establish an end-to-end speedup. Reproduce with `scripts/verify-bank-v2-live-parity.mjs` using the original import ID and matching PDF. Captured provider responses remain in RAM only.
- Frontend completion handling now retries a failed status/preview read at most three times after an event. It does not require a duplicate socket notification or restart AI. All seven completion tests and the frontend typecheck passed.

- Latest combined run: **86 tests passed** across v2 orchestration/HTTP, compact status, notifications, AI/coverage, loopback upload, document workers, stream recovery, scheduler, encrypted storage, exact ledger scope and frontend completion handling.
- An additional cross-process notification integration test passed using the actual Supabase client against a local HTTP/WebSocket protocol fixture. A child publisher reached only the selected connection's subscriber; private source inputs were stripped. This does not certify a real Supabase Realtime deployment or its RLS configuration.
- Two real-PDF/HTTP integration tests cover parsing-first and context-first preparation. Each invoked its deterministic AI fixture once, finalized once and removed the temporary source. These are transport tests, not extraction-accuracy benchmarks.
- Earlier running-balance/normalization tests also passed; they were not included in the 71-test count.
- Ten PDF files (five unique hashes) parsed sequentially using the real local parser. All succeeded and original hashes remained unchanged. Results are in `output/bank-local-v2-parser-verification/results.json`.
- These are parser-only measurements, **not** end-to-end accuracy certification or a pipeline speedup measurement.
- Draft migration executed only in an isolated PostgreSQL 17 test cluster on loopback port 55439, using the minimal fixture schema. No Supabase project was changed.
- SQL fixture checks passed for atomic creation, admission, duplicate claims, finalization, same/different digests, existing account override, permissions, rollback preserving old preview rows, checkpoint creation and cancellation preventing finalization.
- This is not validation against a full disposable copy of the production schema. Concurrent multi-session race/load testing remains outstanding.
- After restarting the memory-heavy dev processes, full frontend and API typechecks passed with a 2 GB compiler heap cap.
- Disposable SQL checks also cover actual checkpoint finalization/expiry, conflicting context rejection, status lookup and restrictive Realtime policies overriding a broad existing policy without changing unrelated topics. The Realtime schema in this fixture is a stub, not a running Supabase service.
- Latest draft SQL also passed checks that parser failure terminates preparation but cannot discard an already accepted AI call. It was executed only in the disposable fixture database `bank_v2_preparation_failure_checks` on loopback port 55439.
- Local installer rebuilt with `--publish never`. Ten changed packaged runtime files were byte-compared against source and matched.
- Packaged Electron 42.11.0 loaded native encrypted SQLite and ran the packaged parser in a child process against a copy of the one-page test PDF. Latest parse measurement: 13 ms, 2,166 Markdown bytes. Original hash unchanged; temporary source removed. This is a smoke test, not an end-to-end benchmark.
- Artifact: `installer/tally-bridge/output/KalikaLocalAgent-1.0.0-x64.exe`. Windows reports **NotSigned**. It was not installed or published.
- Artifact SHA-256: `B6A7A4DB8554CE39F795FEC071DEAB3C4E6780CE7DD4DDB3E3BABA9CA00FE232`.

## Pending before activation

1. Verify real backend/gateway Realtime delivery, reconnect/reload recovery and completion-to-render latency. The API, recovery worker and gateway must share the same configured Supabase project; the gateway requires server-only Realtime credentials. No credentials may be exposed to the browser.
2. Run multi-PC/company end-to-end tests of the implemented strict GUID/session ledger-read enforcement, not just its unit/mock-Tally tests.
3. Complete preparation/admission/upload/context/parser-start/render timing correlation and durable compact metrics; current diagnostic timings cover the backend and parser only.
4. Verify cancellation during a real AI request, response-loss recovery, HTTP admission/backpressure, low-memory behavior, restart/lease handling and full browser reload recovery. Resumed waiters now select v2 by durable metadata, but full browser tests remain outstanding. Current AI code is unchanged; its external cancellation behavior has not been certified.
5. Complete recorded-response old/new preview/account/validation parity and concurrent multi-session SQL races against a full disposable schema, plus existing preview edit/confirmation/Tally-posting regressions.
6. Run all ten PDFs through the entire v2 workflow, not just the parser. The small controlled live-AI/request-parity comparison passed, but real finalization/render timings and full-corpus regression remain pending. Report non-AI overhead separately.
7. Add the migration-readiness RPC and advertise capability only after the remaining gates pass. Rebuild once more if runtime code changes. No publication, deployment, push or production migration without instruction.

The integration remains deliberately fail-closed: `bank_local_v2_capabilities` is absent, the agent does not advertise `bank-local-pipeline-v2`, and no deployment environment flag was changed. Existing supported jobs continue on v1.

## Disposable SQL test inputs

- `scripts/fixtures/bank-local-v2-schema.sql`
- `supabase/migrations/20260904072147_bank_local_pipeline_v2.sql` — manual schema preparation; activation remains gated
- `scripts/fixtures/bank-local-v2-transactions.sql`

Run these only on a fresh disposable local database, in that order, using `psql -v ON_ERROR_STOP=1`. The fixture is deliberately not a migration for any real project.

The final prerequisite-check version passed the same disposable SQL suite in `bank_v2_manual_preparation_checks`. A read-only REST schema inspection of the configured Kalika project confirmed required columns and the absence of v2 functions. This is column-level compatibility evidence, not full hosted trigger/constraint or connected-workflow validation.
