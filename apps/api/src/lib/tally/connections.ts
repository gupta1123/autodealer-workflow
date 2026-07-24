import { createHash, randomBytes, randomInt } from "node:crypto";

export type TallyConnectionStatus =
  | "not_connected"
  | "waiting_for_bridge"
  | "bridge_connected"
  | "tally_reachable"
  | "company_loaded"
  | "connection_error";

export type TallyConnectionRow = {
  id: string;
  owner_user_id: string;
  display_name: string;
  status: TallyConnectionStatus;
  tally_url: string;
  pairing_code_hash: string | null;
  pairing_code_expires_at: string | null;
  paired_at: string | null;
  bridge_name: string | null;
  bridge_version: string | null;
  bridge_machine_id: string | null;
  last_heartbeat_at: string | null;
  last_tested_at: string | null;
  last_tally_reachable: boolean | null;
  last_company_loaded: boolean | null;
  last_company_name: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const PAIRING_CODE_TTL_MINUTES = 10;

export function connectorSupportsReliableActiveCompany(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 0 || minor > 1 || (minor === 1 && patch >= 20);
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createPairingCode() {
  return String(randomInt(100000, 1000000));
}

export function createBridgeToken() {
  return randomBytes(32).toString("base64url");
}

export function createPairingExpiry() {
  return new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

export function serializeTallyConnection(row: TallyConnectionRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    tallyUrl: row.tally_url,
    pairingCodeExpiresAt: row.pairing_code_expires_at,
    pairedAt: row.paired_at,
    bridgeName: row.bridge_name,
    bridgeVersion: row.bridge_version,
    bridgeMachineId: row.bridge_machine_id,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastTestedAt: row.last_tested_at,
    lastTallyReachable: row.last_tally_reachable,
    lastCompanyLoaded: row.last_company_loaded,
    lastCompanyName: row.last_company_name,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeTallyConnectionStatus(row: TallyConnectionRow) {
  const lastHeartbeatAt = row.last_heartbeat_at
    ? new Date(row.last_heartbeat_at).getTime()
    : 0;
  const bridgeStale = !lastHeartbeatAt || Date.now() - lastHeartbeatAt > 45_000;
  const companyDetectionReliable = connectorSupportsReliableActiveCompany(row.bridge_version);
  const connectorUpdateRequired =
    !bridgeStale && Boolean(row.paired_at) && !companyDetectionReliable;
  const effectiveStatus: TallyConnectionStatus =
    row.status === "waiting_for_bridge" || row.status === "not_connected"
      ? row.status
      : connectorUpdateRequired
        ? "connection_error"
      : bridgeStale
        ? "waiting_for_bridge"
        : row.status;

  return {
    ...serializeTallyConnection(row),
    // Reachability and active-company state are observations from a specific
    // connector/Tally session. Once its heartbeat is stale they are no longer
    // facts about the currently running instance.
    lastCompanyName:
      bridgeStale || !companyDetectionReliable ? null : row.last_company_name,
    lastError: connectorUpdateRequired
      ? "Connector update required. Reconnect using the latest Kalika Tally Connector."
      : row.last_error,
    status: effectiveStatus,
    bridgeConnected:
      !bridgeStale && companyDetectionReliable && Boolean(row.paired_at),
    tallyReachable:
      !bridgeStale && companyDetectionReliable && row.last_tally_reachable === true,
    companyLoaded:
      !bridgeStale && companyDetectionReliable && row.last_company_loaded === true,
    heartbeatStale: Boolean(row.paired_at) && bridgeStale,
    connectorUpdateRequired,
  };
}
