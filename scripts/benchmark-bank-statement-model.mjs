import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiRoot = path.join(repoRoot, "apps", "api");
const apiBaseUrl = (process.env.KALIKA_BENCH_API_URL || "http://localhost:3001").replace(/\/$/, "");
const token = process.env.KALIKA_BENCH_AUTH_TOKEN || "";
const model = process.env.KALIKA_BENCH_MODEL || "";
const connectionId = process.env.KALIKA_BENCH_CONNECTION_ID || "25525789-df4f-44a4-b8ee-fda3ba0b6c0f";
const companyName = process.env.KALIKA_BENCH_COMPANY || "Solution Nyx";
const financialYear = process.env.KALIKA_BENCH_FINANCIAL_YEAR || "2026-27";
const workerCount = Math.min(8, Math.max(1, Number(process.env.KALIKA_BENCH_WORKER_COUNT || 6)));
const pdfPath = path.resolve(
  process.env.KALIKA_BENCH_PDF ||
    path.join(
      repoRoot,
      "output",
      "pdf",
      "solution-nyx-resilient-bank-stress-pack",
      "01-solution-nyx-150-rows-8-pages.pdf"
    )
);
const manifestPath = path.join(path.dirname(pdfPath), "manifest.json");
const expectedFileName =
  process.env.KALIKA_BENCH_EXPECTED_FILE ||
  (path.basename(pdfPath) === "00-solution-nyx-page-1-speed-test.pdf"
    ? "01-solution-nyx-150-rows-8-pages.pdf"
    : path.basename(pdfPath));
const expectedRowLimit = Math.max(0, Number(process.env.KALIKA_BENCH_EXPECTED_ROWS || 0));

if (!token) throw new Error("KALIKA_BENCH_AUTH_TOKEN is required.");
if (!model) throw new Error("KALIKA_BENCH_MODEL is required.");
if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

const headers = { Authorization: `Bearer ${token}` };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const elapsed = (startedAt) => Math.round(performance.now() - startedAt);

async function api(pathname, init = {}) {
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("Authorization", headers.Authorization);
  const response = await fetch(`${apiBaseUrl}${pathname}`, { ...init, headers: requestHeaders });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${pathname} failed (${response.status}): ${payload.error || text}`);
  }
  return payload;
}

async function waitForCommand(commandId) {
  const startedAt = performance.now();
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const payload = await api(
      `/api/tally/connections/${connectionId}/commands?ids=${encodeURIComponent(commandId)}&limit=1`
    );
    const command = payload.commands?.find((item) => item.id === commandId);
    if (["succeeded", "failed", "canceled"].includes(command?.status)) {
      if (command.status !== "succeeded") {
        throw new Error(command.error || `Tally master sync ${command.status}.`);
      }
      return { command, durationMs: elapsed(startedAt) };
    }
    await sleep(500);
  }
  throw new Error("Tally master sync timed out.");
}

async function syncTallyMasters() {
  const startedAt = performance.now();
  const payload = await api(`/api/tally/connections/${connectionId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandType: "sync_masters",
      payload: {
        companyName,
        requestedMasterTypes: ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"],
      },
    }),
  });
  if (!payload.command?.id) throw new Error("Tally master sync returned no command id.");
  const completed = await waitForCommand(payload.command.id);
  return {
    durationMs: elapsed(startedAt),
    connectorDurationMs: completed.durationMs,
    totals: completed.command.result?.totals || null,
  };
}

function startPinnedWorker() {
  const workerEnv = { ...process.env };
  delete workerEnv.KALIKA_BENCH_AUTH_TOKEN;
  workerEnv.OPENROUTER_BANK_LEDGER_MODEL = model;
  workerEnv.OPENROUTER_DEBUG_LOG = process.env.OPENROUTER_DEBUG_LOG || "false";
  workerEnv.WORKER_POLL_INTERVAL_MS = "25";
  workerEnv.WORKER_IDLE_LOG_INTERVAL_MS = "60000";
  workerEnv.WORKER_NAME = `bank-model-benchmark-${model.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`;

  const child = spawn(
    process.execPath,
    ["--use-system-ca", "--env-file=.env", "worker/process-packet-jobs.mjs"],
    { cwd: apiRoot, env: workerEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );
  const lines = [];
  const capture = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      lines.push({ at: Date.now(), line });
      if (lines.length > 500) lines.shift();
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, lines };
}

async function waitForWorkerStart(worker) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (worker.lines.some((entry) => entry.line.includes("[worker] started"))) return;
    if (worker.child.exitCode !== null) {
      throw new Error(`Benchmark worker exited before startup (${worker.child.exitCode}).`);
    }
    await sleep(100);
  }
  throw new Error("Benchmark worker did not start within 10 seconds.");
}

async function uploadStatement() {
  const bytes = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "application/pdf" }), path.basename(pdfPath));
  form.set("account", JSON.stringify({}));
  form.set("connectionId", connectionId);
  form.set("companyName", companyName);
  form.set("financialYear", financialYear);
  form.set("bankLedgerName", "");
  form.set("syncBeforeAnalysis", "true");

  const startedAt = performance.now();
  const payload = await api("/api/bank-statements/imports", { method: "POST", body: form });
  if (!payload.import?.id) throw new Error("Bank statement upload returned no import id.");
  return { importId: payload.import.id, durationMs: elapsed(startedAt) };
}

