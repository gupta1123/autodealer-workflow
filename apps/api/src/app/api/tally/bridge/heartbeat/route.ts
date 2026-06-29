import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { isLocalDbMode } from "@/lib/local/mode";
import {
  createLocalTallyCommand,
  listLocalTallyCommands,
  listLocalTallyMasters,
  updateLocalTallyHeartbeat,
} from "@/lib/local/tally-store";
import {
  hashSecret,
  serializeTallyConnectionStatus,
  type TallyConnectionRow,
  type TallyConnectionStatus,
} from "@/lib/tally/connections";
import { queueTallyMasterSyncCommand } from "@/lib/tally/master-sync";

const LOCAL_MASTER_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

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

function getBridgeToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1] ?? request.headers.get("x-bridge-token") ?? "";
}

function toBoolean(value: unknown) {
  return value === true;
}

function toNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

function resolveStatus(input: {
  tallyReachable: boolean;
  companyLoaded: boolean;
  error: string | null;
}): TallyConnectionStatus {
  if (input.companyLoaded) return "company_loaded";
  if (input.tallyReachable) return "tally_reachable";
  if (input.error) return "connection_error";
  return "bridge_connected";
}

function isStaleTimestamp(value: unknown) {
  if (typeof value !== "string") return true;
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || Date.now() - time > LOCAL_MASTER_SYNC_STALE_MS;
}

async function queueLocalMasterSyncIfNeeded(input: {
  connection: TallyConnectionRow;
  companyName: string | null;
}) {
  const { masters, latestSync } = await listLocalTallyMasters({
    connectionId: input.connection.id,
    ownerUserId: input.connection.owner_user_id,
    masterType: "ledger",
    limit: 1,
  });
  const [pendingCommand] = await listLocalTallyCommands({
    connectionId: input.connection.id,
    ownerUserId: input.connection.owner_user_id,
    limit: 20,
  }).then((commands) =>
    commands.filter(
      (command) =>
        command.command_type === "sync_masters" &&
        (command.status === "queued" || command.status === "claimed")
    )
  );

  const completedAt =
    latestSync && typeof latestSync === "object" && "completed_at" in latestSync
      ? latestSync.completed_at
      : null;
  const needsSync =
    masters.length === 0 ||
    !completedAt ||
    isStaleTimestamp(completedAt);

  if (!needsSync) {
    return {
      shouldSync: false,
      queued: false,
      pending: false,
      reason: "fresh",
      activeLedgerCount: masters.length,
      latestSyncCompletedAt: typeof completedAt === "string" ? completedAt : null,
      command: null,
    };
  }

  if (pendingCommand) {
    return {
      shouldSync: true,
      queued: false,
      pending: true,
      reason: "sync_already_pending",
      activeLedgerCount: masters.length,
      latestSyncCompletedAt: typeof completedAt === "string" ? completedAt : null,
      command: pendingCommand,
    };
  }

  const reason = masters.length === 0 ? "no_synced_ledgers" : "stale_sync";
  const command = await createLocalTallyCommand({
    connectionId: input.connection.id,
    ownerUserId: input.connection.owner_user_id,
    commandType: "sync_masters",
    priority: 15,
    payload: {
      companyName: input.companyName,
      requestedMasterTypes: ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"],
      mode: "ledger_accuracy",
      reason,
    },
  });

  return {
    shouldSync: true,
    queued: true,
    pending: false,
    reason,
    activeLedgerCount: masters.length,
    latestSyncCompletedAt: typeof completedAt === "string" ? completedAt : null,
    command,
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(request: Request) {
  try {
    const token = getBridgeToken(request);
    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";

    if (!connectionId || !token) {
      return jsonWithCors(request, { error: "Connection id and bridge token are required." }, { status: 400 });
    }

    const tallyReachable = toBoolean(body.tallyReachable);
    const companyLoaded = toBoolean(body.companyLoaded);
    const companyName = toNullableText(body.companyName);
    const errorMessage = toNullableText(body.error);
    const status = resolveStatus({
      tallyReachable,
      companyLoaded,
      error: errorMessage,
    });

    if (isLocalDbMode()) {
      const connection = await updateLocalTallyHeartbeat({
        connectionId,
        token,
        status,
        tallyUrl: toNullableText(body.tallyUrl),
        bridgeVersion: toNullableText(body.bridgeVersion),
        tallyReachable,
        companyLoaded,
        companyName,
        error: errorMessage,
      });

      if (!connection) {
        return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
      }

      let masterSync = null;
      if (companyLoaded) {
        masterSync = await queueLocalMasterSyncIfNeeded({
          connection,
          companyName,
        });
      }

      return jsonWithCors(request, {
        connection: serializeTallyConnectionStatus(connection),
        masterSync,
      });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_connections")
      .select(`${CONNECTION_SELECT}, bridge_token_hash`)
      .eq("id", connectionId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const connection = data as unknown as (TallyConnectionRow & { bridge_token_hash: string | null }) | null;

    if (!connection?.bridge_token_hash || hashSecret(token) !== connection.bridge_token_hash) {
      return jsonWithCors(request, { error: "Invalid bridge token." }, { status: 401 });
    }

    const now = new Date().toISOString();

    const { data: updatedData, error: updateError } = await supabase
      .from("tally_connections")
      .update({
        status,
        tally_url: toNullableText(body.tallyUrl) ?? connection.tally_url,
        bridge_version: toNullableText(body.bridgeVersion) ?? connection.bridge_version,
        last_heartbeat_at: now,
        last_tested_at: now,
        last_tally_reachable: tallyReachable,
        last_company_loaded: companyLoaded,
        last_company_name: companyName,
        last_error: errorMessage,
      })
      .eq("id", connection.id)
      .select(CONNECTION_SELECT)
      .single();

    if (updateError) {
      throw updateError;
    }

    await supabase.from("tally_connection_events").insert({
      connection_id: connection.id,
      owner_user_id: connection.owner_user_id,
      event_type: "bridge_heartbeat",
      message: errorMessage ?? "Bridge heartbeat received.",
      payload: {
        status,
        tallyReachable,
        companyLoaded,
        companyName,
      },
    });

    let masterSync = null;
    if (companyLoaded) {
      try {
        masterSync = await queueTallyMasterSyncCommand({
          supabase,
          connectionId: connection.id,
          ownerUserId: connection.owner_user_id,
          companyName,
          reason:
            connection.last_company_loaded === true
              ? "stale_sync"
              : "bridge_connected",
        });
      } catch (syncError) {
        console.error("Error queueing automatic Tally master sync:", syncError);
      }
    }

    return jsonWithCors(request, {
      connection: serializeTallyConnectionStatus(updatedData as unknown as TallyConnectionRow),
      masterSync,
    });
  } catch (error) {
    console.error("Error in POST /api/tally/bridge/heartbeat:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
