// Only compact, already authorized import/job state may leave this status path.
// In particular, a missing v2 job must never be repaired with a legacy AI job.
export function bankLocalStatus(importRow, job) {
  const meta = importRow.processing_meta ?? {};
  if (meta.pipelineVersion !== 2) return null;
  const failed = !job || ['failed', 'cancelled', 'canceled'].includes(job.status);
  const completed = job?.status === 'succeeded';
  return {
    pipelineVersion: 2,
    importId: importRow.id,
    connectionId: meta.selectedContext?.connectionId ?? null,
    companyName: meta.selectedContext?.companyName ?? null,
    processing: !failed && !completed,
    job: {
      id: job?.id ?? null,
      status: !job ? 'failed' : job.status,
      progress: job?.progress ?? 0,
      stage: job?.stage ?? null,
      error: !job ? 'The saved analysis job is missing. Contact support before retrying.' : job.error ?? null,
    },
  };
}