async function waitForAnalysis(importId) {
  const startedAt = performance.now();
  const stages = [];
  let lastStage = "";
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const payload = await api(`/api/bank-statements/imports/${importId}?includeTransactions=false`);
    const stage = String(payload.job?.stage || "");
    if (stage && stage !== lastStage) {
      stages.push({ stage, atMs: elapsed(startedAt), progress: payload.job?.progress ?? null });
      lastStage = stage;
    }
    if (!payload.processing) {
      if (payload.job?.status === "failed") throw new Error(payload.job.error || "Analysis failed.");
      return { metadata: payload, durationMs: elapsed(startedAt), stages };
    }
    await sleep(500);
  }
  throw new Error("Bank statement analysis timed out after 15 minutes.");
}

async function loadTransactions(importId) {
  const startedAt = performance.now();
  const payload = await api(
    `/api/bank-statements/imports/${importId}?transactionsPage=1&transactionsPageSize=500`
  );
  return { payload, durationMs: elapsed(startedAt) };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(private|pvt)\b/g, "private")
    .replace(/\b(limited|ltd)\b/g, "limited")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function score(transactions) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const allExpectedRows = manifest.expectedTransactions?.[expectedFileName] || [];
  const expectedRows = expectedRowLimit > 0
    ? allExpectedRows.slice(0, expectedRowLimit)
    : allExpectedRows;
  const expectedByReference = new Map(expectedRows.map((row) => [normalize(row.reference), row]));
  let referencesFound = 0;
  let suggested = 0;
  let correct = 0;
  let incorrect = 0;
  let aiMatched = 0;
  let deterministicMatched = 0;
  const modelValues = new Set();

  for (const row of transactions) {
    const expected = expectedByReference.get(normalize(row.referenceNumber));
    if (!expected) continue;
    referencesFound += 1;
    if (!row.suggestedLedgerName) continue;
    suggested += 1;
    if (normalize(row.suggestedLedgerName) === normalize(expected.expectedLedger)) correct += 1;
    else incorrect += 1;
    const recommendation = row.rawPayload?.aiLedgerRecommendation || {};
    if (recommendation.source === "ai_match") aiMatched += 1;
    else if (recommendation.source && recommendation.source !== "none") deterministicMatched += 1;
    if (recommendation.model) modelValues.add(recommendation.model);
  }
  return {
    expectedRows: expectedRows.length,
    extractedRows: transactions.length,
    referencesFound,
    suggested,
    correct,
    incorrect,
    unresolved: Math.max(0, expectedRows.length - suggested),
    accuracyAmongExpected: expectedRows.length ? Number((correct / expectedRows.length).toFixed(4)) : null,
    aiMatched,
    deterministicMatched,
    recordedModels: [...modelValues],
  };
}

async function stopWorker(worker) {
  if (worker.child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(worker.child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  worker.child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20 && worker.child.exitCode === null; attempt += 1) await sleep(100);
  if (worker.child.exitCode === null) worker.child.kill("SIGKILL");
}

async function main() {
  const runStartedAt = performance.now();
  console.log(JSON.stringify({ event: "start", model, pdf: pdfPath, companyName, connectionId }));
  const tallySync = await syncTallyMasters();
  console.log(JSON.stringify({ event: "tally_sync_complete", ...tallySync }));

  const workers = Array.from({ length: workerCount }, () => startPinnedWorker());
  try {
    await Promise.all(workers.map(waitForWorkerStart));
    const upload = await uploadStatement();
    console.log(JSON.stringify({ event: "upload_complete", ...upload }));
    const analysis = await waitForAnalysis(upload.importId);
    const result = await loadTransactions(upload.importId);
    const localWorkerClaimed = workers.some((worker) =>
      worker.lines.some((entry) => entry.line.includes(`import=${upload.importId}`))
    );
    const metrics = {
      model,
      importId: upload.importId,
      pdf: pdfPath,
      companyName,
      localWorkerClaimed,
      timing: {
        tallySyncMs: tallySync.durationMs,
        uploadMs: upload.durationMs,
        analysisMs: analysis.durationMs,
        resultLoadMs: result.durationMs,
        totalMs: elapsed(runStartedAt),
      },
      stages: analysis.stages,
      extraction: {
        source: result.payload.extractionSource,
        error: result.payload.extractionError,
        diagnostics: result.payload.extractionDiagnostics,
        ledgerRecommendationError: result.payload.ledgerRecommendationError,
      },
      score: score(result.payload.transactions || []),
      workerDiagnostics: workers
        .flatMap((worker) => worker.lines)
        .filter((entry) =>
          entry.line.includes('"scope":"openrouter"') ||
          entry.line.includes('"scope":"bank_ledger_parser"') ||
          entry.line.includes("AI ledger") ||
          entry.line.includes("bank statement job failed") ||
          entry.line.includes("failed import=")
        ),
    };
    console.log(JSON.stringify({ event: "result", metrics }, null, 2));
    if (!localWorkerClaimed) {
      throw new Error("The pinned local worker did not claim this import; discard this trial as uncontrolled.");
    }
  } finally {
    await Promise.all(workers.map(stopWorker));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "error", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
