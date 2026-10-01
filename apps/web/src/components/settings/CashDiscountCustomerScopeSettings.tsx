"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Database, Loader2, RefreshCw, Search, X } from "lucide-react";

import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { apiFetch } from "@/lib/api-client";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import { readPreferredTallyConnectionId } from "@/lib/tally-company-selection";

type Mode = "automatic" | "custom" | "strict";
type Scope = {
  mode: Mode;
  selectedGroupNames: string[];
  includeNestedGroups: boolean;
  detectSalesLinkedExceptions: boolean;
  excludedGroupNames: string[];
  excludedLedgerNames: string[];
};
type Connection = { id: string; displayName?: string | null };
type Company = { id: string; companyName: string; companyGuid?: string | null; financialYear?: string | null };
type Master = { name: string; parent: string | null };
type LiveMastersResult = { groups?: unknown; ledgers?: unknown; validatedAt?: unknown; fetchedAt?: unknown };

const CARD = "rounded-xl border border-[#ded8d0] bg-white shadow-[0_1px_2px_rgba(52,42,32,0.04)]";
const DEFAULT_SCOPE: Scope = {
  mode: "automatic",
  selectedGroupNames: ["Sundry Debtors"],
  includeNestedGroups: true,
  detectSalesLinkedExceptions: true,
  excludedGroupNames: [],
  excludedLedgerNames: [],
};

function key(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function looksLikeCustomerGroup(group: Master) {
  return /debtor|receivable|customer|dealer|distributor/i.test(`${group.name} ${group.parent || ""}`);
}

function readMasters(value: unknown): Master[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const parent = typeof record.parent === "string" && record.parent.trim() ? record.parent.trim() : null;
    return name ? [{ name, parent }] : [];
  });
}

