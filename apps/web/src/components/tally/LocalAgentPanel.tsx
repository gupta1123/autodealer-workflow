"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useAccess } from '@/components/access/AccessProvider';
import { canAccess } from '@autodealer/shared/lib/access';

type Props = { connectionId: string; companyName?: string | null };
type Company = { companyName?: string; guid?: string; financialYear?: string; isActive?: boolean; accessCompanyId?: string };
type AgentPayload = {
  connection?: { organizationId?: string; installationId?: string; sessionGeneration?: number; companies?: Company[] };
  agent?: { version?: string; protocolVersion?: number; lastSeenAt?: string; status?: { activeJob?: { jobClass?: string; progress?: { phase?: string; processed?: number; total?: number | null } } } };
  datasets?: Array<{ company_guid?: string; financial_year?: string; last_synced_at?: string }>;
  error?: string;
};

// Client-facing wording for agent job phases. Internal names (cache, vectors,
// embeddings) are never shown.
function friendlyPhase(phase?: string) {
  const value = String(phase || "").toLowerCase();
  if (/vector|embed|index/.test(value)) return "Preparing smart matching";
  if (/ledger|master|catalog/.test(value)) return "Reading ledgers from Tally";
  if (/voucher|bill/.test(value)) return "Reading vouchers from Tally";
  if (/document|pars/.test(value)) return "Reading document";
  return "Updating Tally data";
}

export function LocalAgentPanel({ connectionId, companyName }: Props) {
  const {enforcementRequired, snapshot} = useAccess();
  const [payload, setPayload] = useState<AgentPayload>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    const response = await apiFetch(`/api/tally/connections/${connectionId}/agent-status`, { cache: "no-store" });
    const next = await response.json().catch(() => ({})) as AgentPayload;
    if (!response.ok) throw new Error(next.error || "Could not load Tally data status.");
    setPayload(next);
    setLoadError(null);
    setCheckedAt(Date.now());
  }, [connectionId]);
  useEffect(() => {
    void refresh().catch((error) => setLoadError(error.message));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => {});
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  const company = useMemo(() => {
    const companies = payload.connection?.companies || [];
    const wanted = companyName?.trim().toLowerCase();
    const candidates = wanted ? companies.filter(entry => entry.companyName?.trim().toLowerCase() === wanted) : companies.filter(entry => entry.isActive);
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
  const refreshFromTally = async () => {
    if (!identity) { setMessage("Open the company in Tally Prime first."); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await apiFetch("/api/tally/agent/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity, commandType: "agent_sync_dataset", jobClass: "incremental_sync" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not start the refresh.");
      setMessage("Refresh started. This usually takes under a minute.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the refresh."); }
    finally { setBusy(false); }
  };
  const activeJob = payload.agent?.status?.activeJob;
  const dataset = payload.datasets?.find((item) => item.company_guid === company?.guid && item.financial_year === company?.financialYear);
  const agentLastSeen = payload.agent?.lastSeenAt ? new Date(payload.agent.lastSeenAt).getTime() : 0;
  const agentOnline = Boolean(agentLastSeen && checkedAt - agentLastSeen < 45_000);
  if (!payload.agent?.version) {
    if (!loadError) return null;
    return (
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-medium text-amber-800">Tally data status is unavailable right now.</p>
        <Button onClick={() => void refresh().catch((error) => setLoadError(error.message))} size="sm" variant="outline">Retry</Button>
      </section>
    );
  }
  const progress = activeJob?.progress;
  const percent = progress?.total ? Math.min(100, Math.round(((progress.processed ?? 0) / progress.total) * 100)) : null;
  const ready = Boolean(dataset?.last_synced_at);
  return (
    <section className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${activeJob ? "bg-sky-50 text-sky-700" : ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {activeJob ? <Loader2 className="h-5 w-5 animate-spin" /> : ready ? <CheckCircle2 className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#24140c]">
              {activeJob ? `${friendlyPhase(progress?.phase || activeJob.jobClass)}…` : ready ? "Tally data is ready" : "Tally data not loaded yet"}
            </h3>
            <p className="mt-0.5 truncate text-xs font-medium text-[#8a7f72]">
              {activeJob
                ? percent !== null ? `${percent}% complete` : "Working in the background"
                : ready
                  ? `${company?.companyName || companyName || "Company"} · Updated ${new Date(dataset!.last_synced_at!).toLocaleString()}`
                  : "Click Refresh from Tally to load ledgers for this company."}
            </p>
          </div>
        </div>
        {canManage && !activeJob ? (
          <Button disabled={busy || !agentOnline} onClick={() => void refreshFromTally()} size="sm" variant="outline">
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh from Tally
          </Button>
        ) : null}
      </div>
      {activeJob && percent !== null ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f1ebe2]"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${percent}%` }} /></div>
      ) : null}
      {message ? <p className="mt-3 text-xs font-normal text-[#6f6255]">{message}</p> : null}
    </section>
  );
}
