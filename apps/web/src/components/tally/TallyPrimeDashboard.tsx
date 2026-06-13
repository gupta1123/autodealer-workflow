"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Database,
  Link2,
  Loader2,
  Pencil,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TallyConnection = {
  id: string;
  displayName: string;
  status: string;
  tallyUrl: string;
  pairingCodeExpiresAt: string | null;
  pairedAt: string | null;
  bridgeName: string | null;
  bridgeVersion: string | null;
  bridgeMachineId: string | null;
  lastHeartbeatAt: string | null;
  lastTestedAt: string | null;
  lastTallyReachable: boolean | null;
  lastCompanyLoaded: boolean | null;
  lastCompanyName: string | null;
  lastError: string | null;
  bridgeConnected?: boolean;
  tallyReachable?: boolean;
  companyLoaded?: boolean;
  heartbeatStale?: boolean;
};

type ConnectionsResponse = {
  connections?: TallyConnection[];
  error?: string;
};

type CreateConnectionResponse = {
  connection?: TallyConnection;
  pairingCode?: string;
  error?: string;
};

type StatusResponse = {
  connection?: TallyConnection;
  error?: string;
};

type TallyMaster = {
  id: string;
  type: string;
  key: string;
  guid: string | null;
  name: string;
  parent: string | null;
  gstin: string | null;
  hsnCode: string | null;
  unitName: string | null;
  taxRate: number | null;
  lastSyncedAt: string;
};

type TallyMapping = {
  id: string;
  mappingType: string;
  sourceKey: string;
  sourceLabel: string;
  targetMasterType: string;
  targetMasterKey: string;
  targetMasterName: string;
  status: string;
  notes: string | null;
  updatedAt: string;
};

type TallyCommand = {
  id: string;
  commandType: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type TallyMasterHealthIssue = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  recommendation: string;
  confidence: number;
  masters: TallyMaster[];
};

type TallyMasterHealthResponse = {
  summary?: {
    totalLedgers: number;
    totalGstLedgers: number;
    issueCount: number;
    criticalCount: number;
    warningCount: number;
    score: number;
  };
  issues?: TallyMasterHealthIssue[];
  error?: string;
};

type MastersResponse = {
  masters?: TallyMaster[];
  latestSync?: {
    id: string;
    status: string;
    company_name: string | null;
    totals: Record<string, number>;
    error: string | null;
    completed_at: string;
  } | null;
  error?: string;
};

type MappingsResponse = {
  mappings?: TallyMapping[];
  mapping?: TallyMapping;
  error?: string;
};

type CommandsResponse = {
  commands?: TallyCommand[];
  command?: TallyCommand;
  error?: string;
};

const MASTER_TYPES = [
  { value: "ledger", label: "Ledgers" },
  { value: "gst_ledger", label: "GST ledgers" },
  { value: "voucher_type", label: "Voucher types" },
  { value: "group", label: "Groups" },
];

const MAPPING_TYPES = [
  { value: "supplier_gstin", label: "Supplier GSTIN", target: "ledger" },
  { value: "buyer_gstin", label: "Buyer GSTIN", target: "ledger" },
  { value: "gst_rate", label: "GST rate", target: "gst_ledger" },
  { value: "freight_ledger", label: "Freight ledger", target: "ledger" },
  { value: "round_off_ledger", label: "Round-off ledger", target: "ledger" },
  { value: "voucher_type", label: "Voucher type", target: "voucher_type" },
];

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

function formatTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(connection?: TallyConnection | null) {
  if (!connection) return "Not connected";
  if (connection.status === "company_loaded") return "Company loaded";
  if (connection.status === "tally_reachable") return "Tally reachable";
  if (connection.status === "bridge_connected") return "Bridge connected";
  if (connection.status === "connection_error") return "Connection error";
  if (connection.status === "waiting_for_bridge") return "Waiting for bridge";
  return "Not connected";
}

function getStatusTone(connection?: TallyConnection | null) {
  if (!connection) return "neutral";
  if (connection.status === "company_loaded") return "success";
  if (connection.status === "tally_reachable" || connection.status === "bridge_connected") return "warning";
  if (connection.status === "connection_error") return "error";
  return "neutral";
}

