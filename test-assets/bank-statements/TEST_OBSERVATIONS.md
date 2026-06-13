# Bank Statement Test Observations

Last updated: 2026-06-12

## Summary

- PDF fixtures are valid and text-readable.
- CSV parser edge cases were tested locally with the real parser.
- Tally posting was partly tested manually by the user against `Local Test Bank`.
- OpenRouter PDF extraction, Supabase import confirmation, account matching, parser edge cases, and Tally posting have been partly verified through live app testing. Remaining cases are marked below.

## Main Cases

| # | Case | Status | Observation | Next step |
|---|---|---|---|---|
| 1 | 3-row HDFC PDF extraction/posting | Passed by user | User observed 3 Tally commands; one initially failed in Educational Mode on `2026-06-03`, then the pending row posted successfully after correcting the license/date condition. | No further action unless retesting from a clean account. |
| 2 | 5-row SBI PDF extraction/posting | Passed by user | User reported case 2 worked. Fixture contains one `02/06/2026` credit row for `73500`. | If duplicate `73500` rows appear in one preview, capture screenshot/file name. |
| 3 | CSV parser fast path | Passed by user | User reported case 3 worked. Parser fast path also passed locally. | No further action unless retesting from a clean account. |
| 4 | Existing account match | App pending | Requires a confirmed import in Supabase, then re-upload of same account number. | Confirm HDFC once, re-upload HDFC PDF, verify single account candidate is selected. |
| 5 | Snapshot replacement | Passed by user | User reported case 5 worked. | No further action unless validating database row counts directly. |
| 6 | Duplicate row handling | Passed by user | User clarified exact duplicates resulted in only a single row being added. Local exact-duplicate fingerprint check also passed. | No further action unless duplicate Tally vouchers recur. |
| 7 | Negative or malformed amount review | Passed by user | User reported upload-sequence case 13 worked. Local parser also confirmed `kalika-hdfc-apr-1-negative-one-row.csv` parses 1 reviewable debit row. | No further action unless adding more negative/parentheses formats. |
| 8 | Manual fallback | User-observed working / needs formal retest | User indicated fallback behavior was working, but no exact unsupported-file observation was captured. | Upload unsupported file and verify manual entry is required. |
| 9 | Tally queue after confirmation | Partially passed | User observed successful posting for valid pending row(s). Earlier failure was tied to Tally Educational Mode date restriction, not missing XML date. | Retest paid mode with all HDFC rows, then SBI rows. |
| 10 | Requeue protection | Pending | Requires a transaction that is posted, then re-imported in a newer statement. | After a posted row exists, import newer snapshot and verify that fingerprint is skipped on queue. |

## Edge Cases

| # | Case | Status | Observation | Next step |
|---|---|---|---|---|
| 11 | Empty or summary-only PDF | Pending | No fixture or live app test yet. | Add/upload a summary-only statement and verify manual review required. |
| 12 | Ambiguous debit/credit columns | Locally passed for DR/CR CSV | `edge-amount-drcr.csv` parsed `CR` as credit and `DR` as debit. | Upload through app and verify preview matches local parser output. |
| 13 | Reversed/mixed date formats | Passed by user | User reported upload-sequence case 9 worked. Local parser normalized `2026-06-01`, `02/06/2026`, and `03-06-26` to ISO dates. | No further action. |
| 14 | Multi-line narration | Pending | No fixture/live test yet for physically wrapped CSV/PDF narration. Quoted comma narration passed in case 29. | Add a wrapped-narration fixture or test with a real statement PDF. |
| 15 | Duplicate-looking rows with different references | Passed by user | User reported upload-sequence case 10 worked. Local parser produced 2 rows and 2 unique fingerprints for `edge-duplicate-different-reference.csv`. | No further action. |
| 16 | Exact duplicate rows | Passed by user | User reported upload-sequence case 11 worked and earlier clarified exact duplicates resulted in only one row being added. Local parser produced 1 unique fingerprint. | No further action unless duplicate Tally vouchers recur. |
| 17 | Opening balance row | Passed by user | User reported upload-sequence case 12 worked. Local parser skipped opening balance because it had no valid transaction date. | No further action. |
| 18 | Closing balance row | Passed by user | User reported upload-sequence case 12 worked. Local parser skipped closing balance and total rows because they had no valid transaction date. | No further action. |
| 19 | Negative amount notation | Passed by user for existing fixture | User reported upload-sequence case 13 worked. Existing negative fixture parses a reviewable debit row. Parentheses/signed amount variants still need a dedicated fixture only if required by real statements. | Add a parentheses amount fixture only if this format appears in real statements. |
| 20 | Account number masking | Pending | No masked-account fixture/live app test yet. | Add/upload statement with `XXXX7890`; verify no misleading full account is auto-created. |
| 21 | Multiple account candidates | App pending | Requires two saved bank accounts with similar holder names and no account number in upload. | Create second similar account and upload account-number-missing fixture/real file. |
| 22 | Unsupported upload fallback | Pending | Not locally tested through route because it requires API request/storage. | Upload unsupported file in app; verify import record + manual review. |
| 23 | OpenRouter unavailable | Pending | Not tested because it requires running API without OpenRouter key or provider failure. | Temporarily remove key and upload PDF; verify extraction error metadata. |
| 24 | Tally queue with missing bank ledger | Pending | Requires app/API queue request without bank ledger. | Confirm import, clear/select no bank ledger, queue; expect validation error. |
| 25 | Previously posted transaction in newer statement | Pending | Requires posted log from Tally result and a newer imported snapshot containing same fingerprint. | Use posted HDFC row, import latest statement with same row, verify row remains posted/skipped. |

## CSV Column/Layout Edge Cases

| # | Case | Status | Observation | Next step |
|---|---|---|---|---|
| 26 | Reordered columns | Passed by user | User reported case 5 in the upload sequence worked. Local parser also confirmed debit/credit mapping with reordered columns. | No further action unless Tally queue direction needs checking. |
| 27 | `Txn Date` + withdrawal/deposit headers | Passed by user | User reported case 6 in the upload sequence worked. Local parser also confirmed `Txn Date`, `Withdrawal`, `Deposit`, and `Running Balance`. | No further action unless Tally queue direction needs checking. |
| 28 | Single amount column with DR/CR marker | Passed by user | User screenshot of `edge-amount-drcr.csv` shows DR/CR mapped correctly: first row credit `50000`, second debit `2500`, third debit `118`. | No further action. |
| 29 | Metadata before header and quoted commas | Passed by user | User reported upload-sequence case 8 worked. Local parser skipped metadata and kept `UPI PAYMENT TO OFFICE SUPPLIES, SATARA` as one description. | No further action. |
| 30 | App-level Tally queue with edge CSV | Pending | Parser output is correct locally; app/Tally queue not yet run. | Confirm `edge-reordered-columns.csv`, select `Local Test Bank`, queue, and verify Tally direction. |

## Local Verification Commands Run

- `npm run typecheck:api`
- `npm run lint:api`
- Direct parser check via `jiti` for all CSV edge fixtures.

Lint result: 0 errors, 5 pre-existing warnings in unrelated files.
