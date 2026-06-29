import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createBridgeToken,
  createPairingCode,
  createPairingExpiry,
  hashSecret,
  type TallyConnectionRow,
  type TallyConnectionStatus,
} from "@/lib/tally/connections";
import type {
  TallyBridgeCommandRow,
  TallyBridgeCommandType,
} from "@/lib/tally/commands";
import {
  normalizeMasterInput,
  type TallyMasterInput,
  type TallyMasterRow,
  type TallyMasterType,
} from "@/lib/tally/masters";
import { LEGACY_LOCAL_USER_IDS, LOCAL_USER_ID } from "./mode";

type LocalConnectionRow = TallyConnectionRow & {
  bridge_token_hash: string | null;
};

type LocalState = {
  connections: LocalConnectionRow[];
  commands: TallyBridgeCommandRow[];
  events: Record<string, unknown>[];
  masters?: TallyMasterRow[];
  masterSyncRuns?: Record<string, unknown>[];
};

const STORE_PATH = path.join(process.cwd(), ".local-data", "tally-store.json");
const STORE_BACKUP_PATH = `${STORE_PATH}.bak`;

let pendingWrite = Promise.resolve();
let pendingMutation: Promise<unknown> = Promise.resolve();

const CONNECTION_FIELDS = [
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
] as const;

function normalizeLocalOwnerUserId(ownerUserId: unknown) {
  return typeof ownerUserId === "string" && LEGACY_LOCAL_USER_IDS.has(ownerUserId)
    ? LOCAL_USER_ID
    : ownerUserId;
}

function emptyState(): LocalState {
  return { connections: [], commands: [], events: [], masters: [], masterSyncRuns: [] };
}

function normalizeState(state: Partial<LocalState>): LocalState {
  return {
    connections: (state.connections ?? []).map((connection) => ({
      ...connection,
      owner_user_id: normalizeLocalOwnerUserId(connection.owner_user_id) as string,
    })),
    commands: (state.commands ?? []).map((command) => ({
      ...command,
      owner_user_id: normalizeLocalOwnerUserId(command.owner_user_id) as string,
    })),
    events: (state.events ?? []).map((event) => ({
      ...event,
      owner_user_id: normalizeLocalOwnerUserId(event.owner_user_id),
    })),
    masters: (state.masters ?? []).map((master) => ({
      ...master,
      owner_user_id: normalizeLocalOwnerUserId(master.owner_user_id) as string,
    })),
    masterSyncRuns: (state.masterSyncRuns ?? []).map((run) => ({
      ...run,
      owner_user_id: normalizeLocalOwnerUserId(run.owner_user_id),
    })),
  };
}

async function readState(): Promise<LocalState> {
  try {
    return normalizeState(JSON.parse(await readFile(STORE_PATH, "utf8")) as LocalState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState();
    }

    try {
      const backupState = normalizeState(JSON.parse(await readFile(STORE_BACKUP_PATH, "utf8")) as LocalState);
      console.warn("Recovered local Tally store from backup after primary store read failed.", error);
      return backupState;
    } catch (backupError) {
      console.warn("Local Tally store is unreadable; starting with an empty local state.", { error, backupError });
      return emptyState();
    }
  }
}

async function writeState(state: LocalState) {
  const write = pendingWrite.then(async () => {
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    const payload = `${JSON.stringify(state, null, 2)}\n`;
    const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;

    try {
      await copyFile(STORE_PATH, STORE_BACKUP_PATH);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, STORE_PATH);
  });

  pendingWrite = write.catch(() => undefined);
  return write;
}

type StateUpdateResult = { result: unknown; write?: boolean };

async function updateState<Operation extends (state: LocalState) => Promise<StateUpdateResult> | StateUpdateResult>(
  operation: Operation
): Promise<Awaited<ReturnType<Operation>>["result"]> {
  const mutation = pendingMutation.then(async () => {
    const state = await readState();
    const { result, write = true } = await operation(state);
    if (write) {
      await writeState(state);
    }
    return result as Awaited<ReturnType<Operation>>["result"];
  });

  pendingMutation = mutation.catch(() => undefined);
  return mutation;
}

function publicConnection(row: LocalConnectionRow): TallyConnectionRow {
  return Object.fromEntries(CONNECTION_FIELDS.map((field) => [field, row[field]])) as TallyConnectionRow;
}

