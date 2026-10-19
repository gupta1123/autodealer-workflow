import { listAccessPredicate } from '@/lib/access/list-scope';
import { withTeamAccess } from '@/lib/access/route-boundary';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  PROCESSING_JOB_COLUMNS,
  getQueuePositions,
  mapProcessingJob,
  type ProcessingJobRow,
} from "@/lib/processing/jobs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_CASE_IDS = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Live progress for the cases list: one call covers every case that is queued or running.
async function GETHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const ids = (new URL(request.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => UUID_PATTERN.test(value))
      .slice(0, MAX_CASE_IDS);
    if (!ids.length) {
      return jsonWithCors(request, { progress: {} });
    }

    const supabase = createSupabaseAdminClient();
    const { data: visibleCases, error: casesError } = await supabase
      .from("packet_cases")
      .select("id")
      .in("id", ids)
      .or(await listAccessPredicate(request, user.id, 'purchases.view'));
    if (casesError) throw casesError;

    const visibleIds = (visibleCases ?? []).map((row) => row.id as string);
    if (!visibleIds.length) {
      return jsonWithCors(request, { progress: {} });
    }

    const { data: jobs, error: jobsError } = await supabase
      .from("packet_processing_jobs")
      .select(PROCESSING_JOB_COLUMNS)
      .in("case_id", visibleIds)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false });
    if (jobsError) throw jobsError;

    const latestByCase = new Map<string, ProcessingJobRow>();
    for (const job of (jobs ?? []) as ProcessingJobRow[]) {
      if (!latestByCase.has(job.case_id)) latestByCase.set(job.case_id, job);
    }

    const positions = await getQueuePositions([...latestByCase.values()]);
    const progress: Record<string, ReturnType<typeof summarize>> = {};
    for (const [caseId, job] of latestByCase) {
      progress[caseId] = summarize(job, positions.get(job.id) ?? null);
    }
    return jsonWithCors(request, { progress });
  } catch (error) {
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : String(error ?? "Unknown error") },
      { status: 500 }
    );
  }
}

function summarize(job: ProcessingJobRow, queuePosition: number | null) {
  const mapped = mapProcessingJob(job, queuePosition)!;
  return {
    status: mapped.status,
    progress: mapped.progress,
    stage: mapped.stage,
    etaSeconds: mapped.etaSeconds,
    queuePosition: mapped.queuePosition,
    detail: mapped.progressDetail,
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export const GET = withTeamAccess(GETHandler);
