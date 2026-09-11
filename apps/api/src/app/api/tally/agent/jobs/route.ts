import { withTeamAccess } from '@/lib/access/route-boundary';
import { queueTeamAgentRead } from '@/lib/access/agent-reads';
import { accessFailureResponse } from '@/lib/access/failures';
import { randomUUID } from "node:crypto";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCompleteAgentIdentity, normalizeFinancialYear, type AgentIdentity } from "@/lib/tally/agent-contracts";
import { serializeTallyBridgeCommand, TALLY_BRIDGE_COMMAND_TYPES, type TallyBridgeCommandRow, type TallyBridgeCommandType } from "@/lib/tally/commands";
import { wakeTallyConnector } from "@/lib/tally/command-wake";
import { createAgentJobToken } from "@/lib/tally/agent-job-token";

const JOB_CLASSES = new Set(["tally_write", "interactive_read", "incremental_sync", "document_parse", "vector_index", "reconciliation", "maintenance"]);

export function OPTIONS(request: Request) { return optionsWithCors(request); }

async function POSTHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (process.env.TEAM_ACCESS_ENFORCEMENT === 'true') {
      return jsonWithCors(request, await queueTeamAgentRead(request, body), { status: 201 });
    }
    const identity = { ...(body.identity || {}), ownerUserId: user.id, protocolVersion: Number(body.identity?.protocolVersion || 1) } as Partial<AgentIdentity>;
    assertCompleteAgentIdentity(identity);
    identity.financialYear = normalizeFinancialYear(identity.financialYear);
    const commandType = String(body.commandType || "") as TallyBridgeCommandType;
    if (!TALLY_BRIDGE_COMMAND_TYPES.includes(commandType)) {
      return jsonWithCors(request, { error: "Unsupported agent command type." }, { status: 400 });
    }
    const jobClass = String(body.jobClass || "interactive_read");
    if (!JOB_CLASSES.has(jobClass)) return jsonWithCors(request, { error: "Unsupported job class." }, { status: 400 });
    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase.from("tally_connections")
      .select("id,owner_user_id,organization_id,installation_id,session_generation,revoked_at,last_companies_snapshot")
      .eq("id", identity.connectionId).eq("owner_user_id", user.id).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.revoked_at) return jsonWithCors(request, { error: "Active Tally connection not found." }, { status: 404 });
    if (String(connection.organization_id || connection.owner_user_id) !== identity.organizationId ||
        String(connection.installation_id || "") !== identity.installationId ||
        Number(connection.session_generation || 0) !== Number(identity.sessionGeneration)) {
      return jsonWithCors(request, { error: "Agent identity does not match the active pairing session." }, { status: 409 });
    }
    const companies = Array.isArray(connection.last_companies_snapshot) ? connection.last_companies_snapshot : [];
    const company = companies.find((entry: Record<string, unknown>) => String(entry.guid || "") === identity.companyGuid);
    if (!company || normalizeFinancialYear(company.financialYear) !== identity.financialYear) {
      return jsonWithCors(request, { error: "The requested company GUID and financial year are not active on this agent." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const payload = { ...(body.payload || {}), agentIdentity: identity } as Record<string, unknown>;
    if (commandType === "agent_parse_document") {
      payload.resultUploadUrl = new URL("/api/tally/agent/document-result", request.url).toString();
      payload.resultUploadToken = createAgentJobToken({ jobId, connectionId: identity.connectionId, ownerUserId: user.id });
    }
    const { data, error } = await supabase.from("tally_bridge_commands").insert({
      id: jobId, connection_id: identity.connectionId, owner_user_id: user.id,
      organization_id: identity.organizationId, installation_id: identity.installationId,
      session_generation: identity.sessionGeneration, company_guid: identity.companyGuid,
      company_name: identity.companyName, financial_year: identity.financialYear,
      protocol_version: identity.protocolVersion, command_type: commandType, job_class: jobClass,
      priority: Math.max(0, Math.min(100, Math.trunc(Number(body.priority ?? 80)))),
      status: "queued", payload,
      available_at: now, deadline_at: body.deadlineAt || null,
    }).select("*").single();
    if (error) throw error;
    void wakeTallyConnector(identity.connectionId);
    return jsonWithCors(request, { job: serializeTallyBridgeCommand(data as unknown as TallyBridgeCommandRow) }, { status: 201 });
  } catch (error) {
    const accessFailure = accessFailureResponse(request, error);
    if (accessFailure) return accessFailure;
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Could not queue Local Agent job.";
    return jsonWithCors(request, { error: message }, { status: /identity is incomplete/i.test(message) ? 400 : 500 });
  }
}

export const POST = withTeamAccess(POSTHandler);
