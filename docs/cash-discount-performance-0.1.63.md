# Cash Discount performance changes — connector 0.1.63

Local implementation; not deployed. No migration or live data changes required.

## Read strategy

- Discover open bills once, then read voucher evidence using native `Vouchers : Ledger` collections for eligible customers only, sequentially.
- Preserve carry-forward bill evidence by extending the evidence start date when necessary.
- Revalidate only the requested customer's linked invoice before debit-note creation. Never use continuation cache as posting authorization.
- Keep the initial company-wide open-bill discovery bounded. It remains a potential bottleneck on large companies and requires a real-client measurement.

## Resource and connection protection

- Cash Discount reads: 20-second per-request limit, 90-second scan budget, 8 MiB XML limit, 4 MiB result limit.
- Stop further customer reads after a failure; retain completed customers and explicitly mark incomplete customers. Missing evidence is not treated as zero.
- Explicit continuation can reuse completed evidence for up to five minutes in a bounded memory-only cache. Keys include connection, installation, company GUID, financial year, scope, ledger identity and fresh bill evidence. Full Refresh and posting invalidate reuse.
- FIFO Tally scheduling, expired/cancelled queue rejection, duplicate-scan rejection, and cancellation propagation on browser timeout/disconnect.
- Keep connector liveness heartbeats independent of Tally reads. Liveness does not refresh the last actual Tally observation. Capability negotiation protects older backends.
- Reuse an active browser socket while work is pending; perform analysis once instead of preview plus final duplicate calls. PDF readiness refreshes saved proposals without a new full scan.
- Company identity is checked before/after evidence collection; changing the UI selection cancels its active scan.

Cancellation aborts our HTTP wait and prevents subsequent reads. It cannot guarantee that Tally immediately stops an already executing request. Avoid immediate repeated retries on a busy client.

## Verification and rollout

Automated regression tests cover scoped queries, carry-forward evidence, partial failures, deadlines, cancellation, bounded caches, socket reuse, gateway cancellation, and authenticated liveness updates. API/web TypeScript checks and installer validation pass.

Built installer: `installer/tally-bridge/output/KalikaTallyConnectorSetup.exe` (0.1.63).

When deployment is authorized, release the API/gateway and frontend together and install connector 0.1.63 on the client. The updated gateway requires 0.1.63 for scans and debit-note creation. No deployment is part of this implementation handoff.

Before calling client performance verified, measure a read-only Cash Discount refresh on the actual 4 GB machine: discovery time, per-customer times, total elapsed time, Tally responsiveness, partial-result handling and cancellation. No live vouchers were created as part of these changes.
