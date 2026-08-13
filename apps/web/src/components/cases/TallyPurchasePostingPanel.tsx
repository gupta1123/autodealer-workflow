"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchCaseFileSignedUrl } from "@/lib/case-persistence";
import {
  approveAndQueueTallyPurchasePosting,
  fetchTallyPurchasePosting,
  matchTallyPurchaseSupplierLedger,
  queueTallyMasterRefresh,
  saveTallyPurchasePosting,
  waitForTallyCommand,
  type TallyMasterOption,
  type TallyPostingIssue,
  type TallyPostingResponse,
  type TallyPostingReview,
  type SupplierLedgerMatch,
} from "@/lib/tally-purchase-posting";

type PanelState = "loading" | "ready" | "error";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function money(value: string | null | undefined) {
  if (!value) return "₹0.00";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(parsed)
    : value;
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

function caseStatusLabel(status: string | undefined) {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "completed") return "Pending decision";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Pending";
}

function statusLabel(status: string | undefined) {
  if (!status) return "Draft";
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

function postingProgressMessage(status: string | undefined) {
  if (status === "approved") return "Voucher approved. Preparing the Tally command…";
  if (status === "queued") return "Voucher approved and queued. Waiting for Tally…";
  if (status === "creating") return "Tally is creating and verifying the Purchase voucher…";
  if (status === "created") return "Purchase voucher created and verified in Tally.";
  if (status === "verification_required") return "Tally created the voucher, but verification needs attention.";
  return null;
}

function statusClass(status: string | undefined) {
  if (status === "created" || status === "ready_for_approval") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "failed" || status === "correction_required" || status === "verification_required") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
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
  sourceHint,
  emptyMessage = "No matching option was returned by Tally.",
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
  sourceHint?: string;
  emptyMessage?: string;
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
        option.gstin,
        option.hsnCode,
        option.unitName,
        option.taxRate,
      ]
        .filter((item) => item !== null && item !== undefined)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [options, search]);
  const detail = (option: TallyMasterOption) =>
    [
      option.parent,
      option.gstin ? `GSTIN ${option.gstin}` : null,
      option.hsnCode ? `HSN ${option.hsnCode}` : null,
      option.unitName ? `Unit ${option.unitName}` : null,
      option.taxRate !== null ? `${option.taxRate}%` : null,
    ].filter(Boolean);

  return (
    <div className={`scroll-mt-24 ${compact ? `w-full max-w-[280px] ${hideLabel ? "" : "space-y-1"}` : "space-y-1.5"}`} id={id}>
      {!hideLabel ? (
        <span className={`flex items-center justify-between gap-2 font-medium text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>
          <span>{label}</span>
          <span className={`${compact ? "text-[8px]" : "text-[9px]"} font-semibold uppercase tracking-wide text-emerald-700`}>
            From Tally
          </span>
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
            ? "w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
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
                placeholder={`Search ${companyName || "Tally"}`}
                value={search}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-medium text-slate-400">
              <span className="truncate">Company: {companyName || "Not selected"}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span>{syncedAt ? `Synced ${formatDateTime(syncedAt)}` : "Not synced"}</span>
                {value ? (
                  <button
                    className="font-semibold text-slate-600 hover:text-rose-700"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </span>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
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
                        <span className="mt-1 flex flex-wrap gap-1">
                          {detail(option).map((item) => (
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
          </ScrollArea>
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
};

export function TallyPurchasePostingPanel({
  caseId,
  onApprovePacket,
  onHeaderStateChange,
}: {
  caseId: string;
  onApprovePacket?: () => Promise<void>;
  onHeaderStateChange?: (state: TallyPurchaseHeaderState) => void;
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
  const [approvingPacket, setApprovingPacket] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [refreshingMasters, setRefreshingMasters] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingGstRate, setEditingGstRate] = useState(false);
  const [supplierLedgerMatch, setSupplierLedgerMatch] = useState<SupplierLedgerMatch | null>(null);
  const [matchingSupplierLedger, setMatchingSupplierLedger] = useState(false);
  const [supplierLedgerMatchError, setSupplierLedgerMatchError] = useState<string | null>(null);
  const automaticMasterSyncKeyRef = useRef("");
  const automaticSupplierMatchKeyRef = useRef("");
  const lastPostingStatusRef = useRef<string | null>(null);

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
      setPayload(next);
      setSelectedConnectionId(next.selectedConnectionId ?? connectionId ?? "");
      setSelectedCompanyName(next.selectedCompanyName ?? companyName ?? "");
      if (replaceReview || (!dirty && !review)) setReview(next.review);
      setError(null);
      setState("ready");
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Tally posting review.");
      setState("error");
      return null;
    }
  }, [caseId, dirty, review]);

  useEffect(() => {
    void load(false, null, true);
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const postingStatus = payload?.posting?.status;
    if (!["approved", "queued", "creating"].includes(postingStatus ?? "")) return;
    const interval = window.setInterval(
      () =>
        void load(
          true,
          payload?.selectedConnectionId,
          false,
          payload?.selectedCompanyName
        ),
      3000
    );
    return () => window.clearInterval(interval);
  }, [
    load,
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

    const progressMessage = postingProgressMessage(status);
    if (progressMessage) {
      setError(null);
      setNotice(progressMessage);
    }
  }, [payload?.posting?.lastError, payload?.posting?.status]);

  useEffect(() => {
    if (!payload) return;
    onHeaderStateChange?.({
      selectedConnectionId: payload.selectedConnectionId,
      connection: payload.connection,
      connectionOptions: payload.connectionOptions,
      buyerGstin: payload.review?.buyerGstin || payload.source?.buyerGstin || null,
    });
  }, [onHeaderStateChange, payload]);

  const locked = ["approved", "queued", "creating", "created", "verification_required"].includes(payload?.posting?.status ?? "");
  const ledgerOptions = useMemo(
    () => dedupeMasterOptions(payload?.masterOptions.ledgers ?? []),
    [payload?.masterOptions.ledgers]
  );
  const stockItemOptions = payload?.masterOptions.stockItems ?? [];
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
      review?.supplierLedgerName?.trim() ||
      (!supplierName && !supplierGstin) ||
      !payload?.connection?.masterSnapshotFresh ||
      !payload.connection.masterSnapshotComplete ||
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
    payload?.connection?.masterSnapshotComplete,
    payload?.connection?.masterSnapshotFresh,
    payload?.connection?.masterSyncRunId,
    review?.supplierGstin,
    review?.supplierLedgerName,
    review?.supplierName,
    selectedCompanyName,
    selectedConnectionId,
  ]);
  const purchaseTaxOptions = (dutyHead: "cgst" | "sgst" | "igst") =>
    ledgerOptions.filter((option) => {
      const identity = `${option.name} ${option.parent ?? ""}`;
      return new RegExp(dutyHead, "i").test(identity) && !/\b(output|sales)\b/i.test(identity);
    });
  const cgstOptions = purchaseTaxOptions("cgst");
  const sgstOptions = purchaseTaxOptions("sgst");
  const igstOptions = purchaseTaxOptions("igst");
  const tdsOptions = ledgerOptions.filter((option) =>
    /\btds\b|tax\s+deducted/i.test(`${option.name} ${option.parent ?? ""}`)
  );
  const freightOptions = ledgerOptions.filter((option) =>
    /transportation\s+inward|freight/i.test(option.name)
  );
  const tds194qOptions = tdsOptions.filter((option) => /194q|0[.]10/i.test(option.name));
  const transportTdsOptions = tdsOptions.filter((option) => /goods\s+transport/i.test(option.name));
  const cgstTdsOptions = tdsOptions.filter((option) => /cgst\s+tds/i.test(option.name));
  const sgstTdsOptions = tdsOptions.filter((option) => /sgst\s+tds/i.test(option.name));
  const igstTdsOptions = tdsOptions.filter((option) => /igst\s+tds/i.test(option.name));
  const tcsOptions = ledgerOptions.filter((option) =>
    /\btcs\b|tax\s+collected/i.test(`${option.name} ${option.parent ?? ""}`)
  );
  const roundOffOptions = ledgerOptions.filter((option) =>
    /round[\s-]*off/i.test(`${option.name} ${option.parent ?? ""}`)
  );
  const purchaseOptions = ledgerOptions.filter((option) =>
    /purchase\s+accounts?/i.test(option.parent ?? "")
  );
  const prerequisiteIssues = useMemo(
    () => (payload?.blockers ?? []).filter((issue) => issue.scope === "case"),
    [payload?.blockers]
  );
  const correctionBlockers = useMemo(
    () => (payload?.blockers ?? []).filter((issue) => issue.scope !== "case"),
    [payload?.blockers]
  );
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

  const issueCounts = useMemo(() => {
    const counts = { invoice: 0, line: 0, tax: 0, source: 0 };
    for (const issue of correctionBlockers) {
      if (issue.scope === "invoice") counts.invoice += 1;
      else if (issue.scope === "line") counts.line += 1;
      else if (issue.scope === "tax") counts.tax += 1;
      else if (issue.scope === "source") counts.source += 1;
    }
    return counts;
  }, [correctionBlockers]);

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

  async function handleCompanyChange(nextCompanyName: string) {
    if (
      !nextCompanyName ||
      nextCompanyName === selectedCompanyName ||
      !selectedConnectionId
    ) {
      return;
    }
    if ((dirty || connectionDirty) && !window.confirm("Discard unsaved Tally review changes and switch company?")) return;
    setDirty(false);
    setConnectionDirty(false);
    setNotice(null);
    const next = await load(
      false,
      selectedConnectionId,
      true,
      nextCompanyName
    );
    if (next) {
      setConnectionDirty(
        next.posting?.connectionId !== selectedConnectionId ||
          next.posting?.companyName !== nextCompanyName
      );
    }
  }

  async function handleSave() {
    if (!review || !selectedConnectionId || !selectedCompanyName || locked) return;
    try {
      setSaving(true);
      setError(null);
      const next = await saveTallyPurchasePosting(
        caseId,
        review,
        selectedConnectionId,
        selectedCompanyName
      );
      setPayload(next);
      setReview(next.review);
      setSelectedConnectionId(next.selectedConnectionId ?? selectedConnectionId);
      setSelectedCompanyName(next.selectedCompanyName ?? selectedCompanyName);
      setDirty(false);
      setConnectionDirty(false);
      setNotice(next.readyForApproval
        ? "Changes saved. This voucher is ready to send to Tally."
        : "Changes saved. Complete the highlighted items before approval.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your changes.");
    } finally {
      setSaving(false);
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
      !payload.connection?.masterSnapshotFresh ||
      !payload.connection?.masterSnapshotComplete
    ) {
      return;
    }
    try {
      setQueueing(true);
      setError(null);
      const next = await approveAndQueueTallyPurchasePosting(caseId);
      setPayload(next);
      setReview(next.review);
      setDirty(false);
      setConnectionDirty(false);
      setConfirmOpen(false);
      setNotice(
        postingProgressMessage(next.posting?.status) ||
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
      const queued = await queueTallyMasterRefresh(connection.id, connection.companyName) as {
        command?: { id?: string };
      };
      const commandId = queued.command?.id;
      if (!commandId) throw new Error("Tally could not start the refresh.");
      if (!automatic) {
        setNotice("Refreshing company data from Tally…");
      }
      const completed = await waitForTallyCommand(connection.id, commandId);
      if (!completed) throw new Error("Tally is still refreshing. Check the Tally connection and try again.");
      if (completed.status !== "succeeded") {
        throw new Error(completed.error || "Tally could not refresh the company data.");
      }
      await load(true, connection.id, !dirty, connection.companyName);
      setNotice("Latest company data loaded from Tally.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh data from Tally.");
    } finally {
      setRefreshingMasters(false);
    }
  }, [dirty, load, payload?.connection]);

  async function handleOpenSource() {
    if (!payload?.sourceFileId) return;
    try {
      const result = await fetchCaseFileSignedUrl(caseId, payload.sourceFileId);
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Failed to open source invoice.");
    }
  }

  const sourceMaterialByLine = useMemo(
    () => new Map(payload?.source?.lines.map((line) => [line.lineId, line.materialLabel]) ?? []),
    [payload?.source?.lines]
  );
  const sourceLineById = useMemo(
    () => new Map(payload?.source?.lines.map((line) => [line.lineId, line]) ?? []),
    [payload?.source?.lines]
  );
  const liveCompanyOptions = useMemo(() => {
    const seenCompanies = new Set<string>();
    return [...(payload?.connectionOptions ?? [])]
      .sort((left, right) => {
        if (left.companyName === selectedCompanyName) return -1;
        if (right.companyName === selectedCompanyName) return 1;
        return 0;
      })
      .filter(
        (option) =>
          option.bridgeConnected &&
          option.tallyReachable &&
          option.companyLoaded &&
          !option.heartbeatStale &&
          Boolean(option.companyName?.trim())
      )
      .filter((option) => {
        const companyKey = option.companyName!.trim().toLowerCase();
        if (seenCompanies.has(companyKey)) return false;
        seenCompanies.add(companyKey);
        return true;
      });
  }, [payload?.connectionOptions, selectedCompanyName]);
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
  const selectedMatchesActive = Boolean(
    connectionReadable &&
      connection?.companyName &&
      connection.activeCompanyName &&
      connection.companyName.trim().toLowerCase() ===
        connection.activeCompanyName.trim().toLowerCase()
  );
  const tallyReviewRefreshing = refreshingMasters || mastersNeedSync;
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
  useEffect(() => {
    if (
      !connectionReadable ||
      !selectedMatchesActive ||
      refreshingMasters ||
      locked ||
      !connection?.id ||
      !connection.companyName
    ) {
      return;
    }
    const syncKey = [
      connection.id,
      connection.companyName.trim().toLowerCase(),
    ].join(":");
    if (automaticMasterSyncKeyRef.current === syncKey) return;
    automaticMasterSyncKeyRef.current = syncKey;
    void handleRefreshMasters(true);
  }, [
    connection?.companyName,
    connection?.id,
    connectionReadable,
    handleRefreshMasters,
    locked,
    refreshingMasters,
    selectedMatchesActive,
  ]);
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

  if (!payload || !payload.eligibility.eligible || !review) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">One invoice is required</h2>
        <p className="mt-2 text-sm text-slate-600">
          This case contains {payload?.eligibility.canonicalInvoiceCount ?? 0} canonical invoices. Purchase posting supports exactly one invoice per case.
        </p>
      </div>
    );
  }

  const calculation = payload.calculation;
  const invoiceTaxKnown = Boolean(payload.source?.invoiceTaxAmount?.trim());
  const invoiceTotalKnown = Boolean(payload.source?.invoiceTotal?.trim());
  const invoiceTds194qKnown = Boolean(payload.source?.invoiceTds194qAmount?.trim());
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
  const purchaseGoodsTdsActive = Number(calculation?.tds194qAmount || 0) > 0;
  const cgstTdsActive = Number(calculation?.cgstTdsAmount || 0) > 0;
  const sgstTdsActive = Number(calculation?.sgstTdsAmount || 0) > 0;
  const igstTdsActive = Number(calculation?.igstTdsAmount || 0) > 0;
  const transporterTdsActive = Number(calculation?.transportTdsAmount || 0) > 0;
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
    <div className="tally-purchase-workflow mx-auto max-w-6xl space-y-4 p-3 pb-32 sm:p-5 sm:pb-32">
      <div
        className="flex flex-col gap-3 px-1 py-0.5 sm:flex-row sm:items-start sm:justify-between"
        id="tally-header"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-950">Tally Purchase voucher</h2>
            <Badge variant="outline" className={statusClass(payload.posting?.status)}>
              {statusLabel(payload.posting?.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Accounting approval is separate from the packet decision.
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:w-auto">
          <label className="min-w-0 flex-1 sm:w-[300px] sm:flex-none">
            <span className="sr-only">Active Tally company</span>
            <select
              className={`${inputClass} h-9 text-xs font-semibold ${
                selectedMatchesActive
                  ? "border-emerald-200 bg-emerald-50/60"
                  : connectionReadable
                    ? "border-amber-300 bg-amber-50"
                    : ""
              }`}
              disabled={locked || state === "loading"}
              onChange={(event) => void handleCompanyChange(event.target.value)}
              title="Active Tally company"
              value={selectedCompanyName}
            >
              <option value="">
                {liveCompanyOptions.length > 0
                  ? "Select active Tally company"
                  : "No readable Tally company"}
              </option>
              {liveCompanyOptions.map((option) => (
                <option key={option.id} value={option.companyName ?? ""}>
                  {option.companyName}{option.isActive ? " — active in Tally" : ""}
                </option>
              ))}
            </select>
            <span className={`mt-1 block truncate text-[10px] font-medium ${
              selectedMatchesActive ? "text-emerald-700" : "text-amber-700"
            }`}>
              {selectedMatchesActive
                ? "Connected to the selected Tally company"
                : connectionReadable
                  ? `Tally is active on ${connection?.activeCompanyName || "another company"}`
                  : "Cannot reach the selected Tally company"}
            </span>
          </label>

          {mastersNeedSync ? (
            <Button
              aria-label={refreshingMasters ? "Refreshing Tally data" : "Refresh Tally data"}
              className="h-9 w-9 shrink-0 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              disabled={
                !connection?.id ||
                !connection.companyName ||
                refreshingMasters ||
                locked
              }
              onClick={() => void handleRefreshMasters()}
              size="icon"
              title={refreshingMasters ? "Refreshing Tally data…" : "Refresh Tally data"}
              variant="outline"
            >
              {refreshingMasters ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Purchase voucher review sections"
        className="grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4"
      >
        {[
          { href: "#tally-invoice", number: "1", label: "Invoice", issues: issueCounts.invoice },
          { href: "#tally-items", number: "2", label: "Mappings", issues: issueCounts.line },
          { href: "#tally-taxes", number: "3", label: "Taxes", issues: issueCounts.tax },
          { href: "#tally-preview", number: "4", label: "Tally preview", issues: issueCounts.source },
        ].map((step) => (
          <a
            className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 sm:border-b-0 sm:border-r sm:last:border-r-0"
            href={step.href}
            key={step.href}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              step.issues > 0
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-700"
            }`}>
              {step.issues > 0 ? step.issues : <CheckCircle2 className="h-3 w-3" />}
            </span>
            <span>{step.number}. {step.label}</span>
          </a>
        ))}
      </nav>

      {payload.posting?.status === "created" ? (
        <section className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-xs font-semibold text-emerald-950">Purchase voucher created</h3>
            <p className="text-[11px] text-emerald-700">
                Voucher {payload.posting.tallyVoucherNumber || "—"} · Verified {formatDateTime(payload.posting.verifiedAt)}
            </p>
          </div>
        </section>
      ) : null}

      {prerequisiteIssues.length > 0 && !onApprovePacket ? (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
          <Database className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">This voucher cannot be approved yet.</span>{" "}
            {prerequisiteIssues[0]?.message}
          </div>
        </div>
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
        <section className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rechecking the voucher against the latest Tally data…
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
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mr-2 inline h-4 w-4" /> All accounting checks passed.
        </section>
      )}

      <ReviewWarnings warnings={scopeWarnings("case")} />

      <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-invoice">
        <div className="flex items-start justify-between gap-4">
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Step 1</div>
            <h3 className="mt-1 font-semibold text-slate-950">Source invoice</h3>
            <p className="mt-1 text-xs text-slate-500">Check the invoice details, then select the matching supplier ledger in Tally.</p>
          </div>
          <Button className="mr-4 mt-4 sm:mr-5 sm:mt-5" disabled={!payload.sourceFileId} onClick={() => void handleOpenSource()} size="sm" variant="outline">
            <ExternalLink className="h-4 w-4" /> View invoice
          </Button>
        </div>
        <div className="mt-4 grid border-t border-slate-100 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            <Field id="field-invoice-number" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_NUMBER_REQUIRED"])} label="Invoice number" onChange={(value) => updateReview("invoiceNumber", value)} sourceValue={payload.source?.invoiceNumber} value={review.invoiceNumber} />
            <Field id="field-invoice-date" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_DATE_REQUIRED"])} label="Supplier invoice date" onChange={(value) => updateReview("invoiceDate", value)} sourceValue={payload.source?.invoiceDate} type="date" value={review.invoiceDate} />
            <Field id="field-voucher-date" disabled={locked} issues={scopeIssues("invoice", ["VOUCHER_DATE_REQUIRED"])} label="Tally voucher date" onChange={(value) => updateReview("voucherDate", value)} type="date" value={review.voucherDate} />
            <Field disabled={locked} label="Vehicle number" onChange={(value) => updateReview("vehicleNumber", value)} sourceValue={payload.source?.vehicleNumber} value={review.vehicleNumber} />
            <Field id="field-invoice-total" disabled={locked} issues={scopeIssues("invoice", ["INVOICE_TOTAL_REQUIRED"])} label="Final invoice payable" onChange={(value) => updateReview("invoiceTotal", value)} sourceValue={payload.source?.invoiceTotal} value={review.invoiceTotal} />
            <Field disabled={locked} label="Supplier name" onChange={(value) => updateReview("supplierName", value)} sourceValue={payload.source?.supplierName} value={review.supplierName} />
            <Field id="field-supplier-gstin" disabled={locked} issues={scopeIssues("invoice", ["SUPPLIER_GSTIN_REQUIRED"])} label="Supplier GSTIN" onChange={(value) => updateReview("supplierGstin", value.toUpperCase())} sourceValue={payload.source?.supplierGstin} value={review.supplierGstin} />
            <Field disabled={locked} label="Buyer name" onChange={(value) => updateReview("buyerName", value)} sourceValue={payload.source?.buyerName} value={review.buyerName} />
            <Field id="field-buyer-gstin" disabled={locked} issues={scopeIssues("invoice", ["BUYER_GSTIN_REQUIRED"])} label="Buyer GSTIN" onChange={(value) => updateReview("buyerGstin", value.toUpperCase())} sourceValue={payload.source?.buyerGstin} value={review.buyerGstin} />
          </div>
          <aside className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Building2 className="h-4 w-4 text-emerald-700" />
              Supplier accounting mapping
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Invoice supplier</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{review.supplierName || "Not extracted"}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">{review.supplierGstin || "GSTIN not available"}</div>
            </div>
            <div className="flex h-8 items-center justify-center">
              <ArrowRight className="h-4 w-4 rotate-90 text-emerald-600" />
            </div>
            <MasterCombobox
              {...masterContext}
              compact
              disabled={locked || mastersNeedSync}
              emptyMessage="No ledger matched this search in the selected Tally company."
              id="field-supplier-ledger"
              issues={scopeIssues("invoice", ["SUPPLIER_LEDGER_REQUIRED", "SUPPLIER_LEDGER_GSTIN_MISMATCH"])}
              label="Post against supplier ledger"
              onChange={(value) => updateReview("supplierLedgerName", value)}
              options={supplierLedgerOptions}
              sourceHint={`Search all ${supplierLedgerOptions.length.toLocaleString("en-IN")} ledgers from the selected Tally company. Likely supplier ledgers appear first.`}
              value={review.supplierLedgerName}
            />
            {matchingSupplierLedger ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                Checking the supplier against all Tally ledgers…
              </div>
            ) : null}
            {supplierLedgerMatch?.matchType === "close_match" && supplierLedgerMatch.candidateLedgerNames.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
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
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] leading-4 text-slate-500">
                No ledger was safe to select automatically. Search the complete ledger list above.
              </div>
            ) : null}
            {supplierLedgerMatchError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700">
                {supplierLedgerMatchError} You can still search all ledgers manually.
              </div>
            ) : null}
            <div className="mt-3">
              <ReviewWarnings warnings={scopeWarnings("invoice")} />
            </div>
          </aside>
        </div>
      </section>

      <section className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-items">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Step 2</div>
          <h3 className="mt-1 font-semibold text-slate-950">Items and Tally mappings</h3>
          <p className="mt-1 text-xs text-slate-500">Check each invoice item and select its stock item and purchase ledger from Tally.</p>
        </div>
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
            const selectedStockItem = stockItemOptions.find(
              (option) =>
                option.name.trim().toLowerCase() ===
                line.stockItemName.trim().toLowerCase()
            );
            const invoiceUnit = sourceLine?.unit || line.unit;
            const tallyUnit = selectedStockItem?.unitName?.trim() || "";
            const equivalentUnitAlias = Boolean(
              invoiceUnit &&
              tallyUnit &&
              invoiceUnit.trim().toLowerCase() !== tallyUnit.toLowerCase() &&
              normalizeUnitFamily(invoiceUnit) === normalizeUnitFamily(tallyUnit)
            );
            return (
            <article className="scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white" id={`tally-line-${line.lineId}`} key={line.lineId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="px-4 pt-4">
                  <div className="text-xs font-semibold text-slate-900">Line {index + 1} · {sourceMaterialByLine.get(line.lineId) || "Manual"}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Invoice details are on the left; Tally selections are on the right.</div>
                </div>
                {lineIssues(line.lineId).length > 0 ? (
                  <Badge variant="outline" className="mr-4 mt-4 border-rose-200 bg-rose-50 text-rose-700">{lineIssues(line.lineId).length} corrections</Badge>
                ) : (
                  <Badge variant="outline" className="mr-4 mt-4 border-emerald-200 bg-emerald-50 text-emerald-700">Line ready</Badge>
                )}
              </div>
              {lineWarnings(line.lineId).length > 0 ? (
                <div className="px-4 pt-3">
                  <ReviewWarnings warnings={lineWarnings(line.lineId)} />
                </div>
              ) : null}
              <div className="mt-4 grid border-t border-slate-100 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.8fr)]">
                <div className="grid gap-4 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Description" onChange={(value) => updateLine(index, "description", value)} sourceValue={sourceLine?.description} value={line.description} />
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["HSN_MAPPING_REQUIRED"])} label="HSN" onChange={(value) => updateLine(index, "hsn", value)} sourceValue={sourceLine?.hsn} value={line.hsn} />
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Quantity" onChange={(value) => updateLine(index, "quantity", value)} sourceValue={sourceLine?.quantity} value={line.quantity} />
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED", "STOCK_ITEM_UNIT_MISMATCH"])} label="Unit" onChange={(value) => updateLine(index, "unit", value)} sourceValue={sourceLine?.unit} value={line.unit} />
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED"])} label="Rate" onChange={(value) => updateLine(index, "rate", value)} sourceValue={sourceLine?.rate} value={line.rate} />
                  <Field disabled={locked} issues={lineIssues(line.lineId, ["LINE_ACCOUNTING_FIELDS_REQUIRED", "LINE_TAXABLE_MISMATCH"])} label="Taxable amount" onChange={(value) => updateLine(index, "taxableAmount", value)} sourceValue={sourceLine?.taxableAmount} value={line.taxableAmount} />
                </div>
                <div className="space-y-4 p-4">
                  <MasterCombobox
                    {...masterContext}
                    compact
                    disabled={locked || mastersNeedSync}
                    emptyMessage="No stock item was returned by Tally."
                    issues={lineIssues(line.lineId, ["STOCK_ITEM_REQUIRED", "STOCK_ITEM_CLIENT_RULE_MISMATCH", "STOCK_ITEM_HSN_MISMATCH", "STOCK_ITEM_UNIT_MISMATCH"])}
                    label="Map to Tally stock item"
                    onChange={(value) => updateLine(index, "stockItemName", value)}
                    options={stockItemOptions}
                    sourceHint={`Invoice: HSN ${line.hsn || "missing"} · Unit ${invoiceUnit || "missing"}`}
                    value={line.stockItemName}
                  />
                  {equivalentUnitAlias ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-[10px] text-emerald-900">
                      <span>Invoice unit <strong>{invoiceUnit}</strong></span>
                      <ArrowRight className="h-3 w-3 text-emerald-600" />
                      <span>Tally unit <strong>{tallyUnit}</strong></span>
                      <span className="rounded-full bg-white px-1.5 py-0.5 font-semibold text-emerald-700">1:1</span>
                    </div>
                  ) : null}
                  <MasterCombobox
                    {...masterContext}
                    compact
                    disabled={locked || mastersNeedSync}
                    emptyMessage="No Purchase Accounts ledger was returned by Tally."
                    issues={lineIssues(line.lineId, ["PURCHASE_LEDGER_REQUIRED", "PURCHASE_LEDGER_CLIENT_RULE_MISMATCH"])}
                    label="Post to purchase ledger"
                    onChange={(value) => updateLine(index, "purchaseLedgerName", value)}
                    options={purchaseOptions}
                    sourceHint="Only ledgers under Purchase Accounts are shown."
                    value={line.purchaseLedgerName}
                  />
                </div>
              </div>
            </article>
          )})}
        </div>
      </section>

      <section className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-taxes">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Step 3</div>
            <h3 className="mt-1 font-semibold text-slate-950">Taxes and reconciliation</h3>
            <p className="mt-1 text-xs text-slate-500">Compare the invoice with the calculated taxes and select the matching Tally ledgers.</p>
          </div>
          {(missingApplicableTaxMasters || mastersNeedSync) ? (
            <Button
              disabled={!connection?.id || !connection.companyName || refreshingMasters || locked}
              onClick={() => void handleRefreshMasters()}
              size="sm"
              variant="outline"
            >
              {refreshingMasters ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh Tally data
            </Button>
          ) : null}
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          <ReviewWarnings warnings={scopeWarnings("tax")} />
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {calculation?.taxMode === "cgst_sgst"
                      ? "Intrastate purchase · CGST + SGST"
                      : calculation?.taxMode === "igst"
                        ? "Interstate purchase · IGST"
                        : "Tax jurisdiction needs confirmation"}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Supplier: {stateLabel(calculation?.supplierStateCode)}
                  </div>
                </div>
              </div>
              <div className="sm:border-l sm:border-slate-200 sm:pl-4">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Buyer registration</div>
                <div className="mt-1 text-xs font-semibold text-slate-800">{stateLabel(calculation?.buyerStateCode)}</div>
              </div>
              <div className="flex scroll-mt-24 items-center justify-between gap-3 sm:justify-end" id="field-gst-rate">
                <div className="text-left sm:text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Confirmed GST rate</div>
                  <div className={`mt-0.5 text-sm font-semibold ${review.gstRate ? "text-slate-900" : "text-rose-600"}`}>
                    {review.gstRate ? `${review.gstRate}%` : "Missing"}
                  </div>
                </div>
                {!locked ? (
                  <Button onClick={() => setEditingGstRate((current) => !current)} size="sm" variant="ghost">
                    {editingGstRate ? "Done" : "Change"}
                  </Button>
                ) : null}
              </div>
            </div>
            {editingGstRate ? (
              <div className="border-t border-slate-200 bg-white px-4 py-3">
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
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                      <MasterCombobox {...masterContext} compact hideLabel id="field-freight-ledger" disabled={locked || mastersNeedSync} emptyMessage="Transportation Inward @ 18.00% was not returned by Tally." issues={scopeIssues("tax", ["FREIGHT_LEDGER_REQUIRED"])} label="Freight ledger" onChange={(value) => updateReview("freightLedgerName", value)} options={freightOptions} value={review.freightLedgerName} />
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
                        <MasterCombobox {...masterContext} compact hideLabel id="field-cgst-ledger" disabled={locked || mastersNeedSync} emptyMessage="No compatible input CGST ledger was returned by Tally." issues={scopeIssues("tax", ["CGST_LEDGER_REQUIRED"])} label="CGST purchase ledger" onChange={(value) => updateReview("cgstLedgerName", value)} options={cgstOptions} value={review.cgstLedgerName} />
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
                        <MasterCombobox {...masterContext} compact hideLabel id="field-sgst-ledger" disabled={locked || mastersNeedSync} emptyMessage="No compatible input SGST ledger was returned by Tally." issues={scopeIssues("tax", ["SGST_LEDGER_REQUIRED"])} label="SGST purchase ledger" onChange={(value) => updateReview("sgstLedgerName", value)} options={sgstOptions} value={review.sgstLedgerName} />
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
                      <MasterCombobox {...masterContext} compact hideLabel id="field-igst-ledger" disabled={locked || mastersNeedSync} emptyMessage="No compatible input IGST ledger was returned by Tally." issues={scopeIssues("tax", ["IGST_LEDGER_REQUIRED"])} label="IGST purchase ledger" onChange={(value) => updateReview("igstLedgerName", value)} options={igstOptions} value={review.igstLedgerName} />
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
                      <div className="text-[11px] font-medium leading-4 text-slate-500">Invoice-confirmed</div>
                      <div className="pt-1 text-xs text-slate-700">{moneyOrMissing(payload.source?.invoiceTds194qAmount)}</div>
                      <div className="pt-1 text-xs font-semibold text-slate-900">{money(calculation?.tds194qAmount)}</div>
                      <MasterCombobox {...masterContext} compact hideLabel id="field-tds-194q-ledger" disabled={locked || mastersNeedSync} emptyMessage="The configured purchase TDS ledger was not returned by Tally." issues={scopeIssues("tax", ["TDS_194Q_LEDGER_REQUIRED"])} label="Purchase TDS ledger" onChange={(value) => updateReview("tds194qLedgerName", value)} options={tds194qOptions} value={review.tds194qLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceTds194qKnown && Math.abs(Number(numericDifference(payload.source?.invoiceTds194qAmount, calculation?.tds194qAmount))) > 1 ? "text-rose-600" : invoiceTds194qKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceTds194qKnown ? money(numericDifference(payload.source?.invoiceTds194qAmount, calculation?.tds194qAmount)) : "—"}
                      </div>
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
                          <MasterCombobox {...masterContext} compact hideLabel id="field-cgst-tds-ledger" disabled={locked || mastersNeedSync} emptyMessage="CGST TDS PAYABLE 1% was not returned by Tally." issues={scopeIssues("tax", ["CGST_TDS_LEDGER_REQUIRED"])} label="CGST TDS ledger" onChange={(value) => updateReview("cgstTdsLedgerName", value)} options={cgstTdsOptions} value={review.cgstTdsLedgerName} />
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
                          <MasterCombobox {...masterContext} compact hideLabel id="field-sgst-tds-ledger" disabled={locked || mastersNeedSync} emptyMessage="SGST TDS PAYABLE 1% was not returned by Tally." issues={scopeIssues("tax", ["SGST_TDS_LEDGER_REQUIRED"])} label="SGST TDS ledger" onChange={(value) => updateReview("sgstTdsLedgerName", value)} options={sgstTdsOptions} value={review.sgstTdsLedgerName} />
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
                      <MasterCombobox {...masterContext} compact hideLabel id="field-igst-tds-ledger" disabled={locked || mastersNeedSync} emptyMessage="IGST TDS PAYABLE 2% was not returned by Tally." issues={scopeIssues("tax", ["IGST_TDS_LEDGER_REQUIRED"])} label="IGST TDS ledger" onChange={(value) => updateReview("igstTdsLedgerName", value)} options={igstTdsOptions} value={review.igstTdsLedgerName} />
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
                      <MasterCombobox {...masterContext} compact hideLabel id="field-transport-tds-ledger" disabled={locked || mastersNeedSync} emptyMessage="Tds on Goods Transport was not returned by Tally." issues={scopeIssues("tax", ["TRANSPORT_TDS_LEDGER_REQUIRED"])} label="Transport TDS ledger" onChange={(value) => updateReview("transportTdsLedgerName", value)} options={transportTdsOptions} value={review.transportTdsLedgerName} />
                      <div className="pt-1 text-xs font-semibold text-slate-400">Deduction</div>
                    </div>
                  ) : null}

                  {review.tcsReceivable ? (
                    <div className="grid grid-cols-[100px_105px_95px_100px_minmax(200px,1fr)_72px] items-center gap-2 border-t border-slate-100 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-900">TCS Receivable</div>
                      <div className="pt-1 text-xs text-slate-400">Adjustment</div>
                      <div className={`pt-1 text-xs ${invoiceTcsKnown ? "text-slate-700" : "font-medium text-amber-700"}`}>{moneyOrMissing(payload.source?.invoiceTcsAmount)}</div>
                      <Field compact hideLabel id="field-tcs-amount" disabled={locked} issues={scopeIssues("tax", ["TCS_AMOUNT_REQUIRED"])} label="Confirmed TCS amount" onChange={(value) => updateReview("tcsAmount", value)} sourceValue={payload.source?.invoiceTcsAmount} value={review.tcsAmount} />
                      <MasterCombobox {...masterContext} compact hideLabel id="field-tcs-ledger" disabled={locked || mastersNeedSync} emptyMessage="No TCS ledger was returned by Tally." issues={scopeIssues("tax", ["TCS_LEDGER_REQUIRED"])} label="TCS Receivable ledger" onChange={(value) => updateReview("tcsLedgerName", value)} options={tcsOptions} value={review.tcsLedgerName} />
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
                      <MasterCombobox {...masterContext} compact hideLabel id="field-round-off-ledger" disabled={locked || mastersNeedSync} emptyMessage="No round-off ledger was returned by Tally." issues={scopeIssues("tax", ["ROUND_OFF_LEDGER_REQUIRED"])} label="Round-off ledger" onChange={(value) => updateReview("roundOffLedgerName", value)} options={roundOffOptions} value={review.roundOffLedgerName} />
                      <div className={`pt-1 text-xs font-semibold ${invoiceRoundOffKnown && Math.abs(Number(numericDifference(payload.source?.invoiceRoundOffAmount, review.roundOffAmount))) > 1 ? "text-rose-600" : invoiceRoundOffKnown ? "text-emerald-700" : "text-slate-400"}`}>
                        {invoiceRoundOffKnown ? money(numericDifference(payload.source?.invoiceRoundOffAmount, review.roundOffAmount)) : "—"}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={locked}
                  onClick={() => updateReview("tcsReceivable", !review.tcsReceivable)}
                  size="sm"
                  variant="outline"
                >
                  {review.tcsReceivable ? "Remove TCS Receivable" : "Add TCS Receivable"}
                </Button>
                <span className="text-[11px] text-slate-500">Optional adjustments are shown only when they apply.</span>
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
            </>
          )}
        </div>
      </section>

      <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="tally-preview">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Step 4</div>
              <h3 className="mt-0.5 font-semibold text-slate-950">Confirm the Purchase voucher</h3>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Review the Purchase voucher that will be sent to Tally.</p>
            </div>
          </div>
          <div className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
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
                  <span className="font-bold tabular-nums">{payload.posting?.tallyVoucherNumber || "Auto"}</span>
                  {!payload.posting?.tallyVoucherNumber ? (
                    <span className="text-[9px] text-[#677386]">assigned by Tally</span>
                  ) : null}
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
            <span>Preview mirrors the Item Invoice layout; Tally assigns the final voucher number.</span>
            <span className={`font-semibold ${Math.abs(liveTotalDifference) > 1 ? "text-rose-600" : "text-emerald-700"}`}>
              Invoice difference {money(String(liveTotalDifference))}
            </span>
          </div>
        </div>

        <details className="group border-b border-slate-100">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 sm:px-5">
            <span>View detailed accounting breakdown</span>
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="grid border-t border-slate-100 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voucher destination</div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-950">
                  <span>Purchase</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">{connection?.companyName || "Select a Tally company"}</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Supplier invoice</div>
                <div className="mt-1 text-sm font-semibold text-slate-950">{review.invoiceNumber || "Missing invoice number"}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  Invoice {review.invoiceDate || "date missing"} · Voucher {review.voucherDate || "date missing"}
                </div>
              </div>
            </div>

            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Supplier account</div>
              <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{review.supplierLedgerName || "Supplier ledger not selected"}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">{review.supplierName || "Supplier name missing"} · {review.supplierGstin || "GSTIN missing"}</div>
                </div>
                <div className="shrink-0 text-[10px] font-medium text-emerald-700">From {connection?.companyName || "Tally"}</div>
              </div>
            </div>

            <div className="px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-950">Items and accounting mappings</h4>
                  <p className="mt-0.5 text-[11px] text-slate-500">Invoice item → stock item → purchase ledger</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">{review.lines.length} item{review.lines.length === 1 ? "" : "s"}</span>
              </div>
              {review.lines.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,1fr)_90px] gap-2 bg-slate-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
                    <div>Invoice item</div>
                    <div>Stock item</div>
                    <div>Purchase ledger</div>
                    <div className="text-right">Taxable</div>
                  </div>
                  {review.lines.map((line) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-x-3 gap-y-2 border-t border-slate-100 px-3 py-2.5 text-[11px] sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,1fr)_90px] sm:gap-2" key={line.lineId}>
                      <div className="col-start-1 row-start-1 min-w-0 sm:col-auto sm:row-auto">
                        <div className="break-words font-semibold leading-4 text-slate-900">{line.description || "Description missing"}</div>
                        <div className="mt-0.5 break-words text-[9px] leading-4 text-slate-400">HSN {line.hsn || "missing"} · {line.quantity || "0"} {line.unit}</div>
                      </div>
                      <div className={`col-start-1 row-start-2 min-w-0 break-words leading-4 sm:col-auto sm:row-auto ${line.stockItemName ? "font-medium text-slate-800" : "font-medium text-rose-600"}`}>
                        <span className="mr-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Stock:</span>
                        {line.stockItemName || "Not mapped"}
                      </div>
                      <div className={`col-start-1 row-start-3 min-w-0 break-words leading-4 sm:col-auto sm:row-auto ${line.purchaseLedgerName ? "font-medium text-slate-800" : "font-medium text-rose-600"}`}>
                        <span className="mr-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Ledger:</span>
                        {line.purchaseLedgerName || "Not mapped"}
                      </div>
                      <div className="col-start-2 row-start-1 whitespace-nowrap text-right font-semibold text-slate-900 sm:col-auto sm:row-auto">{money(line.taxableAmount)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
                  onClick={() => document.getElementById("tally-items")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  type="button"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    <span className="block text-xs font-semibold text-amber-950">No invoice items are ready</span>
                    <span className="mt-0.5 block text-[11px] text-amber-800">Complete the item details and mappings in Step 2.</span>
                  </span>
                </button>
              )}
            </div>

            <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
              <h4 className="text-sm font-semibold text-slate-950">Taxes and adjustments</h4>
              <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {[
                  Number(payload.calculation?.freightAmount || 0)
                    ? ["Freight inward", review.freightLedgerName, payload.calculation?.freightAmount]
                    : null,
                  payload.calculation?.taxMode === "cgst_sgst"
                    ? ["Input CGST", review.cgstLedgerName, payload.calculation.cgstAmount]
                    : ["Input IGST", review.igstLedgerName, payload.calculation?.igstAmount],
                  payload.calculation?.taxMode === "cgst_sgst"
                    ? ["Input SGST", review.sgstLedgerName, payload.calculation.sgstAmount]
                    : null,
                  Number(payload.calculation?.tds194qAmount || 0)
                    ? ["Purchase TDS", review.tds194qLedgerName, payload.calculation?.tds194qAmount]
                    : null,
                  Number(payload.calculation?.transportTdsAmount || 0)
                    ? ["Transport TDS", review.transportTdsLedgerName, payload.calculation?.transportTdsAmount]
                    : null,
                  Number(payload.calculation?.cgstTdsAmount || 0)
                    ? ["CGST TDS", review.cgstTdsLedgerName, payload.calculation?.cgstTdsAmount]
                    : null,
                  Number(payload.calculation?.sgstTdsAmount || 0)
                    ? ["SGST TDS", review.sgstTdsLedgerName, payload.calculation?.sgstTdsAmount]
                    : null,
                  Number(payload.calculation?.igstTdsAmount || 0)
                    ? ["IGST TDS", review.igstTdsLedgerName, payload.calculation?.igstTdsAmount]
                    : null,
                  review.tcsReceivable
                    ? ["TCS Receivable", review.tcsLedgerName, String(liveTcsAmount)]
                    : null,
                  Number(payload.calculation?.roundOffAmount || 0)
                    ? ["Round-off", review.roundOffLedgerName, payload.calculation?.roundOffAmount]
                    : null,
                ].filter(Boolean).map((entry) => {
                  const [label, ledger, amount] = entry as [string, string, string | undefined];
                  return (
                    <div className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-3 px-3 py-2.5 text-xs" key={label}>
                      <span className="font-medium text-slate-500">{label}</span>
                      <span className={`truncate font-medium ${ledger ? "text-slate-800" : "text-rose-600"}`}>{ledger || "Ledger not selected"}</span>
                      <span className="text-right font-semibold text-slate-900">{money(amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="border-t border-slate-100 bg-slate-50/70 px-4 py-5 lg:border-l lg:border-t-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount payable</div>
            <div className={`mt-1 text-2xl font-semibold tracking-tight ${
              liveCalculatedPayable > 0 ? "text-slate-950" : "text-amber-700"
            }`}>
              {money(String(liveCalculatedPayable))}
            </div>
            {liveCalculatedPayable <= 0 ? (
              <p className="mt-1 text-[11px] leading-4 text-amber-700">Complete the item values before this voucher can be approved.</p>
            ) : null}
            <div className="mt-5 space-y-2 text-xs">
              {[
                ["Basic value", payload.calculation?.basicAmount],
                Number(payload.calculation?.freightAmount || 0)
                  ? ["Freight", payload.calculation?.freightAmount]
                  : null,
                ["GST", payload.calculation?.gstAmount],
                ["Total deductions", payload.calculation?.totalWithholdingAmount],
                ["TCS", String(liveTcsAmount)],
                Number(payload.calculation?.roundOffAmount || 0)
                  ? ["Round-off", payload.calculation?.roundOffAmount]
                  : null,
              ].filter(Boolean).map((entry) => {
                const [label, amount] = entry as [string, string | undefined];
                return (
                <div className="flex items-center justify-between gap-3" key={label}>
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-900">{money(amount)}</span>
                </div>
                );
              })}
            </div>
            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Invoice comparison</div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">Invoice payable</span>
                <span className="font-semibold text-slate-900">{money(payload.calculation?.invoiceTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">Difference</span>
                <span className={`font-semibold ${
                  Math.abs(liveTotalDifference) > 1 ? "text-rose-600" : "text-emerald-700"
                }`}>{money(String(liveTotalDifference))}</span>
              </div>
            </div>
          </aside>
        </div>
        </details>

        <div className="grid border-t border-slate-100 lg:grid-cols-2">
          <div className="p-4 sm:p-5 lg:border-r lg:border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-950">Original invoice</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">The source PDF travels with this accounting approval.</p>
              </div>
              <Button disabled={!payload.sourceFileId} onClick={() => void handleOpenSource()} size="sm" variant="outline">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
            </div>
            <div className={`mt-3 flex items-start gap-3 rounded-xl border p-3 ${
              payload.sourceFileId
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}>
              {payload.sourceFileId ? (
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              )}
              <span>
                <span className={`block text-xs font-semibold ${
                  payload.sourceFileId ? "text-emerald-950" : "text-rose-950"
                }`}>
                  {payload.posting?.status === "created"
                    ? "PDF attached and verified"
                    : payload.sourceFileId
                      ? "PDF will be attached to the Tally voucher"
                      : "Original invoice PDF unavailable"}
                </span>
                <span className={`mt-0.5 block text-[11px] leading-4 ${
                  payload.sourceFileId ? "text-emerald-700" : "text-rose-700"
                }`}>
                  {payload.posting?.status === "created"
                    ? "Tally returned the same document identity and checksum."
                    : payload.sourceFileId
                      ? "Kalika verifies the document identity after the voucher is created."
                      : "Restore the source invoice before approving this voucher."}
                </span>
              </span>
            </div>
          </div>
          <label className="block p-4 sm:p-5">
            <span className="text-sm font-semibold text-slate-950">Voucher narration</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">Edit the description that will appear in Tally.</span>
            <textarea className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:text-slate-500" disabled={locked} onChange={(event) => updateReview("narration", event.target.value)} value={review.narration} />
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
                <span>Tally voucher: <strong>{statusLabel(payload.posting?.status)}</strong></span>
              </>
            ) : null}
            {hasUnsavedChanges ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Unsaved</Badge> : null}
          </div>
          {payload.posting?.status === "created" ? (
            <div className="flex items-center justify-end gap-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>Voucher {payload.posting.tallyVoucherNumber || "—"} created and verified</span>
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
                  title={tallyReviewRefreshing ? "Wait for the latest Tally data to finish loading." : undefined}
                >
                  {tallyReviewRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {tallyReviewRefreshing ? "Checking Tally data" : "Approve and send"}
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
          <DialogFooter>
            <Button disabled={queueing} onClick={() => setConfirmOpen(false)} variant="outline">Cancel</Button>
            <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={queueing || tallyReviewRefreshing} onClick={() => void handleApproveAndQueue()}>
              {queueing || tallyReviewRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {tallyReviewRefreshing ? "Checking Tally data" : "Approve and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
