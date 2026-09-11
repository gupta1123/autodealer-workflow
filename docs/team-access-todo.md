# Team & Access completion checklist

Scope: Kalika only. No hosted SQL application, real account provisioning, deployment or push.
Updated 6 September 2026. Checked implementation items have focused source/unit/SQL evidence; full Auth/Storage/browser/worker acceptance remains a separate gate. No hosted activation is implied.

- [x] Inventory existing implementation and release blockers.
- [x] Finish stable dataset-scoped master snapshots and mappings, including producers and consumers.
  - [x] Atomic dataset snapshots/mappings and company-year isolation database tests.
  - [x] Shared bank worker ledger reads use verified dataset identity.
  - [x] Dashboard version and master-health reads use scoped dataset identity; API typecheck passed.
- [x] Finish shared bank posting admission, dispatch, result recording and retry safety.
  - [x] Atomic batch admission, source-change dispatch guard and issued-result database tests.
  - [x] Reject partial/oversized explicit selections rather than silently posting a subset.
- [x] Finish local document job authorization across creation, processing, recovery and delivery.
  - [x] Creator/paired-owner separation, revocation, account selection and cancellation database tests.
  - [x] Backend-parsed preview finalization is atomic and checks worker attempt/lease.
- [x] Finish discount mutations/results and supported command authority receipts.
  - [x] Scoped native PDF export and optional phone-update command receipts, verified PDF evidence and result idempotency.
  - [x] Durable discount admission and post-revocation completion database tests.
  - [x] Team live gateway queues a durable command instead of directly executing an unrecorded write.
- [x] Complete frontend action visibility, direct navigation and access invalidation implementation.
  - [x] Bank Operator refresh and View-only read paths; verified discount company IDs and export visibility; team role-list caching.
  - [x] Independent Follow-ups read/scan permission, response projection and gateway routing; no discount-history query for this page.
  - [x] Shared agent status filters verified datasets; sync pins identity and records administrative authority. Global cache/settings operations remain desktop-only under enforcement.
- [ ] Validate complete schema, Data API, Storage, live events and workers with multiple organizations/roles.
- [x] Produce mapping/activation migrations, readiness report and local test instructions for manual review/application.
  - [x] Prepared operator-only activation migration and client testing handoff; activation rejection fixture passed, no sharing enabled.
- [ ] End-to-end authorization/network performance acceptance after migration setup.
  - [x] Local database-only benchmark: 500 samples, P95 0.093 ms; HTTP/Auth overhead remains unmeasured.
- [x] Rebuild and inspect the local installer; do not publish.
  - Packaged Electron 42.11.0, encrypted SQLite and fresh PDF parsing passed.
  - Packaged bridge SHA-256 matches workspace source. Installer is unsigned; not a stable release.
- [x] Run focused regression suite and record remaining limitations; full client acceptance is not declared.
  - [x] 6 September closing pass: 72 tests, web/API typechecks, scoped-sync and activation-rejection local SQL suites passed.
  - [x] Client-usability pass: 85 focused tests, frontend/API typechecks and three fresh SQL fixture suites passed.
  - [x] Latest focused suite: 80 tests passed; company identity regression: 1 passed; frontend/API typechecks passed.

Detailed evidence and migration inventory: `team-access-implementation-status.md`.
