import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { wakeTallyConnector } from "@/lib/tally/command-wake";
import { serializeTallyBridgeCommand, type TallyBridgeCommandRow } from "@/lib/tally/commands";
import { toNullableText } from "@/lib/tally/masters";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const connectionId = toNullableText(body.connectionId, 80);
    const companyName = toNullableText(body.companyName, 240);
    const operation = body.operation === "revalidate" ? "cash_discount_revalidate" : "cash_discount_scan";
    const proposal = body.proposal && typeof body.proposal === "object"
      ? (body.proposal as Record<string, unknown>)
      : null;
    if (!connectionId || !companyName) {
      return jsonWithCors(request, { error: "The live Tally company is required." }, { status: 400 });
    }
    if (operation === "cash_discount_revalidate" && !toNullableText(proposal?.partyLedgerName, 500)) {
      return jsonWithCors(request, { error: "The customer ledger is required for revalidation." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id, last_company_name, last_tally_reachable, last_company_loaded, revoked_at")
      .eq("id", connectionId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.revoked_at) {
      return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    }
    if (
      connection.last_tally_reachable !== true ||
      connection.last_company_loaded !== true ||
      normalize(connection.last_company_name) !== normalize(companyName)
    ) {
      return jsonWithCors(
        request,
        { error: `Tally must be open to ${companyName} before Cash Discounts can be refreshed.` },
        { status: 409 }
      );
    }

    const { data: commandData, error: commandError } = await supabase
      .from("tally_bridge_commands")
      .insert({
        connection_id: connectionId,
        owner_user_id: user.id,
        // Reuse the established read-only command type so older database
        // constraints remain compatible. The transport marker selects the
        // optimized one-pass Cash Discount snapshot in the connector.
        command_type: "fetch_customer_open_bills",
        status: "queued",
        priority: operation === "cash_discount_revalidate" ? 40 : 25,
        payload: {
          transport: "cash_discount_snapshot_v2",
          operation,
          companyName,
          proposal,
        },
      })
      .select("*")
      .single();
    if (commandError) throw commandError;

    await Promise.all([
      supabase.from("tally_connection_events").insert({
        connection_id: connectionId,
        owner_user_id: user.id,
        event_type: "command_queued",
        message: operation === "cash_discount_revalidate"
          ? "Cash Discount revalidation queued for bridge."
          : "Cash Discount live snapshot queued for bridge.",
        payload: { commandType: "fetch_customer_open_bills", transport: "cash_discount_snapshot_v2" },
      }),
      wakeTallyConnector(connectionId),
    ]);

    return jsonWithCors(request, {
      command: serializeTallyBridgeCommand(commandData as unknown as TallyBridgeCommandRow),
    });
  } catch (error) {
    console.error("Error in POST /api/collections/live/queue-scan:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Could not queue the Cash Discount scan." },
      { status: 500 }
    );
  }
}
