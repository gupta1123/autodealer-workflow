# Purchase voucher audit — 8 September 2026

Scope: Kalika mismatch page, purchase review/prepare/queue code, connector purchase XML/import/read-back, and result classification. This was a source-code and isolated-fixture audit. No live voucher was posted or changed. Client-PC hangs and existing incorrect vouchers have not been reproduced or reconciled against a supplied invoice in this audit. Tax observations below describe implementation consistency, not a legal eligibility determination.

## Confirmed accounting and verification findings

### 1. Read-back can accept incorrect vouchers (high)

`apps/tally-bridge/src/bridge.mjs:1626`, `purchaseVoucherReadbackComparison`:

- Item checks cover count, stock name, HSN, amount and purchase ledger; omit quantity, unit, rate, godown and batch.
- Party and charge comparisons use absolute amounts, losing debit/credit direction.
- Expected allocations include charges and withholdings, but omit `ledgers.roundOff`.
- Unexpected ledger rows and the complete debit/credit balance are not checked.
- It finds the first ledger with a matching name rather than comparing the complete allocation multiset.
- Bill name/date/amount are checked, but New Ref versus Agst Ref is not checked.

An isolated fixture with wrong quantity/rate/unit, reversed supplier/tax direction, a wrong round-off ledger and Agst Ref returned `[]` (no differences). This proves the verifier is incomplete; it does not prove the builder always creates those errors.

Fix: compare a normalized, signed, complete voucher representation, including inventory precision, allocations, bill type, round-off and unexpected entries. Mark mismatches as requiring verification.

### 2. Freight rate is ignored in GST arithmetic (high)

`apps/api/src/lib/tally/purchase-posting.ts:1364`: freight rate only decides whether freight enters the GST basis. Goods GST rate is then applied to the whole basis.

Fixture: goods 1,000 at 18%, freight 100 at 5%; engine returns GST 198, whereas separately applying the entered rates gives 185. Existing mismatch checks block this fixture, so the observed result is a blocked valid invoice, not demonstrated silent posting. Matching the entered rates requires separate tax buckets.

### 3. Single invoice GST rate cannot faithfully represent mixed-rate invoices

`purchase-posting.ts:1360`: all item taxable values use `review.gstRate`. There is no per-line GST computation in this calculation. Mixed-rate, exempt-plus-taxable, and line-rounding differences cannot be faithfully represented by this model. Do not approximate them using a blended rate. Either support per-line rates and grouped tax allocations or explicitly identify unsupported invoices.

### 4. Transport TDS rate and posted amount can disagree (high)

`purchase-posting.ts:1410`: amount comes from `source.invoiceTransportTdsAmount`; changing `review.transportTdsRate` does not recalculate it. The rate is separately carried into the withholding payload.

Fixture: freight 100, entered transport TDS rate 2%, source deduction 1; engine retains amount 1. Choose an explicit amount-authoritative or rate-authoritative mode and validate their agreement.

### 5. Round-off and freight corrections depend on extraction, not confirmed review

`purchase-posting.ts:1161,1193,1438`; `TallyPurchasePostingPanel.tsx:1725`:

- If source round-off is absent/zero and cannot be derived, a manually entered round-off is discarded and its field is hidden.
- Freight also gets cleared when the source did not identify freight.
- Fixture using the existing invoice fixture: entered round-off 0.50 becomes empty review value and calculated 0.00.
- Existing tests explicitly enforce this invoice-driven behavior. This is an intentional guard that creates a correction-workflow gap when OCR is wrong.

Fix: permit an explicit, audited correction backed by the invoice, validate its amount and ledger, and recalculate; do not silently discard edits.

### 6. One-rupee tolerance conceals smaller differences

`purchase-posting.ts:238,1712,2002`: GST, invoice total and line reconciliation tolerate differences up to and including INR 1.00. UI also commonly colors those differences green. This does not automatically create a balancing round-off allocation. It permits invoice-versus-voucher differences, and the per-line tolerance can accumulate.