function humanizeType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCommandSummary(command: TallyCommand) {
  if (command.commandType === "sync_masters") {
    const companyName = command.payload.companyName as string | undefined;
    return companyName ? `Sync masters for ${companyName}` : "Sync masters from Tally";
  }

  if (command.commandType === "alter_ledger") {
    const oldName = command.payload.oldName as string | undefined;
    const newName = command.payload.newName as string | undefined;
    if (oldName && newName) return `${oldName} -> ${newName}`;
    if (newName) return `Rename ledger to ${newName}`;
  }

  return "Tally command";
}

function getHealthScoreTone(score?: number) {
  if (score === undefined) return "neutral";
  if (score >= 85) return "success";
  if (score >= 65) return "warning";
  return "error";
}

function StatusCard({
  title,
  value,
  ok,
  detail,
}: {
  title: string;
  value: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5ddd0] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
            {title}
          </div>
          <div className="mt-2 text-sm font-bold text-[#1a1a1a]">{value}</div>
          <div className="mt-1 text-xs font-medium text-[#8a7f72]">{detail}</div>
        </div>
        {ok ? (
          <CheckCircle2 className="h-5 w-5 text-[#059669]" />
        ) : (
          <TriangleAlert className="h-5 w-5 text-[#d97706]" />
        )}
      </div>
    </div>
  );
}

