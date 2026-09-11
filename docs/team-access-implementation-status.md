# Team & Access — implementation status

## Current handoff — 6 September 2026

The remaining client-scope code paths are implemented locally: independent
Payment Follow-ups authorization/response routing, shared agent status and
transactional dataset-sync admission. Global machine cache/settings actions are
explicitly desktop-only under team enforcement. No connector protocol change.

New unapplied migration: `20260906114629_team_access_scoped_agent_sync.sql`.
The prepared activation-readiness function now also requires this function.
Fresh local SQL fixture `team-access-scoped-agent-sync.sql` passed, including
wrong identity, global-operation rejection and suspension before dispatch.

Remaining release gates are manual schema/mapping/activation setup and full-stack
acceptance/performance testing. See `team-access-client-testing.md` for setup and
`team-access-todo.md` for the current checklist. No hosted SQL, account provisioning,
deployment or Git push was performed. This is not a production-readiness certification.

Everything below is historical evidence from earlier passes, including their
then-unfinished paths; it is superseded by this handoff and the current checklist.

## Latest client-usability pass (5 September 2026)

See [client testing handoff](team-access-client-testing.md) for the current setup,
verification and limitations. Latest checks: web/API typechecks and 85 focused
tests passed; fresh PostgreSQL master/operator, export/phone and activation-gate
fixtures passed. Team role-list loading, verified UI company IDs, operator-only
bank master refresh, scoped discount history and durable export/phone operations
are now implemented. Two additional **unapplied** migrations end in
`client_operations.sql` and `client_activation.sql`. Activation preparation does
not itself enable sharing. Full-stack client acceptance is still outstanding.

The sections below are cumulative implementation notes; earlier statements about
individual unfinished paths or installer rebuilds describe their respective passes,
not a replacement for the current handoff.

Updated 5 September 2026. **Not ready for activation or full user acceptance.**
No hosted migration, real account provisioning, deployment, push or installer
release was performed. Remaining work is implementation/security work, not merely
waiting for the user to apply SQL.

## Implemented locally

- Shared purchase callbacks now finalize the posting, approved workflow revision,
  command, audit event and result digest in one transaction. Creator attribution
  stays separate from connector ownership. Identical retries are acknowledged;
  conflicting results are rejected. A transport success without voucher verification
  leaves verification required, not a posted purchase. An issued write's result can
  still be recorded after its initiating teammate is suspended.
- Connector outbox delivery no longer discards saved outcomes on HTTP 404/409.
  Only accepted callbacks acknowledge delivery. This source change requires a
  later installer rebuild before testing with an installed connector; none was
  built or released in this pass.
- Bank posting's existing ledger/group validation now filters the selected company
  as well as the connection. This fixes that lookup but does not complete shared
  bank posting or stable GUID/year/installation master-cache migration.

- Shared Local Agent open-bill and discount-voucher report admission now keeps the
  paired connector owner separate from the requesting teammate. It validates the
  verified dataset/session, capability, ledger selection and fiscal-year date range;
  arbitrary XML, callback URLs and replacement identities are not forwarded.
  The command and initiating-user receipt are inserted in one backend-only database
  transaction. Lost wake notifications retain the queued command. The result
  projection classifies these two reports as financial discount data, not generic
  connection-administration data. Other agent operations remain excluded from this
  shared endpoint until their dedicated workflow admission is complete.

- Permission catalogue, immutable default templates, custom roles, module/company
  intersection, protected ownership and self-approval governance.
- Team & Access settings, search/pagination, scope editing, role impact,
  confirmations, suspend/restore, ownership and tracked-work summary.
- App-wide access context, organization selection, private shared access-change
  notifications, cache invalidation and first-password page.
- Requests retain their original organization across token renewal; responses from
  an invalidated access context are discarded instead of repopulating old caches.
- Live socket startup also pins the organization before token lookup and rejects
  an access change before dispatch. Administrative company checks now match SQL.
- Team source previews are authenticated API reads rather than exposed signed
  Storage URLs. Browser blob URLs are bounded (16 / 64 MB), revoked on access
  invalidation and released when leaving the case. Preview files are limited to
  PDF and supported images up to 25 MB. Already viewed bytes cannot be recalled.
