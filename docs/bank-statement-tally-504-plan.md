# Bank Statement to Tally 504 / Hanging Mitigation Plan

Status: NOT DONE

This note captures the agreed direction for implementation. The overall plan is not done; completed rows are marked in the implementation table.

## Current Behavior

- The active source folder is `autodealer-workflow`.
- The bank statement upload page now uploads the file/import first, then runs one automatic `sync_masters` before the frontend applies analysis/ledger matching.
- If post-upload `sync_masters` fails, the uploaded import and selected document preview are kept and the user can retry sync without uploading the statement again.
- That sync fetches Tally master data: ledgers, groups, voucher types, GST ledgers, and tax ledgers.
- Statement upload creates a `bank_statement_imports` row and a `bank_statement_extraction_jobs` row.
- On send to Tally, the confirm route currently persists full statement transactions into `bank_transactions`.
- The account also stores checkpoint fields:
  - `last_imported_transaction_at`
  - `last_imported_transaction_marker`
- Queueing then reads `bank_transactions`, creates Tally bridge commands, and the bridge posts or verifies entries in Tally.

## Problems To Fix

- Full uploaded statement transactions are stored in the cloud database.
- Later steps can re-read stored transactions and synced masters instead of using current upload/session data.
- Large statements and large Tally companies can make API routes slow enough to 504.
- Large Tally exports can make the local bridge appear hung if work is not bounded.
- Returning full command rows and large payloads increases response size and memory pressure.

## Implementation Phasing

| Area | Current behavior | Later target | Implementation status |
| --- | --- | --- | --- |
| Tally master sync timing | Pre-upload sync checkbox removed; upload now happens before master sync. | Upload first, then sync once after upload when the workflow is ready to analyze/use ledgers. | DONE |
| Post-upload sync retry | A failed post-upload sync could block the successful uploaded/extracted statement, hide the selected document preview, and show a generic error. | Keep the uploaded import and selected document preview, poll sync longer until terminal state, and show a retry sync action without re-uploading the statement. | DONE |
| `bank_transactions` storage | Full uploaded statement transactions are stored in `bank_transactions`. | Keep this as-is for now. Revisit temporary/minimal storage only after the 504/hanging fixes are stable. | KEEP AS-IS FOR NOW |
| Ledger matching data | Bank statement matching routes now load active synced ledgers once per request and pass that same ledger snapshot into AI matching/validation. | Later enhancement: attach an explicit `syncRunId` to the upload/import context for auditability. | DONE |
| Duplicate detection | Live Tally duplicate checks now use bounded batch verification for the current statement date range and selected bank ledger. Settlement/open-bill fetching is unchanged. | Later enhancement: make voucher-type scoping configurable for companies that use custom bank voucher types. | DONE |
| Queue response size | Queue API returns full command rows and the current frontend uses them for polling/status. | Skip this for now unless frontend and backend are changed together. | SKIPPED FOR NOW |
| Tally fetch scope | Duplicate checks are scoped to the statement date range/bank ledger; settlement voucher evidence now tries an open-bill-date scoped export first and falls back to the legacy broad export if needed. | Later enhancement: add stronger Tally-side ledger filtering if the bridge export can support it reliably. | DONE |
| Master sync payload | Master sync can upload/upsert a large payload and conflict with old synced rows. | Delete the previous synced master snapshot for the connection/types, then insert the fresh snapshot in chunks. | DONE |

## Target Flow

1. User selects a Tally company.
2. User uploads the bank statement first.
3. After upload, run one `sync_masters` command for that workflow when synced Tally data is required for analysis/ledger matching.
4. If `sync_masters` fails or remains pending too long, keep the uploaded import and show a retry sync action instead of requiring another upload.
5. Attach the resulting sync reference, such as `syncRunId`, to the upload/import context.
6. Analyze the uploaded statement.
7. Use the synced master snapshot for:
   - AI ledger matching
   - bank ledger validation
   - counterparty ledger validation
   - suspense ledger lookup
   - queue command creation