export function TallyPrimeDashboard() {
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [masters, setMasters] = useState<TallyMaster[]>([]);
  const [mappings, setMappings] = useState<TallyMapping[]>([]);
  const [commands, setCommands] = useState<TallyCommand[]>([]);
  const [masterHealth, setMasterHealth] = useState<TallyMasterHealthResponse | null>(null);
  const [latestSync, setLatestSync] = useState<MastersResponse["latestSync"]>(null);
  const [masterType, setMasterType] = useState("ledger");
  const [masterSearch, setMasterSearch] = useState("");
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [syncingMasters, setSyncingMasters] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [queueingCommand, setQueueingCommand] = useState(false);
  const [mappingType, setMappingType] = useState("supplier_gstin");
  const [sourceKey, setSourceKey] = useState("");
  const [targetMasterKey, setTargetMasterKey] = useState("");
  const [editingMasterId, setEditingMasterId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedConnection =
    connections.find((connection) => connection.id === selectedId) ?? connections[0] ?? null;
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const bridgePairCommand =
    selectedConnection && pairingCode
      ? `npm run tally-bridge:pair -- --api-base ${apiBaseUrl} --connection-id ${selectedConnection.id} --pairing-code ${pairingCode}`
      : "";
  const bridgeStartCommand = "npm run tally-bridge:start";
  const statusTone = getStatusTone(selectedConnection);
  const mappingDefinition = MAPPING_TYPES.find((type) => type.value === mappingType) ?? MAPPING_TYPES[0];
  const targetOptions = masters.filter((master) => master.type === mappingDefinition.target);
  const selectedTarget = targetOptions.find((master) => master.key === targetMasterKey) ?? null;
  const canWriteToTally =
    selectedConnection?.bridgeConnected === true &&
    selectedConnection.lastTallyReachable === true &&
    selectedConnection.lastCompanyLoaded === true;
  const canQueueBridgeCommand = selectedConnection?.bridgeConnected === true;
  const healthSummary = masterHealth?.summary;
  const healthIssues = masterHealth?.issues ?? [];
  const healthTone = getHealthScoreTone(healthSummary?.score);

  async function loadConnections(options?: { quiet?: boolean }) {
    try {
      if (!options?.quiet) {
        setLoading(true);
      }
      const response = await apiFetch("/api/tally/connections", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as ConnectionsResponse;
      const nextConnections = payload.connections ?? [];
      setConnections(nextConnections);
      setSelectedId((current) =>
        nextConnections.some((connection) => connection.id === current)
          ? current
          : nextConnections[0]?.id || ""
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load Tally connections.",
      });
    } finally {
      setLoading(false);
    }
  }

  const refreshStatus = useCallback(async (connectionId: string) => {
    if (!connectionId) return;

    try {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/status`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as StatusResponse;
      if (!payload.connection) return;

      setConnections((current) =>
        current.map((connection) =>
          connection.id === payload.connection?.id ? payload.connection : connection
        )
      );
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to refresh Tally status.",
      });
    }
  }, []);

  async function createConnection() {
    try {
      setCreating(true);
      setMessage(null);
      const response = await apiFetch("/api/tally/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Tally Prime",
          tallyUrl: "http://localhost:9000",
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CreateConnectionResponse;
      if (!payload.connection || !payload.pairingCode) {
        throw new Error("Connection created, but pairing details were missing.");
      }

      setConnections((current) => [payload.connection as TallyConnection, ...current]);
      setSelectedId(payload.connection.id);
      setPairingCode(payload.pairingCode);
      setMessage({
        tone: "success",
        text: "Tally connection created. Run the pairing command on the Windows machine where Tally Prime is installed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to create Tally connection.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function requestTest() {
    if (!selectedConnection) return;

    try {
      setTesting(true);
      setMessage(null);
      const response = await apiFetch(`/api/tally/connections/${selectedConnection.id}/test`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as StatusResponse;
      if (payload.connection) {
        setConnections((current) =>
          current.map((connection) =>
            connection.id === payload.connection?.id ? payload.connection : connection
          )
        );
      }

      setMessage({
        tone: "success",
        text: "Latest Tally status refreshed. The bridge sends live test results through heartbeat.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to test Tally connection.",
      });
    } finally {
      setTesting(false);
    }
  }

  const loadMasters = useCallback(
    async (connectionId: string, options?: { quiet?: boolean }) => {
      if (!connectionId) return;

      try {
        if (!options?.quiet) {
          setLoadingMasters(true);
        }

        const params = new URLSearchParams();
        params.set("limit", "300");
        if (masterType) params.set("type", masterType);
        if (masterSearch.trim()) params.set("q", masterSearch.trim());

        const response = await apiFetch(`/api/tally/connections/${connectionId}/masters?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await readError(response));
        }

        const payload = (await response.json()) as MastersResponse;
        setMasters(payload.masters ?? []);
        setLatestSync(payload.latestSync ?? null);
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Failed to load Tally masters.",
        });
      } finally {
        setLoadingMasters(false);
      }
    },
    [masterSearch, masterType]
  );

  const loadMappings = useCallback(async (connectionId: string) => {
    if (!connectionId) return;

    try {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/mappings`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as MappingsResponse;
      setMappings(payload.mappings ?? []);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load Tally mappings.",
      });
    }
  }, []);

  const loadMasterHealth = useCallback(async (connectionId: string, options?: { quiet?: boolean }) => {
    if (!connectionId) return;

    try {
      if (!options?.quiet) {
        setLoadingHealth(true);
      }

      const response = await apiFetch(`/api/tally/connections/${connectionId}/master-health`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404 && options?.quiet) {
          setMasterHealth(null);
          return;
        }
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as TallyMasterHealthResponse;
      setMasterHealth(payload);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to inspect Tally master health.",
      });
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadCommands = useCallback(async (connectionId: string) => {
    if (!connectionId) return;

    try {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CommandsResponse;
      setCommands(payload.commands ?? []);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load Tally write-back commands.",
      });
    }
  }, []);

  async function requestMasterSync() {
    if (!selectedConnection) return;

    try {
      setSyncingMasters(true);
      setMessage(null);
      const response = await apiFetch(`/api/tally/connections/${selectedConnection.id}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commandType: "sync_masters",
          payload: {
            companyName: selectedConnection.lastCompanyName,
            requestedMasterTypes: ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"],
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CommandsResponse;
      if (payload.command) {
        setCommands((current) => [payload.command as TallyCommand, ...current]);
      }

      setMessage({
        tone: "success",
        text: "Master sync queued. Keep the local bridge running; it will read Tally ledgers, tax ledgers, groups, and voucher types.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to queue Tally master sync.",
      });
    } finally {
      setSyncingMasters(false);
    }
  }

  async function saveMapping() {
    if (!selectedConnection || !selectedTarget || !sourceKey.trim()) return;

    try {
      setSavingMapping(true);
      setMessage(null);
      const response = await apiFetch(`/api/tally/connections/${selectedConnection.id}/mappings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mappingType,
          sourceKey: sourceKey.trim(),
          sourceLabel: sourceKey.trim(),
          targetMasterType: selectedTarget.type,
          targetMasterKey: selectedTarget.key,
          targetMasterName: selectedTarget.name,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as MappingsResponse;
      if (payload.mapping) {
        setMappings((current) => [
          payload.mapping as TallyMapping,
          ...current.filter(
            (mapping) =>
              !(
                mapping.mappingType === payload.mapping?.mappingType &&
                mapping.sourceKey === payload.mapping?.sourceKey
              )
          ),
        ]);
      }
      setSourceKey("");
      setTargetMasterKey("");
      setMessage({ tone: "success", text: "Tally mapping saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save Tally mapping.",
      });
    } finally {
      setSavingMapping(false);
    }
  }

  function beginEditMaster(master: TallyMaster) {
    setEditingMasterId(master.id);
    setEditingName(master.name);
    setMessage(null);
  }

  function cancelEditMaster() {
    setEditingMasterId("");
    setEditingName("");
  }

  async function queueLedgerRename(master: TallyMaster) {
    if (!selectedConnection || !editingName.trim()) return;

    try {
      setQueueingCommand(true);
      setMessage(null);
      const response = await apiFetch(`/api/tally/connections/${selectedConnection.id}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commandType: "alter_ledger",
          payload: {
            masterKey: master.key,
            newName: editingName.trim(),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CommandsResponse;
      if (payload.command) {
        setCommands((current) => [payload.command as TallyCommand, ...current]);
      }

      cancelEditMaster();
      setMessage({
        tone: "success",
        text: "Tally edit queued. Keep the local bridge running; it will apply the change and report the result.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to queue Tally edit.",
      });
    } finally {
      setQueueingCommand(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage({ tone: "success", text: "Command copied." });
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (!selectedConnection) return;
    const timer = window.setInterval(() => {
      void refreshStatus(selectedConnection.id);
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [refreshStatus, selectedConnection]);

  useEffect(() => {
    if (!selectedConnection) return;
    void loadMasters(selectedConnection.id, { quiet: true });
    void loadMasterHealth(selectedConnection.id, { quiet: true });
    void loadMappings(selectedConnection.id);
    void loadCommands(selectedConnection.id);
  }, [loadCommands, loadMappings, loadMasterHealth, loadMasters, selectedConnection]);

  useEffect(() => {
    const nextDefinition = MAPPING_TYPES.find((type) => type.value === mappingType) ?? MAPPING_TYPES[0];
    setMasterType(nextDefinition.target);
    setTargetMasterKey("");
  }, [mappingType]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-y-auto">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#1a1a1a]">Tally Prime</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#8a7f72]">
            Pair a local bridge with this app, then use heartbeat status to confirm Tally Prime is reachable and a company is loaded.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
            disabled={loading}
            onClick={() => void loadConnections()}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            className="rounded-xl bg-[#1a1a1a] px-5 font-bold text-white"
            disabled={creating}
            onClick={() => void createConnection()}
            type="button"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Create Tally Connection
          </Button>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
            message.tone === "success"
              ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
              : "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-[#f3eee7]" />
          ))}
        </div>
      ) : selectedConnection ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#e5ddd0] bg-[#fafafa] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] text-white">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-[#1a1a1a]">{selectedConnection.displayName}</h3>
                    <Badge
                      className={
                        statusTone === "success"
                          ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                          : statusTone === "error"
                            ? "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
                            : statusTone === "warning"
                              ? "border-[#f59e0b]/20 bg-[#fff7e6] text-[#a16207]"
                              : "border-[#e5ddd0] bg-white text-[#8a7f72]"
                      }
                      variant="outline"
                    >
                      {getStatusLabel(selectedConnection)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#8a7f72]">
                    {selectedConnection.tallyUrl}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                  disabled={testing}
                  onClick={() => void requestTest()}
                  type="button"
                  variant="outline"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Test Connection
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              detail={`Last heartbeat: ${formatTime(selectedConnection.lastHeartbeatAt)}`}
              ok={Boolean(selectedConnection.bridgeConnected)}
              title="Bridge"
              value={selectedConnection.bridgeConnected ? "Connected" : "Waiting"}
            />
            <StatusCard
              detail={`Last test: ${formatTime(selectedConnection.lastTestedAt)}`}
              ok={selectedConnection.lastTallyReachable === true}
              title="Tally"
              value={selectedConnection.lastTallyReachable ? "Reachable" : "Not reachable"}
            />
            <StatusCard
              detail={selectedConnection.lastCompanyName || selectedConnection.lastError || "Company not detected yet"}
              ok={selectedConnection.lastCompanyLoaded === true}
              title="Company"
              value={selectedConnection.lastCompanyLoaded ? "Loaded" : "Not detected"}
            />
          </div>

          <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#8a7f72]" />
                  <h3 className="text-base font-black text-[#1a1a1a]">Ledger master health</h3>
                </div>
                <p className="mt-1 text-xs font-medium text-[#8a7f72]">
                  Finds duplicate-risk ledgers, missing GSTINs, and GST ledger setup issues before voucher posting.
                </p>
              </div>
              <Button
                className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                disabled={loadingHealth}
                onClick={() => selectedConnection && void loadMasterHealth(selectedConnection.id)}
                type="button"
                variant="outline"
              >
                {loadingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recheck
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div
                className={`rounded-xl border p-4 ${
                  healthTone === "success"
                    ? "border-[#10b981]/20 bg-[#ecfdf5]"
                    : healthTone === "error"
                      ? "border-[#ef4444]/20 bg-[#fff1f2]"
                      : healthTone === "warning"
                        ? "border-[#f59e0b]/20 bg-[#fff7e6]"
                        : "border-[#e5ddd0] bg-[#fafafa]"
                }`}
              >
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
                  Accuracy score
                </div>
                <div className="mt-2 text-2xl font-black text-[#1a1a1a]">
                  {healthSummary ? `${healthSummary.score}%` : "--"}
                </div>
              </div>
              <StatusCard
                detail="Synced ledger masters"
                ok={(healthSummary?.totalLedgers ?? 0) > 0}
                title="Ledgers"
                value={String(healthSummary?.totalLedgers ?? 0)}
              />
              <StatusCard
                detail="Critical issues"
                ok={(healthSummary?.criticalCount ?? 0) === 0}
                title="Critical"
                value={String(healthSummary?.criticalCount ?? 0)}
              />
              <StatusCard
                detail="Warnings to review"
                ok={(healthSummary?.warningCount ?? 0) === 0}
                title="Warnings"
                value={String(healthSummary?.warningCount ?? 0)}
              />
            </div>

            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-[#e5ddd0]">
              {healthIssues.length > 0 ? (
                <div className="divide-y divide-[#eee7dd]">
                  {healthIssues.map((issue) => (
                    <div key={issue.id} className="grid gap-3 p-3 text-sm lg:grid-cols-[180px_1fr]">
                      <div>
                        <Badge
                          className={
                            issue.severity === "critical"
                              ? "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
                              : issue.severity === "warning"
                                ? "border-[#f59e0b]/20 bg-[#fff7e6] text-[#a16207]"
                                : "border-[#e5ddd0] bg-white text-[#8a7f72]"
                          }
                          variant="outline"
                        >
                          {humanizeType(issue.severity)}
                        </Badge>
                        <div className="mt-2 text-xs font-medium text-[#8a7f72]">
                          Confidence {Math.round(issue.confidence * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="font-black text-[#1a1a1a]">{issue.title}</div>
                        <div className="mt-1 text-xs font-medium text-[#5f574f]">{issue.message}</div>
                        <div className="mt-2 text-xs font-bold text-[#1a1a1a]">{issue.recommendation}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {issue.masters.map((master) => (
                            <span
                              className="rounded-full border border-[#e5ddd0] bg-[#fafafa] px-2.5 py-1 text-[11px] font-bold text-[#5f574f]"
                              key={master.key}
                            >
                              {master.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm font-medium text-[#8a7f72]">
                  {healthSummary
                    ? "No obvious ledger master issues found. Keep syncing before posting new cases."
                    : "Sync Tally masters to run ledger health checks."}
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
                Pair bridge
              </div>
              {bridgePairCommand ? (
                <>
                  <pre className="overflow-x-auto rounded-lg bg-[#1a1a1a] p-3 text-xs font-semibold text-white">
                    {bridgePairCommand}
                  </pre>
                  <Button
                    className="mt-3 rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                    onClick={() => void copyText(bridgePairCommand)}
                    type="button"
                    variant="outline"
                  >
                    <Clipboard className="h-4 w-4" />
                    Copy Pair Command
                  </Button>
                  <p className="mt-3 text-xs font-medium text-[#8a7f72]">
                    The pairing code is shown only after creating a connection. It expires shortly.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-[#8a7f72]">
                  Create a new Tally connection to generate a one-time pairing command.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#8a7f72]">
                Start bridge
              </div>
              <pre className="overflow-x-auto rounded-lg bg-[#1a1a1a] p-3 text-xs font-semibold text-white">
                {bridgeStartCommand}
              </pre>
              <Button
                className="mt-3 rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                onClick={() => void copyText(bridgeStartCommand)}
                type="button"
                variant="outline"
              >
                <Clipboard className="h-4 w-4" />
                Copy Start Command
              </Button>
              <p className="mt-3 text-xs font-medium text-[#8a7f72]">
                Run this on the Windows machine where Tally Prime is open with a company loaded and port 9000 enabled.
              </p>
            </section>
          </div>

          <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#8a7f72]" />
                  <h3 className="text-base font-black text-[#1a1a1a]">Synced Tally masters</h3>
                </div>
                <p className="mt-1 text-xs font-medium text-[#8a7f72]">
                  Latest sync: {latestSync?.completed_at ? formatTime(latestSync.completed_at) : "No master sync yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-xl bg-[#1a1a1a] px-4 font-bold text-white"
                  disabled={syncingMasters || !canQueueBridgeCommand}
                  onClick={() => void requestMasterSync()}
                  type="button"
                >
                  {syncingMasters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Sync from Tally
                </Button>
                <Button
                  className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                  disabled={loadingMasters}
                  onClick={() => selectedConnection && void loadMasters(selectedConnection.id)}
                  type="button"
                  variant="outline"
                >
                  {loadingMasters ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-[220px_1fr]">
              <select
                className="h-10 rounded-xl border border-[#e5ddd0] bg-white px-3 text-sm font-bold text-[#1a1a1a]"
                onChange={(event) => setMasterType(event.target.value)}
                value={masterType}
              >
                {MASTER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8a7f72]" />
                <Input
                  className="h-10 rounded-xl border-[#e5ddd0] pl-9"
                  onChange={(event) => setMasterSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && selectedConnection) {
                      void loadMasters(selectedConnection.id);
                    }
                  }}
                  placeholder="Search synced Tally names"
                  value={masterSearch}
                />
              </div>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-[#e5ddd0]">
              {masters.length > 0 ? (
                <div className="divide-y divide-[#eee7dd]">
                  {masters.map((master) => (
                    <div key={master.id} className="grid gap-3 p-3 text-sm md:grid-cols-[1.5fr_1fr_1fr_auto]">
                      <div>
                        {editingMasterId === master.id ? (
                          <Input
                            className="h-9 rounded-lg border-[#e5ddd0]"
                            onChange={(event) => setEditingName(event.target.value)}
                            value={editingName}
                          />
                        ) : (
                          <div className="font-black text-[#1a1a1a]">{master.name}</div>
                        )}
                        <div className="text-xs font-medium text-[#8a7f72]">{humanizeType(master.type)}</div>
                      </div>
                      <div className="text-xs font-medium text-[#8a7f72]">
                        Parent: <span className="text-[#1a1a1a]">{master.parent || "None"}</span>
                      </div>
                      <div className="text-xs font-medium text-[#8a7f72]">
                        {master.gstin ? `GSTIN: ${master.gstin}` : master.hsnCode ? `HSN: ${master.hsnCode}` : master.unitName ? `Unit: ${master.unitName}` : "No extra fields"}
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        {editingMasterId === master.id ? (
                          <>
                            <Button
                              className="h-8 rounded-lg bg-[#1a1a1a] px-3 text-xs font-bold text-white"
                              disabled={
                                queueingCommand ||
                                !canWriteToTally ||
                                !editingName.trim() ||
                                editingName.trim() === master.name
                              }
                              onClick={() => void queueLedgerRename(master)}
                              type="button"
                            >
                              {queueingCommand ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              Queue Edit
                            </Button>
                            <Button
                              className="h-8 rounded-lg border-[#e5ddd0] bg-white px-2 text-[#1a1a1a] hover:bg-[#f3eee7]"
                              onClick={cancelEditMaster}
                              type="button"
                              variant="outline"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : master.type === "ledger" || master.type === "gst_ledger" ? (
                          <Button
                            className="h-8 rounded-lg border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#1a1a1a] hover:bg-[#f3eee7]"
                            disabled={!canWriteToTally}
                            onClick={() => beginEditMaster(master)}
                            type="button"
                            variant="outline"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit in Tally
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm font-medium text-[#8a7f72]">
                  No synced masters for this filter yet. Start the bridge, then use Sync from Tally.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-black text-[#1a1a1a]">Tally write-back queue</h3>
                <p className="mt-1 text-xs font-medium text-[#8a7f72]">
                  Edits made here are applied by the local bridge and tracked with a success or failure result.
                </p>
              </div>
              <Button
                className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                onClick={() => selectedConnection && void loadCommands(selectedConnection.id)}
                type="button"
                variant="outline"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Queue
              </Button>
            </div>

            <div className="max-h-56 overflow-auto rounded-xl border border-[#e5ddd0]">
              {commands.length > 0 ? (
                <div className="divide-y divide-[#eee7dd]">
                  {commands.map((command) => (
                    <div key={command.id} className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_1fr_1fr]">
                      <div>
                        <div className="font-black text-[#1a1a1a]">{humanizeType(command.commandType)}</div>
                        <div className="text-xs font-medium text-[#8a7f72]">
                          Created: {formatTime(command.createdAt)}
                        </div>
                      </div>
                      <div className="text-xs font-medium text-[#8a7f72]">
                        {getCommandSummary(command)}
                      </div>
                      <div className="text-xs font-medium text-[#8a7f72]">
                        <span className="font-bold text-[#1a1a1a]">{humanizeType(command.status)}</span>
                        {command.error ? `: ${command.error}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm font-medium text-[#8a7f72]">
                  No Tally write-back commands yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#e5ddd0] bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[#8a7f72]" />
              <h3 className="text-base font-black text-[#1a1a1a]">Mapping Studio</h3>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr_auto]">
              <select
                className="h-10 rounded-xl border border-[#e5ddd0] bg-white px-3 text-sm font-bold text-[#1a1a1a]"
                onChange={(event) => setMappingType(event.target.value)}
                value={mappingType}
              >
                {MAPPING_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <Input
                className="h-10 rounded-xl border-[#e5ddd0]"
                onChange={(event) => setSourceKey(event.target.value)}
                placeholder="Source value, e.g. GSTIN, 18, freight"
                value={sourceKey}
              />
              <select
                className="h-10 rounded-xl border border-[#e5ddd0] bg-white px-3 text-sm font-bold text-[#1a1a1a]"
                onChange={(event) => setTargetMasterKey(event.target.value)}
                value={targetMasterKey}
              >
                <option value="">Select Tally target</option>
                {targetOptions.map((master) => (
                  <option key={master.key} value={master.key}>
                    {master.name}
                  </option>
                ))}
              </select>
              <Button
                className="rounded-xl bg-[#1a1a1a] px-5 font-bold text-white"
                disabled={savingMapping || !sourceKey.trim() || !selectedTarget}
                onClick={() => void saveMapping()}
                type="button"
              >
                {savingMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Save
              </Button>
            </div>

            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-[#e5ddd0]">
              {mappings.length > 0 ? (
                <div className="divide-y divide-[#eee7dd]">
                  {mappings.map((mapping) => (
                    <div key={mapping.id} className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_1fr_1fr]">
                      <div>
                        <div className="font-black text-[#1a1a1a]">{humanizeType(mapping.mappingType)}</div>
                        <div className="text-xs font-medium text-[#8a7f72]">{mapping.sourceLabel}</div>
                      </div>
                      <div className="font-medium text-[#1a1a1a]">{mapping.targetMasterName}</div>
                      <div className="text-xs font-medium text-[#8a7f72]">
                        Updated: {formatTime(mapping.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm font-medium text-[#8a7f72]">
                  No mappings saved yet. Sync masters first, then map packet values to Tally masters.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-[#d8ccbc] bg-[#fafafa] p-8 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a1a] text-white">
              <PlugZap className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-black text-[#1a1a1a]">No Tally connection yet</h3>
            <p className="mt-1 max-w-md text-sm font-medium text-[#8a7f72]">
              Create a connection to generate a pairing code for the local Tally bridge.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