Fix: distinguish exact agreement from explicitly accepted invoice rounding. Keep a visible residual and require the approved round-off allocation to account for it.

### 7. Browser preview combines edited fields with old calculations

`TallyPurchasePostingPanel.tsx:1681,1726`: most totals use the last server `payload.calculation`; edited lines and ledger labels use current review state. Only selected values, notably TCS and a separate 194Q preview, get local arithmetic. Thus the displayed voucher can be internally inconsistent until Save. Dirty state prevents normal posting of unsaved edits, which is an important protection, but the preview is still misleading.

Fix: use one pure calculation implementation for both preview and server validation, and visibly distinguish unsaved from approved data.

### 8. 194Q rounding differs between browser and server

`purchase-posting.ts:1403`; `TallyPurchasePostingPanel.tsx:1707`: server rounds to paise and then to rupees; browser rounds the raw result directly to rupees. For a mathematical deduction of 10.495, the two-stage method produces 11 while direct rupee rounding produces 10. Use one specified rounding rule in one shared calculator.

### 9. Precision and zero-rate handling differ across layers

`purchase-posting.ts:343,1696`; `bridge.mjs:1060`:

- Validation rounds quantities to three decimals and rates to two decimals; XML uses raw numeric quantity and rate formatted to two decimals.
- Server line validation allows rate zero if the other constraints pass; connector rejects zero through `toSignedMoney`.
- Unit decimal metadata is fetched but does not drive the calculation precision.

Fix: validate supported precision against the selected unit, normalize once, and make API and connector acceptance consistent.

### 10. Automatic inventory allocation changes the requested voucher

`bridge.mjs:1775,1789,2070`: for certain generic zero-created import exceptions, a retry supplies `Main Location` / `Primary Batch` for unspecified allocations. It is not restricted to a specific diagnosed missing-batch error. These defaults were not explicitly selected, and read-back does not verify them.

Fix: resolve and validate inventory allocation before approval; show it in the preview. Do not infer an inventory destination from a generic exception.

### 11. Master validation is partial

`bridge.mjs:1924`: validates names, units and HSN, but ignores fetched live GSTIN/tax-role/rate metadata when comparing the approved selection. API GST validation checks ledger role but does not strictly require the configured tax rate to equal the review rate (`purchase-posting.ts:1830`). A wrong-rate input-tax ledger or changed master configuration can therefore escape this part of validation.

Fix: validate the applicable master identity and accounting attributes at posting time and verify persisted tax details. The XML writes manual tax amounts, but a balanced amount alone does not prove statutory classification is correct.

## Performance, responsiveness and recovery

### 12. Opening Tally loads a broad catalogue

`TallyPurchasePostingPanel.tsx:835`; `bridge.mjs:4863`:

- Initial request fetches review, then live ledger/group/stock/unit/company collections, then sends the compact catalogue to the API for preparation.
- The ledger export includes all ledger closing balances, contacts and bank fields even though a single purchase needs a small subset.
- Compaction happens after the full Tally read, so it does not reduce Tally's work.
- Switching Issues/Tally within the same page keeps the panel mounted, so that particular switch does not necessarily refetch. A remount/new case still starts the fresh catalogue read.

Fix: company-scoped cached catalogue, deliberate invalidation and selected-master live validation. Fetch expensive/unneeded attributes only when used.

### 13. Purchase master reads bypass the new bounded bank-read protections

`bridge.mjs:6209,6246,2246`: `ledger_masters` is not classified as a bounded read. Purchase does not provide bank identity. It therefore lacks the new read deadline/size/cancellation/low-memory handling and invokes several master exports concurrently inside its exclusive operation. Exports default to 60 seconds and use `response.text()` without the bounded-read response cap.

