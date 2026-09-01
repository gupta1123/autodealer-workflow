# Parked Proposal: Kalika Local Agent as an Edge Data Node

**Status:** Parked for later review  
**Recorded:** 1 September 2026  
**Decision:** Preserve the idea, but do not include it in the currently committed connector scope.

## Goal

Evolve the Kalika Local Agent into an always-running, private data gateway on the client's computer. While the computer and agent are online, authorised Kalika applications could query the client's locally cached Tally and document data from anywhere, even when the client's Kalika browser is closed.

This would make the agent an **edge data node**, not a public internet server or a cloud data centre.

## Proposed User Experience

1. The client installs the Kalika Local Agent once.
2. Its background service starts with Windows and stays connected to Kalika Cloud.
3. The client may close the Electron control window without stopping the service.
4. An authorised user opens a future Kalika Chat application from another computer or phone.
5. Kalika Cloud authenticates the user and routes a restricted query to the correct device and Tally company.
6. The agent answers from SQLite when possible, or verifies with live Tally when current confirmation is required.
7. The response states its data source and freshness.

Example response:

> Surya Steel has an outstanding balance of Rs. 4,84,206, based on data synced two minutes ago.

## High-Level Architecture

```text
Kalika Chat or another authorised frontend
                    |
                    v
         Kalika Cloud authentication,
         permissions and request routing
                    |
        outbound encrypted WebSocket
                    |
                    v
             Kalika Local Agent
       +-------------------------------+
       | Background Windows service    |
       | Read-only query engine        |
       | Resource-aware job manager    |
       | SQLite Tally cache            |
       | Optional Zvec index           |
       | AnyDoc document results       |
       | Live Tally adapter            |
       +-------------------------------+
                    |
                    v
           Small structured result
```

The agent must establish an outbound connection to Kalika Cloud. It must not expose a public port, require router configuration, or use an ngrok-style tunnel in production.

## Background Service and Desktop UI

The production design should separate the persistent agent from its visual control panel.

### Background service

- Starts with Windows.
- Maintains the secure cloud connection.
- Owns SQLite and Zvec data.
- Communicates with Tally.
- Executes AnyDoc jobs.
- Continues running when the desktop window is closed.

### Electron control panel

- Shows device, cloud, Tally and company status.
- Shows data freshness, jobs, errors and resource usage.
- Provides cache, privacy and update settings.
- Can be closed without stopping the background service.

An initial version could run Electron in the system tray. A reliable production version should use a proper background service and treat Electron as its control panel.

## Supported Query Modes

### Cached local query

Use SQLite for fast read-only answers without burdening Tally. The answer must include the last synchronization time. Cached queries may work while Tally is closed.

### Live Tally query

Use Tally for values requiring current verification. This requires Tally to be running with the intended company open.

### Unavailable query

If the agent is offline or neither cached nor live data is trustworthy, return an explicit unavailable or stale-data response. Never present stale data as current.

## Potential Use Cases

- Outstanding balance questions
- Ledger and voucher searches
- Cash Discount information
- Turnover Discount information
- Bank matching information
- Invoice and document search
- AnyDoc Markdown retrieval
- Optional Zvec ledger or document suggestions
- Management summaries
- Live Tally verification

The cloud and AI should receive only the minimum evidence required to answer the question, not the complete Tally company.

## Non-Negotiable Constraints

### Read-only first

The first version must support read-only queries only. Remote posting, alteration or deletion must be designed separately and require explicit approval.

### No arbitrary execution

The agent must accept only a versioned allowlist of predefined commands such as `query_outstanding`, `find_vouchers` or `search_documents`. It must never execute arbitrary SQL, TDL, shell commands or AI-generated code.

### Strong request identity

Every request must identify and validate:

- User
- Organisation
- Role and permissions
- Device
- Connection
- Tally company GUID
- Financial year
- Request type and expiry time

### Client isolation

Data and query results from one organisation, company, financial year or device must never be returned to another.

### Freshness disclosure

