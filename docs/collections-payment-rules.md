# Collection and cash-discount rules

Agreed on 15 October 2026. Payment follow-ups and CD recovery are independent.

| Invoice terms | Last qualifying payment date | Collection starts if unpaid |
| --- | --- | --- |
| Regular credit, including `PAYMENT WITHIN 25 DAYS` | Invoice date + 30 calendar days | The following IST day |
| `SAME DAY RTGS` | Invoice date | The following IST day |
| `ADVANCE RTGS` | The day before the invoice date | Invoice date |

There is no additional grace week. Missing invoice dates, conflicting terms,
duplicate invoice references or unreconciled balances require review. Reminders
use the remaining Tally balance, independently of any pending CD debit note.
Automatic reminders follow the same deadlines and existing company permissions,
recipient checks, operator automation setting and fresh settlement verification.

## CD basis

The agreed Tally Sales amount is already **net of CD**. Preserve gross-up:

    gross basis = Tally invoice amount / (1 - category rate / 100)
    category CD = gross basis - Tally invoice amount

Advance RTGS uses 1.5%; Same-day RTGS uses 1%. Regular credit has no CD category.
An explicit CD ledger line is not required in the Sales voucher. The agreed
narration establishes the category and the net-of-CD treatment.

The full net invoice must be paid within the category deadline. Partial receipts
do not prorate the category CD. A missed condition produces an operator-reviewed
recovery; this also applies to an invoice fully settled after its deadline.
Confirmed recoveries are deducted before offering another debit note. Fresh
invoice revalidation and existing Tally duplicate checks remain required.

## Connector evidence

Resolve the original amount and invoice date from the Sales customer entry.
With advance receipts, Tally may put `New Ref` on the receipt and `Agst Ref` on
the subsequent sale; the Bill opening amount/date can describe the receipt.
Signed allocations account for refunds, while cancelled and optional vouchers
are excluded. Narration alone is not proof that a receipt settled an invoice.
Unexpected differences from Tally's live balance are held for review.

Keep settled invoices in `settledBills`, separately from `openBills`, so CD can
review late full payments without putting them into payment reminders. Both
prepared-field reads and direct XML reads use the same evidence calculation.
Calculations are generated into the connector from the backend source.

## Release 1.2.33

Install the new connector and refresh the two collections tabs. Existing invoice
and receipt fields are reused; no Tally vouchers need to be recreated.

Apply `supabase/migrations/20261015093155_regular_credit_followups.sql` to enable
automatic enrollment of regular-credit invoices. It extends one category check;
it does not create schedules or send messages. Until applied, regular invoices
still appear in payment follow-ups and existing RTGS automation continues.
