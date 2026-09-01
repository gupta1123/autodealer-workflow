import {
  collectCashDiscountLiveSnapshot,
} from "../apps/tally-bridge/src/bridge.mjs";
import {
  CASH_DISCOUNT_SCAN_MS,
  cashDiscountReadContext,
  createConnectorBenchmarkTrace,
  finishConnectorBenchmarkTrace,
} from "../apps/tally-bridge/src/cash-discount-runtime.mjs";

const companyName = process.argv[2] || "Solution Nyx";
const financialYear = process.argv[3] || "2026-27";
const requestId = `cash-discount-local-${Date.now()}`;
const requestedBatchSize = Number(process.env.KALIKA_CASH_DISCOUNT_UNION_BATCH_SIZE) || null;
const benchmarkTimeoutMs = Number(process.env.KALIKA_BENCHMARK_TIMEOUT_MS) || CASH_DISCOUNT_SCAN_MS;
const quietProgress = process.env.KALIKA_BENCHMARK_QUIET === "1";
const trace = createConnectorBenchmarkTrace({
  requestId,
  operation: "cash_discount_scan",
  companyName,
});
const progress = [];
const startedAt = performance.now();

console.log(JSON.stringify({ event: "started", pid: process.pid, requestId, companyName, requestedBatchSize }));

try {
  const result = await cashDiscountReadContext.run({
    deadlineAt: Date.now() + benchmarkTimeoutMs,
    benchmark: trace,
  }, () => collectCashDiscountLiveSnapshot(
    {
      tallyUrl: "http://localhost:9000",
      connectionId: "benchmark-local",
      bridgeMachineId: "benchmark-local",
    },
    "cash_discount_scan",
    companyName,
    null,
    (message) => {
      progress.push(String(message));
      if (!quietProgress) {
        console.log(JSON.stringify({ event: "progress", elapsedMs: Math.round(performance.now() - startedAt), message }));
      }
    },
    financialYear,
    null,
    { resume: false },
  ));
  const summary = finishConnectorBenchmarkTrace(trace, { success: true });
  console.log(`BENCHMARK_RESULT ${JSON.stringify({
    event: "completed",
    elapsedMs: Math.round(performance.now() - startedAt),
    scanSummary: result.scanSummary,
    ledgers: result.ledgers?.length || 0,
    openBills: Object.values(result.openBillsResult?.result?.byLedger || {}).reduce(
      (total, bucket) => total + (bucket?.openBills?.length || 0),
      0,
    ),
    evidenceQueryMode: result.openBillsResult?.result?.diagnostics?.queryMode || null,
    evidenceBatches: result.openBillsResult?.result?.diagnostics?.batchCount || null,
    benchmark: summary ? {
      totalMs: summary.totalMs,
      tallyCallCount: summary.tally.callCount,
      tallyReadMs: summary.tally.totalReadMs,
      tallyRequestBytes: summary.tally.requestBytes,
      tallyResponseBytes: summary.tally.responseBytes,
      connector: summary.connector,
      localTraceWritten: summary.localTraceWritten,
    } : null,
    lastProgress: progress.at(-1) || null,
  })}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const summary = finishConnectorBenchmarkTrace(trace, { success: false, error: message });
  console.error(`BENCHMARK_RESULT ${JSON.stringify({
    event: "failed",
    elapsedMs: Math.round(performance.now() - startedAt),
    error: message,
    benchmark: summary ? {
      totalMs: summary.totalMs,
      tallyCallCount: summary.tally.callCount,
      tallyReadMs: summary.tally.totalReadMs,
      tallyRequestBytes: summary.tally.requestBytes,
      tallyResponseBytes: summary.tally.responseBytes,
      connector: summary.connector,
      localTraceWritten: summary.localTraceWritten,
    } : null,
    lastProgress: progress.at(-1) || null,
  })}`);
  process.exitCode = 1;
}
