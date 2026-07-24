import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLocalDbMode } from "@/lib/local/mode";
import { disconnectLocalTallyConnection } from "@/lib/local/tally-store";
import {
  hashSecret,
  serializeTallyConnectionStatus,
  type TallyConnectionRow,
} from "@/lib/tally/connections";

const CONNECTION_SELECT = [
  "id",
  "owner_user_id",
  "display_name",
  "status",
  "tally_url",
  "pairing_code_hash",
  "pairing_code_expires_at",
  "paired_at",
  "bridge_name",
  "bridge_version",
  "bridge_machine_id",
  "last_heartbeat_at",
  "last_tested_at",
  "last_tally_reachable",
  "last_company_loaded",
  "last_company_name",
  "last_error",
  "created_at",
  "updated_at",
].join(", ");

function disconnectedUpdatePayload() {
  return {
    status: "waiting_for_bridge",
    pairing_code_hash: null,
    pairing_code_expires_at: null,
    bridge_token_hash: null,
    paired_at: null,
    bridge_name: null,
    bridge_version: null,
    bridge_machine_id: null,
    last_heartbeat_at: null,
    last_tested_at: null,
    last_tally_reachable: null,
    last_company_loaded: null,
    last_error: "Disconnected by user.",
  };
}

function getControlToken(request: Request) {
  return request.headers.get("x-tally-control-token")?.trim() ?? "";
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const controlToken = getControlToken(request);
    if (!controlToken) {
      return jsonWithCors(
        request,
        { error: "This browser does not control the selected Tally connection." },
        { status: 403 }
      );
    }

    if (isLocalDbMode()) {
      const connection = await disconnectLocalTallyConnection(id, user.id, controlToken);
      if (!connection) {
        return jsonWithCors(
          request,
          { error: "This browser cannot disconnect that Tally connection." },
          { status: 403 }
        );
      }
      return jsonWithCors(request, {
        connection: serializeTallyConnectionStatus(connection),
      });
    }

    const supabase = createSupabaseAdminClient();
    const { data: existingData, error: existingError } = await supabase
      .from("tally_connections")
      .select(`${CONNECTION_SELECT}, pairing_code_hash`)
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existingData) {
      return jsonWithCors(request, { error: "Tally connection not found" }, { status: 404 });
    }
    const existing = existingData as unknown as TallyConnectionRow & {
      pairing_code_hash: string | null;
    };
    if (
      !existing.pairing_code_hash ||
      hashSecret(controlToken) !== existing.pairing_code_hash
    ) {
      await supabase.from("tally_connection_events").insert({
        connection_id: existing.id,
        owner_user_id: user.id,
        event_type: "disconnect_rejected",
        message: "A different browser attempted to disconnect this Tally connection.",
        payload: {
          origin: request.headers.get("origin"),
          referer: request.headers.get("referer"),
          userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
          forwardedFor: request.headers.get("x-forwarded-for")?.slice(0, 200) ?? null,
        },
      });
      return jsonWithCors(
        request,
        { error: "This browser cannot disconnect that Tally connection." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("tally_connections")
      .update(disconnectedUpdatePayload())
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .eq("pairing_code_hash", existing.pairing_code_hash)
      .select(CONNECTION_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return jsonWithCors(request, { error: "Tally connection not found" }, { status: 404 });
    }

    const connection = data as unknown as TallyConnectionRow;
    await supabase.from("tally_connection_events").insert({
      connection_id: connection.id,
      owner_user_id: user.id,
      event_type: "bridge_disconnected",
      message: "Tally bridge disconnected by user.",
      payload: {
        source: "web",
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        forwardedFor: request.headers.get("x-forwarded-for")?.slice(0, 200) ?? null,
      },
    });

    return jsonWithCors(request, {
      connection: serializeTallyConnectionStatus(connection),
    });
  } catch (error) {
    console.error("Error in POST /api/tally/connections/[id]/disconnect:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
