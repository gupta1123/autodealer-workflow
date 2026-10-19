import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProcessingJobRow = {
  id: string;
  case_id: string;
  owner_user_id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  progress: number;
  stage: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  locked_at: string | null;
  locked_by: string | null;
  next_run_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

// A typical packet takes about two minutes end to end; used until the run has enough progress to
// extrapolate from its own speed.
const TYPICAL_RUN_SECONDS = 120;

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Seconds left for a running job: a prior early on, then extrapolated from the run's own pace. */
export function estimateRemainingSeconds(job: ProcessingJobRow, now = Date.now()) {
  if (job.status !== "running") return null;
  const progress = Math.min(99, Math.max(0, job.progress ?? 0));
  const result = job.result ?? {};
  const runStartedAt = Date.parse(String(result.activeRunStartedAt ?? job.started_at ?? ""));
  const elapsed = Number.isFinite(runStartedAt) ? Math.max(0, (now - runStartedAt) / 1000) : 0;

  const prior = (TYPICAL_RUN_SECONDS * (100 - progress)) / 100;
  const paced = progress >= 15 && elapsed > 0 ? (elapsed * (100 - progress)) / progress : prior;
  // Blend so the estimate does not swing when progress first crosses the threshold.
  const weight = Math.min(1, Math.max(0, (progress - 5) / 25));
  const seconds = prior * (1 - weight) + paced * weight;
  return Math.max(5, Math.round(seconds / 5) * 5);
}

/** How many queued jobs are ahead of this one (1 = next to run). */
export async function getQueuePositions(jobs: ProcessingJobRow[]) {
  const positions = new Map<string, number>();
  const queued = jobs.filter((job) => job.status === "queued");
  if (!queued.length) return positions;

  const supabase = createSupabaseAdminClient();
  await Promise.all(
    queued.map(async (job) => {
      const { count, error } = await supabase
        .from("packet_processing_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .lt("created_at", job.created_at);
      if (error) throw error;
      positions.set(job.id, (count ?? 0) + 1);
    })
  );
  return positions;
}

export function mapProcessingJob(job: ProcessingJobRow | null, queuePosition?: number | null) {
  if (!job) {
    return null;
  }

  // The checkpoint holds every extracted document; it is large and only the worker needs it.
  const { checkpoint: _checkpoint, ...visibleResult } = (job.result ?? {}) as Record<string, unknown>;
  void _checkpoint;
  const detail = visibleResult.progressDetail;
  delete visibleResult.progressDetail;

  return {
    etaSeconds: estimateRemainingSeconds(job),
    queuePosition: queuePosition ?? null,
    progressDetail:
      detail && typeof detail === "object"
        ? {
            step: String((detail as Record<string, unknown>).step ?? ""),
            done: readNumber((detail as Record<string, unknown>).done),
            total: readNumber((detail as Record<string, unknown>).total),
            pages: readNumber((detail as Record<string, unknown>).pages),
            fileIndex: readNumber((detail as Record<string, unknown>).fileIndex),
            fileCount: readNumber((detail as Record<string, unknown>).fileCount),
          }
        : null,
    id: job.id,
    caseId: job.case_id,
    jobType: job.job_type,
    status: job.status,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    result: visibleResult,
    lockedAt: job.locked_at,
    lockedBy: job.locked_by,
    nextRunAt: job.next_run_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

/**
 * A case marked "processing" with no queued or running job is stuck (the job was
 * cancelled when the case was recycled, or the worker died). Put it back into a
 * usable state and return the new status, or null when nothing needed fixing.
 */
export async function settleOrphanedProcessingCase(caseId: string) {
  const supabase = createSupabaseAdminClient();
  const latestJob = await getLatestProcessingJob(caseId);
  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return null;
  }

  const documents = await supabase
    .from("packet_documents")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId);
  if (documents.error) throw documents.error;

  const nextStatus =
    latestJob?.status === "failed" ? "failed" : (documents.count ?? 0) > 0 ? "completed" : "draft";
  const updated = await supabase
    .from("packet_cases")
    .update({ status: nextStatus })
    .eq("id", caseId)
    .eq("status", "processing")
    .select("status")
    .maybeSingle();
  if (updated.error) throw updated.error;
  return (updated.data?.status as string | undefined) ?? null;
}

// Everything except `checkpoint`, which can be hundreds of KB and is only read by the worker.
export const PROCESSING_JOB_COLUMNS =
  "id, case_id, owner_user_id, job_type, status, attempt_count, max_attempts, progress, stage, error, result, locked_at, locked_by, next_run_at, started_at, finished_at, created_at, updated_at";

export async function getLatestProcessingJob(caseId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("packet_processing_jobs")
    .select(PROCESSING_JOB_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProcessingJobRow | null;
}
