"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
  Terminal,
  TriangleAlert,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TallyConnection = {
  id: string;
  displayName: string;
  status: string;
  tallyUrl: string;
  pairingCodeExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  lastCompanyName: string | null;
  bridgeConnected?: boolean;
  tallyReachable?: boolean;
  companyLoaded?: boolean;
};

type CreatedConnection = {
  connection: TallyConnection;
  pairingCode: string;
};

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function formatTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInitialApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  const url = new URL(window.location.origin);
  if (url.port === "3000") {
    url.port = "3001";
  }
  return url.toString().replace(/\/+$/, "");
}

function commandFor(apiBase: string, connection?: CreatedConnection | null) {
  if (!connection) return "";
  return `npm.cmd run pair -- --api-base "${apiBase}" --connection-id "${connection.connection.id}" --pairing-code "${connection.pairingCode}"`;
}

function connectorUrlFor(apiBase: string, connection?: CreatedConnection | null) {
  if (!connection) return "";
  const params = new URLSearchParams({
    apiBase,
    connectionId: connection.connection.id,
    pairingCode: connection.pairingCode,
    tallyUrl: connection.connection.tallyUrl || "http://localhost:9000",
  });

  return `kalika-tally://connect?${params.toString()}`;
}

export function DevTallyConnectionPage() {
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [created, setCreated] = useState<CreatedConnection | null>(null);
  const [apiBase, setApiBase] = useState(getInitialApiBase);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<"id" | "code" | "command" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pairCommand = useMemo(() => commandFor(apiBase, created), [apiBase, created]);
  const connectorUrl = useMemo(() => connectorUrlFor(apiBase, created), [apiBase, created]);
  const latestConnection = created?.connection ?? connections[0] ?? null;

  async function copy(value: string, key: "id" | "code" | "command") {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1200);
  }

  function openConnector() {
    if (!connectorUrl) return;
    window.location.assign(connectorUrl);
  }

  async function loadConnections() {
    try {
      setError(null);
      setLoading(true);
      const response = await apiFetch("/api/tally/connections", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { connections?: TallyConnection[] };
      setConnections(payload.connections ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load local connections.");
    } finally {
      setLoading(false);
    }
  }

  async function createConnection() {
    try {
      setError(null);
      setCreating(true);
      const response = await apiFetch("/api/tally/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Tally Prime Local Test",
          tallyUrl: "http://localhost:9000",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as CreatedConnection;
      setCreated(payload);
      setConnections((current) => [payload.connection, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create local connection.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-[#e5ddd0] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#8a7f72]">
            <KeyRound className="h-3.5 w-3.5" />
            Local Test Only
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#1a1a1a]">
            Tally Connector Pairing
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#756a5f]">
            Generate a temporary connection ID and pairing code for the Windows Tally bridge while local DB mode is enabled.
          </p>
        </div>
        <Button
          className="h-10 rounded-md bg-[#4a3324] px-4 text-white hover:bg-[#3b281d]"
          disabled={creating}
          onClick={() => void createConnection()}
          type="button"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          Generate ID and Code
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-md border border-[#ef4444]/20 bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#b91c1c]">
          <TriangleAlert className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-[#e5ddd0] bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-[#1a1a1a]">
            <Terminal className="h-4 w-4 text-[#8a7f72]" />
            Pairing Command
          </div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">
            API base reachable from Windows VM
          </label>
          <Input
            className="mb-4 h-10 border-[#e5ddd0] bg-[#fbfaf8] font-mono text-sm"
            onChange={(event) => setApiBase(event.target.value)}
            value={apiBase}
          />
          <div className="rounded-md bg-[#1f1a17] p-4">
            <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs font-semibold text-white">
              {pairCommand || "Generate a local connection to show the pair command."}
            </code>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="rounded-md bg-[#4a3324] px-4 text-white hover:bg-[#3b281d]"
              disabled={!connectorUrl}
              onClick={openConnector}
              type="button"
            >
              <PlugZap className="h-4 w-4" />
              Open Electron Connector
            </Button>
            <Button
              className="rounded-md border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
              disabled={!pairCommand}
              onClick={() => pairCommand && void copy(pairCommand, "command")}
              type="button"
              variant="outline"
            >
              {copied === "command" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              Copy Command
            </Button>
            <Button
              className="rounded-md border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
              onClick={() => void loadConnections()}
              type="button"
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
          <p className="mt-4 text-xs font-medium leading-5 text-[#8a7f72]">
            If the bridge runs inside a Windows VM, replace localhost with your Mac IP address.
          </p>
        </div>

        <div className="rounded-md border border-[#e5ddd0] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-[#1a1a1a]">
            <Server className="h-4 w-4 text-[#8a7f72]" />
            Current Connection
          </div>
          {latestConnection ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">Status</div>
                <div className="mt-1 font-bold text-[#1a1a1a]">{latestConnection.status}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">Heartbeat</div>
                <div className="mt-1 font-bold text-[#1a1a1a]">{formatTime(latestConnection.lastHeartbeatAt)}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">Company</div>
                <div className="mt-1 font-bold text-[#1a1a1a]">{latestConnection.lastCompanyName || "Not detected"}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium leading-6 text-[#756a5f]">
              No local connection exists yet.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-[#e5ddd0] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">Connection ID</div>
          <div className="mt-3 flex gap-2">
            <Input
              className="h-10 border-[#e5ddd0] bg-[#fbfaf8] font-mono text-xs"
              readOnly
              value={created?.connection.id ?? ""}
            />
            <Button
              className="rounded-md border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
              disabled={!created?.connection.id}
              onClick={() => created?.connection.id && void copy(created.connection.id, "id")}
              type="button"
              variant="outline"
            >
              {copied === "id" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-[#e5ddd0] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a7f72]">Pairing Code</div>
          <div className="mt-3 flex gap-2">
            <Input
              className="h-10 border-[#e5ddd0] bg-[#fbfaf8] font-mono text-xs"
              readOnly
              value={created?.pairingCode ?? ""}
            />
            <Button
              className="rounded-md border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
              disabled={!created?.pairingCode}
              onClick={() => created?.pairingCode && void copy(created.pairingCode, "code")}
              type="button"
              variant="outline"
            >
              {copied === "code" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-3 text-xs font-medium text-[#8a7f72]">
            Pairing codes are only shown when a new connection is generated.
          </p>
        </div>
      </section>
    </div>
  );
}
