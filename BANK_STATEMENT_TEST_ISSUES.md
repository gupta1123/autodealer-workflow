# Bank Statement / Tally Test Issues

Recorded: 12 Jul 2026

This is a handoff of the live-Tally findings from the three-PDF multi-company test. Do not use the tagged test data as a clean regression fixture until the cleanup and safeguards below are completed.

## Verified working

- Tally is reachable and its live active company is `Solution Nyx`.
- Nyx bank ledgers are available: `HDFC Bank - 700001111` and `Kotak Mahindra Bank - 6713098600`.
- Solution Nyx bank ledgers are available: `Axis Bank - 7440012233` and `ICICI Bank - 8822014500`.
- The difficult-name Solution Nyx receipts were posted for Crystal Components LLP, BluePeak Fabricators, Sapphire Tube Co, and Nova Alloy Traders.

## Must fix before the next posting test

### 1. Weak party-name match was posted

The statement row `UPI260712999` (`ORION FASTENER SOLUTIONS`) was posted to `Orion Fasteners Pvt Ltd` in Solution Nyx.

- Expected: remain unmatched / require review. The names are not an exact or sufficiently safe party match.
- Actual Tally voucher: Receipt #11, master ID 67, dated 12 Jul 2026.
- Required fix: never post a party mapping based on a weak AI/fuzzy suggestion. Posting must require either a high-confidence unique match that passes deterministic guardrails or explicit user confirmation.

### 2. Cross-bank reference was posted

The statement row using `CSH260709001` was posted in Solution Nyx/ICICI.

- Expected: the reference exists in Axis, so it must not be treated as an ICICI match; keep it in review.
- Actual Tally voucher: Receipt #10, master ID 66, dated 12 Jul 2026.
- Required fix: existing-voucher/reference verification must include the selected bank ledger and must block a match found only under a different bank account.

### 3. HDFC receipt set is incomplete

The HDFC test statement expected receipts for Vardhan, Rudra, Triveni, and interest.

- Posted: Vardhan (`HDFX260712901`, Receipt #49), Rudra (`HDFX260712902`, Receipt #50), and interest (`MCB-260712-V1-HDFC-INT-908`, Receipt #51).
- Missing: Triveni (`HDFX260712903`).
- Required fix: after Send to Tally, reconcile selected queueable rows against completed bridge commands and show any failed/skipped row explicitly. Do not show a generic success state when a selected row did not post.

### 4. Tagged HDFC test data is duplicated

Nyx contains ten duplicate `Payment` vouchers created by the earlier test seed helper.

- Repeated references: `MCB-260712-V1-HDFC-PAY-904` and `MCB-260712-V1-HDFC-CHG-905`.
- Voucher numbers: #40 through #49; master IDs #207 through #216.
- Required fix: remove duplicate tagged vouchers carefully, retaining only intentionally required records. Repair or retire `scripts/seed_multi_company_bank_workflow_v1.mjs`; its prior idempotency check was unsafe.

### 5. Test fixture is not clean across companies

Solution Nyx currently has no `MCB-260712-V1-*` opening-bill references, while Nyx contains the duplicated tagged HDFC payments above.

- Required fix: clean the tagged fixture, re-seed exactly once with a proven idempotency check, and verify one occurrence per expected reference before testing uploads again.

## Recently corrected infrastructure items to re-test

- Statement account extraction now supports the PDF format `Account: HDFC Bank - 700001111`.
- Extraction receives the verified company’s available Tally bank accounts as constrained context; it may auto-select only one exact account-number match.
- Active-company detection now uses Tally's `$$CurrentCompany` function rather than the first item returned by a company collection.
- The old installed `Kalika Tally Connector` was stopped because it was sending a conflicting Nyx heartbeat alongside the updated bridge.
- On initial page load, the UI now displays `Checking Tally company` until it receives a fresh bridge heartbeat, rather than presenting a stale company as current.

## Safe next sequence

1. Do not send further test rows to Tally using the current fixture.
2. Implement party-match and cross-bank-reference posting guards.
3. Clean/rebuild the tagged fixture once, with a recorded before/after reference-count audit.
4. Re-run all three PDFs and compare every selected row with Tally vouchers, including bank ledger, party ledger, amount, reference, and voucher type.
