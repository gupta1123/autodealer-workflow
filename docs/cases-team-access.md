# Cases with team access

Team authorization and purchase approval are independent policies.

- Keep `TEAM_ACCESS_ENFORCEMENT` and frontend enforcement enabled.
- `access_organizations.purchase_approval_required = false` restores the existing packet review, ledger selection, confirmation and Tally posting flow. It removes the separate submit/reviewer/return steps.
- Missing policy fields default to requiring approval in the application. The migration defaults existing organizations to requiring approval; enable direct mode explicitly only after deploying both applications.
- View, prepare, post, export, recycle and delete permissions, company/FY scope, authenticated document access and dispatch-time permission checks remain enforced.

Previously submitted but unposted cases can be edited or posted directly. No mass case rewrite or fabricated reviewer approval is required. Existing approval audit records remain; snapshot the workflow rows in the policy-change audit before activation.

Direct confirmation freezes an internal dispatch checkpoint with `direct_post = true`, `submitted_by = null` and `approved_by = null`. The existing internal `approved` state means ready for dispatch in this mode; it does not represent another user's approval. The connector still receives a frozen voucher through the atomic queue. Double clicks reuse the command. In-flight, uncertain and verified postings retain their existing edit/retry protection.

Migration: `20261016131313_separate_purchase_approval_from_team_access.sql`.

After application deployment, update only the intended organization's policy, increment its access revision and record an audit entry in one transaction. Do not disable sharing or authorization to change this workflow.

Regression checks:

```powershell
node --experimental-strip-types --test apps/web/src/components/cases/TallyPurchasePostingPanel.test.mjs
# DATABASE_URL and SUPABASE_CA_CERT must point to the authorized Kalika database and its official CA.
node --use-system-ca --env-file=apps/api/.env scripts/test-direct-purchase-policy.mjs
```

The hosted integration checks roll back all schema changes, edits, permissions and queued commands. They do not send a voucher to Tally.
