# Modified Files

- **NYX-143**: Added a review/confirmation step before creating Cash Discount debit notes in Tally.
  - **How to test**: Open Cash Discounts, select one or more eligible rows, click create. Confirm that a review dialog shows company, customer, invoice, amount, date, ledger, and narration before the debit note is created. When you click Create in Tally, confirm the modal shows progress such as `Creating debit note 1 of 2` and then Tally refresh progress before closing.

- **NYX-144**: Added safer Created debit-note actions. Delete was not added because created debit notes already exist in Tally and should remain auditable.
  - **How to test**: Open the Created tab, verify each created debit note has actions to view, prepare/download PDF, send/resend WhatsApp, and view cancel/reverse guidance. Confirm there is no delete action.

- **NYX-145**: Bulk actions are available after selecting Cash Discount rows.
  - **How to test**: Select multiple To Create rows and verify a bulk create action appears. Select multiple Created rows and verify a bulk WhatsApp action appears.

- **NYX-146**: Added search, sort, and filter controls for Cash Discount debit-note lists.
  - **How to test**: On To Create and Created lists, search by customer/invoice/status, change filters, and change sort order. Confirm the displayed rows update without reloading the browser.

- **Cash Discount refresh sync status**: Refresh now shows one compact header status, detailed sync progress in the main banner, and the last completed sync time after completion.
  - **How to test**: Click Refresh on Cash Discounts. Confirm the header button changes to Syncing, only the main blue banner shows detailed progress, open-bill scan progress changes like `2/13 batches done, 11 remaining`, and after completion the page shows the latest sync time.

- **NYX-148**: Debit-note rounding issue identified. Not fixed yet; the correct fix is to round the debit-note amount before queueing the Tally command and use that same rounded amount in preview, review, created records, duplicate checks, and Tally posting.
  - **How to test**: Use an invoice/payment case where the calculated debit-note amount has paise. Confirm the current app still preserves the exact calculated amount. This issue should remain open until the posting amount is intentionally rounded everywhere.

- **NYX-150**: Cash Discount pages now check a lightweight dashboard version marker and quietly reload the dashboard only when stored data changes.
  - **How to test**: Open Cash Discounts in two tabs. In one tab, create/send/update a debit note. Keep the second tab open; within about 30 seconds, or after switching back to it, confirm the dashboard updates without a browser refresh.

- **NYX-151**: Cash Discount pages now load the latest saved dashboard first, then refresh Tally data in the background so minimal data does not wait on the full sync.
  - **How to test**: Open Cash Discounts for a connected company. Confirm saved dashboard data appears first, then the page shows background sync progress and updates again after Tally sync completes.

- **NYX-152**: Resend debit note functionality is already available for created debit notes.
  - **How to test**: Send a created debit note through WhatsApp once. Open the Created tab again and confirm the button shows Resend. Click Resend and verify the WhatsApp dialog opens and sends the same debit note PDF again.