- Bank notifications have job-specific subscriptions over the existing shared
  broker: recheck current import/company access before delivering durable status,
  coalesce bursts, bound subscriptions and stop on revocation/terminal state.
- Proposal list/creation use verified organization/company/year scope. Duplicate
  checks no longer merge connections by company display name in team mode.
  Linked bank transactions require access to the same company. Legacy rule IDs
  remain rejected until rule ownership is mapped; legacy master enrichment is
  not trusted for shared proposals.
- Shared bank confirmation checks the import and selected bank account belong to
  the same permitted company. It retains the account's transaction/deduplication
  namespace, records the actual confirmer and does not delete shared history.
  An unapplied migration adds company-scoped account uniqueness while preserving
  legacy unclassified-account deduplication; duplicates fail for reconciliation.
- Purchase reanalysis and its worker use the organization's field configuration;
  the worker passes it into extraction rather than reloading global defaults.
  A settings outage cannot silently select defaults in enforced mode.
- A new-organization trigger copies installed default settings without copying
  row IDs or overwriting customization. Existing organizations require reviewed
  initialization; missing optional settings tables are handled explicitly.
- An unapplied, migration-owner-only Data API hardening operation revokes client
  table/column/view/RPC access, protects Storage/private broker topics, preserves
  existing backend privileges and leaves the audit append-only. Defining this
  operation does not invoke it or activate sharing.
- Internal CLI: dry-run, masked password, existing-account reuse and partial-failure
  reporting. Hosted execution remains blocked. No client invitation controls.
- Outer permission boundaries on user-authenticated business routes. These are
  necessary but do not replace resource-scoped queries.
- Purchase approval endpoint/UI, server financial digest, exact approved revision,
  atomic command/authority creation and distinct initiating/paired identities.
- Dispatch-time checks, revoked-command cancellation/advancement and
  verification-required handling for uncertain issued commands.
- Dispatch now also checks the current paired owner, installation, session,
  organization, GUID/year mapping and deadline before issuing the receipt.
- Shared bank-ledger, purchase-master and customer-open-bill read commands create
  their command and initiating-user receipt atomically. Lost wake notifications
  leave the durable command available to polling. Other generic shared commands
  are explicitly blocked pending their dedicated producer integration.
- Shared command list/detail reads filter financial permissions and company
  scope before pagination, through a backend-only current-pairing projection.
  Connection administration does not grant financial result access. Exports
  require export permission; document-job and arbitrary agent payloads are excluded.
- Scoped purchase queries, explicit new-purchase company selection, registration,
  organization-specific purchase/field/comparison settings.
- Database guards on financial documents, posting review, files and mismatches.
  Draft deletion cleans mappings; approval/ERP history is protected.
- Shared connection/company listings through reviewed GUID/year/installation links.
  Other-company names and raw agent status are removed from those responses.
- Live-operation checks before dispatch and financial result delivery; current
  bridge-token/session validation; scoped company bootstrap. Access invalidation
  closes the browser socket. Connector authentication remains separate.
- Parent-scoped bank preview/account-transaction reads. Team-mode GET no longer
  creates an analysis job. Account candidates accept exact company/org scope.
- Current-authority checks in purchase-analysis and legacy bank-analysis workers.

## Verified

- Re-run on 5 September: 57 focused access/provisioning/gateway/request tests
  passed, as did frontend and backend typechecks. A new disposable PostgreSQL 17
  database (`kalika_team_agent_reads_20260905_v2`, loopback port 55439) passed
  report admission, wrong identity/payload/date denial, receipt creation, result
  visibility and revocation-before-dispatch tests plus its prerequisite fixtures.
  This did not exercise a real agent or authenticated Supabase browser session.

- Frontend/backend typechecks passed.
- Access, provisioning, gateway, dataset and request/preview-scope suite: 50 tests,
  plus 2 shared-read admission tests. All passed.
- Existing purchase-posting and master-matching regressions: 46 tests passed.
- Real loopback WebSocket fixture proves revocation blocks a pending financial
  result and subsequent operation. Its authorization server is synthetic.
- Disposable PostgreSQL 17 fixtures passed: memberships, financial revisions,
  atomic queueing, cancellation, uncertain outcomes, registration, draft cleanup
  and submitted file/mismatch protection. Missing optional tables are exercised.
