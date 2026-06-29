import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { isLocalDbMode } from "@/lib/local/mode";
import {
  createLocalTallyCommand,
  getLocalTallyConnection,
  listLocalTallyCommands,
} from "@/lib/local/tally-store";
import {
  serializeTallyBridgeCommand,
  TALLY_BRIDGE_COMMAND_TYPES,
  type TallyBridgeCommandRow,
  type TallyBridgeCommandType,
} from "@/lib/tally/commands";
import { queueTallyMasterSyncCommand } from "@/lib/tally/master-sync";
import { toNullableText, toRequiredText, type TallyMasterRow } from "@/lib/tally/masters";

function parseCommandType(value: unknown): TallyBridgeCommandType | null {
  if (typeof value !== "string") return null;
  return TALLY_BRIDGE_COMMAND_TYPES.includes(value as TallyBridgeCommandType)
    ? (value as TallyBridgeCommandType)
    : null;
}

async function requireConnection(ownerUserId: string, connectionId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tally_connections")
    .select("id, owner_user_id, status, last_company_name")
    .eq("id", connectionId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const connection = isLocalDbMode()
      ? await getLocalTallyConnection(id, user.id)
      : await requireConnection(user.id, id);
    if (!connection) {
      return jsonWithCors(request, { error: "Tally connection not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const requestedCommandIds = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 100);
    const requestedLimit = Number(url.searchParams.get("limit") ?? "");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : requestedCommandIds.length > 0
        ? requestedCommandIds.length
        : 20;

    if (isLocalDbMode()) {
      return jsonWithCors(request, {
        commands: (await listLocalTallyCommands({
          connectionId: id,
          ownerUserId: user.id,
          ids: requestedCommandIds,
          limit,
        })).map(serializeTallyBridgeCommand),
      });
    }

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("tally_bridge_commands")
      .select("*")
      .eq("connection_id", id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (requestedCommandIds.length > 0) {
      query = query.in("id", requestedCommandIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    return jsonWithCors(request, {
      commands: ((data ?? []) as unknown as TallyBridgeCommandRow[]).map(serializeTallyBridgeCommand),
    });
  } catch (error) {
    console.error("Error in GET /api/tally/connections/[id]/commands:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
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
    const connection = isLocalDbMode()
      ? await getLocalTallyConnection(id, user.id)
      : await requireConnection(user.id, id);
    if (!connection) {
      return jsonWithCors(request, { error: "Tally connection not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const commandType = parseCommandType(body.commandType);
    if (!commandType) {
      return jsonWithCors(request, { error: "Unsupported Tally command type." }, { status: 400 });
    }

    const rawPayload = body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : {};

    if (commandType === "sync_masters") {
      const companyName =
        toNullableText(rawPayload.companyName, 240) ??
        toNullableText(connection.last_company_name, 240);
      const requestedMasterTypes = Array.isArray(rawPayload.requestedMasterTypes)
        ? rawPayload.requestedMasterTypes.filter((value): value is string => typeof value === "string")
        : ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"];
      const payload = {
        companyName,
        requestedMasterTypes,
        mode: "ledger_accuracy",
      };

      if (isLocalDbMode()) {
        const command = await createLocalTallyCommand({
          connectionId: id,
          ownerUserId: user.id,
          commandType,
          payload,
          priority: 10,
        });

        return jsonWithCors(request, {
          command: serializeTallyBridgeCommand(command),
        });
      }

      const syncDecision = await queueTallyMasterSyncCommand({
        supabase: createSupabaseAdminClient(),
        connectionId: id,
        ownerUserId: user.id,
        companyName,
        requestedMasterTypes,
        force: true,
        priority: 10,
        reason: "manual_sync",
      });

      return jsonWithCors(request, {
        command: syncDecision.command,
        masterSync: syncDecision,
      });
    }

    if (commandType === "alter_ledger") {
      const masterKey = toRequiredText(rawPayload.masterKey).slice(0, 500);
      const newName = toRequiredText(rawPayload.newName).slice(0, 500);

      if (!masterKey || !newName) {
        return jsonWithCors(request, { error: "Ledger and new name are required." }, { status: 400 });
      }

      const supabase = createSupabaseAdminClient();
      const { data: masterData, error: masterError } = await supabase
        .from("tally_masters")
        .select("*")
        .eq("connection_id", id)
        .eq("owner_user_id", user.id)
        .eq("master_key", masterKey)
        .in("master_type", ["ledger", "gst_ledger"])
        .eq("is_active", true)
        .maybeSingle();

      if (masterError) throw masterError;
      if (!masterData) {
        return jsonWithCors(request, { error: "Synced ledger was not found." }, { status: 404 });
      }

      const master = masterData as unknown as TallyMasterRow;
      if (master.tally_name.trim().toLowerCase() === newName.trim().toLowerCase()) {
        return jsonWithCors(request, { error: "New ledger name is the same as the current name." }, { status: 400 });
      }

      const payload = {
        masterType: master.master_type,
        masterKey: master.master_key,
        tallyGuid: master.tally_guid,
        oldName: master.tally_name,
        newName,
        parentName: master.parent_name,
        companyName: toNullableText(connection.last_company_name, 240),
      };

      const { data, error } = await supabase
        .from("tally_bridge_commands")
        .insert({
          connection_id: id,
          owner_user_id: user.id,
          command_type: commandType,
          status: "queued",
          payload,
        })
        .select("*")
        .single();

      if (error) throw error;

      await supabase.from("tally_connection_events").insert({
        connection_id: id,
        owner_user_id: user.id,
        event_type: "command_queued",
        message: "Tally ledger edit queued for bridge.",
        payload: {
          commandType,
          oldName: master.tally_name,
          newName,
        },
      });

      return jsonWithCors(request, {
        command: serializeTallyBridgeCommand(data as unknown as TallyBridgeCommandRow),
      });
    }

    if (commandType === "create_ledger") {
      const name = toRequiredText(rawPayload.name).slice(0, 500);
      const parentName = toRequiredText(rawPayload.parentName).slice(0, 240);

      if (!name || !parentName) {
        return jsonWithCors(request, { error: "Ledger name and parent group are required." }, { status: 400 });
      }

      const supabase = createSupabaseAdminClient();
      const { data: existing, error: existingError } = await supabase
        .from("tally_masters")
        .select("id")
        .eq("connection_id", id)
        .eq("owner_user_id", user.id)
        .eq("master_type", "ledger")
        .ilike("tally_name", name)
        .eq("is_active", true)
        .limit(1);

      if (existingError) throw existingError;
      if ((existing ?? []).length > 0) {
        return jsonWithCors(request, { error: "A synced ledger with this name already exists." }, { status: 409 });
      }

      const payload = {
        name,
        parentName,
        companyName: toNullableText(connection.last_company_name, 240),
      };

      const { data, error } = await supabase
        .from("tally_bridge_commands")
        .insert({
          connection_id: id,
          owner_user_id: user.id,
          command_type: commandType,
          status: "queued",
          priority: 30,
          payload,
        })
        .select("*")
        .single();

      if (error) throw error;

      await supabase.from("tally_connection_events").insert({
        connection_id: id,
        owner_user_id: user.id,
        event_type: "command_queued",
        message: "Tally ledger create queued for bridge.",
        payload: {
          commandType,
          name,
          parentName,
        },
      });

      return jsonWithCors(request, {
        command: serializeTallyBridgeCommand(data as unknown as TallyBridgeCommandRow),
      });
    }

    return jsonWithCors(request, { error: "Unsupported Tally command type." }, { status: 400 });
  } catch (error) {
    console.error("Error in POST /api/tally/connections/[id]/commands:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
