"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  FileCheck2,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchCaseFileSignedUrl } from "@/lib/case-persistence";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import {
  approveAndQueueTallyPurchasePosting,
  fetchTallyPurchasePosting,
  matchTallyPurchaseLineMasters,
  matchTallyPurchaseSupplierLedger,
  prepareLiveTallyApprovalContext,
  prepareLiveTallyCatalogue,
  prepareTallyPurchasePostingFromLive,
  saveTallyPurchasePosting,
  selectTallyPurchaseInvoice,
  waitForTallyCommand,
  type TallyMasterOption,
  type TallyPostingIssue,
  type TallyPostingResponse,
  type TallyPostingReview,
  type SupplierLedgerMatch,
  type PurchaseLineMasterSuggestion,
} from "@/lib/tally-purchase-posting";

type PanelState = "loading" | "ready" | "error";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Missing";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function money(value: string | null | undefined) {
  if (!value) return "₹0.00";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(parsed)
    : value;
}

function closingBalanceLabel(option: TallyMasterOption) {
  if (typeof option.closingBalance !== "number" || !Number.isFinite(option.closingBalance)) return null;
  const balanceType = option.closingBalanceType || (option.closingBalance < 0 ? "Dr" : option.closingBalance > 0 ? "Cr" : null);
  return `Closing ${money(String(Math.abs(option.closingBalance)))}${balanceType ? ` ${balanceType}` : ""}`;
}

function tallyAmount(
  value: string | number | null | undefined,
  options: { credit?: boolean } = {}
) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return String(value ?? "0.00");
  const signed = options.credit && parsed > 0 ? -parsed : parsed;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(signed);
}

function tallyQuantity(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return String(value ?? "0.000");
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(parsed);
}

function tallyDate(value: string | null | undefined) {
  if (!value) return "Date missing";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthLabel = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1];
  return monthLabel ? `${Number(day)}-${monthLabel}-${year.slice(-2)}` : value;
}

function tallyWeekday(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" }).format(date);
}

function isValidDateInput(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function moneyOrMissing(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return "Not found";
  return money(value);
}

function stateLabel(code: string | null | undefined) {
  const states: Record<string, string> = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
    "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
    "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
    "24": "Gujarat", "25": "Daman and Diu",
    "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
    "28": "Andhra Pradesh (old)", "29": "Karnataka", "30": "Goa",
    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
    "38": "Ladakh", "97": "Other territory", "99": "Centre jurisdiction",
  };
  if (!code) return "Not known";
  return states[code] ? `${states[code]} (${code})` : `State code ${code}`;
}

function normalizeUnitFamily(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["mt", "mts", "metricton", "metrictons", "tonne", "tonnes"].includes(normalized)) {
    return "metricton";
  }
  return normalized;
}

function numericDifference(
  invoice: string | null | undefined,
  calculated: string | null | undefined
) {
  if (invoice === null || invoice === undefined || invoice.trim() === "") return null;
  const invoiceValue = Number(invoice);
  const calculatedValue = Number(calculated);
  if (!Number.isFinite(invoiceValue) || !Number.isFinite(calculatedValue)) return null;
  return String(calculatedValue - invoiceValue);
}

function dedupeMasterOptions(options: TallyMasterOption[]) {
  const byName = new Map<string, TallyMasterOption>();
  const priority = (option: TallyMasterOption) => {
    if (option.type === "ledger") return 0;
    if (option.type === "gst_ledger") return 1;
    if (option.type === "tax_ledger") return 2;
    return 3;
  };

  for (const option of options) {
    const key = option.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || priority(option) < priority(existing)) {
      byName.set(key, option);
    }
  }

  return [...byName.values()];
}

type LedgerRole =
  | "purchase"
  | "cgst"
  | "sgst"
  | "igst"
  | "freight"
  | "tds_194q"
  | "transport_tds"
  | "cgst_tds"
  | "sgst_tds"
  | "igst_tds"
  | "tcs"
  | "round_off";

function optionIdentity(option: TallyMasterOption) {
  return [
    option.name,
    option.parent,
    option.groupPath,
    option.taxType,
    option.gstDutyHead,
  ].filter(Boolean).join(" ");
}

function rankLedgerRole(
  options: TallyMasterOption[],
  role: LedgerRole,
  expectedRate = 0,
  aiCandidates: string[] = []
) {
  const aiNames = new Set(aiCandidates.map((name) => name.trim().toLowerCase()));
  const score = (option: TallyMasterOption) => {
    const identity = optionIdentity(option);
    let value = aiNames.has(option.name.trim().toLowerCase()) ? 300 : 0;
    if (role === "purchase") {
      if (/purchase\s+accounts?/i.test(identity)) value += 120;
      else if (/\bpurchase\b/i.test(identity)) value += 80;
      if (/direct\s+expenses?/i.test(identity)) value += 25;
      if (/\b(sales|output|bank|cash|sundry\s+(?:debtors?|creditors?))\b/i.test(identity)) value -= 120;
    } else if (["cgst", "sgst", "igst"].includes(role)) {
      const component = role === "cgst"
        ? /\bcgst\b|central\s+tax/i
        : role === "sgst"
          ? /\bsgst\b|state\s+tax/i
          : /\bigst\b|integrated\s+tax/i;
      if (component.test(identity)) value += 120;
      if (/\b(input|itc|purchase)\b/i.test(identity)) value += 50;
      if (/\b(output|sales)\b/i.test(identity)) value -= 150;
      if (option.taxRate !== null && expectedRate > 0 && Math.abs(option.taxRate - expectedRate) < 0.001) value += 30;
    } else if (role === "freight") {
      if (/freight|transportation\s+inward/i.test(identity)) value += 130;
      if (/direct\s+expenses?|purchase/i.test(identity)) value += 25;
    } else if (role === "tds_194q") {
      if (/\btds\b|withholding|tax\s+deducted/i.test(identity)) value += 80;
      if (/194q|0[.]?10/i.test(identity)) value += 100;
    } else if (role === "transport_tds") {
      if (/\btds\b|withholding|tax\s+deducted/i.test(identity)) value += 80;
      if (/transport|freight|goods\s+carriage/i.test(identity)) value += 100;
    } else if (["cgst_tds", "sgst_tds", "igst_tds"].includes(role)) {
      if (/\btds\b|withholding|tax\s+deducted/i.test(identity)) value += 80;
      const component = role === "cgst_tds"
        ? /\bcgst\b|central\s+tax/i
        : role === "sgst_tds"
          ? /\bsgst\b|state\s+tax/i
          : /\bigst\b|integrated\s+tax/i;
      if (component.test(identity)) value += 100;
    } else if (role === "tcs") {
      if (/\btcs\b|tax\s+collected/i.test(identity)) value += 150;
      if (/receivable/i.test(identity)) value += 25;
    } else if (role === "round_off") {
      if (/round[\s-]*off/i.test(identity)) value += 150;
    }
    return value;
  };
  const ranked = [...options]
    .map((option) => ({ option, score: score(option) }))
    .sort((left, right) => right.score - left.score || left.option.name.localeCompare(right.option.name));
  return {
    options: ranked.map((entry) => entry.option),
    suggestedNames: ranked.filter((entry) => entry.score >= 100).slice(0, 8).map((entry) => entry.option.name),
  };
}

function rankStockItems(
  options: TallyMasterOption[],
  line: TallyPostingReview["lines"][number],
  aiCandidates: string[]
) {
  const aiNames = new Set(aiCandidates.map((name) => name.trim().toLowerCase()));
  const normalizedHsn = line.hsn.replace(/\D/g, "");
  const descriptionTokens = line.description.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const ranked = [...options].map((option) => {
    let score = aiNames.has(option.name.trim().toLowerCase()) ? 300 : 0;
    if (normalizedHsn && option.hsnCode?.replace(/\D/g, "") === normalizedHsn) score += 140;
    const identity = optionIdentity(option).toLowerCase();
    score += descriptionTokens.filter((token) => identity.includes(token)).length * 15;
    if (line.unit && option.unitName && normalizeUnitFamily(line.unit) === normalizeUnitFamily(option.unitName)) score += 20;
    return { option, score };
  }).sort((left, right) => right.score - left.score || left.option.name.localeCompare(right.option.name));
  return {
    options: ranked.map((entry) => entry.option),
    suggestedNames: ranked.filter((entry) => entry.score >= 100).slice(0, 8).map((entry) => entry.option.name),
  };
}

function caseStatusLabel(status: string | undefined) {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "completed") return "Pending decision";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Pending";
}

