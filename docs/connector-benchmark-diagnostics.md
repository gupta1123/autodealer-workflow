# Connector benchmark diagnostics

The benchmark path is disabled by default and does not change accounting calculations, Tally queries, WebSocket commands, or database writes.

## Enable on a connector PC

Create the empty opt-in file below, then restart the connector:

```powershell
New-Item -ItemType File -Force "$env:USERPROFILE\.autodealer-tally-bridge\diagnostics.enabled"
```

Alternatively, launch the connector with `KALIKA_BENCHMARK_DIAGNOSTICS=1`.

Each live operation then writes one JSON trace under:

```text
%USERPROFILE%\.autodealer-tally-bridge\diagnostics
```

Cash Discount results also carry the ephemeral `benchmarkDiagnostics` object through the gateway and analysis API to the browser response. It is not stored in Supabase.

## Measure Tally responsiveness and memory

Run the process sampler in a separate PowerShell window immediately before one browser action:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\monitor-tally-benchmark.ps1
```

If the connector PID is known, pass `-ConnectorPid 1234`. The sampler records Tally's `Responding` state, cumulative CPU, working set, private memory, and free system memory every 500 ms. Stop it with Ctrl+C after the browser result appears.

Do not run AnyDoc and Kalika scans together. Run one cold and four warm read-only scans for each implementation against the same company, period, and ledger scope.

## Disable

Delete the opt-in file and restart the connector:

```powershell
Remove-Item -LiteralPath "$env:USERPROFILE\.autodealer-tally-bridge\diagnostics.enabled"
```
