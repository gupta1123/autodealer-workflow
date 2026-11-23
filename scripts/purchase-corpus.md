# Local purchase-case regression replay

The archive covers active cases in the Kalika Steel company for November 16–22, 2026, India time. Client documents and results belong under the ignored `.local-data/purchase-week/` folder. Keep this directory private.

## Run offline

From this checkout, run:

    node scripts/replay-purchase-corpus.mjs .local-data/purchase-week
    node --test apps/api/src/lib/line-items.test.mjs apps/api/src/lib/tally/purchase-posting.test.mjs packages/shared/src/lib/purchase-voucher.test.mjs

The replay verifies every downloaded file against its archived digest, exercises line normalization using stored text and line items, and prepares the voucher from the stored extraction and saved reviewer edits. The per-case comparison covers source-line normalization, review quantities, rates, units, item amounts, financial calculations and blocker codes. The saved command payload (when present) is preserved in the manifest for inspection. The replay runs without live Tally masters, so master-specific approvals and posting are outside this test. Opening the PDF for a changed case is the manual source check. The replay does not perform OCR or call the AI.

## Review results

`baseline.json` is the pre-fix output. `replay.json` lists changed case IDs and their new outputs. The four expected changes cover United Traders 1335, PSP 5731, Bharat Steel 44, and Shaikh Brothers 173. Each has invoice-specific assertions. All other changes currently fail the run. For a future intended change, inspect the affected PDF, then add precise assertions before updating the allowlist. Keep the baseline tied to its original archive.

## Recreate the archive

The export script uses the app's existing database and Storage credentials from the environment. It uses a read-only database transaction and verifies downloaded byte counts and available original SHA-256 values. Point it to a new private directory for a new snapshot. For a fresh baseline, use the pre-fix code and run the replay once with `--baseline`. Baseline creation refuses to overwrite an existing baseline. The archived period and company are explicitly set in the export script.

## When to rerun extraction

For changes to normalization, voucher calculation, or review handling, run the complete offline replay. For changes to the OCR engine, extraction model, prompt, or page splitting, replay alone cannot test what the extractor will return. Select one PDF per affected layout and every previously failing layout, compare fresh extraction to the source PDF, and save the resulting extraction as a reusable local fixture. Expand the sample if a new discrepancy appears. No paid extraction runs automatically in this suite.
