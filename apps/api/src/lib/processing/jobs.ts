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

export function mapProcessingJob(job: ProcessingJobRow | null) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    caseId: job.case_id,
    jobType: job.job_type,
    status: job.status,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    result: job.result ?? {},
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

export async function getLatestProcessingJob(caseId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("packet_processing_jobs")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ProcessingJobRow | null;
}