function statusLabel(status: string | undefined, verificationStatus?: unknown) {
  if (!status) return "Draft";
  if (status === "created" && verificationStatus === "already_in_tally") return "Already in Tally";
  const labels: Record<string, string> = {
    draft: "Draft",
    correction_required: "Needs attention",
    ready_for_approval: "Ready to send",
    approved: "Approved",
    queued: "Sending to Tally",
    creating: "Creating in Tally",
    created: "Created",
    failed: "Failed",
    verification_required: "Check required",
  };
  if (labels[status]) return labels[status];
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function postingProgressMessage(status: string | undefined, verificationStatus?: unknown) {
  if (status === "approved") return "Voucher approved. Preparing the Tally command…";
  if (status === "queued") return "Voucher approved and queued. Waiting for Tally…";
  if (status === "creating") return "Tally is creating and verifying the Purchase voucher…";
  if (status === "created" && verificationStatus === "already_in_tally") {
    return "The existing Purchase voucher was found and linked; no duplicate was created.";
  }
  if (status === "created") return "Purchase voucher created and verified in Tally.";
  if (status === "verification_required") return "Tally created the voucher, but verification needs attention.";
  return null;
}

function FieldIssues({ issues }: { issues?: TallyPostingIssue[] }) {
  if (!issues?.length) return null;
  return (
    <div className="space-y-1">
      {issues.map((issue) => (
        <p className="text-[11px] leading-4 text-rose-600" key={issue.code}>
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function ReviewWarnings({ warnings }: { warnings?: TallyPostingIssue[] }) {
  if (!warnings?.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
          key={`${warning.code}:${warning.lineId ?? index}`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <strong className="block">{warning.label}</strong>
            <span className="mt-0.5 block leading-5 text-amber-800">{warning.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  issues,
  sourceValue,
  compact = false,
  hideLabel = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  issues?: TallyPostingIssue[];
  sourceValue?: string | null;
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const sourceChanged = Boolean(
    sourceValue &&
      sourceValue.trim() &&
      sourceValue.trim() !== value.trim()
  );
  return (
    <label className={`scroll-mt-24 ${hideLabel ? "block" : compact ? "space-y-1" : "space-y-1.5"}`} id={id}>
      {!hideLabel ? (
        <span className={`flex items-center justify-between gap-2 font-medium text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>
          <span>{label}</span>
          {sourceChanged ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
              Edited
            </span>
          ) : null}
        </span>
      ) : null}
      <input
        aria-label={hideLabel ? label : undefined}
        aria-invalid={Boolean(issues?.length)}
        className={`${
          compact
            ? "h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            : inputClass
        } ${issues?.length ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      {sourceChanged ? (
        <p className="truncate text-[10px] leading-4 text-slate-400" title={sourceValue ?? ""}>
          Extracted: {sourceValue}
        </p>
      ) : null}
      <FieldIssues issues={issues} />
    </label>
  );
}

function MasterCombobox({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select from Tally",
  issues,
  companyName,
  syncedAt,
  syncing = false,
  compact = false,
  hideLabel = false,
  hideSourceBadge = false,
  sourceHint,
  emptyMessage = "No matching option was returned by Tally.",
  suggestedNames = [],
  suggestedLabel = "Suggested",
}: {
  id?: string;
  label: string;
  value: string;
  options: TallyMasterOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  issues?: TallyPostingIssue[];
  companyName: string;
  syncedAt?: string | null;
  syncing?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  hideSourceBadge?: boolean;
  sourceHint?: string;
  emptyMessage?: string;
  suggestedNames?: string[];
  suggestedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedValue = value.trim().toLowerCase();
  const selected =
    options.find((option) => option.name.trim().toLowerCase() === normalizedValue) ??
    null;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      [
        option.name,
        option.parent,
        option.groupPath,
        option.gstin,
        option.hsnCode,
        option.unitName,
        option.taxRate,
        option.closingBalance,
        option.closingBalanceType,
      ]
        .filter((item) => item !== null && item !== undefined)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [options, search]);
  const detail = (option: TallyMasterOption) =>
    option.type === "ledger"
      ? [option.groupPath || option.parent, closingBalanceLabel(option)].filter(Boolean)
      : [
          option.groupPath || option.parent,
          option.hsnCode ? `HSN ${option.hsnCode}` : null,
          option.unitName ? `Unit ${option.unitName}` : null,
          option.taxRate !== null ? `${option.taxRate}%` : null,
        ].filter(Boolean);
  const optionTags = (option: TallyMasterOption) =>
    option.type === "ledger"
      ? [closingBalanceLabel(option)].filter(Boolean)
      : [
          option.hsnCode ? `HSN ${option.hsnCode}` : null,
          option.unitName ? `Unit ${option.unitName}` : null,
          option.taxRate !== null ? `${option.taxRate}%` : null,
        ].filter(Boolean);
  const suggestedNameSet = useMemo(
    () => new Set(suggestedNames.map((name) => name.trim().toLowerCase())),
    [suggestedNames]
  );

  return (
    <div className={`scroll-mt-24 ${compact ? `w-full max-w-[280px] ${hideLabel ? "" : "space-y-1"}` : "space-y-1.5"}`} id={id}>
      {!hideLabel ? (
        <span className={`flex items-center justify-between gap-2 font-medium text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>
          <span>{label}</span>
          {!hideSourceBadge ? (
            <span className={`${compact ? "text-[8px]" : "text-[9px]"} font-semibold uppercase tracking-wide text-emerald-700`}>
              From Tally
            </span>
          ) : null}
        </span>
      ) : null}
      <Popover
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch("");
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <button
            aria-label={hideLabel ? label : undefined}
            aria-expanded={open}
            className={`${compact
              ? "w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
              : inputClass
            } flex h-auto items-center justify-between text-left ${
              compact ? "min-h-8 gap-2 py-1.5" : "min-h-10 gap-3 py-2"
            } ${
              issues?.length || (value && !selected)
                ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                : ""
            }`}
            disabled={disabled}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${value ? "font-medium text-slate-900" : "text-slate-400"}`}>
                {value || (syncing ? "Refreshing Tally data…" : placeholder)}
              </span>
              {selected && detail(selected).length > 0 ? (
                <span className={`${compact ? "text-[9px]" : "text-[10px]"} mt-0.5 block truncate text-slate-400`}>
                  {detail(selected).join(" · ")}
                </span>
              ) : null}
            </span>
            {syncing ? (
              <Loader2 className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 animate-spin text-emerald-600`} />
            ) : (
              <ChevronDown className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-slate-400`} />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={16}
          className={`${compact
            ? "w-[max(var(--radix-popover-trigger-width),360px)] max-w-[calc(100vw-2rem)]"
            : "w-[min(430px,calc(100vw-2rem))]"
          } z-[100] flex max-h-[min(26rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl`}
          sideOffset={6}
        >
          <div className={`shrink-0 border-b border-slate-100 ${compact ? "p-2.5" : "p-3"}`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                className={`${compact ? "h-8 text-xs" : "h-9 text-sm"} w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100`}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${options.length.toLocaleString("en-IN")} live masters`}
                value={search}
              />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold text-slate-600">{companyName || "No Tally company selected"}</div>
                <div className="mt-0.5 text-[9px] leading-4 text-slate-400">
                  {suggestedNameSet.size > 0 ? `${suggestedNameSet.size} ${suggestedLabel.toLowerCase()} first · ` : ""}
                  {syncedAt ? `Synced ${formatDateTime(syncedAt)}` : "Not synced"}
                </div>
              </div>
              {value ? (
                <button
                  className="shrink-0 text-[10px] font-semibold text-slate-500 hover:text-rose-700"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  type="button"
                >
                  Clear selection
                </button>
              ) : null}
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            onWheel={(event) => event.stopPropagation()}
            style={{ maxHeight: "min(20rem, calc(var(--radix-popover-content-available-height) - 7rem))" }}
          >
            <div className="p-1.5">
              {filtered.length > 0 ? (
                filtered.map((option) => (
                  <button
                    className={`w-full rounded-lg text-left transition hover:bg-emerald-50 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${
                      selected?.id === option.id ? "bg-emerald-50" : ""
                    }`}
                    key={`${option.type}:${option.id}`}
                    onClick={() => {
                      onChange(option.name);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className={`block truncate font-semibold text-slate-900 ${compact ? "text-xs" : "text-sm"}`}>
                          {option.name}
                        </span>
                        {option.groupPath || option.parent ? (
                          <span
                            className={`${compact ? "text-[9px]" : "text-[10px]"} mt-0.5 block w-full overflow-hidden text-ellipsis whitespace-nowrap text-slate-400`}
                            title={option.groupPath || option.parent || undefined}
                          >
                            {option.groupPath || option.parent}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap gap-1">
                          {suggestedNameSet.has(option.name.trim().toLowerCase()) ? (
                            <span className={`rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                              {suggestedLabel}
                            </span>
                          ) : null}
                          {optionTags(option).map((item) => (
                            <span
                              className={`rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}
                              key={String(item)}
                            >
                              {item}
                            </span>
                          ))}
                        </span>
                      </span>
                      {selected?.id === option.id ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      ) : null}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-8 text-center">
                  <PackageSearch className="mx-auto h-5 w-5 text-slate-300" />
                  <p className="mt-2 text-xs font-medium text-slate-600">{emptyMessage}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Refresh Tally data and try again.
                  </p>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {sourceHint ? <p className="text-[10px] leading-4 text-slate-400">{sourceHint}</p> : null}
      {value && !selected ? (
        <p className="text-[11px] leading-4 text-rose-600">
          This selection is not available in the latest data from {companyName || "Tally"}.
        </p>
      ) : null}
      <FieldIssues issues={issues} />
    </div>
  );
}

function issueAnchor(issue: TallyPostingIssue) {
  const byCode: Record<string, string> = {
    INVOICE_NUMBER_REQUIRED: "field-invoice-number",
    INVOICE_DATE_REQUIRED: "field-invoice-date",
    VOUCHER_DATE_REQUIRED: "field-voucher-date",
    INVOICE_TOTAL_REQUIRED: "field-invoice-total",
    SUPPLIER_GSTIN_REQUIRED: "field-supplier-gstin",
    BUYER_GSTIN_REQUIRED: "field-buyer-gstin",
    SUPPLIER_LEDGER_REQUIRED: "field-supplier-ledger",
    SUPPLIER_LEDGER_GSTIN_MISMATCH: "field-supplier-ledger",
    GST_RATE_REQUIRED: "field-gst-rate",
    CGST_LEDGER_REQUIRED: "field-cgst-ledger",
    SGST_LEDGER_REQUIRED: "field-sgst-ledger",
    IGST_LEDGER_REQUIRED: "field-igst-ledger",
    FREIGHT_LEDGER_REQUIRED: "field-freight-ledger",
    FREIGHT_GST_RATE_REQUIRED: "field-freight-rate",
    TDS_194Q_RATE_REQUIRED: "field-tds-194q-rate",
    TDS_194Q_LEDGER_REQUIRED: "field-tds-194q-ledger",
    TRANSPORT_TDS_RATE_REQUIRED: "field-transport-tds-rate",
    TRANSPORT_TDS_LEDGER_REQUIRED: "field-transport-tds-ledger",
    GST_TDS_RATE_REQUIRED: "field-gst-tds-rate",
    CGST_TDS_LEDGER_REQUIRED: "field-cgst-tds-ledger",
    SGST_TDS_LEDGER_REQUIRED: "field-sgst-tds-ledger",
    IGST_TDS_LEDGER_REQUIRED: "field-igst-tds-ledger",
    TCS_AMOUNT_REQUIRED: "field-tcs-amount",
    TCS_LEDGER_REQUIRED: "field-tcs-ledger",
    ROUND_OFF_LEDGER_REQUIRED: "field-round-off-ledger",
    SOURCE_REFERENCE_APPROVAL_REQUIRED: "field-source-reference",
  };
  if (byCode[issue.code]) return byCode[issue.code];
  if (issue.scope === "line" && issue.lineId) return `tally-line-${issue.lineId}`;
  if (issue.scope === "line") return "tally-items";
  if (issue.scope === "tax") return "tally-taxes";
  if (issue.scope === "source") return "tally-preview";
  if (issue.scope === "invoice") return "tally-invoice";
  if (issue.scope === "company") return "tally-header";
  return "tally-header";
}

export type TallyPurchaseHeaderState = {
  selectedConnectionId: string | null;
  connection: TallyPostingResponse["connection"];
  connectionOptions: TallyPostingResponse["connectionOptions"];
  buyerGstin: string | null;
  postingStatus: string | null;
  tallyVoucherNumber: string | null;
  invoiceNumber: string | null;
  verifiedAt: string | null;
};

export function TallyPurchasePostingPanel({
  caseId,
  onApprovePacket,
  onHeaderStateChange,
  onRefreshReady,
}: {
  caseId: string;
  onApprovePacket?: () => Promise<void>;
  onHeaderStateChange?: (state: TallyPurchaseHeaderState) => void;
  onRefreshReady?: (refresh: () => Promise<void>) => void;
}) {
  const [payload, setPayload] = useState<TallyPostingResponse | null>(null);
  const [review, setReview] = useState<TallyPostingReview | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [state, setState] = useState<PanelState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [connectionDirty, setConnectionDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectingInvoiceId, setSelectingInvoiceId] = useState<string | null>(null);
  const [approvingPacket, setApprovingPacket] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [refreshingMasters, setRefreshingMasters] = useState(false);
  const [liveMastersReady, setLiveMastersReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [editingGstRate, setEditingGstRate] = useState(false);
  const [supplierLedgerMatch, setSupplierLedgerMatch] = useState<SupplierLedgerMatch | null>(null);
  const [matchingSupplierLedger, setMatchingSupplierLedger] = useState(false);
  const [supplierLedgerMatchError, setSupplierLedgerMatchError] = useState<string | null>(null);
  const [lineMasterMatches, setLineMasterMatches] = useState<PurchaseLineMasterSuggestion[]>([]);
  const [matchingLineMasters, setMatchingLineMasters] = useState(false);
  const [lineMasterMatchError, setLineMasterMatchError] = useState<string | null>(null);
  const automaticSupplierMatchKeyRef = useRef("");
  const automaticLineMasterMatchKeyRef = useRef("");
  const lastPostingStatusRef = useRef<string | null>(null);
  const automaticLiveRefreshRef = useRef<string | null>(null);
  const liveMasterResultRef = useRef<unknown>(null);
  const liveMasterOptionsRef = useRef<TallyPostingResponse["masterOptions"] | null>(null);

  const withLiveMasterOptions = useCallback((next: TallyPostingResponse) =>
    liveMasterOptionsRef.current
      ? { ...next, masterOptions: liveMasterOptionsRef.current }
      : next, []);

  const load = useCallback(async (
    quiet = false,
    connectionId?: string | null,
    replaceReview = false,
    companyName?: string | null
  ) => {
    if (!quiet) setState("loading");
    try {
      const next = await fetchTallyPurchasePosting(
        caseId,
        connectionId,
        companyName
      );
      const hydrated = withLiveMasterOptions(next);
      setPayload(hydrated);
      setSelectedConnectionId(hydrated.selectedConnectionId ?? connectionId ?? "");
      setSelectedCompanyName(hydrated.selectedCompanyName ?? companyName ?? "");
      if (replaceReview || (!dirty && !review)) setReview(hydrated.review);
      setError(null);
      setState("ready");
      return hydrated;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Tally posting review.");
      setState("error");
      return null;
    }
  }, [caseId, dirty, review, withLiveMasterOptions]);

  // Resolve the selected connection once, then read a brand-new catalogue
  // directly through the local gateway. This replaces the old Supabase
  // command queue + one-second polling loop and also prevents two initial
  // tally-posting requests from racing each other.
  useEffect(() => {
    if (automaticLiveRefreshRef.current === caseId) return;
    automaticLiveRefreshRef.current = caseId;
    setLiveMastersReady(false);
    void (async () => {
      const next = await load(false, null, true);
      const connection = next?.connection;
      if (
        !next ||
        !next.selectedConnectionId ||
        !next.selectedCompanyName ||
        !connection?.bridgeConnected ||
        !connection.tallyReachable ||
        !connection.companyLoaded
      ) return;
      try {
        setRefreshingMasters(true);
        setNotice("Reading the latest masters from Tally…");
        const liveMasters = await runCashDiscountLiveRequest({
          connectionId: next.selectedConnectionId,
          companyName: next.selectedCompanyName,
          operation: "ledger_masters",
          payload: {
            persist: false,
            requestedMasterTypes: ["ledger", "group", "stock_item", "unit", "gst_ledger", "tax_ledger"],
          },
          onProgress: (message) => setNotice(message),
        });
        const liveCatalogue = prepareLiveTallyCatalogue(liveMasters, next.review);
        liveMasterResultRef.current = liveCatalogue.compactResult;
        liveMasterOptionsRef.current = liveCatalogue.masterOptions;
        const prepared = await prepareTallyPurchasePostingFromLive(
          caseId,
          next.selectedConnectionId,
          next.selectedCompanyName,
          liveCatalogue.compactResult
        );
        const hydrated = withLiveMasterOptions(prepared);
        setPayload(hydrated);
        setReview(hydrated.review);
        setSupplierLedgerMatch(hydrated.supplierLedgerMatch ?? null);
        setLineMasterMatches(hydrated.lineMasterMatches ?? []);
        setLiveMastersReady(true);
        setNotice("Latest live Tally data loaded.");
      } catch (refreshError) {
        setNotice(refreshError instanceof Error ? refreshError.message : "Live Tally refresh is unavailable.");
      } finally {
        setRefreshingMasters(false);
      }
    })();
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const postingStatus = payload?.posting?.status;
    if (!["approved", "queued", "creating"].includes(postingStatus ?? "")) return;
    const connectionId = payload?.selectedConnectionId;
    const commandId = payload?.posting?.commandId;
    let cancelled = false;
    let fallbackTimer: number | null = null;

    if (connectionId && commandId) {
      void (async () => {
        let pollAttempt = 0;
        try {
          while (!cancelled) {
            const intervalMs = Math.min(1500 + pollAttempt * 500, 4000);
            const terminal = await waitForTallyCommand(connectionId, commandId, {
              attempts: 1,
              intervalMs,
            });
            pollAttempt += 1;
            if (!terminal) continue;
            if (!cancelled) {
              if (terminal.status !== "succeeded") {
                // Failure and verification-required states carry richer server
                // diagnostics than the compact command result. They are rare,
                // so retain the full refresh only for those paths.
                await load(true, connectionId, false, payload?.selectedCompanyName);
                setNotice(null);
                setError(terminal.error ?? "Tally could not create the Purchase voucher.");
                return;
              }
              const result = terminal.result ?? {};
              const textResult = (key: string) =>
                typeof result[key] === "string" && result[key].trim()
                  ? result[key].trim()
                  : null;
              setPayload((current) => {
                if (!current?.posting) return current;
                return {
                  ...current,
                  blockers: [],
                  warnings: [],
                  readyForApproval: true,
                  posting: {
                    ...current.posting,
                    status: "created",
                    tallyVoucherNumber: textResult("voucherNumber") ?? current.posting.tallyVoucherNumber,
                    tallyMasterId: textResult("masterId") ?? current.posting.tallyMasterId,
                    tallyGuid: textResult("guid") ?? current.posting.tallyGuid,
                    tallyCreatedAt: terminal.completedAt ?? current.posting.tallyCreatedAt,
                    verifiedAt: terminal.completedAt ?? current.posting.verifiedAt,
                    verificationResult: {
                      verificationStatus: textResult("verificationStatus") ?? "verified",
                    },
                    lastError: null,
                    updatedAt: terminal.updatedAt ?? current.posting.updatedAt,
                  },
                };
              });
              setError(null);
              setNotice("Purchase voucher created and verified in Tally.");
            }
            return;
          }
        } catch {
          if (!cancelled) {
            fallbackTimer = window.setTimeout(
              () => void load(true, connectionId, false, payload?.selectedCompanyName),
              3000
            );
          }
        }
      })();
    } else {
      fallbackTimer = window.setTimeout(
        () => void load(true, connectionId, false, payload?.selectedCompanyName),
        3000
      );
    }

    return () => {
      cancelled = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [
    load,
    payload?.posting?.commandId,
    payload?.posting?.status,
    payload?.selectedCompanyName,
    payload?.selectedConnectionId,
  ]);

  useEffect(() => {
    if (!dirty && !connectionDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [connectionDirty, dirty]);

  useEffect(() => {
    if (!notice || refreshingMasters || /waiting|refreshing|queued|creating|sending|preparing/i.test(notice)) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, refreshingMasters]);

  useEffect(() => {
    const status = payload?.posting?.status ?? null;
    const previousStatus = lastPostingStatusRef.current;
    lastPostingStatusRef.current = status;
    if (!status || !previousStatus || status === previousStatus) return;

    if (status === "failed") {
      setNotice(null);
      setError(payload?.posting?.lastError || "Tally could not create the Purchase voucher.");
      return;
    }

    const progressMessage = postingProgressMessage(
      status,
      payload?.posting?.verificationResult?.verificationStatus
    );
    if (progressMessage) {
      setError(null);
      setNotice(progressMessage);
    }
  }, [payload?.posting?.lastError, payload?.posting?.status, payload?.posting?.verificationResult]);

  useEffect(() => {
    if (!payload) return;
    onHeaderStateChange?.({
      selectedConnectionId: payload.selectedConnectionId,
      connection: payload.connection,
      connectionOptions: payload.connectionOptions,
      buyerGstin: payload.review?.buyerGstin || payload.source?.buyerGstin || null,
      postingStatus: payload.posting?.status ?? null,
      tallyVoucherNumber: payload.posting?.tallyVoucherNumber ?? null,
      invoiceNumber: payload.posting?.invoiceNumber ?? payload.review?.invoiceNumber ?? null,
      verifiedAt: payload.posting?.verifiedAt ?? null,
    });
  }, [onHeaderStateChange, payload]);

  const locked = ["approved", "queued", "creating", "created", "verification_required"].includes(payload?.posting?.status ?? "");
  const ledgerOptions = useMemo(
    () => dedupeMasterOptions(payload?.masterOptions.ledgers ?? []),
    [payload?.masterOptions.ledgers]
  );
  const stockItemOptions = payload?.masterOptions.stockItems ?? [];
  const godownOptions = useMemo(() => {
    const liveOptions = payload?.masterOptions.godowns ?? [];
    const inferredNames = Array.from(new Set(
      [payload?.source?.godownName, ...(payload?.source?.lines ?? []).map((line) => line.godownName)]
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name))
    ));
    const existing = new Set(liveOptions.map((option) => option.name.trim().toLowerCase()));
    const inferredOptions: TallyMasterOption[] = inferredNames
      .filter((name) => !existing.has(name.toLowerCase()))
      .map((name) => ({
        id: `packet-godown:${name}`,
        type: "godown",
        key: name.toLowerCase(),
        name,
        parent: null,
        gstin: null,
        hsnCode: null,
        unitName: null,
        taxRate: null,
        groupPath: "From purchase packet",
        taxType: null,
        gstDutyHead: null,
        closingBalance: null,
        closingBalanceType: null,
      }));
    return [...liveOptions, ...inferredOptions];
  }, [payload?.masterOptions.godowns, payload?.source?.godownName, payload?.source?.lines]);
  const supplierLedgerOptions = useMemo(() => {
    const preferredNames = new Set(
      (supplierLedgerMatch?.candidateLedgerNames ?? []).map((name) => name.trim().toLowerCase())
    );
    return [...ledgerOptions].sort((left, right) => {
      const rightSuggested = Number(preferredNames.has(right.name.trim().toLowerCase()));
      const leftSuggested = Number(preferredNames.has(left.name.trim().toLowerCase()));
      const rightGstinMatch = Number(
        Boolean(review?.supplierGstin) &&
          right.gstin?.toUpperCase() === review?.supplierGstin.toUpperCase()
      );
      const leftGstinMatch = Number(
        Boolean(review?.supplierGstin) &&
          left.gstin?.toUpperCase() === review?.supplierGstin.toUpperCase()
      );
      const rightCreditor = Number(/sundry\s+creditors?|trade\s+payables?/i.test(right.parent ?? ""));
      const leftCreditor = Number(/sundry\s+creditors?|trade\s+payables?/i.test(left.parent ?? ""));
      return rightSuggested - leftSuggested ||
        rightGstinMatch - leftGstinMatch ||
        rightCreditor - leftCreditor ||
        left.name.localeCompare(right.name);
    });
  }, [ledgerOptions, review?.supplierGstin, supplierLedgerMatch?.candidateLedgerNames]);

  useEffect(() => {
    const supplierName = review?.supplierName?.trim() ?? "";
    const supplierGstin = review?.supplierGstin?.trim() ?? "";
    if (
      locked ||
      payload?.liveMatchingComplete ||
      review?.supplierLedgerName?.trim() ||
      (!supplierName && !supplierGstin) ||
      !payload?.connection?.masterSnapshotFresh ||
      !payload.connection.masterSnapshotComplete ||
      !liveMastersReady ||
      !selectedConnectionId ||
      !selectedCompanyName
    ) {
      return;
    }
    const key = [
      selectedConnectionId,
      selectedCompanyName,
      payload.connection.masterSyncRunId ?? "",
      supplierName,
      supplierGstin,
    ].join("::");
    if (automaticSupplierMatchKeyRef.current === key) return;
    automaticSupplierMatchKeyRef.current = key;
    setMatchingSupplierLedger(true);
    setSupplierLedgerMatchError(null);
    void matchTallyPurchaseSupplierLedger(caseId, {
      connectionId: selectedConnectionId,
      companyName: selectedCompanyName,
      supplierName,
      supplierGstin,
    })
      .then((match) => {
        setSupplierLedgerMatch(match);
        if (match.matchType === "direct_match" && match.ledgerName) {
          setReview((current) => current ? { ...current, supplierLedgerName: match.ledgerName ?? "" } : current);
          setDirty(true);
        }
      })
      .catch((matchError) => {
        setSupplierLedgerMatchError(
          matchError instanceof Error ? matchError.message : "Supplier ledger matching failed."
        );
      })
      .finally(() => setMatchingSupplierLedger(false));
  }, [
    caseId,
    locked,
    payload?.liveMatchingComplete,
    payload?.connection?.masterSnapshotComplete,
    payload?.connection?.masterSnapshotFresh,
    payload?.connection?.masterSyncRunId,
    liveMastersReady,
    review?.supplierGstin,
    review?.supplierLedgerName,
    review?.supplierName,
    selectedCompanyName,
    selectedConnectionId,
  ]);

  useEffect(() => {
    if (
      locked ||
      payload?.liveMatchingComplete ||
      !review ||
      !selectedConnectionId ||
      !selectedCompanyName ||
      !payload?.connection?.masterSnapshotFresh ||
      !payload.connection.masterSnapshotComplete ||
      !liveMastersReady ||
      !review.lines.some((line) => !line.stockItemName.trim() || !line.purchaseLedgerName.trim())
    ) {
      return;
    }
    const key = [
      selectedConnectionId,
      selectedCompanyName,
      payload.connection.masterSyncRunId ?? "",
      ...review.lines.map((line) => [
        line.lineId,
        line.description,
        line.hsn,
        line.unit,
        line.stockItemName,
        line.purchaseLedgerName,
      ].join("|")),
    ].join("::");
    if (automaticLineMasterMatchKeyRef.current === key) return;
    automaticLineMasterMatchKeyRef.current = key;
    setMatchingLineMasters(true);
    setLineMasterMatchError(null);
    void matchTallyPurchaseLineMasters(caseId, {
      connectionId: selectedConnectionId,
      companyName: selectedCompanyName,
      review,
    })
      .then((matches) => {
        setLineMasterMatches(matches);
        const directByLine = new Map(matches.map((match) => [match.lineId, match]));
        const hasDirect = matches.some((match) =>
          match.stockItem.matchType === "direct_match" ||
          match.purchaseLedger.matchType === "direct_match"
        );
        if (!hasDirect) return;
        setReview((current) => current ? {
          ...current,
          lines: current.lines.map((line) => {
            const match = directByLine.get(line.lineId);
            if (!match) return line;
            return {
              ...line,
              stockItemName:
                line.stockItemName ||
                (match.stockItem.matchType === "direct_match" ? match.stockItem.masterName ?? "" : ""),
              purchaseLedgerName:
                line.purchaseLedgerName ||
                (match.purchaseLedger.matchType === "direct_match" ? match.purchaseLedger.masterName ?? "" : ""),
            };
          }),
        } : current);
        setDirty(true);
      })
      .catch((matchError) => {
        setLineMasterMatchError(
          matchError instanceof Error ? matchError.message : "Purchase master matching failed."
        );
      })
      .finally(() => setMatchingLineMasters(false));
  }, [
    caseId,
    locked,
    payload?.liveMatchingComplete,
    payload?.connection?.masterSnapshotComplete,
    payload?.connection?.masterSnapshotFresh,
    payload?.connection?.masterSyncRunId,
    liveMastersReady,
    review,
    selectedCompanyName,
    selectedConnectionId,
  ]);
  const cgstRanked = rankLedgerRole(ledgerOptions, "cgst", Number(review?.gstRate || 0) / 2);
  const sgstRanked = rankLedgerRole(ledgerOptions, "sgst", Number(review?.gstRate || 0) / 2);
  const igstRanked = rankLedgerRole(ledgerOptions, "igst", Number(review?.gstRate || 0));
  const freightRanked = rankLedgerRole(ledgerOptions, "freight", Number(review?.freightGstRate || 0));
  const tds194qRanked = rankLedgerRole(ledgerOptions, "tds_194q");
  const transportTdsRanked = rankLedgerRole(ledgerOptions, "transport_tds");
  const cgstTdsRanked = rankLedgerRole(ledgerOptions, "cgst_tds");
  const sgstTdsRanked = rankLedgerRole(ledgerOptions, "sgst_tds");
  const igstTdsRanked = rankLedgerRole(ledgerOptions, "igst_tds");
  const tcsRanked = rankLedgerRole(ledgerOptions, "tcs");
  const roundOffRanked = rankLedgerRole(ledgerOptions, "round_off");
  const cgstOptions = cgstRanked.options;
  const sgstOptions = sgstRanked.options;
  const igstOptions = igstRanked.options;
  const freightOptions = freightRanked.options;
  const tds194qOptions = tds194qRanked.options;
  const transportTdsOptions = transportTdsRanked.options;
  const cgstTdsOptions = cgstTdsRanked.options;
  const sgstTdsOptions = sgstTdsRanked.options;
  const igstTdsOptions = igstTdsRanked.options;
  const tcsOptions = tcsRanked.options;
  const roundOffOptions = roundOffRanked.options;
  const correctionBlockers = useMemo(
    () => ["created", "verification_required"].includes(payload?.posting?.status ?? "")
      ? []
      : (payload?.blockers ?? []).filter((issue) => {
      if (issue.scope === "case" || issue.scope === "company") return false;
      // Server blockers describe the last saved review. Clear date errors as
      // soon as the current browser value is valid; Save still performs the
      // authoritative server validation before approval.
      if (issue.code === "INVOICE_DATE_REQUIRED" && isValidDateInput(review?.invoiceDate)) return false;
      if (issue.code === "VOUCHER_DATE_REQUIRED" && isValidDateInput(review?.voucherDate)) return false;
      return true;
    }),
    [payload?.blockers, payload?.posting?.status, review?.invoiceDate, review?.voucherDate]
  );
  const acknowledgementWarnings = useMemo(
    () => (payload?.warnings ?? []).filter((warning) => warning.requiresAcknowledgement),
    [payload?.warnings]
  );
  const acknowledgementWarningKey = acknowledgementWarnings
    .map((warning) => warning.code)
    .sort()
    .join("|");
  useEffect(() => {
    setWarningsAcknowledged(false);
  }, [acknowledgementWarningKey, payload?.posting?.revision]);
  const warningsByScope = useMemo(() => {
    const map = new Map<string, TallyPostingIssue[]>();
    for (const warning of payload?.warnings ?? []) {
      const key = warning.lineId ? `line:${warning.lineId}` : warning.scope;
      map.set(key, [...(map.get(key) ?? []), warning]);
    }
    return map;
  }, [payload?.warnings]);

  const issuesByScope = useMemo(() => {
    const map = new Map<string, TallyPostingIssue[]>();
    for (const issue of correctionBlockers) {
      const key = issue.lineId ? `line:${issue.lineId}` : issue.scope;
      map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return map;
  }, [correctionBlockers]);

  function scopeIssues(scope: TallyPostingIssue["scope"], codes?: string[]) {
    return (issuesByScope.get(scope) ?? []).filter((issue) => !codes || codes.includes(issue.code));
  }

  function lineIssues(lineId: string, codes?: string[]) {
    return (issuesByScope.get(`line:${lineId}`) ?? []).filter((issue) => !codes || codes.includes(issue.code));
  }

  function scopeWarnings(scope: TallyPostingIssue["scope"]) {
    return warningsByScope.get(scope) ?? [];
  }

  function lineWarnings(lineId: string) {
    return warningsByScope.get(`line:${lineId}`) ?? [];
  }

  function updateReview<K extends keyof TallyPostingReview>(key: K, value: TallyPostingReview[K]) {
    setReview((current) => current ? { ...current, [key]: value } : current);
    if (key === "supplierName" || key === "supplierGstin") {
      setSupplierLedgerMatch(null);
      setSupplierLedgerMatchError(null);
      automaticSupplierMatchKeyRef.current = "";
    }
    setDirty(true);
    setNotice(null);
  }

  async function persistReview(nextReview: TallyPostingReview) {
    if (!selectedConnectionId || !selectedCompanyName || locked) return;
    try {
      setSaving(true);
      setError(null);
      const next = await saveTallyPurchasePosting(
        caseId,
        nextReview,
        selectedConnectionId,
        selectedCompanyName,
        liveMasterResultRef.current
      );
      const hydrated = withLiveMasterOptions(next);
      setPayload(hydrated);
      setReview(hydrated.review);
      setSelectedConnectionId(hydrated.selectedConnectionId ?? selectedConnectionId);
      setSelectedCompanyName(hydrated.selectedCompanyName ?? selectedCompanyName);
      setDirty(false);
      setConnectionDirty(false);
      setNotice(hydrated.readyForApproval
        ? "Changes saved. This voucher is ready to send to Tally."
        : "Changes saved. Complete the highlighted items before approval.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjustmentToggle(
    key: "applyTds194q" | "applyTransportTds" | "applyGstTds" | "tcsReceivable"
  ) {
    if (!review || locked || saving) return;
    const nextReview = { ...review, [key]: !review[key] };
    setReview(nextReview);
    setDirty(true);
    setNotice("Recalculating voucher…");
    await persistReview(nextReview);
  }

  function updateLine(index: number, key: keyof TallyPostingReview["lines"][number], value: string) {
    setReview((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line, lineIndex) =>
          lineIndex === index ? { ...line, [key]: value } : line
        ),
      };
    });
    setDirty(true);
    setNotice(null);
  }

  async function handleSave() {
    if (!review || !selectedConnectionId || !selectedCompanyName || locked) return;
    await persistReview(review);
  }

  async function handleInvoiceSelection(documentId: string) {
    if (!selectedConnectionId || !selectedCompanyName || locked) return;
    setSelectingInvoiceId(documentId);
    setError(null);
    try {
      const next = await selectTallyPurchaseInvoice(
        caseId,
        documentId,
        selectedConnectionId,
        selectedCompanyName,
        liveMasterResultRef.current
      );
      const hydrated = withLiveMasterOptions(next);
      setPayload(hydrated);
      setReview(hydrated.review);
      setDirty(false);
      setNotice("Purchase invoice selected. Review the accounting before posting.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to select the invoice.");
    } finally {
      setSelectingInvoiceId(null);
    }
  }

  async function handleApprovePacket() {
    if (!onApprovePacket || approvingPacket || locked) return;

    try {
      setApprovingPacket(true);
      setError(null);
      await onApprovePacket();
      const next = await load(
        true,
        selectedConnectionId || null,
        false,
        selectedCompanyName || null
      );
      if (!next) return;
      setNotice("Packet approved. The Purchase voucher can now be sent to Tally.");
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Could not approve the packet."
      );
    } finally {
      setApprovingPacket(false);
    }
  }

  async function handleApproveAndQueue() {
    if (
      !payload?.readyForApproval ||
      dirty ||
      connectionDirty ||
      locked ||
      refreshingMasters ||
      (acknowledgementWarnings.length > 0 && !warningsAcknowledged)
    ) {
      return;
    }
    try {
      setQueueing(true);
      setError(null);
      if (!selectedConnectionId || !selectedCompanyName) {
        throw new Error("Select the active Tally company before posting.");
      }
      if (!liveMasterResultRef.current) {
        throw new Error("Refresh the live Tally data once before posting.");
      }
      if (!liveMasterOptionsRef.current || !review) {
        throw new Error("Refresh the live Tally data once before posting.");
      }
      const approvalContext = prepareLiveTallyApprovalContext(
        liveMasterResultRef.current,
        review,
        liveMasterOptionsRef.current
      );
      setNotice("Validating the selected masters and sending to Tally…");
      const next = await approveAndQueueTallyPurchasePosting(
        caseId,
        acknowledgementWarnings.map((warning) => warning.code),
        selectedConnectionId,
        selectedCompanyName,
        approvalContext
      );
      const hydrated = withLiveMasterOptions(next);
      setPayload(hydrated);
      setReview(hydrated.review);
      setDirty(false);
      setConnectionDirty(false);
      setConfirmOpen(false);
      setNotice(
        postingProgressMessage(
          hydrated.posting?.status,
          hydrated.posting?.verificationResult?.verificationStatus
        ) ||
        "Voucher approved. Preparing the Tally command…"
      );
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Could not send the Purchase voucher to Tally.");
    } finally {
      setQueueing(false);
    }
  }

  const handleRefreshMasters = useCallback(async (automatic = false) => {
    const connection = payload?.connection;
    if (!connection?.id || !connection.companyName) return;
    try {
      setRefreshingMasters(true);
      setError(null);
      if (automatic) {
        setNotice(`Reading the latest data from ${connection.companyName}…`);
      }
      if (!automatic) {
        setNotice("Reading live company data from Tally…");
      }
      const liveMasters = await runCashDiscountLiveRequest({
        connectionId: connection.id,
        companyName: connection.companyName,
        operation: "ledger_masters",
        payload: {
          persist: false,
          requestedMasterTypes: ["ledger", "group", "stock_item", "unit", "gst_ledger", "tax_ledger"],
        },
        onProgress: (message) => setNotice(message),
      });
      const liveCatalogue = prepareLiveTallyCatalogue(liveMasters, review);
      liveMasterResultRef.current = liveCatalogue.compactResult;
      liveMasterOptionsRef.current = liveCatalogue.masterOptions;
      const prepared = await prepareTallyPurchasePostingFromLive(
        caseId,
        connection.id,
        connection.companyName,
        liveCatalogue.compactResult
      );
      const hydrated = withLiveMasterOptions(prepared);
      setPayload(hydrated);
      if (!dirty) setReview(hydrated.review);
      setSupplierLedgerMatch(hydrated.supplierLedgerMatch ?? null);
      setLineMasterMatches(hydrated.lineMasterMatches ?? []);
      setLiveMastersReady(true);
      setNotice("Latest company data loaded from Tally.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh data from Tally.");
    } finally {
      setRefreshingMasters(false);
    }
  }, [caseId, dirty, payload?.connection, review, withLiveMasterOptions]);

  // Let the page-level Tally header invoke the exact same refresh path. This
  // keeps one source of truth without persisting the full live catalogue.
  useEffect(() => {
    onRefreshReady?.(() => handleRefreshMasters(false));
    return () => onRefreshReady?.(() => Promise.resolve());
  }, [handleRefreshMasters, onRefreshReady]);

  async function handleOpenSource() {
    if (!payload?.sourceFileId) return;
    try {
      const result = await fetchCaseFileSignedUrl(caseId, payload.sourceFileId);
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Failed to open source invoice.");
    }
  }

  const sourceLineById = useMemo(
    () => new Map(payload?.source?.lines.map((line) => [line.lineId, line]) ?? []),
    [payload?.source?.lines]
  );
  const hasUnsavedChanges = dirty || connectionDirty;
  const canSave = Boolean(
    review &&
    selectedConnectionId &&
    selectedCompanyName &&
    !locked &&
    !refreshingMasters &&
    (hasUnsavedChanges || !payload?.posting)
  );
  const connection = payload?.connection;
  const connectionReadable = Boolean(
    connection?.bridgeConnected &&
      connection.tallyReachable &&
      connection.companyLoaded &&
      !connection.heartbeatStale
  );
  const mastersNeedSync = Boolean(
    connectionReadable &&
      connection?.id &&
      connection.companyName &&
      (!connection.masterSnapshotFresh || !connection.masterSnapshotComplete)
  );
  const masterSelectionDisabled = locked || refreshingMasters;
  const selectedMatchesActive = Boolean(
    connectionReadable &&
      connection?.companyName &&
      connection.activeCompanyName &&
      connection.companyName.trim().toLowerCase() ===
        connection.activeCompanyName.trim().toLowerCase()
  );
  // A stale snapshot should block approval, but it is not an active refresh.
  // Keep the page idle until the reviewer explicitly asks for a full Tally
  // master refresh instead of queueing one on every page open.
  const tallyReviewRefreshing = refreshingMasters;
  const staleMastersBlocking = Boolean(
    payload?.blockers.some((blocker) => blocker.code === "TALLY_MASTERS_STALE")
  );
  const canApprove = Boolean(
    payload?.readyForApproval &&
    payload?.posting &&
    !hasUnsavedChanges &&
    !locked &&
    !tallyReviewRefreshing &&
    connectionReadable &&
    selectedMatchesActive
  );
  const masterContext = {
    companyName: connection?.companyName ?? selectedCompanyName,
    syncedAt: connection?.masterSyncedAt,
    syncing: refreshingMasters,
  };
  if (state === "loading" && !payload) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing the accounting review…
      </div>
    );
  }

  if (state === "error" && !payload) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-950">Tally posting is not available</h2>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <Button className="mt-4" onClick={() => void load()} variant="outline">Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!payload || !payload.eligibility.eligible) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Purchase invoice required</h2>
        <p className="mt-2 text-sm text-slate-600">
          No readable purchase invoice was found in this case.
        </p>
      </div>
    );
  }

  if (!review) {
    const candidates = payload.eligibility.invoiceCandidates;
    return (
      <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Choose the invoice Kalika should post</h2>
        <p className="mt-2 text-sm text-slate-600">
          Duplicate copies have already been combined. Select the invoice billed to the active Tally company; an upstream mother bill should normally be left unselected.
        </p>
        <div className="mt-5 grid gap-3">
          {candidates.map((candidate) => (
            <div className={`rounded-xl border p-4 ${candidate.recommended ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`} key={candidate.documentId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">{candidate.invoiceNumber || "Invoice number missing"}</span>
                    {candidate.recommended ? <Badge className="bg-emerald-100 text-emerald-800">Recommended</Badge> : null}
                    {candidate.role === "mother_bill" ? <Badge variant="outline">Mother bill</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{candidate.supplierName || "Unknown supplier"} → {candidate.buyerName || "Unknown buyer"}</p>
                  <p className="mt-1 text-xs text-slate-500">{candidate.reason}</p>
                </div>
                <Button
                  disabled={!selectedConnectionId || !selectedCompanyName || selectingInvoiceId !== null}
                  onClick={() => void handleInvoiceSelection(candidate.documentId)}
                  variant={candidate.recommended ? "default" : "outline"}
                >
                  {selectingInvoiceId === candidate.documentId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Use this invoice
                </Button>
              </div>
            </div>
          ))}
        </div>
        {!selectedConnectionId || !selectedCompanyName ? (
          <p className="mt-4 text-sm font-medium text-amber-700">Select the Tally workstation and company above before choosing the invoice.</p>
        ) : null}
      </div>
    );
  }

  const calculation = payload.calculation;
  const invoiceTaxKnown = Boolean(payload.source?.invoiceTaxAmount?.trim());
  const invoiceTotalKnown = Boolean(payload.source?.invoiceTotal?.trim());
  const invoiceCgstTdsKnown = Boolean(payload.source?.invoiceCgstTdsAmount?.trim());
  const invoiceSgstTdsKnown = Boolean(payload.source?.invoiceSgstTdsAmount?.trim());
  const invoiceIgstTdsKnown = Boolean(payload.source?.invoiceIgstTdsAmount?.trim());
  const invoiceTcsKnown = Boolean(payload.source?.invoiceTcsAmount?.trim());
  const invoiceRoundOffKnown = Boolean(payload.source?.invoiceRoundOffAmount?.trim());
  const itemValuesReady =
    review.lines.length > 0 &&
    review.lines.every(
      (line) =>
        Number.isFinite(Number(line.quantity)) &&
        Number(line.quantity) > 0 &&
        Number.isFinite(Number(line.rate)) &&
        Number(line.rate) >= 0 &&
        Number.isFinite(Number(line.taxableAmount)) &&
        Number(line.taxableAmount) > 0
    );
  const calculationReady = Boolean(
    calculation &&
      itemValuesReady &&
      calculation.taxMode !== "unknown" &&
      Number(review.gstRate) > 0 &&
      Number(calculation.basicAmount) > 0
  );
  const purchaseGoodsTdsActive = review.applyTds194q;
  const tds194qBasisPreview = Number(review.tds194qBasisAmount || calculation?.basicAmount || 0);
  const tds194qRawPreview = Number.isFinite(tds194qBasisPreview)
    ? tds194qBasisPreview * Number(review.tds194qRate || 0) / 100
    : 0;
  const tds194qAmountPreview = review.tds194qRounding === "nearest_rupee"
    ? Math.round(tds194qRawPreview)
    : Math.round(tds194qRawPreview * 100) / 100;
  const cgstTdsActive = Number(calculation?.cgstTdsAmount || 0) > 0;
  const sgstTdsActive = Number(calculation?.sgstTdsAmount || 0) > 0;
  const igstTdsActive = Number(calculation?.igstTdsAmount || 0) > 0;
  const transporterTdsActive = review.applyTransportTds;
  const invoiceFreightPresent = Number(payload.source?.invoiceFreightAmount) > 0;
  const freightRelevant =
    invoiceFreightPresent ||
    Number(review.freightAmount) > 0 ||
    scopeIssues("tax", ["FREIGHT_LEDGER_REQUIRED", "FREIGHT_GST_RATE_REQUIRED"]).length > 0;
  const showFreight = freightRelevant;
  const showRoundOff = Boolean(Number(payload.source?.invoiceRoundOffAmount));
  const reviewedTcsValue = Number(String(review.tcsAmount || "0").replace(/,/g, ""));
  const liveTcsAmount = review.tcsReceivable && Number.isFinite(reviewedTcsValue)
    ? Math.abs(reviewedTcsValue)
    : 0;
  const savedTcsAmount = Number(calculation?.tcsAmount || 0);
  const liveTcsDelta = liveTcsAmount - (Number.isFinite(savedTcsAmount) ? savedTcsAmount : 0);
  const liveCalculatedPayable = Number(calculation?.calculatedPayable || 0) + liveTcsDelta;
  const liveTotalDifference = Number(calculation?.totalDifference || 0) + liveTcsDelta;
  const halfInvoiceGst = invoiceTaxKnown
    ? String(Number(payload.source?.invoiceTaxAmount) / 2)
    : null;
  const cgstInvoiceAmount =
    calculation?.taxMode === "cgst_sgst" ? halfInvoiceGst : null;
  const sgstInvoiceAmount =
    calculation?.taxMode === "cgst_sgst" ? halfInvoiceGst : null;
  const igstInvoiceAmount =
    calculation?.taxMode === "igst" && invoiceTaxKnown
      ? payload.source?.invoiceTaxAmount ?? null
      : null;
  const applicableTaxOptions =
    calculation?.taxMode === "cgst_sgst"
      ? [...cgstOptions, ...sgstOptions]
      : calculation?.taxMode === "igst"
        ? igstOptions
        : [];
  const missingApplicableTaxMasters =
    connectionReadable &&
    !mastersNeedSync &&
    (calculation?.taxMode === "cgst_sgst"
      ? cgstOptions.length === 0 || sgstOptions.length === 0
      : calculation?.taxMode === "igst"
        ? applicableTaxOptions.length === 0
        : false);

  const previewPurchaseLedgers = Array.from(new Set(
    review.lines.map((line) => line.purchaseLedgerName).filter(Boolean)
  ));
  const previewPurchaseLedger = previewPurchaseLedgers.length === 1
    ? previewPurchaseLedgers[0]
    : previewPurchaseLedgers.length > 1
      ? "Multiple purchase ledgers"
      : "Purchase ledger not selected";
  const purchaseReference = review.invoiceNumber
    ? `${review.invoiceNumber} / ${tallyDate(review.invoiceDate)}`
    : "Invoice number / date missing";
  const previewTotalQuantity = review.lines.reduce(
    (total, line) => total + (Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : 0),
    0
  );
  const previewUnits = Array.from(new Set(review.lines.map((line) => line.unit).filter(Boolean)));
  const previewQuantityLabel = previewUnits.length === 1
    ? `${tallyQuantity(previewTotalQuantity)} ${previewUnits[0]}`
    : `${review.lines.length} item${review.lines.length === 1 ? "" : "s"}`;
  const previewLedgerRows = [
    Number(calculation?.freightAmount || 0)
      ? { ledger: review.freightLedgerName || "Freight inward", rate: review.freightGstRate, amount: calculation?.freightAmount }
      : null,
    calculation?.taxMode === "cgst_sgst"
      ? { ledger: review.cgstLedgerName || "Input CGST", rate: String(Number(calculation.gstRate || 0) / 2), amount: calculation.cgstAmount }
      : calculation?.taxMode === "igst"
        ? { ledger: review.igstLedgerName || "Input IGST", rate: calculation.gstRate, amount: calculation.igstAmount }
        : null,
    calculation?.taxMode === "cgst_sgst"
      ? { ledger: review.sgstLedgerName || "Input SGST", rate: String(Number(calculation.gstRate || 0) / 2), amount: calculation.sgstAmount }
      : null,
    purchaseGoodsTdsActive
      ? { ledger: review.tds194qLedgerName || "Purchase TDS", rate: review.tds194qRate, amount: calculation?.tds194qAmount, credit: true }
      : null,
    transporterTdsActive
      ? { ledger: review.transportTdsLedgerName || "Transport TDS", rate: review.transportTdsRate, amount: calculation?.transportTdsAmount, credit: true }
      : null,
    cgstTdsActive
      ? { ledger: review.cgstTdsLedgerName || "CGST TDS", rate: calculation?.gstTdsRate, amount: calculation?.cgstTdsAmount, credit: true }
      : null,
    sgstTdsActive
      ? { ledger: review.sgstTdsLedgerName || "SGST TDS", rate: calculation?.gstTdsRate, amount: calculation?.sgstTdsAmount, credit: true }
      : null,
    igstTdsActive
      ? { ledger: review.igstTdsLedgerName || "IGST TDS", rate: calculation?.gstTdsRate, amount: calculation?.igstTdsAmount, credit: true }
      : null,
    review.tcsReceivable
      ? { ledger: review.tcsLedgerName || "TCS Receivable", amount: String(liveTcsAmount) }
      : null,
    Number(calculation?.roundOffAmount || 0)
      ? { ledger: review.roundOffLedgerName || "Round-off", amount: calculation?.roundOffAmount }
      : null,
  ].filter(Boolean) as Array<{
    ledger: string;
    rate?: string;
    amount?: string;
    credit?: boolean;
  }>;

  return (
    <div className="tally-purchase-workflow mx-auto max-w-6xl space-y-3 p-3 pb-32 sm:p-4 sm:pb-32" id="tally-header">
      {payload.eligibility.invoiceCandidates.length > 1 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-slate-900">Invoice selected for this Purchase voucher</div>
          <div className="flex flex-wrap gap-2">
            {payload.eligibility.invoiceCandidates.map((candidate) => {
              const selected = candidate.documentId === review.selectedInvoiceDocumentId;
              return (
                <Button
                  className="h-auto min-h-9 whitespace-normal px-3 py-2 text-left"
                  disabled={locked || selectingInvoiceId !== null}
                  key={candidate.documentId}
                  onClick={() => void handleInvoiceSelection(candidate.documentId)}
                  variant={selected ? "default" : "outline"}
                >
                  {selectingInvoiceId === candidate.documentId ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  {candidate.invoiceNumber || "Invoice number missing"}{candidate.role === "mother_bill" ? " · Mother bill" : ""}
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}

      {payload.posting?.status === "created" ? (
        <section className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-xs font-semibold text-emerald-950">Purchase voucher created</h3>
            <p className="text-[11px] text-emerald-700">
              Tally voucher {payload.posting.tallyVoucherNumber || "—"}
              {payload.posting.invoiceNumber ? ` · Supplier invoice ${payload.posting.invoiceNumber}` : ""}
              {` · Verified ${formatDateTime(payload.posting.verifiedAt)}`}
            </p>
          </div>
        </section>
      ) : null}

      {payload.posting?.status === "created" ? null : correctionBlockers.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-rose-950">
                    {correctionBlockers.length} item{correctionBlockers.length === 1 ? "" : "s"} required before approval
                  </h3>
                  <p className="mt-0.5 text-xs text-rose-700">Select an item to go to the field that needs attention.</p>
                </div>
                {hasUnsavedChanges ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Save to check changes</Badge>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {correctionBlockers.map((blocker, index) => (
                  <button
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-left text-xs font-medium text-rose-800 transition hover:border-rose-300 hover:bg-rose-100"
                    key={`${blocker.code}:${blocker.lineId ?? index}`}
                    onClick={() => document.getElementById(issueAnchor(blocker))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    type="button"
                  >
                    {blocker.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : tallyReviewRefreshing ? (
        <section className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking latest Tally data…
        </section>
      ) : payload.posting?.status === "verification_required" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong className="block text-sm">Voucher created; verification needs attention</strong>
              <span className="mt-0.5 block text-xs leading-5 text-amber-800">
                {payload.posting.lastError || "Refresh after checking the voucher in Tally. Kalika will not create a duplicate voucher."}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <ReviewWarnings warnings={scopeWarnings("case")} />

      <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-invoice">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-950">Source invoice</h3>
          <div className="flex items-center gap-2">
            <Button className="h-7 shrink-0 px-2.5 text-[10px]" disabled={!payload.sourceFileId} onClick={() => void handleOpenSource()} size="sm" variant="outline">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </Button>
          </div>
        </header>
        <div>
          <div className={`grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5 ${review.vehicleNumber ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Invoice no.</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-950">
                {review.invoiceNumber || "Missing"}
              </div>
            </div>
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Invoice date</div>
              <div className="mt-0.5 text-[11px] text-slate-700">{formatShortDate(review.invoiceDate)}</div>
            </div>
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Voucher date</div>
              <div className="mt-0.5 text-[11px] text-slate-700">{formatShortDate(review.voucherDate)}</div>
            </div>
            {review.vehicleNumber ? (
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Vehicle</div>
                <div className="mt-0.5 text-[11px] text-slate-700">{review.vehicleNumber}</div>
              </div>
            ) : null}
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Invoice total</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-950">{money(review.invoiceTotal)}</div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950">{review.supplierName || "Supplier missing"}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                <span>{review.supplierGstin || "Supplier GSTIN missing"}</span>
                <span className="text-slate-300">→</span>
                <span>{review.buyerName || "Buyer missing"}</span>
                <span>{review.buyerGstin || "Buyer GSTIN missing"}</span>
              </div>
            </div>
            <MasterCombobox
              {...masterContext}
              compact
              disabled={masterSelectionDisabled}
              emptyMessage="No ledger matched this search in the selected Tally company."
              id="field-supplier-ledger"
              issues={scopeIssues("invoice", ["SUPPLIER_LEDGER_REQUIRED", "SUPPLIER_LEDGER_GSTIN_MISMATCH"])}
              label="Supplier ledger"
              onChange={(value) => updateReview("supplierLedgerName", value)}
              options={supplierLedgerOptions}
              suggestedNames={[
                ...(supplierLedgerMatch?.ledgerName ? [supplierLedgerMatch.ledgerName] : []),
                ...(supplierLedgerMatch?.candidateLedgerNames ?? []),
              ]}
              value={review.supplierLedgerName}
            />
            {matchingSupplierLedger ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 lg:col-span-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                Checking the supplier against all Tally ledgers…
              </div>
            ) : null}
            {supplierLedgerMatch?.matchType === "close_match" && supplierLedgerMatch.candidateLedgerNames.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 lg:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Close matches — choose one</div>
                <p className="mt-1 text-[10px] leading-4 text-amber-700">{supplierLedgerMatch.reason || "More than one Tally ledger may represent this supplier."}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {supplierLedgerMatch.candidateLedgerNames.map((ledgerName) => (
                    <button
                      className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                      key={ledgerName}
                      onClick={() => updateReview("supplierLedgerName", ledgerName)}
                      type="button"
                    >
                      {ledgerName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {supplierLedgerMatch?.matchType === "suspense" ? (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] leading-4 text-slate-500 lg:col-span-2">
                No ledger was safe to select automatically. Search the complete ledger list above.
              </div>
            ) : null}
            {supplierLedgerMatchError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700 lg:col-span-2">
                {supplierLedgerMatchError} You can still search all ledgers manually.
              </div>
            ) : null}
            <div className="lg:col-span-2">
              <ReviewWarnings warnings={scopeWarnings("invoice")} />
            </div>
          </div>

          <details className="group border-t border-slate-100" open={scopeIssues("invoice").some((issue) => issue.code !== "SUPPLIER_LEDGER_REQUIRED" && issue.code !== "SUPPLIER_LEDGER_GSTIN_MISMATCH") || undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 sm:px-5">
              Edit invoice details <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-slate-100 bg-white p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
              <Field compact id="field-invoice-number" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_NUMBER_REQUIRED"])} label="Invoice number" onChange={(value) => updateReview("invoiceNumber", value)} sourceValue={payload.source?.invoiceNumber} value={review.invoiceNumber} />
              <Field compact id="field-invoice-date" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_DATE_REQUIRED"])} label="Supplier invoice date" onChange={(value) => updateReview("invoiceDate", value)} sourceValue={payload.source?.invoiceDate} type="date" value={review.invoiceDate} />
              <Field compact id="field-voucher-date" disabled={locked} issues={scopeIssues("invoice", ["VOUCHER_DATE_REQUIRED"])} label="Tally voucher date" onChange={(value) => updateReview("voucherDate", value)} type="date" value={review.voucherDate} />
              <Field compact disabled={locked} label="Vehicle number" onChange={(value) => updateReview("vehicleNumber", value)} sourceValue={payload.source?.vehicleNumber} value={review.vehicleNumber} />
              <Field compact id="field-invoice-total" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_TOTAL_REQUIRED"])} label="Final invoice payable" onChange={(value) => updateReview("invoiceTotal", value)} sourceValue={payload.source?.invoiceTotal} value={review.invoiceTotal} />
              <Field compact disabled={locked} label="Supplier name" onChange={(value) => updateReview("supplierName", value)} sourceValue={payload.source?.supplierName} value={review.supplierName} />
              <Field compact id="field-supplier-gstin" disabled={locked} issues={scopeIssues("invoice", ["SUPPLIER_GSTIN_REQUIRED"])} label="Supplier GSTIN" onChange={(value) => updateReview("supplierGstin", value.toUpperCase())} sourceValue={payload.source?.supplierGstin} value={review.supplierGstin} />
              <Field compact disabled={locked} label="Buyer name" onChange={(value) => updateReview("buyerName", value)} sourceValue={payload.source?.buyerName} value={review.buyerName} />
              <Field compact id="field-buyer-gstin" disabled={locked} issues={scopeIssues("invoice", ["BUYER_GSTIN_REQUIRED"])} label="Buyer GSTIN" onChange={(value) => updateReview("buyerGstin", value.toUpperCase())} sourceValue={payload.source?.buyerGstin} value={review.buyerGstin} />
            </div>
          </details>
        </div>
      </section>

      <section className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-items">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-950">Items and Tally mappings</h3>
          {matchingLineMasters ? (
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
              <Loader2 className="h-3 w-3 animate-spin" /> Matching…
            </p>
          ) : lineMasterMatchError ? (
            <p className="text-[10px] text-rose-600">Matching failed</p>
          ) : null}
        </header>
        {payload.source?.lineRecovery === "linked_document" ? (
          <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900 sm:px-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="leading-5">
              Item details were found in the matching {payload.source.lineSourceDocumentType}. Check them against the invoice before approval.
            </p>
          </div>
        ) : null}
        <div className="space-y-4 p-4 sm:p-5">
          <ReviewWarnings warnings={scopeWarnings("line")} />
          {review.lines.map((line, index) => {
            const sourceLine = sourceLineById.get(line.lineId);
            const masterMatch = lineMasterMatches.find((match) => match.lineId === line.lineId);
            const stockCandidates = masterMatch?.stockItem.candidateMasterNames ?? [];
            const purchaseCandidates = masterMatch?.purchaseLedger.candidateMasterNames ?? [];
            const rankedStockItems = rankStockItems(stockItemOptions, line, stockCandidates);
            const rankedPurchaseLedgers = rankLedgerRole(ledgerOptions, "purchase", 0, purchaseCandidates);
            return (
            <article className="scroll-mt-24 overflow-hidden border-b border-slate-100 bg-white last:border-b-0" id={`tally-line-${line.lineId}`} key={line.lineId}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-950">{line.description || `Item ${index + 1}`}</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-4">
                    <div>
                      <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">HSN</div>
                      <div className="text-[10px] text-slate-600">{line.hsn || "Missing"}</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Quantity</div>
                      <div className="text-[10px] text-slate-600">{line.quantity || "0"} {line.unit || "units"}</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Rate / unit</div>
                      <div className="text-[10px] text-slate-600">{money(line.rate)}</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Taxable amount</div>
                      <div className="text-[10px] font-semibold text-slate-700">{money(line.taxableAmount)}</div>
                    </div>
                  </div>
                </div>
                {lineIssues(line.lineId).length > 0 ? (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{lineIssues(line.lineId).length} corrections</Badge>
                ) : null}
              </div>
              {lineWarnings(line.lineId).length > 0 ? (
                <div className="px-4 pt-3">
                  <ReviewWarnings warnings={lineWarnings(line.lineId)} />
                </div>
              ) : null}
              <div className="grid gap-3 border-t border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
                <div>
                  <MasterCombobox
                    {...masterContext}
                    compact
                    disabled={masterSelectionDisabled}
                    emptyMessage="No stock item was returned by Tally."
                    hideSourceBadge
                    issues={lineIssues(line.lineId, ["STOCK_ITEM_REQUIRED", "STOCK_ITEM_HSN_MISMATCH", "STOCK_ITEM_UNIT_MISMATCH"])}
                    label="Stock item"
                    onChange={(value) => updateLine(index, "stockItemName", value)}
                    options={rankedStockItems.options}
                    suggestedNames={rankedStockItems.suggestedNames}
                    value={line.stockItemName}
                  />
                  {masterMatch?.stockItem.matchType === "close_match" ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900">
                      <div className="font-semibold">Choose the matching stock item</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {stockCandidates.map((name) => (
                          <button className="rounded-full border border-amber-200 bg-white px-2 py-1 font-medium hover:border-emerald-300 hover:text-emerald-700" key={name} onClick={() => updateLine(index, "stockItemName", name)} type="button">{name}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <MasterCombobox
                    {...masterContext}
                    compact
                    disabled={masterSelectionDisabled}
                    emptyMessage="No ledger was returned by live Tally."
                    hideSourceBadge
                    issues={lineIssues(line.lineId, ["PURCHASE_LEDGER_REQUIRED"])}
                    label="Purchase ledger"
                    onChange={(value) => updateLine(index, "purchaseLedgerName", value)}
                    options={rankedPurchaseLedgers.options}
                    suggestedNames={rankedPurchaseLedgers.suggestedNames}
                    value={line.purchaseLedgerName}
                  />
                  {masterMatch?.purchaseLedger.matchType === "close_match" ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900">
                      <div className="font-semibold">Choose the purchase ledger</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {purchaseCandidates.map((name) => (
                          <button className="rounded-full border border-amber-200 bg-white px-2 py-1 font-medium hover:border-emerald-300 hover:text-emerald-700" key={name} onClick={() => updateLine(index, "purchaseLedgerName", name)} type="button">{name}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  <MasterCombobox
                    {...masterContext}
                    compact
                    disabled={masterSelectionDisabled}
                    emptyMessage="No godown was returned by live Tally."
                    hideSourceBadge
                    issues={lineIssues(line.lineId, ["GODOWN_REQUIRED"])}
                    label="Godown"
                    onChange={(value) => updateLine(index, "godownName", value)}
                    options={godownOptions}
                    placeholder="No godown allocation"
                    sourceHint={sourceLine?.godownName}
                    suggestedNames={sourceLine?.godownName ? [sourceLine.godownName] : []}
                    value={line.godownName}
                  />
                </div>
              </div>
              <details className="group border-t border-slate-100" open={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED", "HSN_MAPPING_REQUIRED", "LINE_TAXABLE_MISMATCH"]).length > 0 || undefined}>
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 sm:px-4">
                  Edit item values <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Description" onChange={(value) => updateLine(index, "description", value)} sourceValue={sourceLine?.description} value={line.description} />
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["HSN_MAPPING_REQUIRED"])} label="HSN" onChange={(value) => updateLine(index, "hsn", value)} sourceValue={sourceLine?.hsn} value={line.hsn} />
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Quantity" onChange={(value) => updateLine(index, "quantity", value)} sourceValue={sourceLine?.quantity} value={line.quantity} />
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED", "STOCK_ITEM_UNIT_MISMATCH"])} label="Unit" onChange={(value) => updateLine(index, "unit", value)} sourceValue={sourceLine?.unit} value={line.unit} />
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Rate" onChange={(value) => updateLine(index, "rate", value)} sourceValue={sourceLine?.rate} value={line.rate} />
                  <Field compact disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED", "LINE_TAXABLE_MISMATCH"])} label="Taxable amount" onChange={(value) => updateLine(index, "taxableAmount", value)} sourceValue={sourceLine?.taxableAmount} value={line.taxableAmount} />
                  <Field compact disabled={locked} label="Batch / lot (optional)" onChange={(value) => updateLine(index, "batchName", value)} sourceValue={sourceLine?.batchName} value={line.batchName} />
                </div>
              </details>
            </article>
          )})}
        </div>
      </section>

      <section className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-taxes">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-950">Taxes</h3>
          {(missingApplicableTaxMasters || mastersNeedSync) ? (
            <Button
              aria-label="Refresh Tally tax ledgers"
              className="h-7 w-7"
              disabled={!connection?.id || !connection.companyName || refreshingMasters || locked}
              onClick={() => void handleRefreshMasters()}
              size="icon"
              title="Refresh Tally tax ledgers"
              variant="outline"
            >
              {refreshingMasters ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
        </header>

        <div className="space-y-1 px-4 pb-4 sm:px-5">
          <ReviewWarnings warnings={scopeWarnings("tax")} />
          <div className="border-b border-slate-100 py-2.5" id="field-gst-rate">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <strong className="text-slate-900">
                {calculation?.taxMode === "cgst_sgst" ? "CGST + SGST" : calculation?.taxMode === "igst" ? "IGST" : "Tax mode missing"}
              </strong>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{stateLabel(calculation?.supplierStateCode)} → {stateLabel(calculation?.buyerStateCode)}</span>
              <span className="text-slate-400">·</span>
              <strong className={review.gstRate ? "text-slate-900" : "text-rose-600"}>{review.gstRate ? `${review.gstRate}% GST` : "GST rate missing"}</strong>
              {!locked ? (
                <button className="ml-auto font-semibold text-emerald-700 hover:text-emerald-900" onClick={() => setEditingGstRate((current) => !current)} type="button">
                  {editingGstRate ? "Done" : "Edit"}
                </button>
              ) : null}
            </div>
            {editingGstRate ? (
              <div className="mt-2 border-t border-slate-100 pt-3">
                <div className="max-w-xs">
                  <Field
                    id="field-gst-rate-input"
                    disabled={locked}
                    issues={scopeIssues("tax", ["GST_RATE_REQUIRED"])}
                    label="Confirmed GST rate %"
                    onChange={(value) => updateReview("gstRate", value)}
                    sourceValue={payload.source?.invoiceTaxRate}
                    value={review.gstRate}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                <button
                  aria-checked={review.applyTds194q}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${review.applyTds194q ? "bg-emerald-700" : "bg-slate-300"}`}
                  disabled={locked || saving}
                  onClick={() => void handleAdjustmentToggle("applyTds194q")}
                  role="switch"
                  type="button"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${review.applyTds194q ? "left-[18px]" : "left-0.5"}`} />
                </button>
                194Q TDS
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                <button
                  aria-checked={review.applyTransportTds}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${review.applyTransportTds ? "bg-emerald-700" : "bg-slate-300"}`}
                  disabled={locked || saving}
                  onClick={() => void handleAdjustmentToggle("applyTransportTds")}
                  role="switch"
                  type="button"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${review.applyTransportTds ? "left-[18px]" : "left-0.5"}`} />
                </button>
                Transport TDS
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                <button
                  aria-checked={review.applyGstTds}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${review.applyGstTds ? "bg-emerald-700" : "bg-slate-300"}`}
                  disabled={locked || saving}
                  onClick={() => void handleAdjustmentToggle("applyGstTds")}
                  role="switch"
                  type="button"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${review.applyGstTds ? "left-[18px]" : "left-0.5"}`} />
                </button>
                {calculation?.taxMode === "cgst_sgst"
                  ? "GST TDS (CGST + SGST)"
                  : calculation?.taxMode === "igst"
                    ? "GST TDS (IGST)"
                    : "GST TDS"}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                <button
                  aria-checked={review.tcsReceivable}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${review.tcsReceivable ? "bg-emerald-700" : "bg-slate-300"}`}
                  disabled={locked || saving}
                  onClick={() => void handleAdjustmentToggle("tcsReceivable")}
                  role="switch"
                  type="button"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${review.tcsReceivable ? "left-[18px]" : "left-0.5"}`} />
                </button>
                TCS Receivable
              </label>
              {review.applyTds194q ? (
                <details className="group basis-full border-t border-slate-100 pt-2">
                  <summary className="cursor-pointer list-none text-[10px] font-semibold text-slate-500 hover:text-slate-800">
                    194Q basis and rounding <ChevronDown className="ml-1 inline h-3 w-3 transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field compact disabled={locked} issues={scopeIssues("tax", ["TDS_194Q_BASIS_REQUIRED"])} label="Taxable basis" onChange={(value) => updateReview("tds194qBasisAmount", value)} sourceValue={calculation?.basicAmount} value={review.tds194qBasisAmount || calculation?.basicAmount || ""} />
                    <Field compact disabled={locked} issues={scopeIssues("tax", ["TDS_194Q_RATE_REQUIRED"])} label="TDS rate %" onChange={(value) => updateReview("tds194qRate", value)} value={review.tds194qRate} />
                    <label className="block text-[11px] font-medium text-slate-600">
                      Rounding
                      <select className={`${inputClass} mt-1 h-8 text-xs`} disabled={locked} onChange={(event) => updateReview("tds194qRounding", event.target.value as TallyPostingReview["tds194qRounding"])} value={review.tds194qRounding}>
                        <option value="nearest_rupee">Nearest rupee</option>
                        <option value="paise">Exact paise</option>
                      </select>
                    </label>
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          {!calculationReady ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <div className="text-sm font-semibold text-amber-950">Calculation is waiting for reviewed invoice values</div>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Complete every item&apos;s quantity, rate and taxable amount, confirm the GST rate, and verify the supplier and buyer states. Amounts are intentionally not shown as zero while this is incomplete.
                  </p>
                </div>
              </div>
              <Button onClick={() => document.getElementById("tally-items")?.scrollIntoView({ behavior: "smooth", block: "start" })} size="sm" variant="outline">
                Review item values
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 py-2.5 text-[11px]">
                <span className="font-semibold text-slate-700">Ledger reconciliation</span>
                <span className="ml-auto text-slate-500">
                  Payable <strong className="text-slate-900">{money(String(liveCalculatedPayable))}</strong>
                  {invoiceTotalKnown ? (
                    <span className={`ml-2 font-semibold ${Math.abs(liveTotalDifference) > 1 ? "text-rose-600" : "text-emerald-700"}`}>
                      Δ {money(String(liveTotalDifference))}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="space-y-3 border-t border-slate-100">
              <div className="overflow-x-auto">
                <div className="min-w-[740px]">
                  <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 bg-slate-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                    <div>Component</div>
                    <div>Taxable basis</div>
                    <div>On invoice</div>
                    <div>Calculated</div>
                    <div className="flex items-center gap-1.5">
                      <span>Tally ledger</span>
                      <span className="inline-flex items-center gap-1 text-[8px] text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Live
                      </span>
                    </div>
                    <div>Difference</div>
                  </div>

                  {showFreight ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Freight inward</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">Separate charge</div>
                      </div>
                      <Field id="field-freight-rate" disabled={locked} issues={scopeIssues("tax", ["FREIGHT_GST_RATE_REQUIRED"])} label="GST rate %" onChange={(value) => updateReview("freightGstRate", value)} sourceValue={payload.source?.invoiceFreightGstRate} value={review.freightGstRate} />
                      <div className="pt-1 text-xs text-slate-700">{moneyOrMissing(payload.source?.invoiceFreightAmount)}</div>
                      <Field disabled={locked} label="Freight amount" onChange={(value) => updateReview("freightAmount", value)} sourceValue={payload.source?.invoiceFreightAmount} value={review.freightAmount} />
                      <MasterCombobox {...masterContext} compact hideLabel id="field-freight-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["FREIGHT_LEDGER_REQUIRED"])} label="Freight ledger" onChange={(value) => updateReview("freightLedgerName", value)} options={freightOptions} suggestedNames={freightRanked.suggestedNames} value={review.freightLedgerName} />
                      <div className="pt-1 text-xs font-semibold text-slate-400">Charge</div>
                    </div>
                  ) : null}

                  {calculation?.taxMode === "cgst_sgst" ? (
                    <>
                      <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Input CGST</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{Number(review.gstRate) / 2}%</div>
                        </div>
                        <div className="pt-1 text-xs text-slate-700">{money(calculation.gstTaxableAmount)}</div>
                        <div className={`pt-1 text-xs ${invoiceTaxKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(cgstInvoiceAmount)}</div>
                        <div className="pt-1 text-xs font-semibold text-slate-900">{money(calculation.cgstAmount)}</div>
                        <MasterCombobox {...masterContext} compact hideLabel id="field-cgst-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["CGST_LEDGER_REQUIRED"])} label="CGST purchase ledger" onChange={(value) => updateReview("cgstLedgerName", value)} options={cgstOptions} suggestedNames={cgstRanked.suggestedNames} value={review.cgstLedgerName} />
                        <div className={`pt-1 text-xs font-semibold ${invoiceTaxKnown && Math.abs(Number(numericDifference(cgstInvoiceAmount, calculation.cgstAmount))) > 1 ? "text-rose-600" : invoiceTaxKnown ? "text-emerald-700" : "text-slate-400"}`}>
                          {invoiceTaxKnown ? money(numericDifference(cgstInvoiceAmount, calculation.cgstAmount)) : "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">Input SGST</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{Number(review.gstRate) / 2}%</div>
                        </div>
                        <div className="pt-1 text-xs text-slate-700">{money(calculation.gstTaxableAmount)}</div>
                        <div className={`pt-1 text-xs ${invoiceTaxKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(sgstInvoiceAmount)}</div>
                        <div className="pt-1 text-xs font-semibold text-slate-900">{money(calculation.sgstAmount)}</div>
                        <MasterCombobox {...masterContext} compact hideLabel id="field-sgst-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["SGST_LEDGER_REQUIRED"])} label="SGST purchase ledger" onChange={(value) => updateReview("sgstLedgerName", value)} options={sgstOptions} suggestedNames={sgstRanked.suggestedNames} value={review.sgstLedgerName} />
                        <div className={`pt-1 text-xs font-semibold ${invoiceTaxKnown && Math.abs(Number(numericDifference(sgstInvoiceAmount, calculation.sgstAmount))) > 1 ? "text-rose-600" : invoiceTaxKnown ? "text-emerald-700" : "text-slate-400"}`}>
                          {invoiceTaxKnown ? money(numericDifference(sgstInvoiceAmount, calculation.sgstAmount)) : "—"}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Input IGST</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{review.gstRate}%</div>
                      </div>
                      <div className="pt-1 text-xs text-slate-700">{money(calculation?.gstTaxableAmount)}</div>
                      <div className={`pt-1 text-xs ${invoiceTaxKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(igstInvoiceAmount)}</div>
                      <div className="pt-1 text-xs font-semibold text-slate-900">{money(calculation?.igstAmount)}</div>
                      <MasterCombobox {...masterContext} compact hideLabel id="field-igst-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["IGST_LEDGER_REQUIRED"])} label="IGST purchase ledger" onChange={(value) => updateReview("igstLedgerName", value)} options={igstOptions} suggestedNames={igstRanked.suggestedNames} value={review.igstLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceTaxKnown && Math.abs(Number(numericDifference(igstInvoiceAmount, calculation?.igstAmount))) > 1 ? "text-rose-600" : invoiceTaxKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceTaxKnown ? money(numericDifference(igstInvoiceAmount, calculation?.igstAmount)) : "—"}
                      </div>
                    </div>
                  )}

                  {purchaseGoodsTdsActive ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div>
                        <div className="whitespace-nowrap text-xs font-semibold text-slate-900">Purchase TDS</div>
                        <label className="mt-1 flex h-5 items-center gap-1 text-[10px] text-slate-500" id="field-tds-194q-rate">
                          <span>Goods</span>
                          <span aria-hidden="true">·</span>
                          <input
                            aria-invalid={Boolean(scopeIssues("tax", ["TDS_194Q_RATE_REQUIRED"]).length)}
                            aria-label="Purchase TDS rate percentage"
                            className={`h-5 w-10 rounded border bg-white px-1 text-center text-[10px] font-semibold leading-none text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 ${scopeIssues("tax", ["TDS_194Q_RATE_REQUIRED"]).length ? "border-rose-300" : "border-slate-200"}`}
                            disabled={locked}
                            inputMode="decimal"
                            onChange={(event) => updateReview("tds194qRate", event.target.value)}
                            value={review.tds194qRate}
                          />
                          <span>%</span>
                        </label>
                      </div>
                      <div className="text-[11px] font-medium leading-4 text-slate-500">Reviewer confirmed</div>
                      <div className="pt-1 text-xs text-slate-700">{money(String(tds194qBasisPreview))}</div>
                      <div className="pt-1 text-xs font-semibold text-slate-900">{money(String(tds194qAmountPreview))}</div>
                      <MasterCombobox {...masterContext} compact hideLabel id="field-tds-194q-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["TDS_194Q_LEDGER_REQUIRED"])} label="Purchase TDS ledger" onChange={(value) => updateReview("tds194qLedgerName", value)} options={tds194qOptions} suggestedNames={tds194qRanked.suggestedNames} value={review.tds194qLedgerName} />
                      <div className="pt-1 text-[10px] font-semibold text-emerald-700">Enabled</div>
                    </div>
                  ) : null}

                  {cgstTdsActive || sgstTdsActive ? (
                    <>
                      {cgstTdsActive ? (
                        <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">CGST TDS</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">{calculation?.gstTdsRate || "1"}%</div>
                          </div>
                          <div className="pt-1 text-[11px] font-medium text-slate-500">{calculation?.gstTdsAutomatic ? `Scrap basis ${money(calculation.gstTdsBasisAmount)}` : "Confirmed on invoice"}</div>
                          <div className="pt-1 text-xs text-slate-700">{calculation?.gstTdsAutomatic ? "Automatic" : moneyOrMissing(payload.source?.invoiceCgstTdsAmount)}</div>
                          <div className="text-xs font-semibold text-slate-900">{money(calculation?.cgstTdsAmount)}</div>
                          <MasterCombobox {...masterContext} compact hideLabel id="field-cgst-tds-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["CGST_TDS_LEDGER_REQUIRED"])} label="CGST TDS ledger" onChange={(value) => updateReview("cgstTdsLedgerName", value)} options={cgstTdsOptions} suggestedNames={cgstTdsRanked.suggestedNames} value={review.cgstTdsLedgerName} />
                          <div className={`pt-1 text-xs font-semibold ${invoiceCgstTdsKnown && Math.abs(Number(numericDifference(payload.source?.invoiceCgstTdsAmount, calculation?.cgstTdsAmount))) > 1 ? "text-rose-600" : invoiceCgstTdsKnown ? "text-emerald-700" : "text-slate-400"}`}>
                            {invoiceCgstTdsKnown ? money(numericDifference(payload.source?.invoiceCgstTdsAmount, calculation?.cgstTdsAmount)) : "—"}
                          </div>
                        </div>
                      ) : null}
                      {sgstTdsActive ? (
                        <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">SGST TDS</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">{calculation?.gstTdsRate || "1"}%</div>
                          </div>
                          <div className="pt-1 text-[11px] font-medium text-slate-500">{calculation?.gstTdsAutomatic ? `Scrap basis ${money(calculation.gstTdsBasisAmount)}` : "Confirmed on invoice"}</div>
                          <div className="pt-1 text-xs text-slate-700">{calculation?.gstTdsAutomatic ? "Automatic" : moneyOrMissing(payload.source?.invoiceSgstTdsAmount)}</div>
                          <div className="pt-1 text-xs font-semibold text-slate-900">{money(calculation?.sgstTdsAmount)}</div>
                          <MasterCombobox {...masterContext} compact hideLabel id="field-sgst-tds-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["SGST_TDS_LEDGER_REQUIRED"])} label="SGST TDS ledger" onChange={(value) => updateReview("sgstTdsLedgerName", value)} options={sgstTdsOptions} suggestedNames={sgstTdsRanked.suggestedNames} value={review.sgstTdsLedgerName} />
                          <div className={`pt-1 text-xs font-semibold ${invoiceSgstTdsKnown && Math.abs(Number(numericDifference(payload.source?.invoiceSgstTdsAmount, calculation?.sgstTdsAmount))) > 1 ? "text-rose-600" : invoiceSgstTdsKnown ? "text-emerald-700" : "text-slate-400"}`}>
                            {invoiceSgstTdsKnown ? money(numericDifference(payload.source?.invoiceSgstTdsAmount, calculation?.sgstTdsAmount)) : "—"}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : igstTdsActive ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">IGST TDS</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{calculation?.gstTdsRate || "2"}%</div>
                      </div>
                      <div className="pt-1 text-[11px] font-medium text-slate-500">{calculation?.gstTdsAutomatic ? `Scrap basis ${money(calculation.gstTdsBasisAmount)}` : "Confirmed on invoice"}</div>
                      <div className="pt-1 text-xs text-slate-700">{calculation?.gstTdsAutomatic ? "Automatic" : moneyOrMissing(payload.source?.invoiceIgstTdsAmount)}</div>
                      <div className="text-xs font-semibold text-slate-900">{money(calculation?.igstTdsAmount)}</div>
                      <MasterCombobox {...masterContext} compact hideLabel id="field-igst-tds-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["IGST_TDS_LEDGER_REQUIRED"])} label="IGST TDS ledger" onChange={(value) => updateReview("igstTdsLedgerName", value)} options={igstTdsOptions} suggestedNames={igstTdsRanked.suggestedNames} value={review.igstTdsLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceIgstTdsKnown && Math.abs(Number(numericDifference(payload.source?.invoiceIgstTdsAmount, calculation?.igstTdsAmount))) > 1 ? "text-rose-600" : invoiceIgstTdsKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceIgstTdsKnown ? money(numericDifference(payload.source?.invoiceIgstTdsAmount, calculation?.igstTdsAmount)) : "—"}
                      </div>
                    </div>
                  ) : null}

                  {transporterTdsActive ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-900">Transport TDS</div>
                      <div className="pt-1 text-xs text-slate-700">{money(calculation?.freightAmount)}</div>
                      <div className="pt-1 text-xs text-slate-700">{moneyOrMissing(payload.source?.invoiceTransportTdsAmount)}</div>
                      <Field id="field-transport-tds-rate" disabled={locked} issues={scopeIssues("tax", ["TRANSPORT_TDS_RATE_REQUIRED"])} label={`Calculated ${money(calculation?.transportTdsAmount)} · rate %`} onChange={(value) => updateReview("transportTdsRate", value)} sourceValue={payload.source?.invoiceTransportTdsRate} value={review.transportTdsRate} />
                      <MasterCombobox {...masterContext} compact hideLabel id="field-transport-tds-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["TRANSPORT_TDS_LEDGER_REQUIRED"])} label="Transport TDS ledger" onChange={(value) => updateReview("transportTdsLedgerName", value)} options={transportTdsOptions} suggestedNames={transportTdsRanked.suggestedNames} value={review.transportTdsLedgerName} />
                      <div className="pt-1 text-xs font-semibold text-slate-400">Deduction</div>
                    </div>
                  ) : null}

                  {review.tcsReceivable ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-900">TCS Receivable</div>
                      <div className="pt-1 text-xs text-slate-400">Adjustment</div>
                      <div className={`pt-1 text-xs ${invoiceTcsKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(payload.source?.invoiceTcsAmount)}</div>
                      <Field compact hideLabel id="field-tcs-amount" disabled={locked} issues={scopeIssues("tax", ["TCS_AMOUNT_REQUIRED"])} label="Confirmed TCS amount" onChange={(value) => updateReview("tcsAmount", value)} sourceValue={payload.source?.invoiceTcsAmount} value={review.tcsAmount} />
                      <MasterCombobox {...masterContext} compact hideLabel id="field-tcs-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["TCS_LEDGER_REQUIRED"])} label="TCS Receivable ledger" onChange={(value) => updateReview("tcsLedgerName", value)} options={tcsOptions} suggestedNames={tcsRanked.suggestedNames} value={review.tcsLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceTcsKnown && Math.abs(Number(numericDifference(payload.source?.invoiceTcsAmount, review.tcsAmount))) > 1 ? "text-rose-600" : invoiceTcsKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceTcsKnown ? money(numericDifference(payload.source?.invoiceTcsAmount, review.tcsAmount)) : "—"}
                      </div>
                    </div>
                  ) : null}

                  {showRoundOff ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-900">Round-off</div>
                      <div className="pt-1 text-xs text-slate-400">After tax</div>
                      <div className={`pt-1 text-xs ${invoiceRoundOffKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(payload.source?.invoiceRoundOffAmount)}</div>
                      <Field compact hideLabel disabled={locked} label="Confirmed round-off amount" onChange={(value) => updateReview("roundOffAmount", value)} sourceValue={payload.source?.invoiceRoundOffAmount} value={review.roundOffAmount} />
                      <MasterCombobox {...masterContext} compact hideLabel id="field-round-off-ledger" disabled={masterSelectionDisabled} emptyMessage="No live Tally ledger is available." issues={scopeIssues("tax", ["ROUND_OFF_LEDGER_REQUIRED"])} label="Round-off ledger" onChange={(value) => updateReview("roundOffLedgerName", value)} options={roundOffOptions} suggestedNames={roundOffRanked.suggestedNames} value={review.roundOffLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceRoundOffKnown && Math.abs(Number(numericDifference(payload.source?.invoiceRoundOffAmount, review.roundOffAmount))) > 1 ? "text-rose-600" : invoiceRoundOffKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceRoundOffKnown ? money(numericDifference(payload.source?.invoiceRoundOffAmount, review.roundOffAmount)) : "—"}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-[#e5ddd0] bg-[#f5f0e8] px-3.5 py-3 text-slate-900">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-[#8a7f72]">Calculated payable</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                      <span>{money(calculation?.basicAmount)} basic</span>
                      {Number(calculation?.freightAmount) > 0 ? (
                        <>
                          <span className="text-[#8a7f72]">+</span>
                          <span>{money(calculation?.freightAmount)} freight</span>
                        </>
                      ) : null}
                      <span className="text-[#8a7f72]">+</span>
                      <span>{money(calculation?.gstAmount)} GST</span>
                      <span className="text-[#8a7f72]">−</span>
                      <span>{money(calculation?.totalWithholdingAmount)} deductions</span>
                      <span className="text-[#8a7f72]">+</span>
                      <span>{money(String(liveTcsAmount))} TCS</span>
                      {Number(calculation?.roundOffAmount) !== 0 ? (
                        <>
                          <span className="text-[#8a7f72]">±</span>
                          <span>{money(calculation?.roundOffAmount)} round-off</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-end gap-5 lg:text-right">
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-[#8a7f72]">Invoice total</div>
                      <div className={`mt-0.5 text-xs font-semibold ${invoiceTotalKnown ? "text-slate-900" : "text-amber-700"}`}>{moneyOrMissing(payload.source?.invoiceTotal)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-[#8a7f72]">Difference</div>
                      <div className={`mt-0.5 text-xs font-semibold ${invoiceTotalKnown && Math.abs(liveTotalDifference) > 1 ? "text-rose-700" : invoiceTotalKnown ? "text-emerald-700" : "text-[#8a7f72]"}`}>
                        {invoiceTotalKnown ? money(String(liveTotalDifference)) : "—"}
                      </div>
                    </div>
                    <div className="min-w-28">
                      <div className="text-[9px] uppercase tracking-wide text-[#8a7f72]">Supplier payable</div>
                      <div className="mt-0.5 text-base font-semibold">{money(String(liveCalculatedPayable))}</div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-preview">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-950">Confirm Purchase voucher</h3>
          <div className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
            correctionBlockers.length > 0
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : hasUnsavedChanges
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {correctionBlockers.length > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {correctionBlockers.length > 0
              ? `${correctionBlockers.length} correction${correctionBlockers.length === 1 ? "" : "s"} remaining`
              : hasUnsavedChanges
                ? "Save to check"
                : "Accounting checks passed"}
          </div>
        </header>

        {scopeWarnings("source").length > 0 ? (
          <div className="border-b border-slate-100 p-4 sm:px-5">
            <ReviewWarnings warnings={scopeWarnings("source")} />
          </div>
        ) : null}

        <div className="border-b border-slate-100 bg-[#eef1f7] p-3 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3 px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span>Tally-style voucher preview</span>
            <span className="normal-case tracking-normal text-slate-400 sm:hidden">Swipe to inspect</span>
          </div>
          <div className="overflow-x-auto rounded-sm border border-[#aeb4c0] bg-[#f6f5fb] shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
            <div className="min-h-[560px] min-w-[760px] p-4 text-[12px] leading-5 text-[#111827] sm:p-5">
              <div className="flex items-start justify-between gap-8">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 items-center bg-[#173b70] px-3 text-[11px] font-bold text-white">Purchase</span>
                  <span className="font-semibold">No.</span>
                  <span className="font-bold tabular-nums">{purchaseReference}</span>
                </div>
                <div className="min-w-48 border border-[#d7c700] bg-[#fffbd1] px-4 py-2 text-right">
                  <div className="font-bold tabular-nums">{tallyDate(review.voucherDate)}</div>
                  <div className="text-[10px] text-[#4b5563]">{tallyWeekday(review.voucherDate)}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[145px_12px_minmax(180px,1fr)_60px_12px_150px] gap-y-1">
                <span>Supplier Invoice No.</span>
                <span>:</span>
                <strong>{review.invoiceNumber || "Missing"}</strong>
                <span>Date</span>
                <span>:</span>
                <strong>{tallyDate(review.invoiceDate)}</strong>

                <span>Party A/c name</span>
                <span>:</span>
                <div className="col-span-4 min-w-0">
                  <strong>{review.supplierLedgerName || "Supplier ledger not selected"}</strong>
                  <div className="text-[9px] italic text-[#657186]">
                    {review.supplierGstin ? `GSTIN ${review.supplierGstin}` : review.supplierName || "Supplier GSTIN missing"}
                  </div>
                </div>

                <span>Purchase ledger</span>
                <span>:</span>
                <div className="col-span-4">
                  <strong>{previewPurchaseLedger}</strong>
                  <div className="text-[9px] italic text-[#657186]">{connection?.companyName || "Tally company not selected"}</div>
                </div>
              </div>

              <div className="mt-5 border-t border-[#9da5b2]">
                <div className="grid grid-cols-[minmax(280px,1fr)_120px_115px_60px_145px] border-b border-[#aeb4c0] px-1 py-1 font-bold">
                  <span>Name of Item</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Rate</span>
                  <span className="text-center">per</span>
                  <span className="text-right">Amount</span>
                </div>
                <div className="min-h-[255px] py-1">
                  {review.lines.map((line) => (
                    <div className="grid grid-cols-[minmax(280px,1fr)_120px_115px_60px_145px] items-start px-1 py-1" key={line.lineId}>
                      <div className="pr-5">
                        <strong>{line.stockItemName || line.description || "Item not mapped"}</strong>
                        <div className="text-[9px] text-[#657186]">{line.description || `HSN ${line.hsn || "missing"}`}</div>
                      </div>
                      <strong className="text-right tabular-nums">{tallyQuantity(line.quantity)}</strong>
                      <strong className="text-right tabular-nums">{tallyAmount(line.rate)}</strong>
                      <span className="text-center">{line.unit || "—"}</span>
                      <strong className="text-right tabular-nums">{tallyAmount(line.taxableAmount)}</strong>
                    </div>
                  ))}
                  {previewLedgerRows.map((row, index) => (
                    <div className="grid grid-cols-[minmax(280px,1fr)_120px_115px_60px_145px] px-1 py-0.5" key={`${row.ledger}-${index}`}>
                      <strong>{row.ledger}</strong>
                      <span />
                      <span className="text-right tabular-nums">
                        {row.rate && Number(row.rate) > 0
                          ? `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(row.rate))} %`
                          : ""}
                      </span>
                      <span />
                      <strong className="text-right tabular-nums">{tallyAmount(row.amount, { credit: row.credit })}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#9da5b2] pt-3">
                <div className="grid grid-cols-[210px_1fr] gap-y-2">
                  <span>Provide GST/e-Way Bill details</span>
                  <strong>: &nbsp; No</strong>
                  <span>Narration</span>
                  <strong className="whitespace-pre-wrap">: &nbsp; {review.narration || "No narration"}</strong>
                </div>
                <div className="mt-4 ml-auto grid w-[46%] min-w-[360px] grid-cols-2 border-y border-[#9da5b2] py-1 font-bold">
                  <span className="text-center tabular-nums">{previewQuantityLabel}</span>
                  <span className="text-right text-[14px] tabular-nums">{tallyAmount(String(liveCalculatedPayable))}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>Purchase number: {purchaseReference}</span>
            <span className={`font-semibold ${Math.abs(liveTotalDifference) > 1 ? "text-rose-600" : "text-emerald-700"}`}>
              Invoice difference {money(String(liveTotalDifference))}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold ${
            payload.sourceFileId ? "text-emerald-700" : "text-rose-700"
          }`}>
            {payload.sourceFileId ? <FileCheck2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            <span>{payload.sourceFileId ? "Invoice PDF attached" : "Invoice PDF missing"}</span>
            <button
              className="ml-1 text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 disabled:no-underline disabled:opacity-40"
              disabled={!payload.sourceFileId}
              onClick={() => void handleOpenSource()}
              type="button"
            >
              Open
            </button>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 sm:ml-4">
            <span className="shrink-0 text-[11px] font-semibold text-slate-500">Narration</span>
            <input
              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:text-slate-500"
              disabled={locked}
              onChange={(event) => updateReview("narration", event.target.value)}
              value={review.narration}
            />
          </label>
        </div>
      </section>

      {(error || notice) ? (
        <div className={`sticky bottom-24 z-20 rounded-xl border px-4 py-3 text-sm shadow-lg ${
          error
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : ["approved", "queued", "creating"].includes(payload.posting?.status ?? "") ||
                /waiting|refreshing|queued|creating|sending|preparing|reading/i.test(notice ?? "")
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : payload.posting?.status === "verification_required"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {error || notice}
        </div>
      ) : null}

      <div className="fixed bottom-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:left-[340px]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Database className="h-4 w-4" />
            <span>Packet: <strong>{caseStatusLabel(payload.caseStatus)}</strong></span>
            {payload.posting?.status !== "created" ? (
              <>
                <span>·</span>
                <span>Tally voucher: <strong>{statusLabel(
                  payload.posting?.status,
                  payload.posting?.verificationResult?.verificationStatus
                )}</strong></span>
              </>
            ) : null}
            {hasUnsavedChanges ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Unsaved</Badge> : null}
          </div>
          {payload.posting?.status === "created" ? (
            <div className="flex items-center justify-end gap-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Tally voucher {payload.posting.tallyVoucherNumber || "—"} created and verified
                {payload.posting.invoiceNumber ? ` · Invoice ${payload.posting.invoiceNumber}` : ""}
              </span>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button disabled={!canSave || saving} onClick={() => void handleSave()} variant="outline">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                Save and check
              </Button>
              {onApprovePacket ? (
                <Button
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                  disabled={approvingPacket || locked}
                  onClick={() => void handleApprovePacket()}
                >
                  {approvingPacket ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {approvingPacket ? "Approving packet" : "Approve packet"}
                </Button>
              ) : (
                <Button
                  className={canApprove ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-slate-200 text-slate-500"}
                  disabled={!canApprove || queueing}
                  onClick={() => setConfirmOpen(true)}
                  title={staleMastersBlocking ? "Refresh Tally data before approving this voucher." : undefined}
                >
                  {tallyReviewRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {tallyReviewRefreshing
                    ? "Checking Tally data"
                    : staleMastersBlocking
                      ? "Refresh Tally data first"
                      : "Approve and send"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this Purchase voucher to Tally?</DialogTitle>
            <DialogDescription>
              Kalika will create the voucher in the selected Tally company. The packet decision will not change.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            {[
              ["Company", connection?.companyName || "Missing"],
              ["Company GSTIN", connection?.companyGstin || "Missing"],
              ["Supplier invoice", review.invoiceNumber || "Missing"],
              ["Supplier ledger", review.supplierLedgerName || "Missing"],
              ["Final payable", money(String(liveCalculatedPayable))],
            ].map(([label, value]) => (
              <div className="grid grid-cols-[140px_1fr] border-b border-slate-100 px-4 py-3 text-sm last:border-b-0" key={label}>
                <span className="text-slate-500">{label}</span>
                <strong className="text-right text-slate-900">{value}</strong>
              </div>
            ))}
          </div>
          {acknowledgementWarnings.length > 0 ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <input
                checked={warningsAcknowledged}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-amber-700"
                onChange={(event) => setWarningsAcknowledged(event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-amber-950">
                  Acknowledge {acknowledgementWarnings.length} validation warning{acknowledgementWarnings.length === 1 ? "" : "s"}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-amber-800">
                  {acknowledgementWarnings.map((warning) => warning.label).join(" · ")}
                </span>
              </span>
            </label>
          ) : null}
          <DialogFooter>
            <Button disabled={queueing} onClick={() => setConfirmOpen(false)} variant="outline">Cancel</Button>
            <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={queueing || tallyReviewRefreshing || staleMastersBlocking || (acknowledgementWarnings.length > 0 && !warningsAcknowledged)} onClick={() => void handleApproveAndQueue()}>
              {queueing || tallyReviewRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {tallyReviewRefreshing
                ? "Checking Tally data"
                : staleMastersBlocking
                  ? "Refresh Tally data first"
                  : "Approve and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
