import { withTeamAccess } from '@/lib/access/route-boundary';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readCompanyMappings } from "@/lib/tally/company-mappings";

const ALLOWED_DEFAULTS = new Map([
  ["ms-scrap-item", { mappingType: "item_hsn", sourceKey: "7204", targetTypes: ["stock_item"] }],
  ["sponge-iron-item", { mappingType: "item_hsn", sourceKey: "72031000", targetTypes: ["stock_item"] }],
  ["ms-scrap-local", { mappingType: "purchase_ledger", sourceKey: "ms_scrap:local", targetTypes: ["ledger"] }],
  ["ms-scrap-interstate", { mappingType: "purchase_ledger", sourceKey: "ms_scrap:interstate", targetTypes: ["ledger"] }],
  ["sponge-local", { mappingType: "purchase_ledger", sourceKey: "sponge_iron:local", targetTypes: ["ledger"] }],
  ["sponge-interstate", { mappingType: "purchase_ledger", sourceKey: "sponge_iron:interstate", targetTypes: ["ledger"] }],
  ["cgst", { mappingType: "gst_rate", sourceKey: "cgst:9", targetTypes: ["ledger", "gst_ledger", "tax_ledger"] }],
  ["sgst", { mappingType: "gst_rate", sourceKey: "sgst:9", targetTypes: ["ledger", "gst_ledger", "tax_ledger"] }],
  ["igst", { mappingType: "gst_rate", sourceKey: "igst:18", targetTypes: ["ledger", "gst_ledger", "tax_ledger"] }],
  ["tds-194q", { mappingType: "tds_ledger", sourceKey: "194q", targetTypes: ["ledger", "tax_ledger"] }],
  ["transport-tds", { mappingType: "tds_ledger", sourceKey: "transport", targetTypes: ["ledger", "tax_ledger"] }],
  ["cgst-tds", { mappingType: "tds_ledger", sourceKey: "cgst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["sgst-tds", { mappingType: "tds_ledger", sourceKey: "sgst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["igst-tds", { mappingType: "tds_ledger", sourceKey: "igst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["tcs", { mappingType: "tcs_ledger", sourceKey: "receivable", targetTypes: ["ledger", "tax_ledger"] }],
  ["freight", { mappingType: "freight_ledger", sourceKey: "purchase", targetTypes: ["ledger"] }],
  ["round-off", { mappingType: "round_off_ledger", sourceKey: "purchase", targetTypes: ["ledger"] }],
  ["godown", { mappingType: "godown", sourceKey: "purchase", targetTypes: ["godown"] }],
] as const);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// Same shape as the posting review's master key, so a name-only default still matches live Tally.
function masterKeyFromName(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// A default arrives either as a plain name (clears when empty) or as the master the user picked
// from the live Tally list: { name, guid }. The posting review re-checks every saved default
// against live Tally before it is used, so a renamed or deleted master is never posted.
function readTarget(value: unknown) {
  if (typeof value === "string") return { name: clean(value), guid: "" };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return { name: clean(record.name), guid: clean(record.guid) };
  }
  return { name: "", guid: "" };
}

async function verifyConnection(ownerUserId: string, connectionId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tally_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) throw error;
  return { supabase, exists: Boolean(data) };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

async function GETHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const connectionId = clean(url.searchParams.get("connectionId"));
    const companyName = clean(url.searchParams.get("companyName"));
    if (!connectionId || !companyName) {
      return jsonWithCors(request, { error: "Tally connection and company are required." }, { status: 400 });
    }
    const { supabase, exists } = await verifyConnection(user.id, connectionId);
    if (!exists) return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    const rows = await readCompanyMappings(supabase, { connectionId, companyName, ownerUserId: user.id });
    const defaults = Object.fromEntries([...ALLOWED_DEFAULTS].map(([id, definition]) => [
      id,
      rows.find((row) => row.mapping_type === definition.mappingType && row.source_key === definition.sourceKey)
        ?.target_master_name ?? "",
    ]));
    return jsonWithCors(request, { defaults });
  } catch (error) {
    console.error("Error loading Purchase posting defaults:", error);
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not load defaults." }, { status: 500 });
  }
}

async function PUTHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const connectionId = clean(body.connectionId);
    const companyName = clean(body.companyName);
    const defaults = body.defaults && typeof body.defaults === "object" && !Array.isArray(body.defaults)
      ? body.defaults as Record<string, unknown>
      : null;
    if (!connectionId || !companyName || !defaults) {
      return jsonWithCors(request, { error: "Tally connection, company, and defaults are required." }, { status: 400 });
    }
    const { supabase, exists } = await verifyConnection(user.id, connectionId);
    if (!exists) return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });

    // Only the defaults present in the request change, so each field can be saved on its own.
    for (const [id, definition] of ALLOWED_DEFAULTS) {
      if (!(id in defaults)) continue;
      const target = readTarget(defaults[id]);

      // Replace the company's default on every connection, so an older connection's value can
      // never reappear after this one is cleared or changed.
      const { error: deleteError } = await supabase
        .from("tally_mapping_settings")
        .delete()
        .eq("owner_user_id", user.id)
        .ilike("company_name", escapeLikePattern(companyName))
        .eq("mapping_type", definition.mappingType)
        .eq("source_key", definition.sourceKey);
      if (deleteError) throw deleteError;
      if (!target.name) continue;

      const { error } = await supabase.from("tally_mapping_settings").insert({
        connection_id: connectionId,
        owner_user_id: user.id,
        company_name: companyName,
        mapping_type: definition.mappingType,
        source_key: definition.sourceKey,
        source_label: id,
        target_master_type: definition.targetTypes[0],
        target_master_key: target.guid || masterKeyFromName(target.name),
        target_master_name: target.name,
        status: "active",
        notes: "Configured in Purchase accounting settings.",
      });
      if (error) throw error;
    }
    return jsonWithCors(request, { saved: true });
  } catch (error) {
    console.error("Error saving Purchase posting defaults:", error);
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not save defaults." }, { status: 500 });
  }
}

export const GET = withTeamAccess(GETHandler);
export const PUT = withTeamAccess(PUTHandler);