function nowIso() {
  return new Date().toISOString();
}

export async function listLocalTallyConnections(ownerUserId = LOCAL_USER_ID) {
  const state = await readState();
  return state.connections
    .filter((connection) => connection.owner_user_id === ownerUserId)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .map(publicConnection);
}

export async function createLocalTallyConnection(input: {
  displayName: string;
  tallyUrl: string;
  ownerUserId?: string;
}) {
  return updateState((state) => {
    const createdAt = nowIso();
    const pairingCode = createPairingCode();
    const row: LocalConnectionRow = {
      id: randomUUID(),
      owner_user_id: input.ownerUserId ?? LOCAL_USER_ID,
      display_name: input.displayName,
      status: "waiting_for_bridge",
      tally_url: input.tallyUrl,
      pairing_code_hash: hashSecret(pairingCode),
      pairing_code_expires_at: createPairingExpiry(),
      paired_at: null,
      bridge_token_hash: null,
      bridge_name: null,
      bridge_version: null,
      bridge_machine_id: null,
      last_heartbeat_at: null,
      last_tested_at: null,
      last_tally_reachable: null,
      last_company_loaded: null,
      last_company_name: null,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    state.connections.unshift(row);
    return { result: { connection: publicConnection(row), pairingCode } };
  });
}

export async function getLocalTallyConnection(connectionId: string, ownerUserId = LOCAL_USER_ID) {
  const state = await readState();
  const row = state.connections.find(
    (connection) => connection.id === connectionId && connection.owner_user_id === ownerUserId
  );
  return row ? publicConnection(row) : null;
}

export async function pairLocalTallyConnection(input: {
  connectionId: string;
  pairingCode: string;
  bridgeName: string;
  bridgeVersion: string;
  bridgeMachineId: string;
}) {
  return updateState((state) => {
    const row = state.connections.find((connection) => connection.id === input.connectionId);
    if (!row) return { result: { error: "Tally connection not found.", status: 404 as const }, write: false };
    if (!row.pairing_code_hash || !row.pairing_code_expires_at) {
      return {
        result: { error: "This connection does not have an active pairing code.", status: 409 as const },
        write: false,
      };
    }
    if (new Date(row.pairing_code_expires_at).getTime() <= Date.now()) {
      row.pairing_code_hash = null;
      row.pairing_code_expires_at = null;
      row.status = "waiting_for_bridge";
      row.last_error = "Pairing code expired.";
      row.updated_at = nowIso();
      return { result: { error: "Pairing code expired.", status: 410 as const } };
    }
    if (hashSecret(input.pairingCode) !== row.pairing_code_hash) {
      return { result: { error: "Invalid pairing code.", status: 401 as const }, write: false };
    }

    const bridgeToken = createBridgeToken();
    const now = nowIso();
    row.status = "bridge_connected";
    row.pairing_code_hash = null;
    row.pairing_code_expires_at = null;
    row.paired_at = now;
    row.bridge_token_hash = hashSecret(bridgeToken);
    row.bridge_name = input.bridgeName;
    row.bridge_version = input.bridgeVersion;
    row.bridge_machine_id = input.bridgeMachineId;
    row.last_heartbeat_at = now;
    row.last_error = null;
    row.updated_at = now;

    return { result: { connection: publicConnection(row), bridgeToken } };
  });
}

export async function getLocalConnectionForBridge(connectionId: string, token: string) {
  const state = await readState();
  const row = state.connections.find((connection) => connection.id === connectionId);
  if (!row?.bridge_token_hash || hashSecret(token) !== row.bridge_token_hash) {
    return null;
  }
  return row;
}

export async function updateLocalTallyHeartbeat(input: {
  connectionId: string;
  token: string;
  status: TallyConnectionStatus;
  tallyUrl?: string | null;
  bridgeVersion?: string | null;
  tallyReachable: boolean;
  companyLoaded: boolean;
  companyName?: string | null;
  error?: string | null;
}) {
  return updateState((state) => {
    const row = state.connections.find((connection) => connection.id === input.connectionId);
    if (!row?.bridge_token_hash || hashSecret(input.token) !== row.bridge_token_hash) {
      return { result: null, write: false };
    }

    const now = nowIso();
    row.status = input.status;
    row.tally_url = input.tallyUrl || row.tally_url;
    row.bridge_version = input.bridgeVersion || row.bridge_version;
    row.last_heartbeat_at = now;
    row.last_tested_at = now;
    row.last_tally_reachable = input.tallyReachable;
    row.last_company_loaded = input.companyLoaded;
    row.last_company_name = input.companyName || null;
    row.last_error = input.error || null;
    row.updated_at = now;
    return { result: publicConnection(row) };
  });
}

export async function disconnectLocalTallyConnection(connectionId: string, ownerUserId = LOCAL_USER_ID) {
  return updateState((state) => {
    const row = state.connections.find(
      (connection) => connection.id === connectionId && connection.owner_user_id === ownerUserId
    );
    if (!row) return { result: null, write: false };

    row.status = "waiting_for_bridge";
    row.pairing_code_hash = null;
    row.pairing_code_expires_at = null;
    row.bridge_token_hash = null;
    row.paired_at = null;
    row.bridge_name = null;
    row.bridge_version = null;
    row.bridge_machine_id = null;
    row.last_heartbeat_at = null;
    row.last_tested_at = null;
    row.last_tally_reachable = null;
    row.last_company_loaded = null;
    row.last_company_name = null;
    row.last_error = "Disconnected by user.";
    row.updated_at = nowIso();
    return { result: publicConnection(row) };
  });
}

export async function createLocalTallyCommand(input: {
  connectionId: string;
  ownerUserId?: string;
  commandType: TallyBridgeCommandType;
  payload: Record<string, unknown>;
  priority?: number;
}) {
  return updateState((state) => {
    const now = nowIso();
    const command: TallyBridgeCommandRow = {
      id: randomUUID(),
      connection_id: input.connectionId,
      owner_user_id: input.ownerUserId ?? LOCAL_USER_ID,
      command_type: input.commandType,
      status: "queued",
      priority: input.priority ?? 10,
      payload: input.payload,
      result: null,
      error: null,
      attempts: 0,
      max_attempts: 3,
      available_at: now,
      claimed_at: null,
      completed_at: null,
      bridge_version: null,
      created_at: now,
      updated_at: now,
    };
    state.commands.unshift(command);
    return { result: command };
  });
}

export async function listLocalTallyCommands(input: {
  connectionId: string;
  ownerUserId?: string;
  ids?: string[];
  limit?: number;
}) {
  const state = await readState();
  const ids = new Set(input.ids ?? []);
  return state.commands
    .filter((command) => command.connection_id === input.connectionId)
    .filter((command) => command.owner_user_id === (input.ownerUserId ?? LOCAL_USER_ID))
    .filter((command) => ids.size === 0 || ids.has(command.id))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, input.limit ?? 20);
}

