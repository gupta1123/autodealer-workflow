import { withTeamAccess } from '@/lib/access/route-boundary';
import {teamBankParsing} from '@/lib/access/bank-parsing';
import {accessFailureResponse} from '@/lib/access/failures';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bankParsingPolicy } from "@/lib/processing/local-bank-parsing.mjs";
import { canStartBankLocalV2 } from "@/lib/processing/bank-local-v2-gate";

export function OPTIONS(request: Request) { return optionsWithCors(request); }
async function POSTHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const input = await request.json();
    const team=process.env.TEAM_ACCESS_ENFORCEMENT==='true'?await teamBankParsing(request,input.connectionId,input):null;
    const { data, error } = team?{data:team.connection,error:null}:await createSupabaseAdminClient().from("tally_connections").select("*")
      .eq("id", input.connectionId).eq("owner_user_id", user.id).maybeSingle();
    if (error) throw error;
    const policy = team?.policy||bankParsingPolicy(data, { companyName: input.companyName, year: input.financialYear, ownerUserId: user.id });
    if (policy.mode === "local_agent" && !data.agent_capabilities?.includes("browser-document-upload-v1")) {
      return jsonWithCors(request, { error: "Install the updated Local Agent for direct PDF transfer. Your PDF has not been uploaded." }, { status: 409 });
    }
    const pipelineVersion = policy.mode === 'local_agent' && await canStartBankLocalV2(createSupabaseAdminClient(), data.agent_capabilities) ? 2 : 1;
    if(team&&policy.mode==='local_agent'&&pipelineVersion!==2)return jsonWithCors(request,{error:'This shared local workflow requires the current agent and v2 pipeline.'},{status:409});
    return jsonWithCors(request, { mode: policy.mode, machineName: policy.machineName, pipelineVersion,
      ...(pipelineVersion === 2 ? { identity: policy.identity } : {}),
    });
  } catch (error) {
    const denied=accessFailureResponse(request,error);if(denied)return denied;
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Cannot verify parsing mode." }, { status: 409 });
  }
}

export const POST = withTeamAccess(POSTHandler);