- Earlier concurrent owner-suspension test retained an active owner.
- Disposable PostgreSQL fixtures additionally cover direct column grants, owner
  views, SECURITY DEFINER RPCs, Storage and broker policies, retained backend RPC
  privileges, future function defaults, optional settings and initialization
  without overwriting customized values.

These are not full authenticated browser, Data API, Storage or workflow acceptance
tests. They do not support a production performance or release-readiness claim.

## Remaining release blockers

### Current implementation pass — September 5

New unapplied migrations:

- `20260905070944_team_access_dataset_masters.sql`: full dataset identity for
  master snapshots and mappings; issued sync receipts, digest retries and atomic replacement.
- `20260905071727_team_access_bank_queue.sql`: atomic shared bank batch admission,
  source fingerprints, pre-dispatch guards and durable issued-result completion.
- `20260905072804_team_access_bank_documents.sql`: shared local job creation,
  pairing/creator separation, current authorization at claim/save/recovery,
  company-scoped account selection and atomic backend-parser finalization.
- `20260905074815_team_access_discount_writes.sql`: durable scoped debit-note
  admission, proposal source fingerprint, issued-result handling and audit.

Local disposable fixture evidence:

- Masters: `kalika_team_masters_20260905_v2`.
- Bank queue: `kalika_team_bank_queue_20260905`.
- Documents including backend-parser rollback and worker lease:
  `kalika_team_documents_20260905_v6`.
- Discount writes including absent historical table at migration time:
  `kalika_team_discounts_20260905_v4`.

Latest focused run: **76 tests passed**, frontend and API typechecks passed.
The worker now uses verified dataset-scoped master/mapping inputs; no AI prompt,
model, batching or accounting-validation changes were made in this pass.
The team live gateway uses the durable discount queue, leaving legacy live
behavior unchanged. Uncertain writes remain held for verification, not blindly retried.

These results supersede the portions of the older inventory below concerning
implemented bank admission, master storage and document creation. They do not
complete consumer/UI/export integration or full Auth/Storage acceptance. The
top-level checklist remains deliberately unchecked until that broader evidence exists.

1. Shared bank posting, remaining discount mutations/results, connection/master
   mappings and local-v2 document jobs still need complete resource-level scoping.
   Existing owner queries remain; wrappers alone are insufficient.
2. Every generic/agent/bank command producer must create an initiating-user authority
   receipt before enabling the new claim path. The three shared read producers
   above and purchase posting are implemented; the remaining producers are not.
   Preserve already-issued outcomes
   after revocation, including direct live debit-note confirmation.
3. Validate the prepared Data API/Storage hardening against the complete legacy
   schema and actual Supabase Auth/Storage APIs. Audit remaining exports and
   connector attachment delivery, including signed-URL revocation limitations.
4. Finish stable dataset stamping for master snapshots and remaining settings
   callers. Team bank reads currently use scoped saved mappings; they deliberately
   do not trust the legacy owner/connection-only master fallback.
5. Exercise job-specific bank subscriptions with authenticated browser sessions
   and the completed shared local-v2 producer. Broker unit tests pass, but this is
   not yet a full real Supabase-to-browser integration acceptance result.
6. Complete all module action controls/cache invalidation and authenticated
   UI/API/database/storage/socket/worker tests across two organizations and roles.
7. Finish reviewed mapping/activation SQL and real authorization-overhead measures.
   Historical records remain unmapped; no name merges or invented approvals.

## Latest verification supplement

The newest focused suite passes **80 tests**, plus one company-option identity
regression. Frontend and API typechecks pass. Company dropdown deduplication no
longer combines identical names from separate connections, companies or years.
Dashboard version checks and master-health reads now use the reviewed dataset;
native PDF downloads authorize shared proposal scope and proxy bytes instead of
returning reusable storage URLs. Fuzzy master-health comparison work is bounded.

The local database-only authorization benchmark measured 500 post-warmup samples:
mean 0.086 ms, P50 0.084 ms, P95 0.093 ms, maximum 0.419 ms. This excludes HTTP,
authentication and network overhead. The two-owner concurrent governance test
also passed: one change committed, the conflicting change was rejected, and one
active owner remained.