8. Do not re-sync Tally masters during the same upload/send flow.
9. Keep `bank_transactions` behavior unchanged for now to avoid introducing storage/recovery risk while the 504/hanging fixes are being stabilized.
10. Queue Tally commands asynchronously in small batches.
11. After the core stability fixes are complete, revisit whether full uploaded transaction rows should become temporary workflow-scoped data.

## Temporary Data Retention

This is a later privacy/storage redesign, not part of the first stability pass.

- Uploaded transaction details should exist only while that specific upload/send-to-Tally workflow is active.
- Do not keep temporary transaction details for the next upload.
- A later upload should run its own sync after upload and should use fresh ledger/master data for that workflow.
- Delete temporary transaction details immediately when:
  - Tally posting/checking completes successfully
  - the user cancels or removes the upload
  - upload analysis fails
  - send-to-Tally reaches a terminal failure
  - the user starts over with a new statement
  - the session/job is explicitly expired
- We still need a cleanup fallback. If the browser closes, the internet drops, or the server never receives a done/cancel event, a stale-job cleanup should delete abandoned temporary data automatically.
- The cleanup fallback is only for privacy and storage safety; it is not intended to retain data for reuse.
- Suggested stale cleanup window: 30-60 minutes after the workflow stops heartbeating or updating.

## Data To Keep

For the first stability pass, keep the existing `bank_transactions` behavior unchanged. The following reduced-storage approach is a later change after the 504/hanging issues are stable.

Persist on `bank_accounts`:

- `last_imported_transaction_at`
- `last_imported_transaction_marker`

Persist minimal posting metadata, preferably without full descriptions or raw payloads:

- bank account id
- transaction fingerprint or keyed digest
- status: queued, posted, verified, failed, etc.
- Tally command id
- Tally voucher id/date/reference if available
- timestamps and error summary

Later target: do not persist full uploaded transaction rows long term.

## Sync Rules

- Master sync should happen once after upload. Statement extraction/analysis may continue while sync is running; ledger matching should update after the sync succeeds.
- The frontend should poll the sync command until it succeeds, fails, is canceled, or reaches the polling timeout.
- A failed post-upload sync should not discard the uploaded import, analyzed rows, or selected document preview; retry should rerun only `sync_masters` and then reload the existing import preview so ledger matching can be applied.
- Ledger matching uses the synced master snapshot from that upload workflow.
- Queueing uses the same snapshot.
- No additional master sync should happen during send-to-Tally unless the user explicitly refreshes.
- Tally posting and verification commands still run because they perform actual Tally work.
- Voucher/bill fetches should be bounded by statement date range or by the specific review action.

## Suggested Technical Changes

- Add a sync snapshot reference to bank statement import/job metadata.
- Remove the pre-upload master sync and move the workflow sync to after upload.
- Refactor ledger matching helpers so they can receive preloaded ledgers and mappings while preserving the current AI prompt and matching order.
- Keep `bank_transactions` unchanged in the first stability pass; revisit temporary upload/job transaction storage later.
- Keep async queueing as the default for send-to-Tally.
- Reduce queue responses to counts and command ids instead of full command rows.
- Chunk large master sync uploads/upserts.
- Bound voucher/bill exports by date range and context.
- Keep bridge export timeouts so Tally failures fail cleanly instead of blocking the connector loop.

## Duplicate Detection Without Storing Full Bank Data

Preferred options:

1. Store keyed fingerprints only.
   - Create an HMAC digest from normalized transaction fields using a server-side or company-local secret.
   - Example inputs: account id, date, amount, debit/credit direction, normalized reference, normalized description token.
   - Store only the digest, not the original transaction text.

2. Keep duplicate state locally on the company machine.
   - The Tally bridge can maintain a local encrypted store of recent fingerprints.
   - Cloud receives only job status and command ids.
   - This is strongest for data privacy but needs backup/recovery handling.

3. Use Tally itself as the source of truth.
   - Before posting, verify in Tally by date range, bank ledger, amount, reference, and matched ledger.
   - Store no bank transaction history in cloud.
   - This avoids cloud storage but makes duplicate checks dependent on Tally availability/performance.