export async function claimNextLocalTallyCommand(input: {
  connectionId: string;
  token: string;
  bridgeVersion?: string | null;
}) {
  return updateState((state) => {
    const row = state.connections.find((connection) => connection.id === input.connectionId);
    if (!row?.bridge_token_hash || hashSecret(input.token) !== row.bridge_token_hash) {
      return { result: { unauthorized: true, command: null }, write: false };
    }

    const now = nowIso();
    const command = state.commands
      .filter((entry) => entry.connection_id === input.connectionId)
      .filter((entry) => entry.status === "queued")
      .filter((entry) => entry.available_at <= now)
      .sort((left, right) => right.priority - left.priority || left.created_at.localeCompare(right.created_at))[0];

    if (!command) return { result: { command: null }, write: false };

    command.status = "claimed";
    command.claimed_at = now;
    command.attempts += 1;
    command.bridge_version = input.bridgeVersion ?? null;
    command.updated_at = now;
    return { result: { command } };
  });
}

export async function completeLocalTallyCommand(input: {
  connectionId: string;
  token: string;
  commandId: string;
  success: boolean;
  result: Record<string, unknown>;
  error: string | null;
}) {
  return updateState((state) => {
    const row = state.connections.find((connection) => connection.id === input.connectionId);
    if (!row?.bridge_token_hash || hashSecret(input.token) !== row.bridge_token_hash) {
      return { result: { unauthorized: true, command: null }, write: false };
    }

    const command = state.commands.find(
      (entry) => entry.id === input.commandId && entry.connection_id === input.connectionId
    );
    if (!command) return { result: { command: null }, write: false };

    command.status = input.success ? "succeeded" : "failed";
    command.result = input.result;
    command.error = input.error;
    command.completed_at = nowIso();
    command.updated_at = command.completed_at;
    return { result: { command } };
  });
}

