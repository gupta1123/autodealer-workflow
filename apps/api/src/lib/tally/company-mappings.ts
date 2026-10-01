import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export type CompanyMappingRow = {
  connection_id: string;
  mapping_type: string;
  source_key: string;
  source_label: string | null;
  target_master_type: string;
  target_master_key: string;
  target_master_name: string;
  status: string;
  updated_at: string | null;
};

const MAPPING_COLUMNS =
  "connection_id, mapping_type, source_key, source_label, target_master_type, target_master_key, target_master_name, status, updated_at";

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Saved Tally defaults (purchase ledgers, GST/TDS ledgers, supplier-by-GSTIN, ...) are written
// against the connector connection that saved them. A connector re-pair creates a new
// connection, so reads look across every connection of the same owner for the company and keep
// one row per mapping: the current connection's row first, otherwise the most recently saved.
export async function readCompanyMappings(
  supabase: SupabaseAdmin,
  params: { connectionId: string; companyName: string; ownerUserId?: string | null }
): Promise<CompanyMappingRow[]> {
  const companyName = params.companyName.trim();
  if (!params.connectionId || !companyName) return [];

  let ownerUserId = params.ownerUserId ?? null;
  if (!ownerUserId) {
    const { data, error } = await supabase
      .from("tally_connections")
      .select("owner_user_id")
      .eq("id", params.connectionId)
      .maybeSingle();
    if (error) throw error;
    ownerUserId = (data?.owner_user_id as string | undefined) ?? null;
  }
  if (!ownerUserId) return [];

  const { data, error } = await supabase
    .from("tally_mapping_settings")
    .select(MAPPING_COLUMNS)
    .eq("owner_user_id", ownerUserId)
    .ilike("company_name", escapeLikePattern(companyName))
    .eq("status", "active");
  if (error) throw error;

  const rows = ((data ?? []) as CompanyMappingRow[]).sort((left, right) => {
    const leftCurrent = left.connection_id === params.connectionId ? 1 : 0;
    const rightCurrent = right.connection_id === params.connectionId ? 1 : 0;
    if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
    return String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
  });

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.mapping_type}\u0000${row.source_key.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
