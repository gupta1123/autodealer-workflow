# Cash Discount manual query benchmark — 31 August 2026

## Outcome

The best **validated, behavior-preserving query change** is one metadata discovery pass followed by small unions of native per-ledger voucher collections. A manual pilot processed all 2,123 open-bill ledgers in 25.569 seconds, versus the deployed read phase reaching its 85-second budget. This is not a measured end-to-end frontend speedup: the pilot reused discovery metadata, did not call Heroku analysis, and ran after earlier tests had warmed some Tally caches.

No production code, deployment, database rows, vouchers, or masters were changed. The diagnostic script only sends Tally `Export` requests and writes local measurement artifacts.

## Environment and safeguards

- Local Solution Nyx, matching the latest Kalika connection; connector 0.1.63.
- Machine has 15.9 GiB RAM. These are **not measurements of the client's 4 GB machine**.
- One Tally request at a time; 10-second request and 8 MiB streamed-response limits. Full pilot stops starting batches after 45 seconds.
- Date range: 1 April–31 August 2026. The pilot checked that its open bills did not require an earlier carry-forward date.
- Tally remained reachable in a final read-only readiness check. This does not measure UI responsiveness or prove absence of pauses.

## Observed data and timings

| Test | Result |
| --- | --- |
| Minimal metadata for all 12,000 ledgers | 657 ms, 6.15 MB |
| Current 50-ledger filtered metadata request | 740 ms, 27.8 kB |
| Open bills | 214 ms, 2,472 bills, 2.05 MB |
| Ten separate customer-history calls, sample A | 791 ms, 21 vouchers |
| Same ten customers in one union | 358 ms first measured call; 62–67 ms repeats; same 21 voucher records |
| Ten-customer union, different sample B | 521 ms first measured call; 81 ms repeat; 32 vouchers |
| 25-customer union | 507 ms first measured call; 130 ms repeat |
| 50-customer union | 844 ms first measured call; 129 ms repeat |
| 100-customer union | 1,009 ms first measured call; 245 ms repeat; 223 vouchers |
| Sales-type collection filtered to sample A's ten parties | 4,091 ms; same 15 Sales vouchers, excluding settlements |
| All FY Sales headers | 897 ms; 3,752 vouchers; 5.38 MB |
| CD-text-filtered Sales headers | 909 ms; 1,548 vouchers; 2.29 MB; matched an offline filter over all Sales headers |
| New 25-customer sample selected from CD candidates | 282 ms first measured call; 83 ms repeat |
| Full 2,123-ledger pilot, batches of 50 | 25,569 ms; 44 reads including fresh bills; all ledgers processed |

The pilot's slowest batch was 1,814 ms; largest batch 616,523 bytes. Parsing took 705 ms. The derived `byLedger` result was 1,293,597 bytes, containing 2,402 open-bill rows before the existing exception-scope filtering. Counts therefore must not be presented as final eligible Cash Discount invoices.

Independent single-ledger parser checks matched the pilot exactly for 12 sampled customers, including narration, invoice classification and receipt evidence. Sample union XML voucher records were also compared for equality, not just row counts. This is strong sample evidence, not an exhaustive proof for every financial edge case.

First measured calls are not guaranteed cold-cache measurements. Do not extrapolate repeat timings to a freshly opened client company.

## Rejected or incomplete shortcuts

1. **One HTTP call per customer:** too much repeated fixed work at this scale. The deployed metadata path additionally runs about 43 separately filtered ledger-collection reads for 2,123 names.
2. **Sales-type query separately filtered per customer batch:** the measured sample was slower than native per-ledger unions. Do not replace one repeated scan with another.
3. **Custom compact report prototype:** both initial variants returned an empty envelope. Rejected as invalid, not counted as a fast successful result.
4. **Only scan invoices with a CD marker:** header/reference matching identified 712 open invoices across 710 customers, but the page also produces ordinary payment follow-ups. Dropping other customers would change behavior.
5. **Trust Sales header PartyLedgerName alone:** real Sales vouchers in the sample store the party in ledger entries while the header is blank. A header-only exception filter missed them. Bill-allocation/ledger-entry evidence or a safe fallback remains necessary.

## Additional correctness defect found

The automatic scope admitted 495 out-of-group ledgers. Existing code rejected 490 after reading their histories and accepted five based on a nonempty `sourceSalesLedgerName` field.

That field is not reliable proof of Sales: shared `isPartyInvoiceVoucher` accepts Purchase as well as Sales, then `salesLedgerFromInvoiceVoucher` takes a non-tax credit entry. For example, a Purchase voucher for Surya Steel Trading Company (`KALIKA-TDS-POST-CONFIG-C`, master ID 12242) was assigned its TDS payable ledger as Sales evidence. Other purchase references were assigned Round Off. Do not preserve this error as intended Cash Discount eligibility.

Fix Cash Discount-specific Sales validation using genuine voucher-type/master-group evidence, without breaking the generic purchase/bank consumers of the shared parser. Preserve valid Sales where the party exists only in ledger entries, custom Sales types, advances, carry-forward bills, and unmatched cases that require review.

## Recommended implementation order

1. Replace the repeated 50-name metadata exports with one bounded minimal discovery; join to open-bill ledger names locally. Fetch contact/address details only for relevant visible proposals or actions. Do not forward all raw master XML to the backend.
2. Use native `Vouchers : Ledger` / `Child Of` collections combined into small requests. Start with 25 customers on low-memory machines, increase toward 50 only when measured latency/bytes are small; use smaller batches for high-volume ledgers. Deduplicate voucher identities and parse each batch once.
3. Stream completed batch progress/results and allow cancellation between batches. Keep one in-flight Tally read, independent liveness, company guards, and fresh final posting validation.
4. Correct the Sales/Purchase exception classification; avoid investigating suppliers merely because they have open bills. Do not assume a nonempty credit-ledger field or a party-header match proves eligibility.
5. Then evaluate a second-stage invoice/receipt index and company-isolated incremental cache. The header experiment is promising, but not yet a complete replacement for bill-allocation evidence or payment-follow-up calculations.

## Reproduction and sources

Script: `scripts/benchmark-cash-discount-readonly.mjs`.
Local artifacts: `.codex-run/cash-discount-benchmark-20260831/` (raw exports and JSON timings; not intended for Git publication).
Modes used: `discover`, `compare`, `scale`, `compact`, `sales`, `candidates`, `pilot`, `verify`. `compact` is intentionally a failed prototype. Review the hard-coded target/date and ensure no user scan is active before any rerun.

- [Tally: Child Of versus Filter, and collection performance](https://help.tallysolutions.com/how-to-choose-the-right-approach-from-tdl/)
- [Tally: objects, collections, native ledger subcollections and unions](https://help.tallysolutions.com/objects-and-collections/)
- [Tally: XML export/report examples](https://help.tallysolutions.com/sample-xml/)