export async function syncLocalTallyMasters(input: {
  connectionId: string;
  token: string;
  companyName?: string | null;
  bridgeVersion?: string | null;
  masters: Record<string, TallyMasterInput[]>;
  masterTypesByPayloadKey: Record<string, TallyMasterType>;
}) {
  return updateState((state) => {
    const row = state.connections.find((connection) => connection.id === input.connectionId);
    if (!row?.bridge_token_hash || hashSecret(input.token) !== row.bridge_token_hash) {
      return { result: { unauthorized: true as const, result: null }, write: false };
    }

    const now = nowIso();
    const syncRunId = randomUUID();
    const totals: Record<string, number> = {};
    const syncedTypes = new Set<TallyMasterType>();
    const rows: TallyMasterRow[] = [];

    for (const [payloadKey, masterType] of Object.entries(input.masterTypesByPayloadKey)) {
      const items = Array.isArray(input.masters[payloadKey]) ? input.masters[payloadKey] : [];
      totals[masterType] = items.length;
      if (items.length > 0) {
        syncedTypes.add(masterType);
      }

      for (const item of items) {
        const normalized = normalizeMasterInput(masterType, item);
        if (!normalized) continue;

        rows.push({
          id: randomUUID(),
          connection_id: row.id,
          owner_user_id: row.owner_user_id,
          sync_run_id: syncRunId,
          ...normalized,
          is_active: true,
          last_synced_at: now,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const existingMasters = state.masters ?? [];
    const incomingKeys = new Set(rows.map((master) => `${master.connection_id}:${master.master_key}`));
    state.masters = [
      ...existingMasters
        .map((master) =>
          master.connection_id === row.id && syncedTypes.has(master.master_type)
            ? { ...master, is_active: false, last_synced_at: now, updated_at: now }
            : master
        )
        .filter((master) => !incomingKeys.has(`${master.connection_id}:${master.master_key}`)),
      ...rows,
    ];
    state.masterSyncRuns = [
      {
        id: syncRunId,
        connection_id: row.id,
        owner_user_id: row.owner_user_id,
        status: "completed",
        company_name: input.companyName ?? null,
        bridge_version: input.bridgeVersion ?? null,
        totals,
        error: null,
        completed_at: now,
        created_at: now,
        updated_at: now,
      },
      ...(state.masterSyncRuns ?? []),
    ];
    state.events.unshift({
      connection_id: row.id,
      owner_user_id: row.owner_user_id,
      event_type: "masters_synced",
      message: "Tally masters synced from bridge.",
      payload: { totals, syncRunId, companyName: input.companyName ?? null },
      created_at: now,
    });

    return {
      result: {
        unauthorized: false as const,
        result: {
          syncRunId,
          totals,
          accepted: rows.length,
          masters: rows,
        },
      },
    };
  });
}

export async function listLocalTallyMasters(input: {
  connectionId: string;
  ownerUserId?: string;
  masterType?: TallyMasterType | null;
  query?: string;
  limit?: number;
}) {
  const state = await readState();
  const ownerUserId = input.ownerUserId ?? LOCAL_USER_ID;
  const query = (input.query ?? "").trim().toLowerCase();
  const masters = (state.masters ?? [])
    .filter((master) => master.connection_id === input.connectionId)
    .filter((master) => master.owner_user_id === ownerUserId)
    .filter((master) => master.is_active)
    .filter((master) => !input.masterType || master.master_type === input.masterType)
    .filter((master) => !query || master.tally_name.toLowerCase().includes(query))
    .sort((left, right) => {
      const typeCompare = left.master_type.localeCompare(right.master_type);
      return typeCompare || left.tally_name.localeCompare(right.tally_name);
    })
    .slice(0, input.limit ?? 100);

  const latestSync =
    (state.masterSyncRuns ?? [])
      .filter((run) => run.connection_id === input.connectionId)
      .filter((run) => run.owner_user_id === ownerUserId)
      .sort((left, right) =>
        String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""))
      )[0] ?? null;

  return { masters, latestSync };
}
