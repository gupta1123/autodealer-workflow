import { withTeamAccess } from '@/lib/access/route-boundary';
import {requireResourceAccess} from '@/lib/access/resources';
import {accessFailureResponse} from '@/lib/access/failures';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishBankJobEvent } from '@/lib/processing/bank-job-events.mjs';

export function OPTIONS(request: Request) { return optionsWithCors(request); }
async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const db = createSupabaseAdminClient();
    const team=process.env.TEAM_ACCESS_ENFORCEMENT==='true'?await requireResourceAccess(request,'bank_import',id,'bank.prepare'):null;
    const { data: row, error } = await db.from("bank_statement_imports").select("processing_meta,status")
      .eq("id", id).or(team?`and(access_organization_id.eq.${JSON.stringify(team.access.organizationId)},access_company_id.eq.${team.scope.company_id})`:`owner_user_id.eq.${user.id}`).maybeSingle();
    if (error) throw error;
    if (!row || row.processing_meta?.sourceRetention !== "local_only") return jsonWithCors(request, { error: "Local import not found." }, { status: 404 });
    if (row.processing_meta?.pipelineVersion === 2) {
      const { data: run, error: runError } = await db.from('bank_local_pipeline_runs')
        .select('job_id,organization_id,identity').eq('import_id', id).or(team?`organization_id.eq.${JSON.stringify(team.access.organizationId)}`:`owner_user_id.eq.${user.id}`).single();
      if (runError) throw runError;
      const { data: cancelled, error: cancelError } = await db.rpc(team?'access_cancel_bank_document':'bank_local_v2_cancel', team?{
        p_job:run.job_id,p_actor:user.id,p_org:team.access.organizationId,
      }:{p_job_id: run.job_id, p_owner_id: user.id, p_organization_id: run.organization_id});
      if (cancelError) throw cancelError;
      if (cancelled?.state === 'cancelled') void publishBankJobEvent(run.identity, 'bank_job_cancelled', {
        ...cancelled, jobId: run.job_id, importId: id,
      });
      return jsonWithCors(request, { cancelled: cancelled?.state === 'cancelled', ...cancelled });
    }
    const message = "Local PDF transfer failed or was cancelled. Reselect the PDF on the connected PC to retry; no cloud copy exists.";
    const finishedAt = new Date().toISOString();
    const { data: changed, error: jobError } = await db.from("bank_statement_extraction_jobs")
      .update({ status: "cancelled", stage: "Local transfer cancelled", error: message, finished_at: finishedAt })
      .eq("import_id", id).eq("owner_user_id", user.id).in("status", ["queued", "running"]).select("id");
    if (jobError) throw jobError;
    if (changed?.length) {
      const { error: saveError } = await db.from("bank_statement_imports").update({ status: "failed", processing_meta: {
        ...row.processing_meta, analysis: { ...row.processing_meta.analysis, status: "failed", error: message, stage: "Local transfer cancelled" },
      } }).eq("id", id).eq("owner_user_id", user.id).eq("status", "processing");
      if (saveError) throw saveError;
      const { error: cancelError } = await db.from("tally_bridge_commands").update({ status: "canceled", error: message, completed_at: finishedAt })
        .eq("owner_user_id", user.id).eq("command_type", "agent_parse_document")
        .eq("payload->>bankStatementImportId", id).in("status", ["queued", "claimed"]);
      if (cancelError) throw cancelError;
    }
    return jsonWithCors(request, { cancelled: Boolean(changed?.length) });
  } catch (error) {
    const denied=accessFailureResponse(request,error);if(denied)return denied;
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Cannot cancel local transfer." }, { status: 500 });
  }
}

export const POST = withTeamAccess(POSTHandler);
