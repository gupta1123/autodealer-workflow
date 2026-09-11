# Payment follow-up settlement verification

Checking outstanding preserves the pipeline and message history. Active invoices with a lower balance continue for the remainder. Verified settlement sets status `settled`, outstanding zero and next due null. Missing/ambiguous evidence sets `review` and invalidates sending authorization. All updates retain the existing resource scope and revision compare-and-swap.

The connector performs an additional bounded, sequential party-voucher read only when the requested invoice is absent from open bills. It requires one exact Sales New Ref with the invoice date and customer, and signed Receipt/Payment Agst Ref allocations totalling the original amount. Cancelled/optional vouchers are excluded. Duplicate sources, unknown adjustment types, wrong identities/dates, refunds leaving a balance, over-allocation and missing source evidence cannot establish settlement. Custom voucher types and opening-balance-only invoices may require manual review; they are not guessed to be paid.

No migration is needed. Older connectors do not return settlement evidence and safely retain Needs review for absent invoices. Install the rebuilt connector to enable verification; restart it after upgrading.

Local verification on 7 September 2026: Solution Nyx, INV/26-27/06371, original and linked allocations both 17,935,244.80. The new connector code verified settlement using read-only Tally requests. No message was sent and no pipeline database row was changed by this diagnostic.

Tests: shared follow-up tests, connector settlement tests, gateway read test (7 total), existing bridge suite (40), frontend and API typechecks. Browser/installed-agent round-trip still requires user testing after installation.

Test in Kalika: locate the invoice under Reminder tracking / Needs review, Check outstanding, confirm Settled and zero balance. It remains under All statuses / Settled and disappears from Reminders due with an explanatory result banner. History remains accessible. For partial payment, confirm the remaining balance and part-payment note. A deleted/renamed invoice without matching allocations must stay Needs review.
