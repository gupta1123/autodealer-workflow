# Payment reminders require an operator

Connecting Tally, preparing customer dues, opening Cash Discounts or Payment
Follow-ups, refreshing results and checking outstanding balances must never
enroll invoices or submit WhatsApp messages.

An operator selects invoices and confirms the corresponding action in Payment
Follow-ups. Starting a follow-up creates an operator-managed schedule; sending
still requires the team's Check & send action. Send once requires confirmation.
Existing permission, company scope, outstanding verification and atomic send
claim checks remain in place.

The live gateway no longer starts a background reminder worker. The old
bridge-authenticated `/api/collections/follow-ups/automatic` endpoint is retained
only to return empty work lists to older gateways. Settings always expose and
save `automatic: false`, and reject attempts to enable it. The previous automatic
toggle has been removed from Settings.

Migration `20261017052547_block_unrequested_automatic_reminders.sql` prevents
creating a send attempt for an automatically discovered schedule, including from
an older server process. Historical attempts are retained. The 157 automatic
Solution Nyx schedules paused during the 17 October incident remain paused.
This migration does not resume, convert or send those schedules.

The rollback-only SQL check in `scripts/test-manual-reminder-guard.sql` verifies
that automatic claims fail while operator-created claims remain available.
