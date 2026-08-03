import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PurchaseAccountingSettings = {
  purchaseGoodsTdsEnabled: boolean;
  transporterTdsEnabled: boolean;
  gstTdsEnabled: boolean;
};

type PurchaseAccountingSettingsRow = {
  organization_id: string;
  purchase_goods_tds_enabled: boolean;
  transporter_tds_enabled: boolean;
  gst_tds_enabled: boolean;
};

export const DEFAULT_PURCHASE_ACCOUNTING_SETTINGS: PurchaseAccountingSettings = {
  purchaseGoodsTdsEnabled: false,
  transporterTdsEnabled: false,
  gstTdsEnabled: false,
};

const DEFAULT_ORG_ID = "default";
const CACHE_TTL_MS = 60_000;

const cache = new Map<
  string,
  { value: PurchaseAccountingSettings; expiresAt: number }
>();
const pendingReads = new Map<
  string,
  Promise<PurchaseAccountingSettings>
>();

function fromRow(
  row: PurchaseAccountingSettingsRow | null
): PurchaseAccountingSettings {
  if (!row) return { ...DEFAULT_PURCHASE_ACCOUNTING_SETTINGS };
  return {
    purchaseGoodsTdsEnabled: Boolean(row.purchase_goods_tds_enabled),
    transporterTdsEnabled: Boolean(row.transporter_tds_enabled),
    gstTdsEnabled: Boolean(row.gst_tds_enabled),
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const record = error as Record<string, unknown>;
  return [record.message, record.details, record.hint, record.code]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export function isPurchaseAccountingSettingsSchemaMissing(error: unknown) {
  return /purchase_accounting_settings|schema cache|does not exist|PGRST205/i.test(
    serializeError(error)
  );
}

function readCached(orgId: string) {
  const cached = cache.get(orgId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(orgId);
    return null;
  }
  return cached.value;
}

function storeCached(orgId: string, value: PurchaseAccountingSettings) {
  cache.set(orgId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function readFromDatabase(orgId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("purchase_accounting_settings")
    .select(
      "organization_id, purchase_goods_tds_enabled, transporter_tds_enabled, gst_tds_enabled"
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;

  const settings = fromRow(data as PurchaseAccountingSettingsRow | null);
  storeCached(orgId, settings);
  return settings;
}

export async function getPurchaseAccountingSettings(
  orgId: string = DEFAULT_ORG_ID
) {
  const cached = readCached(orgId);
  if (cached) return cached;

  const pending = pendingReads.get(orgId);
  if (pending) return pending;

  const read = readFromDatabase(orgId).finally(() => pendingReads.delete(orgId));
  pendingReads.set(orgId, read);
  return read;
}

export async function getPurchaseAccountingSettingsOrDefaults(
  orgId: string = DEFAULT_ORG_ID
) {
  try {
    return await getPurchaseAccountingSettings(orgId);
  } catch (error) {
    if (isPurchaseAccountingSettingsSchemaMissing(error)) {
      return { ...DEFAULT_PURCHASE_ACCOUNTING_SETTINGS };
    }
    throw error;
  }
}

export async function savePurchaseAccountingSettings(
  settings: PurchaseAccountingSettings,
  orgId: string = DEFAULT_ORG_ID
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("purchase_accounting_settings")
    .upsert(
      {
        organization_id: orgId,
        purchase_goods_tds_enabled: settings.purchaseGoodsTdsEnabled,
        transporter_tds_enabled: settings.transporterTdsEnabled,
        gst_tds_enabled: settings.gstTdsEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    )
    .select(
      "organization_id, purchase_goods_tds_enabled, transporter_tds_enabled, gst_tds_enabled"
    )
    .single();
  if (error) throw error;

  const saved = fromRow(data as PurchaseAccountingSettingsRow);
  storeCached(orgId, saved);
  return saved;
}
