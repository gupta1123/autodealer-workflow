# Cash Discount reliability changes — local verification

## Implemented

- No automatic full Tally rescan after WhatsApp or debit-note creation. Saved history refresh failures are separated from successful actions; bulk creation reports its confirmed count.
- Live reads take the shared Tally lane per request rather than per scan. Posting can run between reads. Revalidation before creation is retained.
- Evidence batches are capped by available RAM (10/25/50), shrink after slow reads, and stop below 750 MB free RAM. Historical evidence uses disjoint windows of at most 90 days. Timeout/partial reads impose a 30-second scan recovery pause.
- New live debit-note creation uses the durable command queue. The connector checks for the existing voucher before posting. Result upload failures are not reported as write failures. Successful command publication follows history/PDF persistence; replayed history inserts verify their saved identity and amount.
- Removed silent 100/500/1000 history caps. Paged reads have a bounded, explicit failure limit. Known financial years are separated; unclassified historical reversals remain conservatively included, rather than forgotten.
- WhatsApp submission persists intent with an optimistic concurrency claim before sending. Concurrent/uncertain attempts cannot be blindly resent. Definite HTTP rejection can be retried; transport uncertainty stays blocked for provider verification. Only the verified stored PDF is allowed. Provider request timeout is 20 seconds. UI says submitted, not delivered.
- Compact terminal scan events use the existing `tally_connection_events` table. Successful scans include aggregate query/byte/connector-memory metrics; failures preserve compact terminal classification. No bill rows or narration are persisted by this telemetry endpoint.
- UI explicitly distinguishes configured 7/15 calendar-day policy from narration and shows scan-time freshness. Calculation rules were not changed.

## Verification performed

- Frontend and API TypeScript checks.
- Connector/runtime/gateway tests, including bounded evidence, low-memory refusal, queue ordering, cancellation and durable notification polling.
- Accounting narration regression tests unchanged; complete-history paging tests.
- Installer source validation. Build outcome is reported separately in the task.
- Local NSIS build completed; packaged bridge/runtime files match workspace bytes. Packaged Electron native SQLite in-memory smoke test passed. The installer is unsigned (local testing only).
- Targeted result: 55 connector/runtime/gateway tests plus 16 accounting/history tests passed (71 total). This is not an end-to-end provider or client-Tally test.

Installer: `installer/tally-bridge/output/KalikaLocalAgent-1.0.0-x64.exe`

SHA-256: `F9F38E9A72EAC4D489A8002F4A1B1C9394D8E2485CE857CCF41FFFF9EB1F71DE`

## Required before claiming client readiness

1. Install the newly built agent on a test machine, with the matching local API and gateway. No production deploy or migration application was performed.
2. Scan the intended company with low-memory monitoring enabled. The initial company-wide open-bill report is still a single Tally report; its safe behavior on the client's dataset is NOT proven by unit tests.
3. Measure both Tally process responsiveness/RSS and connector RSS. Current aggregate telemetry measures the connector and free system RAM, not Windows Tally's Not Responding duration. Use the existing read-only benchmark monitor only during an agreed client test.
4. Compare exact eligible invoices and amounts before/after; date windows must retain carry-forward and receipt allocations. More bounded requests are a safety measure, not evidence of a speedup.
5. In a test company, create one note; interrupt result delivery; confirm exactly one voucher and one saved history row. Test PDF completion before WhatsApp availability.
6. With a test recipient/provider sandbox, exercise accepted, definite rejection, timeout, duplicate submission and DB failure after acceptance. Delivery webhooks/provider reconciliation are not implemented here: accepted must never be called delivered. An uncertain intent requires trusted provider verification before changing its durable state; do not clear it merely because time elapsed.
7. Test same-name companies and unclassified historical years. Historical null-year rows are not automatically remapped.

## Remaining limitations

- This does not establish that Tally can never hang. The initial open-bill query is not yet paged inside Tally; a managed report or other query strategy needs real Tally benchmarking before replacing it.
- Fine-grained invoice-only voucher filtering is not introduced without proving TDL compatibility and complete receipt coverage.
- End-to-end accounting writes, provider sends, hosted callback fault injection, actual client performance and packaged-app operation are not represented by passing source/unit tests.
- Existing legacy live creation fallback is retained only for older backend responses; the matching new backend returns durable commands. Deploy backend/gateway together, then install the matching agent.
- No new SQL migration is required for these changes; they use existing proposal snapshots, commands and connection events.
