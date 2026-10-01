"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PurchaseDocumentFolderSettings } from './PurchaseDocumentFolderSettings';
import { apiFetch } from "@/lib/api-client";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import { readPreferredTallyConnectionId } from "@/lib/tally-company-selection";

type Connection = { id: string; displayName?: string | null };
type Company = { id: string; companyName: string; companyGuid?: string | null; financialYear?: string | null };
type MasterKind = "ledger" | "stock" | "godown";
type Master = { guid: string; kind: MasterKind; name: string; parent: string | null };
type Defaults = Record<string, string>;

type LiveMaster = {
  guid?: unknown;
  name?: unknown;
  parent?: unknown;
};

type LivePurchaseMasterResult = {
  source?: unknown;
  validatedAt?: unknown;
  fetchedAt?: unknown;
  masters?: {
    ledgers?: unknown;
    stockItems?: unknown;
    godowns?: unknown;
  };
};

const SECTIONS: ReadonlyArray<{
  title: string;
  description: string;
  fields: ReadonlyArray<readonly [string, string, MasterKind]>;
}> = [
  {
    title: "Items and godown",
    description: "HSN 7204 includes longer scrap codes such as 72044900. The godown is used when the documents name none.",
    fields: [
      ["ms-scrap-item", "MS Scrap · HSN 7204…", "stock"],
      ["sponge-iron-item", "Sponge Iron · HSN 72031000", "stock"],
      ["godown", "Default godown", "godown"],
    ],
  },
  {
    title: "Purchase ledgers",
    description: "Local means supplier and buyer states match; otherwise interstate is used.",
    fields: [
      ["ms-scrap-local", "MS Scrap · Maharashtra", "ledger"],
      ["ms-scrap-interstate", "MS Scrap · outside Maharashtra", "ledger"],
      ["sponge-local", "Sponge Iron · Maharashtra", "ledger"],
      ["sponge-interstate", "Sponge Iron · outside Maharashtra", "ledger"],
    ],
  },
  {
    title: "GST, freight and round off",
    description: "Freight on the invoice is booked once to the freight ledger, with GST at the invoice rate.",
    fields: [
      ["cgst", "Input CGST 9%", "ledger"],
      ["sgst", "Input SGST 9%", "ledger"],
      ["igst", "Input IGST 18%", "ledger"],
      ["freight", "Freight inward", "ledger"],
      ["round-off", "Round off", "ledger"],
    ],
  },
  {
    title: "TDS and TCS",
    description: "Used only for the deductions switched on above.",
    fields: [
      ["tds-194q", "Section 194Q TDS", "ledger"],
      ["transport-tds", "TDS on goods transport", "ledger"],
      ["cgst-tds", "CGST TDS 1%", "ledger"],
      ["sgst-tds", "SGST TDS 1%", "ledger"],
      ["igst-tds", "IGST TDS 2%", "ledger"],
      ["tcs", "TCS receivable", "ledger"],
    ],
  },
];

async function errorText(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function describeSyncedCopy(value: LivePurchaseMasterResult) {
  const checkedAt = new Date(cleanText(value.validatedAt) || cleanText(value.fetchedAt));
  if (Number.isNaN(checkedAt.getTime())) return "Read through the connector";
  const when = checkedAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `Read through the connector, last checked with Tally ${when}. Use Refresh from Tally for new masters`;
}

function mastersFromLiveResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as LivePurchaseMasterResult;
  if (result.source !== "live_tally" || !result.masters) return null;

  const convert = (values: unknown, kind: MasterKind) =>
    (Array.isArray(values) ? values : []).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as LiveMaster;
      const name = cleanText(row.name);
      if (!name) return [];
      return [{ guid: cleanText(row.guid), kind, name, parent: cleanText(row.parent) || null } satisfies Master];
    });

  const ledgers = convert(result.masters.ledgers, "ledger");
  if (ledgers.length === 0) return null;
  return [...ledgers, ...convert(result.masters.stockItems, "stock"), ...convert(result.masters.godowns, "godown")];
}

export function PurchasePostingDefaultsSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [masters, setMasters] = useState<Master[]>([]);
  const [defaults, setDefaults] = useState<Defaults>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [masterSource, setMasterSource] = useState("");
  const [savingField, setSavingField] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const company = companies.find((entry) => entry.companyName === companyName);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/tally/connections", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return response.json() as Promise<{ connections?: Connection[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const next = payload.connections ?? [];
        const preferred = readPreferredTallyConnectionId();
        setConnections(next);
        setConnectionId(next.find((connection) => connection.id === preferred)?.id || next[0]?.id || "");
        if (next.length === 0) setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load Tally connections." });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!connectionId) {
      setCompanies([]);
      setCompanyName("");
      return;
    }
    let cancelled = false;
    void apiFetch(`/api/tally/companies?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        return response.json() as Promise<{ companies?: Company[]; selectedCompanyId?: string | null }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const next = payload.companies ?? [];
        setCompanies(next);
        setCompanyName(next.find((entry) => entry.id === payload.selectedCompanyId)?.companyName || next[0]?.companyName || "");
        if (next.length === 0) setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load Tally companies." });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [connectionId]);

  // Masters come through the connector. Opening the tab uses the connector's synced copy (fast);
  // the Refresh button asks the connector to check Tally for changed masters first, the same as
  // the posting review does. Godowns are always read directly from Tally.
  const refreshLiveMasters = useCallback(async (checkTally = false) => {
    if (!connectionId || !companyName) return;
    setRefreshing(true);
    try {
      const livePayload = await runCashDiscountLiveRequest<LivePurchaseMasterResult>({
        connectionId,
        companyName,
        companyGuid: company?.companyGuid,
        financialYear: company?.financialYear,
        operation: "ledger_masters",
        payload: {
          requestedMasterTypes: ["ledger", "group", "stock_item"],
          includeInventoryLocations: true,
          ...(checkTally ? { requireFresh: true } : {}),
        },
      });
      const live = mastersFromLiveResult(livePayload);
      if (!live) throw new Error("Tally returned no usable ledgers for this company.");
      setMasters(live);
      setMasterSource(checkTally ? "Checked with Tally just now" : describeSyncedCopy(livePayload));
    } catch (error) {
      setNotice({
        tone: "error",
        text: `${error instanceof Error ? error.message : "Could not read ledgers from Tally."} Saved choices are still shown; open the company in Tally and refresh to change them.`,
      });
    } finally {
      setRefreshing(false);
    }
  }, [companyName, connectionId, company?.companyGuid, company?.financialYear]);

  useEffect(() => {
    if (!connectionId || !companyName) return;
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    setMasters([]);
    setMasterSource("");
    const query = new URLSearchParams({ connectionId, companyName });
    void apiFetch(`/api/settings/purchase-posting-defaults?${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        const payload = await response.json() as { defaults?: Defaults };
        if (!cancelled) setDefaults(payload.defaults ?? {});
      })
      .catch((error) => {
        if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load Purchase defaults." });
      })
      .finally(() => !cancelled && setLoading(false));
    void refreshLiveMasters();
    return () => { cancelled = true; };
  }, [companyName, connectionId, refreshLiveMasters]);

  const optionsByKind = useMemo(() => ({
    ledger: masters.filter((master) => master.kind === "ledger"),
    stock: masters.filter((master) => master.kind === "stock"),
    godown: masters.filter((master) => master.kind === "godown"),
  }), [masters]);

  async function saveField(id: string, kind: MasterKind, name: string) {
    const previous = defaults[id] ?? "";
    const picked = optionsByKind[kind].find((option) => option.name === name);
    setDefaults((current) => ({ ...current, [id]: name }));
    setSavingField(id);
    setNotice(null);
    try {
      const response = await apiFetch("/api/settings/purchase-posting-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, companyName, defaults: { [id]: name ? { name, guid: picked?.guid ?? "" } : "" } }),
      });
      if (!response.ok) throw new Error(await errorText(response));
    } catch (error) {
      setDefaults((current) => ({ ...current, [id]: previous }));
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save this default." });
    } finally {
      setSavingField("");
    }
  }

  const disabled = loading || !connectionId || !companyName;

  return (
    <section className="rounded-xl border border-[#ded8d0] bg-white px-5 py-4 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-[#111827]">Ledgers and items</h2>
          <p className="mt-1 text-xs text-[#5b4b3d]">
            Pre-filled on every Purchase voucher for this company and kept when the connector is re-paired. Supplier ledgers are remembered by GSTIN once confirmed on a voucher. Each choice saves as soon as it is picked.
          </p>
        </div>
        <Button disabled={disabled || refreshing} onClick={() => void refreshLiveMasters(true)} size="sm" variant="outline">
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh from Tally
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {connections.length > 1 ? (
          <label className="text-xs font-medium text-[#5b4b3d]">Tally workstation
            <select className="mt-1 h-10 w-full rounded-lg border border-[#ddd7cc] bg-white px-3" onChange={(event) => { setCompanyName(''); setCompanies([]); setConnectionId(event.target.value); }} value={connectionId}>
              {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || "Tally workstation"}</option>)}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-medium text-[#5b4b3d]">Tally company
          <select className="mt-1 h-10 w-full rounded-lg border border-[#ddd7cc] bg-white px-3" onChange={(event) => setCompanyName(event.target.value)} value={companyName}>
            {companies.map((entry) => <option key={entry.id} value={entry.companyName}>{entry.companyName}</option>)}
          </select>
        </label>
      </div>

      {notice ? <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div> : null}

      {loading ? (
        <div className="mt-4 flex items-center text-xs text-[#5b4b3d]"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved choices…</div>
      ) : (
        <div className="mt-2 divide-y divide-[#f0ece4]">
          {SECTIONS.map((section) => (
            <div className="py-4" key={section.title}>
              <h3 className="text-sm font-bold text-[#111827]">{section.title}</h3>
              <p className="mt-0.5 text-xs text-[#8a7f72]">{section.description}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {section.fields.map(([id, label, kind]) => {
                  const saved = defaults[id] || "";
                  const options = optionsByKind[kind];
                  const savedMissing = saved && !options.some((option) => option.name === saved);
                  return <label className="text-xs font-medium text-[#5b4b3d]" key={id}>
                    <span className="flex items-center gap-1.5">{label}{savingField === id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}</span>
                    <select className="mt-1 h-10 w-full rounded-lg border border-[#ddd7cc] bg-white px-3 text-xs" disabled={disabled || refreshing || savingField === id} onChange={(event) => void saveField(id, kind, event.target.value)} value={saved}>
                      <option value="">{options.length ? "Choose from Tally…" : refreshing ? "Reading Tally…" : "Not set"}</option>
                      {savedMissing ? <option value={saved}>{saved}{masters.length ? " (not in this Tally company)" : ""}</option> : null}
                      {options.map((option) => <option key={`${option.kind}:${option.guid || option.name}`} value={option.name}>{option.name}{option.parent ? ` — ${option.parent}` : ""}</option>)}
                    </select>
                  </label>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {masters.length ? <p className="mt-1 text-xs font-medium text-emerald-700"><Check className="mr-1 inline h-4 w-4" />{optionsByKind.ledger.length} ledgers, {optionsByKind.stock.length} items and {optionsByKind.godown.length} godowns. {masterSource}.</p> : null}

      <div className="mt-4 border-t border-[#f0ece4] pt-4">
        <PurchaseDocumentFolderSettings connectionId={connectionId} companyName={companyName}
          companyGuid={company?.companyGuid} financialYear={company?.financialYear} />
      </div>
    </section>
  );
}
