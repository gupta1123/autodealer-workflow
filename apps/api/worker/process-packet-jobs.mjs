import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const WORKER_NAME = process.env.WORKER_NAME || `worker-${process.pid}`;
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);

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

async function requeueJob(jobId, errorMessage) {
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

async function claimNextJob() {
  const { data, error } = await supabase.rpc("claim_packet_processing_job", {
    worker_name: WORKER_NAME,
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

  const response = await fetch(`${APP_BASE_URL}/api/internal/jobs/${job.id}/run`, {
    method: "POST",
    headers: {
      "x-worker-secret": WORKER_SECRET,
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || `Internal processing failed (${response.status})`);
  }
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
        console.error(`[worker] dispatch failed for job ${job.id}: ${message}`);
        await requeueJob(job.id, message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
      console.error(`[worker] polling failed: ${message}`);
      await sleep(WORKER_POLL_INTERVAL_MS);
    }
  }
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
