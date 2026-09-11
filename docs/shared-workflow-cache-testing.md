# Shared Local Agent data — local testing

No Supabase migration is required or applied. Local Agent schema v2 is created automatically inside its encrypted SQLite file and preserves existing settings. Restart the live gateway and install the rebuilt Local Agent; editing source does not update the installed executable.

1. Open a company in Tally and leave the connector online. Its first heartbeat now queues the initial ledger, group, stock-item and unit sync automatically. The first sync reads from AlterID zero once; it does not repeat the entire catalogue as a reconciliation pass.
2. Change one master in Tally. The connector compares the company watermark and requests only masters after each saved entity cursor. A backwards watermark clears and rebuilds that company/year dataset. The weekly key reconciliation finds deletions.
3. Open Bank Statements or a Purchase review. A ready catalogue returns with `cache.source=encrypted_local_agent_incremental`; a missing, quarantined or explicitly refreshed catalogue falls back to live Tally.
4. Enable **Local ledger suggestions** in Tally Connection settings. Suggested ledgers are generated from deterministic local hashed n-grams and Zvec. No label or embedding is sent to an API. The per-ledger content hash prevents re-embedding when only an unrelated field or balance changed.
5. Use the four module switches to enable or disable local data for Purchase vouchers, Bank statements, Cash discounts and Payment follow-ups independently.
6. Open Cash Discounts or Payment Follow-ups. Open bills remain a current targeted Tally read, while matching ledger details and group ancestry come from the incremental catalogue when ready. Existing complete workflow snapshots still provide the saved-results-first experience.
7. Run a bank open-bill match twice inside one minute. The second exact-scope read uses encrypted cache. Cash/follow-up scoped reads use a two-minute window. Any posting attempt invalidates open-bill snapshots before it sends data to Tally.
8. Switch company or financial year and verify no prior catalogue, vectors, bills or workflow results appear.

Local benchmark on 8 September 2026: 50,000 ledger vectors indexed in 4.9 seconds; 100 searches completed in 589 ms (5.89 ms average). Packaged Electron verification passed encrypted SQLite, local document parsing, native Zvec indexing/query/deletion and byte-for-byte comparison of nine connector source files.

A connected, verified Tally company is still required to retrieve the snapshot. Offline browsing is not enabled. Current open bills are deliberately refreshed on a short targeted schedule because Tally does not expose a cheap per-ledger change feed. Financial reminder and posting validation remain authoritative and live.
