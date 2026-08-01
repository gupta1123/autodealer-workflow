import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { toText } from "@/lib/collections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TallyConnectionRow = {
  id: string;
  owner_user_id: string;
  last_company_name: string | null;
  last_tally_reachable: boolean | null;
  last_company_loaded: boolean | null;
};

type TimestampRow = {
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  last_synced_at?: string | null;
};

function normalizeLedgerName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function nullableText(value: unknown, maxLength = 500) {
  const text = toText(value, maxLength);
  return text || null;
}

function isGenericTallyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return (
    !normalized ||
    normalized === "tally" ||
    normalized === "tally prime" ||
    /^tally(?: prime)?\s*[-–]\s*(?:current year|\d{4}[-–]\d{2})$/.test(normalized)
  );
}

function isMissingCollectionsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /debit_note_proposals|tally_bridge_commands|tally_masters|tally_master_sync_runs|relation .* does not exist|schema cache/i.test(message);
}

function latestTimestamp(...values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestTime = 0;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time <= latestTime) continue;
    latest = value;
    latestTime = time;
  }
  return latest;
}

function rowTimestamp(row: TimestampRow | null | undefined) {
  if (!row) return null;
  return latestTimestamp(row.updated_at, row.completed_at, row.last_synced_at, row.created_at);
}

function commandCompanyName(command: { payload?: Record<string, unknown> | null }) {
  return nullableText(command.payload?.companyName, 240);
}

function belongsToCompany(command: { payload?: Record<string, unknown> | null }, companyName: string | null) {
  return normalizeLedgerName(commandCompanyName(command)) === normalizeLedgerName(companyName);
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId")?.trim();
    const requestedCompanyName = nullableText(url.searchParams.get("companyName"), 240);

    if (!connectionId) {
      return jsonWithCors(request, { error: "Tally company/connection is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id, last_company_name, last_tally_reachable, last_company_loaded")
      .eq("id", connectionId)
      .eq("owner_user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) {
      return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    }

    const activeCompanyName = !isGenericTallyLabel((connection as TallyConnectionRow).last_company_name)
      ? (connection as TallyConnectionRow).last_company_name
      : null;
    if (
      (connection as TallyConnectionRow).last_tally_reachable !== true ||
      (connection as TallyConnectionRow).last_company_loaded !== true ||
      !activeCompanyName
    ) {
      return jsonWithCors(
        request,
        { error: "Tally must be connected with an active company before Cash Discounts can be calculated." },
        { status: 409 }
      );
    }

    const companyName = requestedCompanyName ?? activeCompanyName;
    if (normalizeLedgerName(companyName) !== normalizeLedgerName(activeCompanyName)) {
      return jsonWithCors(
        request,
        {
          error: `Tally is currently open to ${activeCompanyName}. Switch Tally to ${companyName} before calculating Cash Discounts.`,
        },
        { status: 409 }
      );
    }

    const compatibleConnectionIds = new Set([connectionId]);
    const [
      { data: companyConnectionRows, error: companyConnectionError },
      { data: companySyncRows, error: companySyncError },
    ] = await Promise.all([
      supabase
        .from("tally_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("last_company_name", companyName)
        .limit(200),
      supabase
        .from("tally_master_sync_runs")
        .select("connection_id")
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .limit(500),
    ]);

    if (companyConnectionError) throw companyConnectionError;
    if (companySyncError) throw companySyncError;
    for (const row of companyConnectionRows ?? []) {
      if (row.id) compatibleConnectionIds.add(String(row.id));
    }
    for (const row of companySyncRows ?? []) {
      if (row.connection_id) compatibleConnectionIds.add(String(row.connection_id));
    }

    const connectionIds = Array.from(compatibleConnectionIds);
    const [
      { data: latestProposalRows, count: proposalCount, error: proposalError },
      { data: latestOpenBillRows, count: openBillCommandCount, error: openBillCommandError },
      { data: latestDebitNoteCommandRows, error: debitNoteCommandError },
      { data: latestLedgerRows, count: ledgerCount, error: ledgerError },
    ] = await Promise.all([
      supabase
        .from("debit_note_proposals")
        .select("updated_at, created_at", { count: "exact" })
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase
        .from("tally_bridge_commands")
        .select("completed_at, created_at", { count: "exact" })
        .eq("owner_user_id", user.id)
        .eq("connection_id", connectionId)
        .eq("command_type", "fetch_customer_open_bills")
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(1),
      supabase
        .from("tally_bridge_commands")
        .select("completed_at, created_at, payload")
        .eq("owner_user_id", user.id)
        .in("connection_id", connectionIds)
        .eq("command_type", "create_debit_note")
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(100),
      supabase
        .from("tally_masters")
        .select("last_synced_at", { count: "exact" })
        .eq("owner_user_id", user.id)
        .eq("connection_id", connectionId)
        .eq("master_type", "ledger")
        .eq("is_active", true)
        .order("last_synced_at", { ascending: false })
        .limit(1),
    ]);

    if (proposalError) throw proposalError;
    if (openBillCommandError) throw openBillCommandError;
    if (debitNoteCommandError) throw debitNoteCommandError;
    if (ledgerError) throw ledgerError;

    const latestDebitNoteCommand = ((latestDebitNoteCommandRows ?? []) as Array<TimestampRow & { payload?: Record<string, unknown> | null }>)
      .find((command) => belongsToCompany(command, companyName));

    const changedAt = latestTimestamp(
      rowTimestamp(((latestProposalRows ?? []) as TimestampRow[])[0]),
      rowTimestamp(((latestOpenBillRows ?? []) as TimestampRow[])[0]),
      rowTimestamp(latestDebitNoteCommand),
      rowTimestamp(((latestLedgerRows ?? []) as TimestampRow[])[0])
    );
    const versionParts = [
      changedAt ?? "none",
      proposalCount ?? 0,
      openBillCommandCount ?? 0,
      rowTimestamp(latestDebitNoteCommand) ?? "none",
      ledgerCount ?? 0,
    ];

    return jsonWithCors(request, {
      version: versionParts.join("|"),
      changedAt,
      counts: {
        debitNoteProposals: proposalCount ?? 0,
        openBillScans: openBillCommandCount ?? 0,
        matchingDebitNoteCommandsSeen: latestDebitNoteCommand ? 1 : 0,
        ledgers: ledgerCount ?? 0,
      },
    });
  } catch (error) {
    if (isMissingCollectionsTable(error)) {
      return jsonWithCors(request, {
        version: "setup-required",
        changedAt: null,
        setupRequired: true,
      });
    }

    console.error("Error in GET /api/collections/dashboard/version:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