Fix: give purchase reads the shared bounded read context and serialize Tally HTTP work; do not make one huge call merely to reduce round trips. Aborting the HTTP client does not itself prove Tally stopped processing its report.

### 14. Duplicate verification scans a full financial-year scope

`bridge.mjs:1819,1994`: supplier/reference filters are present, so this is not an unfiltered download of every voucher. However it is a whole-year collection with extensive nested ledger/inventory fetches, no narrow identity-first pass and no purchase-specific response budget. Expense depends on the client's company size and Tally behavior.

Fix: lightweight identity query first, then detailed read-back of the exact candidate, retaining cross-date duplicate protection. Measure client timings rather than assuming a small response means a cheap query.

### 15. Dropdown and form work scales with the complete catalogue

`TallyPurchasePostingPanel.tsx:485,633,1229`: dropdown renders every filtered option; there is no virtualization or result limit. Eleven role rankings are recomputed on parent renders. Editing one field can repeatedly sort large arrays and regenerate other controls.

Fix: memoized role indexes, memoized item rows and virtualized/search-limited dropdowns. This primarily causes browser lag, separately from Tally processing lag.

### 16. Save and loading do avoidable repeated work

`apps/web/src/lib/tally-purchase-posting.ts:666`; API route `:560,1053`: Save sends the compact master catalogue again and reloads case/documents/settings/posting context, then prepares defaults and review calculations. Toggles await Save. This can be slow even when Tally is idle.

Fix: reuse a validated company/revision-scoped context, compute preview locally and persist only changed review data. Preserve authoritative server validation.

### 17. Posting has multiple serial stages and repeated document download

`bridge.mjs:1982,5345,5633`: readiness and PDF download run together, then duplicate check, selected-master validation, import, optional retry and read-back. The PDF is downloaded before checking the hash of the local existing copy. Stage timings exist, but the purchase UI mostly has generic queue/creating status.

Fix: reuse verified source files by immutable ID/hash and expose stage progress/timings. Keep correctness checks while narrowing their reads.

### 18. Timeout/exception can discard evidence that a write succeeded (high)

`bridge.mjs:2093,5698`; result route `:458`: if import times out after Tally accepts it, or read-back throws after successful import, the outer catch sends a generic failure without retained created IDs/import result. The legacy result branch classifies this as failed rather than verification-required. Team completion is more conservative; the two paths differ.

Existing duplicate checks and running-write recovery reduce duplicate risk, but generic failure is not proof that no voucher exists. Fix by recording import outcome immediately, keeping an explicit unknown/verification-pending state and checking by stable identity before any retry. Polling currently has no overall user-facing terminal deadline.

## Existing protections and test evidence

- Server recalculates before queueing; normal unsaved review changes block posting.
- Frozen payload/revision, atomic queueing and duplicate identity checks exist.
- Supplier/reference duplicate checks and post-import read-back exist.
- Source PDF is checked for type, size and hash.
- 85 existing tests passed across purchase posting, bridge and live envelope suites. Output: `.codex-run/purchase-audit-tests.txt`.
- Extra calculation fixture: `.codex-run/purchase-audit-fixtures.mjs`. Freight and transport inconsistencies and source-gated round-off were reproduced.
- The read-back mutation fixture returned no differences for deliberately altered fields; this must become a regression test in the fix.

## Suggested implementation order

1. Complete signed read-back and preserve uncertain write outcomes; remove unapproved inventory defaults.
2. Unify calculation/precision rules; support rate buckets, explicit round-off corrections and consistent transport deductions.
3. Validate with representative real invoices against exported Tally voucher details, including negative round-off and different freight rates.
4. Add cached, bounded purchase reads and narrow duplicate lookup.
5. Virtualize/memoize UI and expose posting stages.
6. Rebuild installer and validate on the affected client PC before claiming the hanging issue is resolved.

All proposed engineering changes can use existing infrastructure; they do not inherently require a paid service or plan upgrade.
