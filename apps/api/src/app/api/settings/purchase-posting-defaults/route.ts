import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  ["cgst-tds", { mappingType: "tds_ledger", sourceKey: "cgst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["sgst-tds", { mappingType: "tds_ledger", sourceKey: "sgst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["igst-tds", { mappingType: "tds_ledger", sourceKey: "igst_tds", targetTypes: ["ledger", "tax_ledger"] }],
  ["freight", { mappingType: "freight_ledger", sourceKey: "purchase", targetTypes: ["ledger"] }],
  ["round-off", { mappingType: "round_off_ledger", sourceKey: "purchase", targetTypes: ["ledger"] }],
] as const);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

export async function GET(request: Request) {
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
    const { data, error } = await supabase
      .from("tally_mapping_settings")
      .select("mapping_type, source_key, target_master_name, status")
      .eq("connection_id", connectionId)
      .eq("owner_user_id", user.id)
      .ilike("company_name", companyName)
      .eq("status", "active");
    if (error) throw error;
    const rows = data ?? [];
    const defaults = Object.fromEntries([...ALLOWED_DEFAULTS].map(([id, definition]) => [
      id,
      rows.find((row) =>
        row.mapping_type === definition.mappingType && row.source_key === definition.sourceKey
      )?.target_master_name ?? "",
    ]));
    return jsonWithCors(request, { defaults });
  } catch (error) {
    console.error("Error loading Purchase posting defaults:", error);
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not load defaults." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

    for (const [id, definition] of ALLOWED_DEFAULTS) {
      const targetName = clean(defaults[id]);
      const baseDelete = supabase
        .from("tally_mapping_settings")
        .delete()
        .eq("connection_id", connectionId)
        .eq("owner_user_id", user.id)
        .ilike("company_name", companyName)
        .eq("mapping_type", definition.mappingType)
        .eq("source_key", definition.sourceKey);
      if (!targetName) {
        const { error } = await baseDelete;
        if (error) throw error;
        continue;
      }
      const { data: target, error: targetError } = await supabase
        .from("tally_masters")
        .select("master_type, master_key, tally_name")
        .eq("connection_id", connectionId)
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .eq("is_active", true)
        .in("master_type", [...definition.targetTypes])
        .eq("tally_name", targetName)
        .limit(1)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) {
        return jsonWithCors(request, { error: `${targetName} is not an active master in ${companyName}.` }, { status: 409 });
      }
      const { error } = await supabase.from("tally_mapping_settings").upsert({
        connection_id: connectionId,
        owner_user_id: user.id,
        company_name: companyName,
        mapping_type: definition.mappingType,
        source_key: definition.sourceKey,
        source_label: id,
        target_master_type: target.master_type,
        target_master_key: target.master_key,
        target_master_name: target.tally_name,
        status: "active",
        notes: "Configured in Purchase accounting settings.",
      }, { onConflict: "connection_id,company_name,mapping_type,source_key" });
      if (error) throw error;
    }
    return jsonWithCors(request, { saved: true });
  } catch (error) {
    console.error("Error saving Purchase posting defaults:", error);
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not save defaults." }, { status: 500 });
  }
}
