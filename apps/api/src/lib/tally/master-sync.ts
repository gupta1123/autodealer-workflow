import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  serializeTallyBridgeCommand,
  type TallyBridgeCommandRow,
} from "@/lib/tally/commands";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SyncRunRow = {
  id: string;
  status: string;
  company_name: string | null;
  totals: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
};

export const DEFAULT_MASTER_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_MASTER_SYNC_TYPES = [
  "ledger",
  "group",
  "voucher_type",
  "gst_ledger",
  "tax_ledger",
];

export type TallyMasterSyncDecision = {
  shouldSync: boolean;
  queued: boolean;
  pending: boolean;
  reason: string;
  activeLedgerCount: number;
  latestSyncCompletedAt: string | null;
  command: ReturnType<typeof serializeTallyBridgeCommand> | null;
};

function normalizeCompanyName(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function syncIsStale(completedAt: string | null, staleAfterMs: number) {
  if (!completedAt) return true;
  const completedTime = new Date(completedAt).getTime();
  if (!Number.isFinite(completedTime)) return true;
  return Date.now() - completedTime > staleAfterMs;
}

function resolveSyncReason(input: {
  activeLedgerCount: number;
  latestSync: SyncRunRow | null;
  companyName?: string | null;
  force: boolean;
  staleAfterMs: number;
  reason?: string;
}) {
  if (input.force) return input.reason || "forced_sync";
  if (input.activeLedgerCount <= 0) return "no_synced_ledgers";
  if (!input.latestSync?.completed_at) return "no_completed_sync";

  const currentCompanyName = normalizeCompanyName(input.companyName);
  const syncedCompanyName = normalizeCompanyName(input.latestSync.company_name);
  if (currentCompanyName && syncedCompanyName && currentCompanyName !== syncedCompanyName) {
    return "company_changed";
  }

  if (syncIsStale(input.latestSync.completed_at, input.staleAfterMs)) {
    return input.reason || "stale_sync";
  }

  return null;
}

export async function queueTallyMasterSyncCommand(input: {
  supabase: SupabaseAdminClient;
  connectionId: string;
  ownerUserId: string;
  companyName?: string | null;
  requestedMasterTypes?: string[];
  force?: boolean;
  staleAfterMs?: number;
  priority?: number;
  reason?: string;
}): Promise<TallyMasterSyncDecision> {
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_MASTER_SYNC_STALE_MS;

  const { count: activeLedgerCount, error: countError } = await input.supabase
    .from("tally_masters")
    .select("id", { count: "exact", head: true })
    .eq("connection_id", input.connectionId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("master_type", "ledger")
    .eq("is_active", true);

  if (countError) throw countError;

  const { data: latestSyncData, error: latestSyncError } = await input.supabase
    .from("tally_master_sync_runs")
    .select("id, status, company_name, totals, completed_at, created_at")
    .eq("connection_id", input.connectionId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSyncError) throw latestSyncError;

  const latestSync = (latestSyncData ?? null) as SyncRunRow | null;
  const activeCount = activeLedgerCount ?? 0;
  const reason = resolveSyncReason({
    activeLedgerCount: activeCount,
    latestSync,
    companyName: input.companyName,
    force: input.force === true,
    staleAfterMs,
    reason: input.reason,
  });

  if (!reason) {
    return {
      shouldSync: false,
      queued: false,
      pending: false,
      reason: "fresh",
      activeLedgerCount: activeCount,
      latestSyncCompletedAt: latestSync?.completed_at ?? null,
      command: null,
    };
  }

  const { data: pendingCommandData, error: pendingCommandError } = await input.supabase
    .from("tally_bridge_commands")
    .select("*")
    .eq("connection_id", input.connectionId)
    .eq("owner_user_id", input.ownerUserId)
    .eq("command_type", "sync_masters")
    .in("status", ["queued", "claimed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingCommandError) throw pendingCommandError;

  if (pendingCommandData) {
    return {
      shouldSync: true,
      queued: false,
      pending: true,
      reason: "sync_already_pending",
      activeLedgerCount: activeCount,
      latestSyncCompletedAt: latestSync?.completed_at ?? null,
      command: serializeTallyBridgeCommand(pendingCommandData as unknown as TallyBridgeCommandRow),
    };
  }

  const requestedMasterTypes =
    input.requestedMasterTypes && input.requestedMasterTypes.length > 0
      ? input.requestedMasterTypes
      : DEFAULT_MASTER_SYNC_TYPES;
  const payload = {
    companyName: input.companyName ?? null,
    requestedMasterTypes,
    mode: "ledger_accuracy",
    reason,
  };

  const { data: commandData, error: commandError } = await input.supabase
    .from("tally_bridge_commands")
    .insert({
      connection_id: input.connectionId,
      owner_user_id: input.ownerUserId,
      command_type: "sync_masters",
      status: "queued",
      priority: input.priority ?? 15,
      payload,
    })
    .select("*")
    .single();

  if (commandError) throw commandError;

  await input.supabase.from("tally_connection_events").insert({
    connection_id: input.connectionId,
    owner_user_id: input.ownerUserId,
    event_type: "command_queued",
    message: "Tally master sync queued for bridge.",
    payload: {
      commandType: "sync_masters",
      companyName: input.companyName ?? null,
      requestedMasterTypes,
      reason,
    },
  });

  return {
    shouldSync: true,
    queued: true,
    pending: false,
    reason,
    activeLedgerCount: activeCount,
    latestSyncCompletedAt: latestSync?.completed_at ?? null,
    command: serializeTallyBridgeCommand(commandData as unknown as TallyBridgeCommandRow),
  };
}
