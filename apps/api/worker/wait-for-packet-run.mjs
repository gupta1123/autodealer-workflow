// A router timeout does not stop the API's analysis. Keep the worker occupied
// until that attempt finishes or its lease becomes eligible for stale recovery.
export async function waitForPacketRun(jobId, {
  getJob, sleep, pollMs, staleMs, reportMs, report = () => {}, now = Date.now,
}) {
  let nextReport = now() + reportMs;
  for (;;) {
    const job = await getJob(jobId);
    if (!job || job.status !== 'running') return job;
    const lockedAt = Date.parse(job.locked_at || job.updated_at || '');
    if (Number.isFinite(lockedAt) && now() - lockedAt >= staleMs) return job;
    if (now() >= nextReport) {
      report(jobId);
      nextReport = now() + reportMs;
    }
    await sleep(pollMs);
  }
}
