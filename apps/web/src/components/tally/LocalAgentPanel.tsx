"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, HardDrive, Loader2, MoreHorizontal, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useAccess } from '@/components/access/AccessProvider';
import { canAccess } from '@autodealer/shared/lib/access';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = { connectionId: string; companyName?: string | null };
type Company = { companyName?: string; guid?: string; financialYear?: string; isActive?: boolean; accessCompanyId?: string };
type AgentPayload = {
  connection?: { organizationId?: string; installationId?: string; sessionGeneration?: number; machineName?: string; companies?: Company[]; lastHeartbeatAt?: string };
  agent?: { version?: string; protocolVersion?: number; tdlVersion?: number; localSchemaVersion?: number; lastSeenAt?: string; status?: { storage?: { sizeBytes?: number; queuedJobs?: number; pendingOutbox?: number }; settings?: Record<string, unknown>; resources?: { freeMemoryBytes?: number }; activeJob?: { id?: string; jobClass?: string; progress?: { phase?: string; processed?: number; total?: number | null; elapsedMs?: number } } } };
  datasets?: Array<{ company_guid?: string; company_name?: string; financial_year?: string; last_synced_at?: string; cache_size_bytes?: number; cache_health?: Record<string, unknown>; quarantined_at?: string }>;
  error?: string;
};