Every response must indicate whether it came from cached data or live Tally and when it was last verified.

## Security Requirements

- Use encrypted `wss` communication.
- Give each installed device a revocable identity and rotating credentials.
- Prefer short-lived tokens and one-time connection codes.
- Keep long-lived JWTs out of custom protocol URLs and logs.
- Bind any local HTTP endpoint to `127.0.0.1` only and authenticate every request.
- Authorise every query in the cloud before routing it.
- Apply per-user, per-device and per-company rate limits.
- Record an audit trail for every remote query.
- Redact voucher contents, GSTINs, balances, credentials and PDF text from ordinary logs.
- Sign the agent, updater and downloadable capability packs.
- Allow an administrator to revoke a lost or decommissioned device remotely.
- Define whether chat messages and accounting results are retained in the cloud.

## Performance and Resource Rules

- Normal chat questions should query SQLite, not start a complete Tally scan.
- Combine or reuse identical concurrent requests when safe.
- Queue and throttle live Tally requests.
- Give interactive read queries priority over background synchronisation.
- Do not run AnyDoc conversion during a heavy Tally operation on a low-resource computer.
- Limit query concurrency according to available memory and measured Tally latency.
- Return a busy or delayed response instead of allowing Tally to hang.
- Use the shared job manager planned for the Local Agent.

## Availability Limits

The edge node can be reached only while:

- The client's computer is powered on and awake.
- The Kalika Agent service is running.
- Internet access is available.
- The device has not been revoked.

Cached queries may work while Tally is closed. Live verification requires Tally and the correct company.

If future requirements demand answers while the client computer is offline, that would require a separate, optional encrypted cloud replica. That is a new privacy and product decision and is outside this parked proposal.

## Failure Behaviour

- Reconnect automatically after temporary internet loss.
- Persist safe in-flight read jobs across an agent restart only when their expiry time has not passed.
- Give remote read jobs a short time-to-live so stale questions are not executed hours later.
- Never automatically replay a write command; future write support must use idempotency and independent Tally verification.
- Report whether failure occurred in cloud routing, device connectivity, local cache, company selection or live Tally.
- Continue serving verified cached data when live Tally is temporarily unavailable, while labelling it as cached.

## Relationship to the Active Local Agent Plan

This proposal depends on the previously planned foundations:

- Tally TDL/TCP add-on with compact reports
- Incremental AlterID synchronisation
- Company-scoped SQLite cache
- Resource-aware job manager
- AnyDoc worker
- Optional Zvec index
- Automatic updates and rollback
- Durable diagnostics and command tracking

Those foundations should be built and proven before enabling the Local Agent as a remotely queryable edge node.

## Open Product Decisions

Before resuming this proposal, decide:

1. Which chat questions are allowed in the first read-only release?
2. Which roles may query balances, vouchers and documents?
3. How long may cached data be considered acceptable for each question type?
4. Should document text ever leave the client computer?
5. Should chat responses be retained in cloud history?
6. Should the agent run as a Windows service or initially as a tray application?
7. What should happen when multiple devices expose the same Tally company?
8. How should the user choose between a cached answer and live verification?
9. What query concurrency is safe on a 4 GB computer?
10. Is an optional encrypted cloud replica ever acceptable?

## Suggested Future Delivery Sequence

1. Complete and benchmark the active Local Agent foundations.
2. Split the background runtime from the Electron control panel.
3. Add device identity, revocation and secure outbound request routing.
4. Implement a small read-only query allowlist against SQLite.
5. Add freshness information and audit logging.
6. Add carefully throttled live Tally verification.
7. Pilot on internal devices.
8. Pilot with one client and read-only data.
9. Review security, performance and privacy evidence before expanding query types.

## Revisit Criteria

Revisit this proposal when the Local Agent has demonstrated:

- Reliable background operation
- Correct multi-company isolation
- Fast incremental synchronisation
- Safe behaviour on a 4 GB computer
- Stable automatic updates and rollback
- Accurate cache freshness and reconciliation
- Secure device authentication and revocation

