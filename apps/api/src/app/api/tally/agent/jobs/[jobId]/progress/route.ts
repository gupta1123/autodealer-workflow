import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { hashSecret } from "@/lib/tally/connections";

function bridgeToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || request.headers.get("x-bridge-token") || "";
}

export function OPTIONS(request: Request) { return optionsWithCors(request); }

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const token = bridgeToken(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    if (!token || !connectionId) return jsonWithCors(request, { error: "Connection id and bridge token are required." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase.from("tally_connections")
      .select("id,bridge_token_hash,revoked_at")
      .eq("id", connectionId).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.bridge_token_hash || connection.revoked_at || hashSecret(token) !== connection.bridge_token_hash) {
      return jsonWithCors(request, { error: "Invalid or revoked bridge token." }, { status: 401 });
    }

    const { jobId } = await context.params;
    const source = body.progress && typeof body.progress === "object" ? body.progress : {};
    const compactProgress = {
      phase: typeof source.phase === "string" ? source.phase.slice(0, 120) : "running",
      processed: Number.isFinite(Number(source.processed)) ? Number(source.processed) : null,
      total: Number.isFinite(Number(source.total)) ? Number(source.total) : null,
      elapsedMs: Number.isFinite(Number(source.elapsedMs)) ? Math.max(0, Math.round(Number(source.elapsedMs))) : null,
      lastVchId: typeof source.lastVchId === "string" || typeof source.lastVchId === "number"
        ? String(source.lastVchId).slice(0, 100)
        : null,
      created: Number.isFinite(Number(source.created)) ? Number(source.created) : null,
      altered: Number.isFinite(Number(source.altered)) ? Number(source.altered) : null,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("tally_bridge_commands")
      .update({ compact_progress: compactProgress })
      .eq("id", jobId).eq("connection_id", connectionId)
      .in("status", ["queued", "claimed"])
      .select("id").maybeSingle();
    if (error) throw error;
    if (!data) return jsonWithCors(request, { error: "Active Local Agent job not found." }, { status: 404 });
    return jsonWithCors(request, { accepted: true });
  } catch (error) {
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not save agent progress." }, { status: 500 });
  }
}
