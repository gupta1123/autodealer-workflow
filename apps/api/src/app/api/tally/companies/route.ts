import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serializeTallyConnectionStatus, type TallyConnectionRow } from "@/lib/tally/connections";

type TallyConnectionWithSync = TallyConnectionRow & {
  latestSync?: LatestSyncRow | null;
};

type LatestSyncRow = {
  connection_id: string;
  company_name: string | null;
  completed_at: string | null;
  totals: Record<string, unknown> | null;
};

function inferFinancialYear() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
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

function pickCompanyName(connection: TallyConnectionWithSync) {
  const latestSync = connection.latestSync ?? null;
  const names = [connection.last_company_name, latestSync?.company_name, connection.display_name];
  return names.find((name) => !isGenericTallyLabel(name)) ?? names.find((name) => String(name ?? "").trim()) ?? "Tally Prime";
}

function serializeCompany(connection: TallyConnectionWithSync) {
  const status = serializeTallyConnectionStatus(connection);
  const latestSync = connection.latestSync ?? null;
  const companyName = pickCompanyName(connection);
  const totals = latestSync?.totals && typeof latestSync.totals === "object" ? latestSync.totals : {};
  const bankAccountCount =
    typeof totals.bank_ledger === "number"
      ? totals.bank_ledger
      : typeof totals.ledger === "number"
        ? null
        : null;

  return {
    id: connection.id,
    connectionId: connection.id,
    companyName,
    financialYear: inferFinancialYear(),
    status: status.status,
    bridgeConnected: status.bridgeConnected,
    tallyReachable: status.tallyReachable,
    companyLoaded: status.companyLoaded,
    bankAccountCount,
    lastSyncAt: latestSync?.completed_at ?? null,
    lastHeartbeatAt: connection.last_heartbeat_at,
    lastError: connection.last_error,
  };
}

function timestampValue(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
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

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_connections")
      .select(
        [
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
        ].join(", ")
      )
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const connections = (data ?? []) as unknown as TallyConnectionRow[];
    const connectionIds = connections.map((connection) => connection.id);
    const latestSyncByConnection = new Map<string, LatestSyncRow>();

    if (connectionIds.length > 0) {
      const { data: syncRows, error: syncError } = await supabase
        .from("tally_master_sync_runs")
        .select("connection_id, company_name, completed_at, totals")
        .eq("owner_user_id", user.id)
        .in("connection_id", connectionIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (syncError) throw syncError;

      for (const row of (syncRows ?? []) as unknown as LatestSyncRow[]) {
        if (!latestSyncByConnection.has(row.connection_id)) {
          latestSyncByConnection.set(row.connection_id, row);
        }
      }
    }

    const companyEntries = connections.map((connection) => {
      const latestSync = latestSyncByConnection.get(connection.id) ?? null;
      const hasSpecificName = !isGenericTallyLabel(connection.last_company_name) || !isGenericTallyLabel(latestSync?.company_name);

      return {
        company: serializeCompany({
          ...connection,
          latestSync,
        }),
        hasSpecificName,
        updatedAt: connection.updated_at,
      };
    });

    companyEntries.sort((a, b) => {
      if (a.hasSpecificName !== b.hasSpecificName) {
        return a.hasSpecificName ? -1 : 1;
      }

      return timestampValue(b.updatedAt) - timestampValue(a.updatedAt);
    });

    const connectedCompanyEntries = companyEntries.filter(
      (entry) => entry.company.bridgeConnected && entry.company.tallyReachable && entry.company.companyLoaded
    );
    const namedCompanyEntries = companyEntries.filter((entry) => entry.hasSpecificName);
    const visibleCompanyEntries = namedCompanyEntries.length > 0 ? namedCompanyEntries : companyEntries;
    const connectedCompanyIds = new Set(connectedCompanyEntries.map((entry) => entry.company.id));
    visibleCompanyEntries.sort((a, b) => {
      const connectedDiff = Number(connectedCompanyIds.has(b.company.id)) - Number(connectedCompanyIds.has(a.company.id));
      if (connectedDiff !== 0) return connectedDiff;
      return timestampValue(b.updatedAt) - timestampValue(a.updatedAt);
    });
    const companies = visibleCompanyEntries.map((entry) => entry.company);

    return jsonWithCors(request, {
      companies,
      selectedCompanyId: connectedCompanyEntries[0]?.company.id ?? companies[0]?.id ?? null,
    });
  } catch (error) {
    console.error("Error in GET /api/tally/companies:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