4. Store a minimal posting log with redacted fields.
   - Keep amount/date/status/voucher id only if needed.
   - Avoid narration, raw payload, full counterparty details, and full statement rows.

Recommended approach:

- Use Tally verification as the primary duplicate check.
- Store only HMAC fingerprints plus Tally voucher references as a fallback/recovery layer.
- Keep full uploaded transaction details only in temporary job storage, with automatic cleanup.

## Open Decisions

- Where temporary transaction data should live: database temp table, job payload, or local bridge store.
- Whether fingerprint secrets should be global, per user, per company, or generated locally by the bridge.
- Retention period for temporary upload/job data.
- Exact retention/storage approach for future temporary transaction data.
- Whether cloud should keep any posting log or whether the bridge/Tally should be the only durable duplicate source.

## Changes Completed So Far

- DONE: Removed the upload-page sync checkbox.
- DONE: Bank statement upload now happens first, then Tally master sync runs once after upload.
- DONE: Post-upload sync failure now keeps the uploaded import and selected document preview available, polls sync longer, and shows a retry sync action instead of forcing another upload.
- DONE: Statement analysis now continues even while post-upload Tally sync is running or if sync fails. The review page remains visible, shows sync-in-progress or retry status, and reloads the same import after sync succeeds so ledger matching can update.
- DONE: Ledger matching still uses the same AI matching logic, but bank-statement matching routes now reuse one active-ledger snapshot per request instead of reloading ledgers for every row.
- DONE: AI ledger matching prompt now has generic party-root and descriptor collision rules. Direct match is allowed only when one ledger is uniquely safe; ambiguous shortened/partial names return close-match candidates for review; generic/no-evidence narrations remain suspense.
- DONE: Added `scripts/audit-bank-ledger-ai-matching.mjs` to test the exact source prompt against `docs/tally-test-ledgers.md`, compare AI output with expected direct/close/suspense results, and write `docs/bank-ledger-ai-matching-audit-report.md`.
- DONE: Duplicate detection keeps Tally as the source of truth by using the existing batch live Tally check for the statement date range.
- DONE: Duplicate detection now passes the current upload's relevant ledger context and the bridge filters parsed vouchers to the selected bank ledger before matching.
- DONE: Settlement/open-bill logic was not changed. `fetch_customer_open_bills` still fetches open bills and existing advances for matched party ledgers.
- DONE: Settlement voucher evidence no longer starts with the all-time voucher export. It first uses the matched ledgers' open bill dates through today, then falls back to the old broad export if the scoped export fails.
- DONE: Master sync backend ingestion now treats `tally_masters` as a latest snapshot for synced master data: it deletes old rows for the current connection/types, de-duplicates the new rows, and inserts the fresh snapshot in chunks.
- DONE: Manual connector sync failures now include the backend HTTP status and message instead of only `Internal server error`.
- DONE: Ledger matching prompt audit was expanded to 29 cases covering shortened descriptors, root-only ambiguity, OCR/spelling variants, bank-account ambiguity, category ledgers, generic references, and saved-mapping rejection.
- DONE: Prompt changes fixed the original Sahil `TRA/TRANSP` issue, descriptor filtering, Axis bank-account ambiguity, and most close-match/direct-match cases in the audit. Latest full prompt-only audit result: 27/29 passed in `docs/bank-ledger-ai-matching-audit-report.md`; the remaining full-run failures were safe close_match rows with broader-than-expected candidate lists.
- DONE: Added deterministic ledger-collision safety version `token_collision_v3`. Existing v2 recommendations are refreshed, direct/suspense AI outputs are converted to close-match review when the current synced masters contain multiple token-prefix candidates, and the review dropdown shows only suggested close matches plus the safe Suspense fallback for those rows.
- DONE: Fixed synced-ledger loading to page through Supabase in 1000-row chunks up to the existing 5000-row cap. This prevents the AI matcher and dropdown from missing ledgers that exist after the first 1000 rows, such as `Sahil Transport` and `Sahil Transport And Suppliers`.
- SKIPPED FOR NOW: Queue response shrinking was not implemented because the current frontend uses the returned `commands` array for posting status and polling.
