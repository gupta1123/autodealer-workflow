# Team & Access: client testing handoff

Updated 6 September 2026. Local source changes only. **No hosted migration,
account creation, activation, deployment or Git push has been performed.**

## What the client uses

Our internal operator provisions accounts. Client owners use Settings → Team &
Access to assign roles, modules and companies, or suspend/restore existing people.
There is no invitation or client-facing account-creation feature.

Administrator manages settings and people, not financial approvals. Operator
prepares and submits. Approver can approve but cannot post by default. View only
reads saved records without preparing, exporting or posting. Clone a role to
explicitly enable posting/export. Ownership protects governance and does not
automatically grant financial access.

## Changes verified in this pass

- Follow-ups-only memberships have separate read/analysis endpoints and live scan
  authority. They no longer request Cash Discount history or receive debit-note results.
- Agent status uses verified organization/installation/company/year links, not the
  requesting user's ownership. Raw machine job details are not returned to teammates.
- Web dataset sync records the initiating administrator and paired identity in one
  transaction. Revocation before dispatch cancels it. Installation-wide settings,
  cache deletion and rebuild stay in the desktop agent under team enforcement;
  web users are told where those actions belong rather than shown failing buttons.

- Bank Operators can refresh only ledger/group masters without connection-admin
  permission; other master types and mappings remain protected.
- View-only bank users read saved scoped masters instead of starting a Tally scan.
- Discount history, company selection and action visibility retain verified company
  identity and financial year. The live company response does not trust a company
  ID supplied by the connector.
- Native Tally PDF export and optional ledger-phone updates use durable, scoped
  commands. PDF voucher/party/reference/amount/hash evidence is verified before
  saving an immutable file reference. Invalid evidence records a failed outcome.
- Shared-role export and WhatsApp actions check export permission; phone changes
  additionally require connection management. No messages or Tally writes were
  sent during testing.
- Team search/pagination no longer reloads roles for every search/page. Requests
  retain the selected organization and discard aborted responses.

## Evidence

6 September closing pass: **72 focused tests passed**, frontend/API typechecks
passed, and fresh standalone PostgreSQL scoped-sync and activation-rejection
fixtures passed. These include a real loopback gateway request proving Follow-ups
uses its own endpoint, and a shared agent-status projection regression. The older
85-test result below is a previous suite, not an additive count for this run.

- Frontend and backend TypeScript checks passed.
- 85 focused Node tests passed across access, routing, provisioning, live gateway,
  company identity, document cancellation and connector result delivery.
- Fresh standalone local PostgreSQL fixtures passed:
  `team-access-client-operations.sql`, `team-access-dataset-masters.sql`,
  `team-access-client-activation.sql` (including their prerequisite fixtures).
- Activation tests cover rejection and preparation leaving sharing disabled.
  They do **not** prove successful full-schema activation or real Supabase Auth,
  Storage, browser and worker interoperability.

## Manual migration preparation — Kalika only

1. Confirm project identity is `ktpaupxmlbtpjgvigmpb` (Kalika), never
   `xojorrtjxmopxjlvvbki` (Gajkesari). Back up and inspect migration history first.
2. Review the existing application schema and local-bank-pipeline prerequisites.
   These Team & Access migrations are additive to the application, not a standalone
   fresh Supabase application schema. Do not apply every unrelated repository file.
3. Review the 20 `*_team_access_*.sql` files in timestamp order, from
   `20260904145334_team_access_foundation.sql` through
   `20260906114629_team_access_scoped_agent_sync.sql`. The preceding activation
   preparation file checks for this new function too. Applying these files does
   not enable sharing. Use the current copies of all unapplied files.
4. The prepared dataset-master migration now includes a permission argument on
   `access_enqueue_master_sync`. If an earlier copy of that migration was already
   applied, stop and prepare a versioned upgrade rather than rerunning the file.
5. After schema preparation, run the mapping report with protected backend
   environment variables:
   `node --env-file=apps/api/.env scripts/team-access-mapping-report.mjs --read`.
   Resolve organization and stable company/dataset ownership explicitly. Matching
   company display names alone is not sufficient. Unmapped historical rows stay
   restricted; applying the schema does not automatically share those records.

## Provisioning and enforcement

- `node scripts/provision-team-user.mjs --help` explains the internal CLI.
- The CLI defaults to dry-run; execution requires `--execute`, protected Supabase
  credentials and an interactive masked password for a new account. Reusing an
  existing email does not reset its password. New memberships start with no
  financial module/company scope until an owner assigns it.
- Hosted provisioning additionally requires `TEAM_ACCESS_ENFORCEMENT=true` and
  the complete release schema. Do not provision real accounts during implementation.
- API/worker/gateway must use `TEAM_ACCESS_ENFORCEMENT=true`; frontend must use
  `NEXT_PUBLIC_TEAM_ACCESS_ENFORCEMENT=true`. Restart/rebuild the corresponding
  processes when changing environment flags. Missing infrastructure fails closed.
- `access_client_release_readiness` is a schema/mapping prerequisite report, not
  a security certification. Only a database operator can call activation, after
  code, mapping and full-stack acceptance review. Do not activate from this guide
  until the outstanding checks below pass.

## Required end-to-end checks before client activation

Use a disposable full application database with real local Supabase Auth/Storage,
two organizations and at least two companies. Test login/password change, owner
scope assignment, Operator bank preparation, purchase submission/approval/posting,
View-only reads, export, suspension and a second browser tab. Confirm guessed IDs,
downloads, subscriptions and queued writes cannot cross scope. Verify cancellation
and finalization with the actual worker/gateway, then refresh saved previews.

Deliberate safeguards and remaining acceptance:

- Include a Follow-ups-only Operator and View-only user in the browser test matrix.
  Neither should request or receive discount history. Confirm cold/no-snapshot behavior.
- An uncertain bank posting remains held for manual Tally verification rather than
  automatically repeating a potentially completed financial write.
- Full Auth/Storage/browser role acceptance and successful complete-schema
  activation have not been run. Standalone SQL fixtures are not substitutes.
- Machine-wide maintenance remains desktop-only; web sync is dataset-scoped.
  Historical mappings require operator review as part of migration/activation setup.

No new installer rebuild is required for this pass: the changes are in web/API,
gateway and SQL, not the connector protocol or packaged bridge.