The checklist is the current completion inventory. Earlier test counts and
blocker descriptions below are historical evidence, not a claim that newly
implemented paths remain entirely absent. **End-to-end release readiness is
still blocked** by the unchecked items, notably native export command/WhatsApp
authority, uncertain bank-write recovery, complete frontend action coverage,
real Auth/Storage/live-worker acceptance, and reviewed mapping/activation.
Docker is installed but its engine was not running during this pass; the SQL
fixtures used standalone disposable PostgreSQL, not real Supabase Auth accounts.

## Migrations — unapplied

In order, for disposable validation only until the blockers are closed:

1. `20260904145334_team_access_foundation.sql`
2. `20260904151552_team_access_workflow_authority.sql`
3. `20260904160936_team_access_command_dispatch.sql`
4. `20260904161958_team_access_resource_registration.sql`
5. `20260904164026_team_access_resource_deletion.sql`
6. `20260904170147_team_access_data_api_hardening.sql`
7. `20260904171430_team_access_organization_defaults.sql`
8. `20260904172300_team_access_bank_account_identity.sql`
9. `20260904174716_team_access_dispatch_identity.sql`
10. `20260904174928_team_access_command_visibility.sql`
11. `20260904175244_team_access_enqueue_reads.sql`
12. `20260905064256_team_access_agent_reads.sql`
13. `20260905065432_team_access_purchase_completion.sql`
14. `20260905070944_team_access_dataset_masters.sql`
15. `20260905071727_team_access_bank_queue.sql`
16. `20260905072804_team_access_bank_documents.sql`
17. `20260905074815_team_access_discount_writes.sql`

Migration 6 defines but does not execute `access_harden_data_api`. Do not invoke
it yet. It intentionally covers all non-extension application objects in the
dedicated Kalika public schema and requires a reviewed API-only activation.
Migration 7 initializes **future** organizations only. It does not backfill the
current organizations or classify historical business records.

The foundation retains `access_sharing_requires_enforcement CHECK (NOT sharing_enabled)`.
Do not remove it, set enforcement flags or apply hosted SQL yet. Verify Kalika
project `ktpaupxmlbtpjgvigmpb`, not Gajkesari, before any future manual application.

## Repeatable checks

```powershell
npm run typecheck
node --test apps/api/src/lib/access/*.test.mjs packages/shared/src/lib/access*.test.mjs scripts/provision-team-user.test.mjs apps/cash-discount-gateway/src/*.test.mjs apps/web/src/lib/api-access-scope.test.mjs apps/web/src/lib/protected-preview.test.mjs apps/web/src/lib/cash-discount-live-access.test.mjs
```

Run `scripts/fixtures/team-access-deletion.sql` with psql ON_ERROR_STOP against a
new disposable database only. It includes preceding fixtures and synthetic users.
Additional fixtures: `scripts/fixtures/team-access-data-api.sql` (includes the
prior workflow fixtures), `scripts/fixtures/team-access-settings.sql` and
`scripts/fixtures/team-access-bank-identity.sql`.
Latest passing databases: `kalika_team_security_final` and
`kalika_team_settings_1735`, local PostgreSQL port 55439.
Bank identity fixture also passed in `kalika_team_bank_identity_v2`.
Dispatch identity, command visibility and shared-read admission fixtures passed
in `kalika_team_dispatch_identity_1748`, `kalika_team_command_visibility_1753`
and `kalika_team_enqueue_reads_1755`. They cover routing changes, result recording
after issued-write revocation, backend-only result projection, rejected document
payload exposure, atomic read receipts and revocation before read dispatch.
These are not real Supabase Auth accounts.

Latest verification: 62 focused access/delivery tests and 46 purchase regression
tests passed; both frontend and API typechecks passed. The 62-test command above
also includes `apps/tally-bridge/src/command-result-delivery.test.mjs`.
`scripts/fixtures/team-access-agent-reads.sql` and
`scripts/fixtures/team-access-purchase-completion.sql` passed in fresh disposable
databases `kalika_team_agent_reads_20260905_v2` and
`kalika_team_completion_20260905_v2` on port 55439. Purchase completion tests cover
unissued writes, wrong pairing proof, revoked actors after issue, unverified
outcomes, identical/conflicting callbacks and single audit insertion.
These results do not close the activation blockers listed above.

The mapping-report script defaults to dry-run and its optional read is project
checked. The readiness script is only a static inventory, not a security proof;
its non-ready exit status remains intentional.