function checkedLabel(value: LiveMastersResult) {
  const raw = typeof value.validatedAt === "string" ? value.validatedAt : typeof value.fetchedAt === "string" ? value.fetchedAt : "";
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return "Read through the connector";
  return `Last checked with Tally ${date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

// The connector reads only `mode === "strict"` (which switches outside customers off), so the
// switch alone decides it; Recommended is stored as "automatic".
function withMode(scope: Scope, recommended: boolean): Scope {
  return { ...scope, mode: recommended ? "automatic" : scope.detectSalesLinkedExceptions ? "custom" : "strict" };
}

export function CashDiscountCustomerScopeSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [groups, setGroups] = useState<Master[]>([]);
  const [ledgers, setLedgers] = useState<Master[]>([]);
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const savedJson = useRef("");
  const company = companies.find((entry) => entry.companyName === companyName);
  const recommended = scope.mode === "automatic";

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/tally/connections", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        const next = ((await response.json()) as { connections?: Connection[] }).connections ?? [];
        if (cancelled) return;
        const preferred = readPreferredTallyConnectionId();
        setConnections(next);
        setConnectionId(next.find((item) => item.id === preferred)?.id || next[0]?.id || "");
        if (next.length === 0) setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice(error instanceof Error ? error.message : "Could not load Tally connections.");
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
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { companies?: Company[]; selectedCompanyId?: string | null };
        if (cancelled) return;
        const next = (payload.companies ?? []).filter((entry, index, all) =>
          all.findIndex((candidate) => key(candidate.companyName) === key(entry.companyName)) === index
        );
        setCompanies(next);
        setCompanyName(next.find((item) => item.id === payload.selectedCompanyId)?.companyName || next[0]?.companyName || "");
        if (next.length === 0) setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice(error instanceof Error ? error.message : "Could not load Tally companies.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [connectionId]);

  // Groups and ledgers come through the connector: its synced copy when the tab opens, and a
  // check against Tally for changed masters when Refresh is pressed.
  const readTally = useCallback(async (checkTally: boolean) => {
    if (!connectionId || !companyName) return;
    setRefreshing(true);
    try {
      const live = await runCashDiscountLiveRequest<LiveMastersResult>({
        connectionId,
        companyName,
        companyGuid: company?.companyGuid,
        financialYear: company?.financialYear,
        operation: "ledger_masters",
        payload: { requestedMasterTypes: ["ledger", "group"], ...(checkTally ? { requireFresh: true } : {}) },
      });
      setGroups(readMasters(live.groups));
      setLedgers(readMasters(live.ledgers));
      setSource(checkTally ? "Checked with Tally just now" : checkedLabel(live));
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "Could not read Tally."} Saved choices still apply; open the company in Tally and refresh to change groups.`);
    } finally {
      setRefreshing(false);
    }
  }, [companyName, connectionId, company?.companyGuid, company?.financialYear]);

  useEffect(() => {
    if (!connectionId || !companyName) return;
    let cancelled = false;
    setLoading(true);
    setNotice("");
    setGroups([]);
    setLedgers([]);
    setSource("");
    setQuery("");
    setShowAllGroups(false);
    const params = new URLSearchParams({ connectionId, companyName });
    void apiFetch(`/api/settings/cash-discount-customer-scope?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 409) {
          setNotice("Database setup is required before this can be saved. The Sundry Debtors default applies meanwhile.");
          return DEFAULT_SCOPE;
        }
        if (!response.ok) throw new Error(await responseError(response));
        return ((await response.json()) as { settings?: Scope }).settings ?? DEFAULT_SCOPE;
      })
      .then((loaded) => {
        if (cancelled) return;
        savedJson.current = JSON.stringify(loaded);
        setScope(loaded);
      })
      .catch((error) => !cancelled && setNotice(error instanceof Error ? error.message : "Could not load the customer scope."))
      .finally(() => !cancelled && setLoading(false));
    void readTally(false);
    return () => { cancelled = true; };
  }, [companyName, connectionId, readTally]);

  // Open the tree down to every selected group once the groups arrive.
  useEffect(() => {
    const parentOf = new Map(groups.map((group) => [key(group.name), group.parent]));
    const open = new Set<string>();
    for (const name of scope.selectedGroupNames) {
      let current: string | null | undefined = name;
      while (current && !open.has(key(current))) {
        open.add(key(current));
        current = parentOf.get(key(current));
      }
    }
    setExpanded(open);
    // Only when the group list itself changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // Every change saves automatically once it is valid.
  useEffect(() => {
    if (loading || !connectionId || !companyName) return;
    const json = JSON.stringify(scope);
    if (json === savedJson.current || scope.selectedGroupNames.length === 0) return;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      void apiFetch("/api/settings/cash-discount-customer-scope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, companyName, settings: scope }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await responseError(response));
          savedJson.current = json;
          setStatus("saved");
        })
        .catch((error) => {
          setStatus("");
          setNotice(error instanceof Error ? error.message : "Could not save the customer scope.");
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [scope, loading, connectionId, companyName]);

  const tree = useMemo(() => {
    const byName = new Map(groups.map((group) => [key(group.name), group]));
    const children = new Map<string, Master[]>();
    for (const group of groups) {
      const parentKey = key(group.parent);
      children.set(parentKey, [...(children.get(parentKey) ?? []), group]);
    }
    for (const list of children.values()) list.sort((left, right) => left.name.localeCompare(right.name));

    const selected = new Map(scope.selectedGroupNames.map((name) => [key(name), name]));
    // Nearest selected ancestor of each group, used for "Included via" and the nested count.
    const selectedAncestor = (group: Master) => {
      const seen = new Set<string>();
      let parent = group.parent;
      while (parent && !seen.has(key(parent))) {
        if (selected.has(key(parent))) return selected.get(key(parent)) ?? null;
        seen.add(key(parent));
        parent = byName.get(key(parent))?.parent ?? null;
      }
      return null;
    };
    const inheritedFrom = new Map<string, string>();
    for (const group of groups) {
      if (selected.has(key(group.name))) continue;
      const ancestor = selectedAncestor(group);
      if (ancestor) inheritedFrom.set(key(group.name), ancestor);
    }

    const needle = query.trim().toLowerCase();
    const shown = new Set<string>();
    const showWithAncestors = (group: Master) => {
      let current: Master | undefined = group;
      while (current && !shown.has(key(current.name))) {
        shown.add(key(current.name));
        current = byName.get(key(current.parent));
      }
    };
    if (needle) groups.filter((group) => `${group.name} ${group.parent ?? ""}`.toLowerCase().includes(needle)).forEach(showWithAncestors);
    else if (!showAllGroups) groups.filter((group) => looksLikeCustomerGroup(group) || selected.has(key(group.name))).forEach(showWithAncestors);

    const rows: Array<{ group: Master; depth: number; childCount: number; open: boolean }> = [];
    const visited = new Set<string>();
    const walk = (group: Master, depth: number) => {
      const groupKey = key(group.name);
      if (visited.has(groupKey)) return;
      visited.add(groupKey);
      if (!(showAllGroups && !needle) && !shown.has(groupKey)) return;
      const kids = children.get(groupKey) ?? [];
      const open = Boolean(needle) || expanded.has(groupKey);
      rows.push({ group, depth, childCount: kids.length, open });
      if (open) kids.forEach((child) => walk(child, depth + 1));
    };
    groups.filter((group) => !byName.has(key(group.parent))).sort((left, right) => left.name.localeCompare(right.name)).forEach((group) => walk(group, 0));

    return { rows, inheritedFrom, nestedCount: inheritedFrom.size };
  }, [expanded, groups, query, scope.selectedGroupNames, showAllGroups]);

  const recommendedGroup = groups.find((group) => key(group.name) === "sundry debtors")?.name
    || groups.find(looksLikeCustomerGroup)?.name
    || "Sundry Debtors";
  const unusualGroups = scope.selectedGroupNames.filter((name) => {
    const group = groups.find((candidate) => key(candidate.name) === key(name));
    return group && !looksLikeCustomerGroup(group);
  });
  const nestedCount = scope.includeNestedGroups ? tree.nestedCount : 0;
  const disabled = loading || !connectionId || !companyName;

  function update(patch: Partial<Scope>, nextRecommended = recommended) {
    setNotice("");
    setScope((current) => withMode({ ...current, ...patch }, nextRecommended));
  }

  function toggleGroup(name: string) {
    const exists = scope.selectedGroupNames.some((item) => key(item) === key(name));
    update({ selectedGroupNames: exists ? scope.selectedGroupNames.filter((item) => key(item) !== key(name)) : [...scope.selectedGroupNames, name] });
  }

  const summary = [
    `${scope.selectedGroupNames.join(", ") || "No group"}${nestedCount ? ` + ${nestedCount} nested` : ""}`,
    scope.detectSalesLinkedExceptions ? "verified customers outside these groups" : "these groups only",
    scope.excludedLedgerNames.length ? `${scope.excludedLedgerNames.length} ledger${scope.excludedLedgerNames.length === 1 ? "" : "s"} excluded` : "",
  ].filter(Boolean).join(" · ");

  return (
    <main className="w-full space-y-4">
      <section className={CARD}>
        <header className="flex flex-col gap-4 border-b border-[#e8e2db] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-[#111827]">Customers for cash discounts</h2>
            <p className="mt-1 max-w-2xl text-xs text-[#5b4b3d]">Which Tally ledgers Kalika treats as customers when it looks for cash discounts and payment follow-ups. Saved per Tally company, automatically.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {connections.length > 1 ? (
              <SelectDropdown
                className="w-44"
                onChange={(value) => { setCompanyName(""); setCompanies([]); setConnectionId(value); }}
                options={connections.map((connection) => ({ value: connection.id, label: connection.displayName || "Tally workstation" }))}
                value={connectionId}
              />
            ) : null}
            {companies.length > 1 ? (
              <SelectDropdown className="w-64" onChange={setCompanyName} options={companies.map((entry) => ({ value: entry.companyName, label: entry.companyName }))} value={companyName} />
            ) : null}
            <span className="flex h-6 items-center gap-1.5 rounded-full border border-[#ded8d0] bg-[#faf8f5] px-2.5 text-[11px] font-medium text-[#675d54]">
              {status === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</> : <><Check className="h-3 w-3 text-emerald-600" />Saved automatically</>}
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#f0ece4] bg-[#faf8f5] px-5 py-2.5 text-xs text-[#675d54]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#2b1a10]"><Database className="h-3.5 w-3.5 text-[#8a7f72]" />{companyName || "No Tally company"}</span>
          <span className="text-[#c8bfb0]">•</span>
          <span className="min-w-0">Kalika scans: <span className="font-medium text-[#2b1a10]">{summary}</span></span>
        </div>

        {notice ? (
          <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}
          </p>
        ) : null}

        <div className="px-5 py-2">
          <div className="grid gap-2 py-3 sm:grid-cols-2" role="radiogroup" aria-label="How customers are found">
            {[
              { value: true, title: "Recommended", text: `${recommendedGroup} and all its subgroups.` },
              { value: false, title: "Choose groups", text: "For companies that keep customers in their own Tally groups." },
            ].map((option) => {
              const active = recommended === option.value;
              return (
                <button
                  aria-checked={active}
                  className={`rounded-lg border px-4 py-3 text-left transition ${active ? "border-[#2b1a10] bg-[#faf8f5]" : "border-[#ded8d0] hover:border-[#b9aa99] hover:bg-[#fbfaf8]"}`}
                  disabled={disabled}
                  key={option.title}
                  onClick={() => option.value
                    ? update({ selectedGroupNames: [recommendedGroup], includeNestedGroups: true }, true)
                    : update({}, false)}
                  role="radio"
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#111827]">{option.title}</span>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${active ? "border-[#2b1a10] bg-[#2b1a10]" : "border-[#c8bfb0] bg-white"}`}>
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-[#8a7f72]">{option.text}</span>
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-[#f3efe9]">
            <button
              aria-pressed={scope.detectSalesLinkedExceptions}
              className="flex w-full items-center justify-between gap-6 py-3.5 text-left"
              disabled={disabled}
              onClick={() => update({ detectSalesLinkedExceptions: !scope.detectSalesLinkedExceptions })}
              type="button"
            >
              <span>
                <span className="block text-xs font-semibold text-[#111827]">Include verified customers outside these groups</span>
                <span className="mt-0.5 block text-[11px] leading-5 text-[#8a7f72]">A ledger elsewhere in Tally is included only when its open bill comes from a real Sales voucher.</span>
              </span>
              <SettingsSwitch checked={scope.detectSalesLinkedExceptions} />
            </button>
            {!recommended ? (
              <button
                aria-pressed={scope.includeNestedGroups}
                className="flex w-full items-center justify-between gap-6 py-3.5 text-left"
                disabled={disabled}
                onClick={() => update({ includeNestedGroups: !scope.includeNestedGroups })}
                type="button"
              >
                <span>
                  <span className="block text-xs font-semibold text-[#111827]">Include nested subgroups</span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-[#8a7f72]">Subgroups split by region, channel or salesperson are included with their parent group.</span>
                </span>
                <SettingsSwitch checked={scope.includeNestedGroups} />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {!recommended ? (
        <section className={CARD}>
          <header className="flex flex-col gap-3 border-b border-[#e8e2db] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#111827]">Customer groups</h2>
              <p className="mt-1 text-xs text-[#5b4b3d]">Tick every Tally group that holds customers. {source ? <span className="text-[#8a7f72]">{source}.</span> : null}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 focus-within:border-[#b9aa99] focus-within:bg-white">
                <Search className="h-3.5 w-3.5 text-[#8a7f72]" />
                <input aria-label="Search Tally groups" className="w-40 bg-transparent text-xs outline-none placeholder:text-[#a89e92]" onChange={(event) => setQuery(event.target.value)} placeholder="Search groups…" value={query} />
              </label>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#ded8d0] bg-[#faf8f5] px-3 text-xs font-semibold text-[#332c26] transition hover:bg-[#f3eee8] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={disabled || refreshing}
                onClick={() => void readTally(true)}
                type="button"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh from Tally
              </button>
            </div>
          </header>

          {unusualGroups.length ? (
            <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><strong>{unusualGroups.join(", ")}</strong> {unusualGroups.length === 1 ? "is" : "are"} unusual for customers, but will be scanned as selected.</span>
            </p>
          ) : null}
          {scope.selectedGroupNames.length === 0 ? (
            <p className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Tick at least one group. Nothing is saved until then.</p>
          ) : null}

          <div className="m-5 overflow-hidden rounded-lg border border-[#e8e2db]">
            <div className="flex items-center justify-between gap-2 border-b border-[#e8e2db] bg-[#faf8f5] px-3 py-2 text-[11px] font-semibold text-[#675d54]">
              <span>{query ? "Search results" : showAllGroups ? `All ${groups.length} groups` : "Likely customer groups"}</span>
              {!query ? (
                <button className="font-semibold text-[#2b1a10] hover:underline" onClick={() => setShowAllGroups((current) => !current)} type="button">
                  {showAllGroups ? "Show likely customer groups" : `Show all ${groups.length} groups`}
                </button>
              ) : null}
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              {loading || (refreshing && !groups.length) ? (
                <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, index) => <div className="h-9 animate-pulse rounded-lg bg-[#ede6d9]/50" key={index} />)}</div>
              ) : tree.rows.map(({ group, depth, childCount, open }) => {
                const groupKey = key(group.name);
                const selected = scope.selectedGroupNames.some((name) => key(name) === groupKey);
                const via = scope.includeNestedGroups ? tree.inheritedFrom.get(groupKey) : undefined;
                return (
                  <div
                    className={`flex items-center border-b border-[#f3efe9] pr-3 last:border-0 ${selected ? "bg-[#f5efe6]" : via ? "bg-[#fbf8f3]" : "hover:bg-[#fbfaf8]"}`}
                    key={group.name}
                    style={{ paddingLeft: `${8 + Math.min(depth, 6) * 20}px` }}
                  >
                    {childCount ? (
                      <button
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${group.name}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8a7f72] hover:bg-[#ede6d9] hover:text-[#111827]"
                        onClick={() => setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                          return next;
                        })}
                        type="button"
                      >
                        <ChevronRight className={`h-3.5 w-3.5 transition ${open ? "rotate-90" : ""}`} />
                      </button>
                    ) : <span className="h-7 w-7 shrink-0" />}
                    <button
                      aria-pressed={selected || Boolean(via)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left disabled:cursor-default"
                      disabled={Boolean(via)}
                      onClick={() => toggleGroup(group.name)}
                      title={via ? `Included through ${via}` : undefined}
                      type="button"
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-[#2b1a10] bg-[#2b1a10] text-white" : via ? "border-[#c8bfb0] bg-[#ede6d9] text-[#2b1a10]" : "border-[#c8bfb0] bg-white text-transparent"}`}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[#111827]">{group.name}</span>
                        <span className="block truncate text-[11px] text-[#8a7f72]">Under {group.parent || "Primary"}{childCount ? ` · ${childCount} subgroup${childCount === 1 ? "" : "s"}` : ""}</span>
                      </span>
                      {via ? <span className="hidden shrink-0 rounded-full border border-[#ded8d0] bg-white px-2 py-0.5 text-[10px] font-medium text-[#675d54] sm:inline">Via {via}</span>
                        : looksLikeCustomerGroup(group) ? <span className="hidden shrink-0 rounded-full bg-[#f3eee8] px-2 py-0.5 text-[10px] font-medium text-[#675d54] sm:inline">Likely customers</span> : null}
                    </button>
                  </div>
                );
              })}
              {!loading && !refreshing && tree.rows.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#8a7f72]">{groups.length ? "No groups match this search." : "Tally groups are not loaded. Use Refresh from Tally."}</div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className={CARD}>
        <header className="border-b border-[#e8e2db] px-5 py-4">
          <h2 className="text-base font-bold tracking-tight text-[#111827]">Excluded ledgers</h2>
          <p className="mt-1 text-xs text-[#5b4b3d]">Never treated as customers, even inside the groups above. For example staff, directors or sister concerns kept under Sundry Debtors.</p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <div className="max-w-md">
            <SearchableSelect
              allowClear={false}
              aria-label="Add a ledger to exclude"
              disabled={disabled}
              emptyMessage={ledgers.length ? "No matching ledger." : "Tally ledgers are not loaded."}
              onChange={(name) => name && !scope.excludedLedgerNames.some((item) => key(item) === key(name)) && update({ excludedLedgerNames: [...scope.excludedLedgerNames, name] })}
              options={ledgers
                .filter((ledger) => !scope.excludedLedgerNames.some((item) => key(item) === key(ledger.name)))
                .map((ledger) => ({ value: ledger.name, label: ledger.name, hint: ledger.parent }))}
              placeholder={refreshing && !ledgers.length ? "Reading Tally…" : "Add a ledger to exclude…"}
              searchPlaceholder="Search ledgers…"
              value=""
            />
          </div>
          {scope.excludedLedgerNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {scope.excludedLedgerNames.map((name) => (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#ded8d0] bg-[#faf8f5] py-1 pl-2.5 pr-1 text-xs font-medium text-[#2b1a10]" key={name}>
                  {name}
                  <button aria-label={`Stop excluding ${name}`} className="rounded p-0.5 text-[#8a7f72] hover:bg-[#ede6d9] hover:text-[#b91c1c]" onClick={() => update({ excludedLedgerNames: scope.excludedLedgerNames.filter((item) => item !== name) })} type="button">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#8a7f72]">No ledgers excluded.</p>
          )}
          {scope.excludedGroupNames.length ? (
            <p className="text-[11px] text-[#8a7f72]">Also excluded from an earlier setup: {scope.excludedGroupNames.join(", ")}.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
