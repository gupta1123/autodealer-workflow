# Bank Statement Test Cases

Use these fixtures from this folder:

- `kalika-hdfc-june-ai-sample.pdf` - 3 transaction rows
- `kalika-sbi-june-ai-sample.pdf` - 5 transaction rows
- Existing CSV fixtures such as `kalika-hdfc-educational-mode-sample.csv`, `kalika-hdfc-june-sample.csv`, `kalika-hdfc-june-latest-sample.csv`, and `kalika-hdfc-apr-1-negative-one-row.csv`

Note: Tally Educational Mode accepts imports only on restricted dates such as the 1st, 2nd, and 31st. Paid-license testing should use the normal PDF/CSV fixtures with June 3+ dates. If you fall back to Educational Mode, use `kalika-hdfc-educational-mode-sample.csv` for Tally queueing.

For pass/fail notes from local and manual testing, see `TEST_OBSERVATIONS.md`.

## Test Order

Start with the 3-record HDFC PDF to validate the smallest AI extraction flow. Then test the 5-record SBI PDF to validate a different bank layout and more rows. After those pass, continue through account matching, confirm/import, snapshot replacement, duplicate handling, and Tally queueing.

## Cases to Test

1. PDF AI extraction happy path
   - Upload `kalika-hdfc-june-ai-sample.pdf`.
   - Expected: account details are extracted for HDFC, 3 transaction rows appear, and `requiresManualExtraction` is false.

2. PDF AI extraction with alternate bank layout
   - Upload `kalika-sbi-june-ai-sample.pdf`.
   - Expected: account details are extracted for SBI, 5 transaction rows appear, withdrawal/deposit columns map to debit/credit, and charges are categorized as bank charges.

3. CSV parser fast path
   - Upload `kalika-hdfc-educational-mode-sample.csv` when testing with Tally Educational Mode.
   - Expected: rows are parsed without AI, account matching still works from manual/extracted account fields, and preview rows can be confirmed.

4. Existing account match
   - Import a statement with account number `50100234567890`, confirm it, then upload the HDFC PDF again.
   - Expected: the existing bank account is selected or returned as the single candidate.

5. Newer snapshot replacement
   - Confirm one HDFC import, then confirm `kalika-hdfc-june-latest-sample.csv` for the same account.
   - Expected: current `bank_transactions` snapshot is replaced, while posted-memory rows remain protected by `bank_transaction_posting_log`.
   - In Educational Mode, do not queue the latest CSV rows to Tally unless you edit dates to allowed dates first.

6. Duplicate row handling
   - Confirm the same statement twice for the same account.
   - Expected: transaction fingerprints dedupe identical rows and do not create duplicate pending Tally vouchers.

7. Negative or malformed amount review
   - Upload `kalika-hdfc-apr-1-negative-one-row.csv`.
   - Expected: preview allows manual correction before confirm; invalid rows should not be confirmed silently.

8. Manual fallback
   - Upload a non-PDF/non-image/non-text file or temporarily run without OpenRouter credentials.
   - Expected: file is stored, `requiresManualExtraction` is true, and the user can manually enter rows before confirming.

9. Tally queue after confirmation
   - Confirm a valid import, select a Tally connection and bank ledger, then queue transactions.
   - Expected: one `post_bank_voucher` bridge command is queued per pending transaction.

10. Requeue protection
   - Mark/complete a transaction as posted, then import a newer snapshot containing the same fingerprint.
   - Expected: that transaction remains `posted` and is skipped when queueing.

## Edge Cases to Test

11. Empty or summary-only PDF
   - Upload a statement page that has account details and closing balance but no transaction rows.
   - Expected: account details may populate, `requiresManualExtraction` is true, and the user must add rows manually before confirm.

12. Ambiguous debit/credit columns
   - Upload a statement where amounts are shown in one column with `DR`/`CR` suffixes.
   - Expected: debits and credits are split correctly, or uncertain rows remain editable in preview.

13. Reversed date format
   - Upload rows using `YYYY-MM-DD`, `DD/MM/YYYY`, and `DD-MM-YY`.
   - Expected: all valid dates normalize to ISO dates before confirm.

14. Multi-line narration
   - Upload a row where narration wraps across two lines.
   - Expected: the description is combined into one transaction row, not split into duplicate rows.

15. Duplicate-looking rows with different references
   - Upload two rows with same date, description, and amount but different reference numbers.
   - Expected: both rows remain separate because fingerprints include reference number.

16. Exact duplicate rows
   - Upload two identical rows in the same statement.
   - Expected: only one row survives after fingerprint dedupe during confirm.

17. Opening balance row
   - Upload a statement that includes `Opening Balance` as a row.
   - Expected: opening balance is not imported as a transaction.

18. Closing balance row
   - Upload a statement that includes `Closing Balance` as a row.
   - Expected: closing balance is not imported as a transaction.

19. Negative amount notation
   - Upload amounts like `(1,250.00)` or `-1250.00`.
   - Expected: the row is flagged for review or normalized consistently before confirm; it should not silently become the wrong debit/credit.

20. Account number masking
   - Upload a statement showing only masked account number such as `XXXX7890`.
   - Expected: system should not auto-create a misleading full account unless the user confirms/enters the real account number.

21. Multiple account candidates
   - Create two bank accounts with similar holder names, then upload a statement without account number.
   - Expected: user must select the correct account before confirm.

22. Unsupported upload fallback
   - Upload an unsupported file type.
   - Expected: file is stored, extraction falls back to manual review, and no empty transactions are auto-confirmed.

23. OpenRouter unavailable
   - Run without `OPENROUTER_API_KEY` or simulate provider failure for a PDF upload.
   - Expected: import record is created with extraction error metadata and manual review is required.

24. Tally queue with missing bank ledger
   - Confirm transactions but do not select/provide a Tally bank ledger.
   - Expected: queue action is blocked with a clear validation error.

25. Previously posted transaction in newer statement
   - Import, queue, mark one row posted, then import a newer statement containing the same row plus new rows.
   - Expected: old posted row stays posted, new rows are pending, and only pending rows queue.

## CSV Column/Layout Edge Cases

26. Reordered columns
   - Upload `edge-reordered-columns.csv`.
   - Expected: 3 rows import correctly even though the columns are ordered as balance, credit, debit, reference, narration, value date, date.
   - Check: first row is credit 50000, second row is debit 2500, third row is debit 118 and category `bank_charges`.

27. `Txn Date` and withdrawal/deposit headers
   - Upload `edge-txn-date-header.csv`.
   - Expected: 3 rows import correctly with `Txn Date`, `Withdrawal`, `Deposit`, and `Running Balance` headers.
   - Check: RTGS row is debit 45000, NEFT row is credit 73500, charges row is debit 29.50.

28. Single amount column with DR/CR marker
   - Upload `edge-amount-drcr.csv`.
   - Expected: 3 rows import correctly even though there is one `Amount` column plus `Dr/Cr`.
   - Check: `CR` becomes credit, `DR` becomes debit.

29. Metadata before header and quoted commas
   - Upload `edge-metadata-before-header.csv`.
   - Expected: parser skips metadata lines before the transaction table and keeps quoted narration commas inside one description.
   - Check: second row description is `UPI PAYMENT TO OFFICE SUPPLIES, SATARA`, not split into broken columns.

30. App-level Tally queue with edge CSV
   - Confirm `edge-reordered-columns.csv`.
   - Select Tally connection and `Local Test Bank`.
   - Queue transactions.
   - Expected: rows queue with the same debit/credit direction seen in preview. If Tally is still Educational Mode, June 3 rows may fail posting; that is a license-date restriction, not parser failure.
