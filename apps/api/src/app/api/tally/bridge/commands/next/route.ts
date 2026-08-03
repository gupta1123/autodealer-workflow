import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { isLocalDbMode } from "@/lib/local/mode";
import { claimNextLocalTallyCommand } from "@/lib/local/tally-store";
import {
  hashSecret,
  TALLY_CONNECTION_SELECT,
  type TallyConnectionRow,
} from "@/lib/tally/connections";
import {
  serializeTallyBridgeCommand,
  type TallyBridgeCommandRow,
} from "@/lib/tally/commands";

function getBridgeToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] ?? request.headers.get("x-bridge-token") ?? "";
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId") ?? "";
    const bridgeVersion = url.searchParams.get("bridgeVersion") ?? null;
    const token = getBridgeToken(request);

    if (!connectionId || !token) {
      return jsonWithCors(request, { error: "Connection id and bridge token are required." }, { status: 400 });
    }

    if (isLocalDbMode()) {
      const result = await claimNextLocalTallyCommand({
        connectionId,
        token,
        bridgeVersion,
      });

      if (result.unauthorized) {
        return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
      }

      return jsonWithCors(request, {
        command: result.command ? serializeTallyBridgeCommand(result.command) : null,
      });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_connections")
      .select(TALLY_CONNECTION_SELECT)
      .eq("id", connectionId)
      .maybeSingle();

    if (error) throw error;

    const connection = data as unknown as TallyConnectionRow | null;
    if (connection?.revoked_at) {
      return jsonWithCors(
        request,
        { error: "This connector session has been revoked. Reconnect this computer." },
        { status: 409 }
      );
    }
    if (!connection?.bridge_token_hash || hashSecret(token) !== connection.bridge_token_hash) {
      return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const staleClaimedBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: exhaustedCommands, error: exhaustedClaimError } = await supabase
      .from("tally_bridge_commands")
      .update({
        status: "failed",
        completed_at: now,
        error: "Bridge claimed this command but did not report a result before the retry limit.",
      })
      .eq("connection_id", connection.id)
      .eq("status", "claimed")
      .lt("claimed_at", staleClaimedBefore)
      .gte("attempts", 3)
      .select("id, command_type");

    if (exhaustedClaimError) throw exhaustedClaimError;
    const exhaustedIds = (exhaustedCommands ?? [])
      .filter((command) => command.command_type === "create_purchase_voucher")
      .map((command) => command.id);
    if (exhaustedIds.length > 0) {
      const [postingCleanup, commandCleanup] = await Promise.all([
        supabase
          .from("purchase_invoice_tally_postings")
          .update({
            status: "failed",
            last_error: "Tally bridge did not report a result before the retry limit.",
          })
          .in("command_id", exhaustedIds)
          .in("status", ["queued", "creating"]),
        supabase
          .from("tally_bridge_commands")
          .update({ payload: {}, result: {} })
          .in("id", exhaustedIds),
      ]);
      if (postingCleanup.error) throw postingCleanup.error;
      if (commandCleanup.error) throw commandCleanup.error;
    }

    const { data: requeuedCommands, error: staleClaimError } = await supabase
      .from("tally_bridge_commands")
      .update({
        status: "queued",
        claimed_at: null,
        error: "Requeued after the bridge claimed this command but did not report a result.",
      })
      .eq("connection_id", connection.id)
      .eq("status", "claimed")
      .lt("claimed_at", staleClaimedBefore)
      .lt("attempts", 3)
      .select("id, command_type");

    if (staleClaimError) throw staleClaimError;
    const requeuedIds = (requeuedCommands ?? [])
      .filter((command) => command.command_type === "create_purchase_voucher")
      .map((command) => command.id);
    if (requeuedIds.length > 0) {
      await supabase
        .from("purchase_invoice_tally_postings")
        .update({ status: "queued", last_error: null })
        .in("command_id", requeuedIds)
        .eq("status", "creating");
    }

    const { data: commandData, error: commandError } = await supabase
      .from("tally_bridge_commands")
      .select("*")
      .eq("connection_id", connection.id)
      .eq("status", "queued")
      .lte("available_at", now)
      .lt("attempts", 3)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (commandError) throw commandError;
    if (!commandData) {
      return jsonWithCors(request, { command: null });
    }

    const command = commandData as unknown as TallyBridgeCommandRow;
    const { data: claimedData, error: claimError } = await supabase
      .from("tally_bridge_commands")
      .update({
        status: "claimed",
        claimed_at: now,
        attempts: command.attempts + 1,
        bridge_version: bridgeVersion,
      })
      .eq("id", command.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimedData) {
      return jsonWithCors(request, { command: null });
    }

    if ((claimedData as TallyBridgeCommandRow).command_type === "create_purchase_voucher") {
      await supabase
        .from("purchase_invoice_tally_postings")
        .update({ status: "creating", last_error: null })
        .eq("command_id", (claimedData as TallyBridgeCommandRow).id)
        .in("status", ["approved", "queued", "creating"]);
    }

    return jsonWithCors(request, {
      command: serializeTallyBridgeCommand(claimedData as unknown as TallyBridgeCommandRow),
    });
  } catch (error) {
    console.error("Error in GET /api/tally/bridge/commands/next:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