function bytes(value = 0) {
  if (!value) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function LocalAgentPanel({ connectionId, companyName }: Props) {
  const {enforcementRequired, snapshot} = useAccess();
  const [payload, setPayload] = useState<AgentPayload>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    const response = await apiFetch(`/api/tally/connections/${connectionId}/agent-status`, { cache: "no-store" });
    const next = await response.json().catch(() => ({})) as AgentPayload;
    if (!response.ok) throw new Error(next.error || "Could not load Local Agent status.");
    setPayload(next);
    setCheckedAt(Date.now());
  }, [connectionId]);
  useEffect(() => {
    void refresh().catch((error) => setMessage(error.message));
    const timer = window.setInterval(() => void refresh().catch(() => {}), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const company = useMemo(() => {
    const companies = payload.connection?.companies || [];
    const candidates = companyName ? companies.filter(entry => entry.companyName === companyName) : companies.filter(entry => entry.isActive);
    if (candidates.length === 1) return candidates[0];
    // Never guess between financial years or silently switch the selected company.
    return !companyName && !candidates.length && companies.length === 1 ? companies[0] : undefined;
  }, [companyName, payload.connection?.companies]);
  const canManage = !enforcementRequired || Boolean(snapshot && company?.accessCompanyId && canAccess(snapshot, 'connections.manage', company.accessCompanyId));
  const identity = company?.guid && company?.financialYear ? {
    protocolVersion: payload.agent?.protocolVersion || 1,
    organizationId: payload.connection?.organizationId,
    connectionId, installationId: payload.connection?.installationId,
    sessionGeneration: payload.connection?.sessionGeneration,
    companyGuid: company.guid, companyName: company.companyName || companyName,
    financialYear: company.financialYear,
  } : null;
  const queue = async (commandType: string, jobClass: string, extra: Record<string, unknown> = {}) => {
    if (!identity) return setMessage("Open a Tally company with a GUID and financial year first.");
    setBusy(commandType); setMessage(null);
    try {
      const response = await apiFetch("/api/tally/agent/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity, commandType, jobClass, ...extra }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not queue Local Agent job.");
      setMessage("Job queued. Progress will appear here as the agent works.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Local Agent request failed."); }
    finally { setBusy(null); }
  };
  const status = payload.agent?.status || {};
  const settings = status.settings || {};
  const localDataModules = (settings.localDataModules && typeof settings.localDataModules === "object"
    ? settings.localDataModules
    : { purchase: true, bank: true, cashDiscount: true, followups: true }) as Record<string, boolean>;
  const toggleModule = (key: string) => void queue("agent_update_settings", "maintenance", {
    payload: { settings: { localDataModules: { ...localDataModules, [key]: localDataModules[key] === false } } },
  });
  const dataset = payload.datasets?.find((item) => item.company_guid === company?.guid && item.financial_year === company?.financialYear);
  const agentLastSeen = payload.agent?.lastSeenAt ? new Date(payload.agent.lastSeenAt).getTime() : 0;
  const agentOnline = Boolean(agentLastSeen && checkedAt - agentLastSeen < 45_000);
  const confirmAndQueue = (prompt: string, commandType: string, jobClass: string) => {
    if (window.confirm(prompt)) void queue(commandType, jobClass);
  };
  if (!payload.agent?.version) return null;
  return (
    <section className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${agentOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><ShieldCheck className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-[#24140c]">Local Agent</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${agentOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{agentOnline ? "Online" : "Status stale"}</span></div>
          <p className="mt-0.5 truncate text-xs font-medium text-[#8a7f72]">{payload.connection?.machineName || "This machine"} · {company?.companyName || companyName} · {company?.financialYear || "Financial year unavailable"}</p>
        </div>
        <Button aria-label="Refresh agent status" onClick={() => void refresh()} size="icon-sm" variant="ghost"><RefreshCw className="h-4 w-4" /></Button>
        <Popover>
          <PopoverTrigger asChild><Button aria-label="Open Local Agent settings" size="icon-sm" variant="outline"><MoreHorizontal className="h-4 w-4" /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl border-[#e5ddd0] p-2 shadow-xl">
            {enforcementRequired ? <p className="px-2 py-2 text-xs text-[#8a7f72]">Change machine-wide preferences or clear local data in the desktop agent. These actions affect every company on that computer.</p> : <>
            <p className="px-2 pb-1 pt-1 text-[11px] font-semibold text-[#8a7f72]">Preferences</p>
            <button className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-medium hover:bg-slate-50" disabled={Boolean(busy)} onClick={() => void queue("agent_update_settings", "maintenance", { payload: { settings: { localAnydocEnabled: settings.localAnydocEnabled === false } } })}><span>Parse documents locally</span><span className="text-[#8a7f72]">{settings.localAnydocEnabled === false ? "Off" : "On"}</span></button>
            <button className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-medium hover:bg-slate-50" disabled={Boolean(busy)} onClick={() => void queue("agent_update_settings", "maintenance", { payload: { settings: { localZvecEnabled: settings.localZvecEnabled !== true } } })}><span>Local ledger suggestions</span><span className="text-[#8a7f72]">{settings.localZvecEnabled === true ? "On" : "Off"}</span></button>
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold text-[#8a7f72]">Use local data in</p>
            {[["purchase", "Purchase vouchers"], ["bank", "Bank statements"], ["cashDiscount", "Cash discounts"], ["followups", "Payment follow-ups"]].map(([key, label]) => (
              <button key={key} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50" disabled={Boolean(busy)} onClick={() => toggleModule(key)}><span>{label}</span><span className="text-[#8a7f72]">{localDataModules[key] === false ? "Off" : "On"}</span></button>
            ))}
            <div className="my-2 h-px bg-slate-100" />
            <p className="px-2 pb-1 text-[11px] font-semibold text-[#8a7f72]">Maintenance</p>
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium hover:bg-slate-50" disabled={Boolean(busy)} onClick={() => confirmAndQueue("Rebuild the workflow cache? Tally data will be read again.", "agent_rebuild_cache", "incremental_sync")}><HardDrive className="h-3.5 w-3.5" />Rebuild workflow cache…</button>
            <button className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50" disabled={Boolean(busy)} onClick={() => confirmAndQueue("Clear rebuildable Local Agent cache? Pairing and write receipts will be kept.", "agent_clear_cache", "maintenance")}>Clear rebuildable cache…</button>
            <div className="my-2 h-px bg-slate-100" />
            </>}
            <div className="px-2 py-1 text-[11px] leading-5 text-[#8a7f72]">Agent {payload.agent.version} · TDL {payload.agent.tdlVersion || "—"} · DB {payload.agent.localSchemaVersion || "—"}<br />Cache {bytes(status.storage?.sizeBytes || dataset?.cache_size_bytes)} · {status.resources?.freeMemoryBytes === undefined ? 'Memory status unavailable' : `${bytes(status.resources.freeMemoryBytes)} free`}</div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-[#faf8f4] px-4 py-3">
        <div className="min-w-0"><p className="text-xs font-normal text-slate-800">{status.activeJob?.jobClass ? "Agent is working" : dataset?.last_synced_at ? "Workflow cache ready" : "Workflow cache not synced"}</p><p className="mt-0.5 truncate text-[11px] font-medium text-[#8a7f72]">{dataset?.last_synced_at ? `Updated ${new Date(dataset.last_synced_at).toLocaleString()}` : "Run the first sync when you are ready."}</p></div>
        {canManage ? <Button disabled={Boolean(busy) || !agentOnline} onClick={() => void queue("agent_sync_dataset", "incremental_sync")} size="sm"><Database className="mr-1.5 h-3.5 w-3.5" />Sync now</Button> : null}
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>
      {message ? <p className="mt-3 text-xs font-normal text-amber-700">{message}</p> : null}
      {status.activeJob?.progress ? <p className="mt-3 text-xs font-normal text-sky-700">{status.activeJob.progress.phase || status.activeJob.jobClass}: {status.activeJob.progress.processed ?? 0}{status.activeJob.progress.total != null ? `/${status.activeJob.progress.total}` : " processed"} · {Math.round((status.activeJob.progress.elapsedMs || 0) / 1000)}s</p> : null}
    </section>
  );
}
