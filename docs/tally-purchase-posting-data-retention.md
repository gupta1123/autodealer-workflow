# Tally purchase posting: data-minimized retention

## Principle

The purchase-posting workflow must not mirror Tally books in Supabase. Supabase
keeps only the state needed to review a case, prevent duplicate writes, deliver
one command reliably, and identify the voucher that Tally created.

The invoice remains owned by the existing case/document records. The posting
workflow does not create another permanent copy of that source.

## Permanently retained

`purchase_invoice_tally_postings` retains:

- References to the case, source document, owner, connector, master sync and
  command.
- Lifecycle status and revision.
- SHA-256 duplicate and idempotency keys.
- Only user changes from the derived review (`review_patch`), not the complete
  invoice or voucher.
- A SHA-256 hash of the exact approved payload.
- Approval, queue, creation and verification timestamps.
- Tally voucher number, Master ID, GUID and compact verification status.
- The latest operational error, if any.

The workflow does not create a posting-events table or retain before/after
review snapshots.

## Temporarily retained

The exact approved voucher payload is stored in `tally_bridge_commands.payload`
only while the command is queued, claimed or retryable. This is necessary for a
deterministic retry: the connector must resend exactly what the user approved.

The payload is replaced with command identifiers after the connector reports a
result. It is cleared if retries are exhausted, and a delete trigger clears it
if the associated posting/case is removed first.

## Tally-derived data

This workflow retains only:

- Active company name plus GSTIN/state code needed to choose and validate the
  intended company.
- Existing scoped master names needed for ledger, stock-item and unit choices.
- The created voucher's number, Master ID, GUID and verification status.

It does not retain Tally voucher history, books, reports, full verification
responses, or request XML.

## Purchase-accounting settings

`purchase_accounting_settings` stores only three organization-level boolean
rules: purchase-of-goods TDS, transporter TDS, and GST TDS. All three default
to off. They do not store invoice values, tax registrations, Tally masters, or
voucher data.

Core client behavior is not configurable here: Maharashtra GST routing,
M.S./O.M.S. purchase-ledger selection, stock-item mapping, freight, round-off,
and separate invoice/voucher dates remain part of the purchase-posting logic.
Even when an optional deduction rule is enabled, the posting flow uses only a
deduction amount confirmed in the reviewed invoice; it does not infer one from
HSN or invoice basic value.

Install the settings table with
`supabase/migrations/20260731160143_purchase_accounting_settings.sql`. The
application uses safe off defaults until that migration is applied, but saved
settings are unavailable.

## Access control

The posting table has RLS enabled. Authenticated users can select, insert and
update only rows whose `owner_user_id` equals their authenticated user ID. The
atomic queue function is executable only by `service_role`; the service-role
key must remain backend-only.

The purchase-accounting settings table also has RLS enabled and grants no
browser role direct access. Authenticated Settings API routes read and update
it through the backend service-role client.
