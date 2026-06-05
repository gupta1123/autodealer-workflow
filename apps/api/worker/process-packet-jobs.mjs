import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const WORKER_NAME = process.env.WORKER_NAME || `worker-${process.pid}`;
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const RAW_APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);
const APP_BASE_URL = RAW_APP_BASE_URL?.replace(/\/+$/, "");
const HEROKU_ROUTER_TIMEOUT_GRACE_MS = Number(process.env.HEROKU_ROUTER_TIMEOUT_GRACE_MS ?? 29_000);
const WORKER_STALE_RUNNING_JOB_MS = Number(process.env.WORKER_STALE_RUNNING_JOB_MS ?? 20 * 60_000);
const WORKER_STALE_RUNNING_JOB_INTERVAL = `${Math.max(1, Math.round(WORKER_STALE_RUNNING_JOB_MS / 60_000))} minutes`;
const WORKER_IN_FLIGHT_WAIT_MS = Number(process.env.WORKER_IN_FLIGHT_WAIT_MS ?? 2 * 60_000);
const WORKER_IN_FLIGHT_POLL_MS = Number(process.env.WORKER_IN_FLIGHT_POLL_MS ?? 5_000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment variables are missing for the worker.");
}

if (!WORKER_SECRET) {
  throw new Error("WORKER_SECRET is required for the worker.");
}

if (!APP_BASE_URL) {
  throw new Error("APP_BASE_URL is required for the worker.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class JobMayStillBeRunningError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobMayStillBeRunningError";
  }
}

function isTerminalJobStatus(status) {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

function formatError(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "Unknown error");
}

async function getJob(jobId) {
  const { data, error } = await supabase
    .from("packet_processing_jobs")
    .select("id, case_id, status, attempt_count, max_attempts, locked_at, locked_by, result, error, updated_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function markCaseFailed(caseId, message) {
  const { data: caseRow } = await supabase
    .from("packet_cases")
    .select("processing_meta")
    .eq("id", caseId)
    .maybeSingle();

  const existingMeta =
    caseRow?.processing_meta && typeof caseRow.processing_meta === "object" && !Array.isArray(caseRow.processing_meta)
      ? caseRow.processing_meta
      : {};

  await supabase
    .from("packet_cases")
    .update({
      status: "failed",
      processing_meta: {
        ...existingMeta,
        lastProcessingError: message,
      },
    })
    .eq("id", caseId);
}

async function failJob(job, message) {
  await supabase
    .from("packet_processing_jobs")
    .update({
      status: "failed",
      progress: 100,
      stage: "Failed",
      error: message,
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  await markCaseFailed(job.case_id, message);
}

async function requeueJob(jobId, errorMessage) {
  const job = await getJob(jobId);
  if (!job || isTerminalJobStatus(job.status)) {
    return;
  }

  if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
    await failJob(job, errorMessage);
    return;
  }

  const nextRunAt = new Date(Date.now() + WORKER_POLL_INTERVAL_MS).toISOString();
  await supabase
    .from("packet_processing_jobs")
    .update({
      status: "queued",
      progress: 0,
      stage: "Queued after worker dispatch failure",
      error: errorMessage,
      locked_at: null,
      locked_by: null,
      next_run_at: nextRunAt,
    })
    .eq("id", jobId)
    .eq("status", "running");
}

async function recoverStaleRunningJobs() {
  const cutoff = new Date(Date.now() - WORKER_STALE_RUNNING_JOB_MS).toISOString();
  const { data: jobs, error } = await supabase
    .from("packet_processing_jobs")
    .select("id, case_id, status, attempt_count, max_attempts, locked_at")
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .limit(10);

  if (error) {
    throw error;
  }

  for (const job of jobs ?? []) {
    const message = `Processing job was stale for more than ${Math.round(WORKER_STALE_RUNNING_JOB_MS / 60000)} minutes.`;
    if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
      await failJob(job, message);
      continue;
    }

    await supabase
      .from("packet_processing_jobs")
      .update({
        status: "queued",
        progress: 0,
        stage: "Queued after stale worker run",
        error: message,
        locked_at: null,
        locked_by: null,
        next_run_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "running");
  }
}

async function claimNextJob() {
  await recoverStaleRunningJobs();

  const { data, error } = await supabase.rpc("claim_packet_processing_job", {
    worker_name: WORKER_NAME,
    stale_after: WORKER_STALE_RUNNING_JOB_INTERVAL,
  });

  if (error) {
    throw error;
  }

  const claimedJob = Array.isArray(data) ? data[0] : data;

  if (!claimedJob?.id) {
    return null;
  }

  return claimedJob;
}

async function runJob(job) {
  if (!job?.id) {
    throw new Error("Cannot run a packet processing job without an id.");
  }

  const startedAt = Date.now();
  const response = await fetch(`${APP_BASE_URL}/api/internal/jobs/${job.id}/run`, {
    method: "POST",
    headers: {
      "x-worker-secret": WORKER_SECRET,
    },
  });

  if (response.status === 409) {
    const payload = await response.text().catch(() => "");
    console.warn(`[worker] job ${job.id} skipped: ${payload || "not runnable"}`);
    return;
  }

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    if (response.status === 503 && Date.now() - startedAt >= HEROKU_ROUTER_TIMEOUT_GRACE_MS) {
      throw new JobMayStillBeRunningError(
        payload || "Heroku router timed out while the analysis request continued on the web dyno."
      );
    }
    throw new Error(payload || `Internal processing failed (${response.status})`);
  }
}

async function waitForInFlightRun(jobId) {
  const deadline = Date.now() + WORKER_IN_FLIGHT_WAIT_MS;

  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (!job || isTerminalJobStatus(job.status) || job.status === "queued") {
      return job;
    }
    await sleep(WORKER_IN_FLIGHT_POLL_MS);
  }

  return getJob(jobId);
}

async function main() {
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      try {
        await runJob(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        if (error instanceof JobMayStillBeRunningError) {
          console.warn(`[worker] job ${job.id} exceeded router timeout; waiting for in-flight run instead of requeueing`);
          const latestJob = await waitForInFlightRun(job.id);
          if (latestJob?.status === "running") {
            console.warn(`[worker] job ${job.id} is still running; leaving it locked for stale recovery`);
          }
          continue;
        }
        console.error(`[worker] dispatch failed for job ${job.id}: ${message}`);
        await requeueJob(job.id, message);
      }
    } catch (error) {
      const message = formatError(error);
      console.error(`[worker] polling failed: ${message}`);
      await sleep(WORKER_POLL_INTERVAL_MS);
    }
  }
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
