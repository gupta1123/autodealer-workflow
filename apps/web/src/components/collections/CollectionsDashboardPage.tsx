"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import { readPreferredTallyConnectionId } from "@/lib/tally-company-selection";

type CompanyOption = {
  id: string;
  connectionId: string;
  companyName: string;
  financialYear: string;
  status: string;
  bridgeConnected: boolean;
  tallyReachable: boolean;
  companyLoaded: boolean;
  bankAccountCount: number | null;
  lastSyncAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
};

function uniqueCompanyOptions(options: CompanyOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.companyName.trim().toLowerCase()}::${option.financialYear.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCompanyOptionLabel(company: CompanyOption) {
  return [company.companyName, company.financialYear].filter(Boolean).join(" - ");
}

type CashDiscountTerm = {
  ratePercent: number;
  eligibilityDays: number;
  periodSource: "explicit" | "default";
};

type CashDiscountReversalPlan = {
  initialDiscount: CashDiscountTerm & { discountDeadline: string; discountAmount: number };
  grossInvoiceAmount: number;
  activeDiscount: (CashDiscountTerm & { discountDeadline: string; discountAmount: number }) | null;
  currentPayableAmount: number;
  totalReversalRequired: number;
};

type CashDiscountAnalysis = {
  sourceNarration: string;
  matchedCashDiscountContext: string | null;
  terms: CashDiscountTerm[];
  termsLabel: string | null;
  finalEligibilityDays: number | null;
  discountDeadline: string | null;
  expectedDiscounts: Array<{ ratePercent: number; amount: number }>;
  receiptDate: string | null;
  matchedReceiptAmount: number | null;
  deterministicStatus: string;
  deterministicReason: string;
  reversalPlan: CashDiscountReversalPlan | null;
  calculationVersion: string;
};

type NarrationAnalysisRow = {
  partyLedgerName: string;
  linkedInvoiceNumber: string | null;
  linkedInvoiceDate: string | null;
  originalInvoiceAmount: number;
  pendingAmount: number;
  analysis: CashDiscountAnalysis;
};

type PaymentFollowUp = {
  id: string;
  kind: "discount_window_open" | "full_payment_due" | "payment_due" | "payment_review";
  followUpStatus: "needs_follow_up" | "escalate" | "needs_review";
  ageBasis: "due_date" | "invoice_date" | "missing_dates";
  ageDays: number | null;
  ageLabel: string;
  dueDate: string | null;
  title: string;
  nextAction: string;
  partyLedgerName: string;
  partyGstin: string | null;
  partyPhone: string | null;
  partyEmail: string | null;
  linkedInvoiceNumber: string | null;
  linkedInvoiceDate: string | null;
  originalInvoiceAmount: number;
  outstandingAmount: number;
  amountReceived: number;
  narration: string;
  matchedCashDiscountContext: string | null;
  terms: CashDiscountTerm[];
  termsLabel: string | null;
  discountDeadline: string | null;
  currentDiscount: {
    ratePercent: number;
    eligibilityDays: number;
    periodSource: "explicit" | "default";
    discountDeadline: string;
    discountAmount: number;
  } | null;
  paymentAmountIfPaidToday: number | null;
  reversalPlan: CashDiscountReversalPlan | null;
  deterministicStatus: string;
  deterministicReason: string;
  calculationVersion: string;
};

type DebitNoteProposal = {
  id: string;
  sourceKind?: "tally_open_bill" | "supabase_proposal" | null;
  issueType?: "discount_shortfall" | "unpaid_discount_tier_reversal" | "invoice_unpaid" | "partial_unpaid" | null;
  canCreateDebitNote?: boolean | null;
  expectedDiscount?: number | null;
  pendingAmount?: number | null;
  connectionId?: string | null;
  companyName?: string | null;
  financialYear?: string | null;
  partyLedgerName: string;
  partyGstin: string | null;
  partyEmail: string | null;
  partyPhone: string | null;
  partyContactPerson: string | null;
  partyAddress: string | null;
  sourceSalesLedgerName?: string | null;
  linkedInvoiceNumber: string | null;
  linkedInvoiceDate: string | null;
  originalInvoiceAmount: number | null;
  cashDiscountRuleId?: string | null;
  cashDiscountRuleName?: string | null;
  amountReceived: number | null;
  recoverableAmount: number;
  remainingRecoverableAmount: number | null;
  receiptDate: string | null;
  discountDeadline: string | null;
  debitNoteDate: string;
  status: string;
  tallyVoucherGuid: string | null;
  tallyVoucherId: string | null;
  tallyVoucherNumber: string | null;
  tallyVoucherDate: string | null;
  lastError: string | null;
  narration: string | null;
  tallyOpenReferenceName: string | null;
  createdInTallyAt: string | null;
  communicationStatus: string | null;
  nativeTallyPdf?: {
    source: "tally_voucher_render";
    status: "verified";
    voucherId: string;
    voucherNumber: string;
    reference: string | null;
    alterId: string | null;
    sha256: string;
    byteSize: number;
    exportedAt: string;
  } | null;
  nativeTallyPdfVerified?: boolean;
  communicationRecipient?: string | null;
  communicationSentAt?: string | null;
  reasonCode?: string | null;
  gstMode?: string | null;
  cashDiscountAnalysis?: CashDiscountAnalysis | null;
  referenceNumber?: string | null;
  adjustOriginalInvoice?: boolean | null;
};

type TallyMaster = {
  name: string;
  parent?: string | null;
  type?: string | null;
  ledgerType?: string | null;
  billWiseEnabled?: boolean | null;
  phone?: string | null;
};

type WhatsappSendResult = {
  phoneSaveCommandId?: string | null;
  phoneSaveConnectionId?: string | null;
  phoneSaveQueueError?: string | null;
};

type TallyCommand = {
  id: string;
  connectionId?: string;
  status: "queued" | "claimed" | "succeeded" | "failed" | "canceled";
  error?: string | null;
  result?: Record<string, unknown> | null;
};

type LiveTallyConnection = {
  id: string;
  status: string;
  lastCompanyName?: string | null;
  companyLoaded?: boolean;
  tallyReachable?: boolean;
};

function isLiveTallyCompanyMatch(
  connection: LiveTallyConnection | null,
  connectionId: string,
  company: CompanyOption | null
) {
  const activeCompanyName = connection?.lastCompanyName?.trim() ?? "";
  return Boolean(
    connection?.id === connectionId &&
      company?.companyName &&
      activeCompanyName &&
      connection.tallyReachable === true &&
      connection.companyLoaded === true &&
      normalizeCompanyName(company.companyName) === normalizeCompanyName(activeCompanyName)
  );
}

type DashboardPayload = {
  setupRequired?: boolean;
  error?: string;
  company?: {
    companyName: string;
    status: string;
    tallyReachable: boolean;
    companyLoaded: boolean;
    lastHeartbeatAt: string | null;
  };
  kpis?: Record<string, number | null>;
  tabs?: {
    overduePayments?: unknown[];
    paymentFollowUps?: PaymentFollowUp[];
    cashDiscountTracker?: DebitNoteProposal[];
    debitNoteQueue?: DebitNoteProposal[];
  };
  narrationAnalysis?: NarrationAnalysisRow[];
  notes?: string[];
};

type ActiveView = "needsAction" | "followUps" | "done";
type PaymentFollowUpSort = "priority" | "most_overdue" | "highest_outstanding" | "oldest_invoice" | "customer";

type CollectionsDashboardPageProps = {
  initialView?: ActiveView;
  showWorkflowSummary?: boolean;
};

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    // Cash-discount reversals can have a real paise component (for example,
    // ₹10,000 recorded net of a 1% discount requires a ₹101.01 debit note).
    // Do not visually round the amount that will be posted to Tally.
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function daysPast(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
}

function sumRecoverable(values: DebitNoteProposal[]) {
  return values.reduce((total, item) => total + (Number(item.recoverableAmount) || 0), 0);
}

function statusClass(value?: string) {
  if (value === "created_in_tally") return "border-emerald-250 bg-emerald-50 text-emerald-800";
  if (value === "queued_in_tally" || value === "approved") return "border-amber-250 bg-amber-50 text-amber-800";
  if (value === "failed") return "border-red-250 bg-red-50 text-red-800";
  return "border-slate-200 bg-white text-slate-500";
}

function messageStatusClass(value?: string | null) {
  if (value === "sent") return "border-emerald-250 bg-emerald-50 text-emerald-800";
  if (value === "failed") return "border-red-255 bg-red-50 text-red-800";
  return "border-slate-200 bg-white text-slate-500";
}

function followUpStatusClass(status: PaymentFollowUp["followUpStatus"]) {
  if (status === "escalate") return "border-red-200 bg-red-50 text-red-700";
  if (status === "needs_review") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function followUpStatusLabel(status: PaymentFollowUp["followUpStatus"]) {
  if (status === "escalate") return "Escalate";
  if (status === "needs_review") return "Needs review";
  return "Needs follow-up";
}

function sortPaymentFollowUpRows(rows: PaymentFollowUp[], sort: PaymentFollowUpSort) {
  const basisRank: Record<PaymentFollowUp["ageBasis"], number> = {
    due_date: 1,
    invoice_date: 2,
    missing_dates: 3,
  };
  const compareName = (left: PaymentFollowUp, right: PaymentFollowUp) =>
    left.partyLedgerName.localeCompare(right.partyLedgerName);
  const compareAmount = (left: PaymentFollowUp, right: PaymentFollowUp) =>
    right.outstandingAmount - left.outstandingAmount;
  const compareAge = (left: PaymentFollowUp, right: PaymentFollowUp) => {
    const basisDifference = basisRank[left.ageBasis] - basisRank[right.ageBasis];
    if (basisDifference !== 0) return basisDifference;
    return (right.ageDays ?? -1) - (left.ageDays ?? -1);
  };

  return [...rows].sort((left, right) => {
    if (sort === "customer") return compareName(left, right);
    if (sort === "highest_outstanding") return compareAmount(left, right) || compareAge(left, right) || compareName(left, right);
    if (sort === "oldest_invoice") {
      const leftDate = Date.parse(`${left.linkedInvoiceDate ?? ""}T00:00:00.000Z`) || Number.MAX_SAFE_INTEGER;
      const rightDate = Date.parse(`${right.linkedInvoiceDate ?? ""}T00:00:00.000Z`) || Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate || compareAmount(left, right) || compareName(left, right);
    }
    if (sort === "most_overdue") return compareAge(left, right) || compareAmount(left, right) || compareName(left, right);

    const leftPriority = basisRank[left.ageBasis];
    const rightPriority = basisRank[right.ageBasis];
    return leftPriority - rightPriority || compareAge(left, right) || compareAmount(left, right) || compareName(left, right);
  });
}

function isPendingDebitNote(proposal: DebitNoteProposal) {
  return ["draft", "pending_approval", "approved", "queued_in_tally", "failed"].includes(proposal.status);
}

function isCreatedDebitNote(proposal: DebitNoteProposal) {
  return proposal.status === "created_in_tally";
}

function proposalInvoiceKey(proposal: DebitNoteProposal) {
  return `${normalizeCompanyName(proposal.partyLedgerName)}|${normalizeCompanyName(proposal.linkedInvoiceNumber)}`;
}

function shortText(value?: string | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeCompanyName(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function liveChannelUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /live cash discount channel|live Tally request timed out|channel closed|connector is not on the live|could not connect to the live|live-session authentication/i.test(message);
}

function issueLabel(proposal: DebitNoteProposal) {
  if (proposal.lastError) return "Tally action failed";
  if (proposal.status === "queued_in_tally" || proposal.status === "approved") return "Creating debit note";
  if (proposal.issueType === "unpaid_discount_tier_reversal") return "Discount period ended";
  if (proposal.issueType === "invoice_unpaid") return "Payment still outstanding";
  if (proposal.issueType === "partial_unpaid") return "Payment still partly outstanding";
  return "Collect existing invoice balance";
}

function conciseTermsLabel(proposal: DebitNoteProposal) {
  const terms = proposal.cashDiscountAnalysis?.terms ?? [];
  if (terms.length > 0) {
    return `Applied rule: ${terms.map((term) => `${term.ratePercent}% discount · fixed ${term.eligibilityDays}-day period`).join(" · ")}`;
  }
  return proposal.cashDiscountAnalysis?.termsLabel || proposal.cashDiscountRuleName || "Fixed cash-discount rule";
}

function whyNowSummary(proposal: DebitNoteProposal, lateByDays: number | null) {
  const lateSuffix = lateByDays && lateByDays > 0 ? ` ${lateByDays} day${lateByDays === 1 ? "" : "s"} late.` : "";

  if (proposal.issueType === "discount_shortfall") {
    return `${formatMoney(proposal.pendingAmount)} is already outstanding in Tally. Collect that balance without adding another debit note.${lateSuffix}`;
  }
  if (proposal.issueType === "unpaid_discount_tier_reversal") {
    return `The invoice remains unpaid after the fixed discount period ended on ${formatDate(proposal.discountDeadline)}.`;
  }
  if (proposal.issueType === "partial_unpaid") {
    return `${formatMoney(proposal.pendingAmount)} remains outstanding after the discount deadline.${lateSuffix}`;
  }
  return `No payment received after ${formatDate(proposal.discountDeadline)}.${lateSuffix}`;
}

function createButtonLabel(proposal: DebitNoteProposal) {
  if (proposal.canCreateDebitNote === false) return "Not available";
  const status = proposal.status;
  if (status === "failed") return "Retry creation";
  if (status === "approved" || status === "queued_in_tally") return "Creating…";
  return "Create debit note";
}

function canCreateInTally(proposal: DebitNoteProposal) {
  if (proposal.canCreateDebitNote === false) return false;
  return ["draft", "pending_approval", "failed"].includes(proposal.status);
}

function messageLabel(proposal: DebitNoteProposal) {
  if (needsUpdatedPdfDelivery(proposal)) return "Send updated PDF";
  if (proposal.communicationStatus === "sent") return "Sent";
  if (proposal.communicationStatus === "failed") return "Retry";
  if (!proposal.partyPhone) return "No phone";
  return "Send";
}

function needsUpdatedPdfDelivery(proposal: DebitNoteProposal) {
  const sentAt = proposal.communicationSentAt ? Date.parse(proposal.communicationSentAt) : Number.NaN;
  const exportedAt = proposal.nativeTallyPdf?.exportedAt ? Date.parse(proposal.nativeTallyPdf.exportedAt) : Number.NaN;
  return proposal.communicationStatus === "sent" && Number.isFinite(sentAt) && Number.isFinite(exportedAt) && exportedAt > sentAt;
}

function getTenDigitPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

function ContactMeta({ proposal }: { proposal: DebitNoteProposal }) {
  const items = [proposal.partyEmail, proposal.partyPhone, proposal.partyGstin].filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="mt-1 max-w-[280px] truncate text-xs text-[#8a7f72]">
      {items.join(" / ")}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#e5ddd0] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-3 border-b border-[#e5ddd0] px-5 py-4.5 sm:flex-row sm:items-center sm:justify-between bg-[#fcfbfa]/80 rounded-t-2xl">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1a1a1a]">{title}</h3>
          {description ? <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function WorkflowButton({
  active,
  count,
  detail,
  label,
  onClick,
}: {
  active: boolean;
  count: number | string;
  detail: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-28 rounded-2xl border p-5 text-left transition-all duration-300 ${
        active
          ? "border-[#2d2d2d] bg-[#2d2d2d] text-[#f7f7f5] shadow-lg shadow-black/10"
          : "border-[#e5ddd0] bg-white text-[#1a1a1a] hover:border-[#cbd5e1] hover:bg-[#faf8f4] shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? "text-amber-300" : "text-slate-400"}`}>
        {label}
      </span>
      <span className="mt-3 block text-3xl font-black tracking-tight leading-none">{count}</span>
      <span className={`mt-2.5 block text-xs font-semibold leading-relaxed ${active ? "text-slate-300" : "text-slate-500"}`}>{detail}</span>
    </button>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#e5ddd0] bg-white px-4 py-12 text-center text-xs font-semibold text-slate-400">
      {children}
    </div>
  );
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function CollectionsDashboardPage({
  initialView = "needsAction",
  showWorkflowSummary = true,
}: CollectionsDashboardPageProps = {}) {
  const isDedicatedFollowUpsPage = initialView === "followUps" && !showWorkflowSummary;
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [liveTallyConnection, setLiveTallyConnection] = useState<LiveTallyConnection | null>(null);
  const [checkingLiveTallyCompany, setCheckingLiveTallyCompany] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>(initialView);
  const [paymentFollowUpSort, setPaymentFollowUpSort] = useState<PaymentFollowUpSort>("priority");
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState("");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [sendingWhatsappId, setSendingWhatsappId] = useState("");
  const [preparingNativePdfId, setPreparingNativePdfId] = useState("");
  const [bulkSendingWhatsapp, setBulkSendingWhatsapp] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(() => new Set());
  const [selectedCreatedIds, setSelectedCreatedIds] = useState<Set<string>>(() => new Set());
  const [reviewingProposal, setReviewingProposal] = useState<DebitNoteProposal | null>(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [whatsappDialogProposals, setWhatsappDialogProposals] = useState<DebitNoteProposal[]>([]);
  const [whatsappPhoneInputs, setWhatsappPhoneInputs] = useState<Record<string, string>>({});
  const [whatsappSaveToTally, setWhatsappSaveToTally] = useState(true);
  const [whatsappDialogSending, setWhatsappDialogSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const initialLoadStartedRef = useRef(false);
  const lastLoadedConnectionRef = useRef("");

  const selectedCompany = useMemo(
    () =>
      companies.find((company) => company.id === selectedCompanyId) ??
      companies.find((company) => company.connectionId === selectedConnectionId) ??
      companies[0] ??
      null,
    [companies, selectedCompanyId, selectedConnectionId]
  );

  const loadCompanies = useCallback(async () => {
    const connectionId =
      readPreferredTallyConnectionId() || selectedConnectionId;
    if (!connectionId) {
      setCompanies([]);
      setSelectedCompanyId("");
      setSelectedConnectionId("");
      return [];
    }
    const response = await apiFetch(
      `/api/tally/companies?connectionId=${encodeURIComponent(connectionId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json()) as { companies?: CompanyOption[]; selectedCompanyId?: string | null };
    const nextCompanies = uniqueCompanyOptions(payload.companies ?? []);
    setCompanies(nextCompanies);
    setSelectedCompanyId((current) =>
      current && nextCompanies.some((company) => company.id === current)
        ? current
        : payload.selectedCompanyId || nextCompanies[0]?.id || ""
    );
    setSelectedConnectionId((current) => {
      const selectedOption =
        nextCompanies.find((company) => company.id === selectedCompanyId) ??
        nextCompanies.find((company) => company.id === payload.selectedCompanyId) ??
        nextCompanies[0];
      if (selectedOption) return selectedOption.connectionId;
      return nextCompanies.some((company) => company.connectionId === current) ? current : "";
    });
    return nextCompanies;
  }, [selectedCompanyId, selectedConnectionId]);

  const pollCommand = useCallback(async (
    connectionId: string,
    commandId: string,
    options?: { timeoutSeconds?: number; pendingMessage?: string }
  ) => {
    // A native PDF is rendered by Tally after the command has been received.
    // Give that one bounded extra time instead of reporting a false timeout
    // while the bridge is still within its own 60-second safety limit.
    const timeoutSeconds = options?.timeoutSeconds ?? 45;
    for (let attempt = 0; attempt < timeoutSeconds; attempt += 1) {
      await wait(1000);
      const response = await apiFetch(
        `/api/tally/connections/${connectionId}/commands?${new URLSearchParams({
          ids: commandId,
          limit: "1",
        }).toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { commands?: TallyCommand[] };
      const command = payload.commands?.find((item) => item.id === commandId);
      if (command?.status === "succeeded") return command;
      if (command?.status === "failed" || command?.status === "canceled") {
        throw new Error(command.error || "Tally command failed.");
      }
    }
    throw new Error(
      options?.pendingMessage ?? "The Tally command is still pending. Check the connector status, then refresh."
    );
  }, []);

  const refreshLiveTallyCompany = useCallback(async (connectionId: string) => {
    if (!connectionId) {
      setLiveTallyConnection(null);
      setCheckingLiveTallyCompany(false);
      return null;
    }
    setCheckingLiveTallyCompany(true);
    try {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/status`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { connection?: LiveTallyConnection };
      const nextConnection = payload.connection ?? null;
      setLiveTallyConnection(nextConnection);
      return nextConnection;
    } finally {
      setCheckingLiveTallyCompany(false);
    }
  }, []);

  const refreshTallyOpenBills = useCallback(
    async (connectionId: string, companyName?: string | null, financialYear?: string | null) => {
      const resolvedCompanyName = String(companyName ?? "").trim();
      if (!connectionId || !resolvedCompanyName) {
        throw new Error("Select the live Tally company before refreshing Cash Discounts.");
      }
      setMessage({ tone: "info", text: "Checking eligible candidates…" });
      let customerScope: Record<string, unknown> | undefined;
      const scopeResponse = await apiFetch(
        `/api/settings/cash-discount-customer-scope?${new URLSearchParams({
          connectionId,
          companyName: resolvedCompanyName,
        }).toString()}`,
        { cache: "no-store" }
      );
      if (scopeResponse.ok) {
        const scopePayload = await scopeResponse.json() as { settings?: Record<string, unknown> };
        customerScope = scopePayload.settings;
      } else if (scopeResponse.status !== 409) {
        throw new Error(await readError(scopeResponse));
      }
      try {
        return await runCashDiscountLiveRequest<DashboardPayload>({
          connectionId,
          companyName: resolvedCompanyName,
          financialYear,
          operation: "scan",
          customerScope,
          onProgress: () => setMessage({ tone: "info", text: "Checking eligible candidates…" }),
        });
      } catch (error) {
        if (!liveChannelUnavailable(error)) throw error;
        setMessage({ tone: "info", text: "Checking eligible candidates…" });
      }

      const queueResponse = await apiFetch("/api/collections/live/queue-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, companyName: resolvedCompanyName, financialYear, operation: "scan" }),
      });
      if (!queueResponse.ok) throw new Error(await readError(queueResponse));
      const queued = (await queueResponse.json()) as { command?: TallyCommand };
      if (!queued.command?.id) throw new Error("Cash Discount scan could not be queued.");
      const completed = await pollCommand(connectionId, queued.command.id, {
        timeoutSeconds: 90,
        pendingMessage: "The Cash Discount scan is still pending. Check the connector, then refresh.",
      });
      const scan = completed.result && typeof completed.result === "object" ? completed.result : null;
      if (!scan) throw new Error("The connector completed the Cash Discount scan without a result.");

      setMessage({ tone: "info", text: "Checking eligible candidates…" });
      const analyseResponse = await apiFetch("/api/collections/live/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, companyName: resolvedCompanyName, scan }),
      });
      if (!analyseResponse.ok) throw new Error(await readError(analyseResponse));
      return (await analyseResponse.json()) as DashboardPayload;
    },
    [pollCommand]
  );

  const refreshCreatedDebitNotesFromStore = useCallback(async (connectionId: string) => {
    const response = await apiFetch(
      `/api/collections/debit-note-proposals?${new URLSearchParams({
        connectionId,
        status: "created_in_tally",
      }).toString()}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json()) as { proposals?: DebitNoteProposal[] };
    const created = payload.proposals ?? [];
    const createdKeys = new Set(created.map(proposalInvoiceKey));

    setDashboard((current) => {
      if (!current) return current;
      const existing = current.tabs?.debitNoteQueue ?? [];
      const pending = existing.filter(
        (proposal) => !isCreatedDebitNote(proposal) && !createdKeys.has(proposalInvoiceKey(proposal))
      );
      const proposals = [...pending, ...created];
      return {
        ...current,
        kpis: {
          ...(current.kpis ?? {}),
          cdExpired: pending.length,
          debitNotesPendingApproval: pending.length,
          needsAttention: pending.length,
          createdDebitNotes: created.length,
          createdDebitNoteAmount: sumRecoverable(created),
        },
        tabs: {
          ...(current.tabs ?? {}),
          cashDiscountTracker: proposals,
          debitNoteQueue: proposals,
        },
      };
    });
  }, []);

  const refreshAll = useCallback(
    async (options?: { quiet?: boolean; refreshTally?: boolean }) => {
      try {
        if (!options?.quiet) setLoading(true);
        setMessage(null);
        setDashboard(null);
        const nextCompanies = await loadCompanies();
        let company =
          nextCompanies.find((item) => item.id === selectedCompanyId) ??
          nextCompanies.find((item) => item.connectionId === selectedConnectionId) ??
          nextCompanies[0] ??
          null;
        let connectionId = company?.connectionId || selectedConnectionId || "";
        const liveConnection = connectionId ? await refreshLiveTallyCompany(connectionId) : null;

        // The live company in Tally is the source of truth. On every full
        // refresh, move the initial/stale Kalika selection to the company that
        // Tally is actually open to before issuing any read command.
        const activeCompanyName = liveConnection?.lastCompanyName?.trim() ?? "";
        const activeCompany = activeCompanyName
          ? nextCompanies.find(
              (item) =>
                item.connectionId === connectionId &&
                normalizeCompanyName(item.companyName) === normalizeCompanyName(activeCompanyName)
            ) ?? null
          : null;

        if (activeCompany) {
          company = activeCompany;
          connectionId = activeCompany.connectionId;
          setSelectedCompanyId(activeCompany.id);
          setSelectedConnectionId(activeCompany.connectionId);
        } else if (company) {
          setSelectedCompanyId(company.id);
          setSelectedConnectionId(connectionId);
        }

        // Never calculate from a dropdown value alone. A stale, unloaded, or
        // mismatched live context must leave the dashboard empty.
        if (!isLiveTallyCompanyMatch(liveConnection, connectionId, company)) {
          lastLoadedConnectionRef.current = "";
          return;
        }

        // Set this before the asynchronous Tally scan so the selection effect
        // does not start a second, overlapping scan for the same company.
        lastLoadedConnectionRef.current = `${connectionId}::${company?.companyName ?? ""}`;
        const nextDashboard = await refreshTallyOpenBills(connectionId, company?.companyName, company?.financialYear);
        setDashboard(nextDashboard);
        setMessage(null);
        lastLoadedConnectionRef.current = `${connectionId}::${company?.companyName ?? ""}`;
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." });
      } finally {
        setLoading(false);
      }
    },
    [loadCompanies, refreshLiveTallyCompany, refreshTallyOpenBills, selectedCompanyId, selectedConnectionId]
  );

  async function createDebitNoteForProposal(proposal: DebitNoteProposal) {
    const companyName = selectedCompany?.companyName ?? proposal.companyName ?? "";
    if (!selectedConnectionId || !companyName) throw new Error("The live Tally company is not selected.");
    const proposalIdentity = {
      connectionId: proposal.connectionId,
      companyName,
      financialYear: selectedCompany?.financialYear ?? proposal.financialYear,
      partyLedgerName: proposal.partyLedgerName,
      linkedInvoiceNumber: proposal.linkedInvoiceNumber,
      recoverableAmount: proposal.recoverableAmount,
    };

    setMessage({ tone: "info", text: "Rechecking the customer and invoice in Tally..." });
    const revalidateResponse = await apiFetch("/api/collections/live/queue-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: selectedConnectionId,
        companyName,
        operation: "revalidate",
        proposal: proposalIdentity,
      }),
    });
    if (!revalidateResponse.ok) throw new Error(await readError(revalidateResponse));
    const revalidation = (await revalidateResponse.json()) as { command?: TallyCommand };
    if (!revalidation.command?.id) throw new Error("The live invoice recheck could not be queued.");
    const checked = await pollCommand(selectedConnectionId, revalidation.command.id, { timeoutSeconds: 75 });
    if (!checked.result) throw new Error("The connector completed the invoice recheck without a result.");

    setMessage({ tone: "info", text: "Creating and verifying the Debit Note in Tally..." });
    const prepareResponse = await apiFetch("/api/collections/live/prepare-debit-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: selectedConnectionId,
        companyName,
        proposal: proposalIdentity,
        scan: checked.result,
        queue: true,
      }),
    });
    if (!prepareResponse.ok) throw new Error(await readError(prepareResponse));
    const prepared = (await prepareResponse.json()) as { command?: TallyCommand };
    if (!prepared.command?.id) throw new Error("The Debit Note could not be queued.");
    return pollCommand(selectedConnectionId, prepared.command.id, {
      timeoutSeconds: 90,
      pendingMessage: "The Debit Note is still pending. Check the connector, then refresh.",
    });
  }

  async function approveProposal(proposal: DebitNoteProposal) {
    if (!tallyCompanyVerified) {
      setMessage({ tone: "error", text: `Tally is open to ${activeTallyCompanyName || "another company"}. Switch it to ${selectedCompany?.companyName || "the selected company"}, refresh, then create the debit note.` });
      return;
    }
    const id = proposal.id;
    try {
      setApprovingId(id);
      setReviewingProposal(null);
      setReviewAcknowledged(false);
      setMessage({ tone: "info", text: "Creating debit note in Tally..." });
      await createDebitNoteForProposal(proposal);
      if (selectedConnectionId) {
        try {
          await refreshCreatedDebitNotesFromStore(selectedConnectionId);
        } catch {
          const nextDashboard = await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName, selectedCompany?.financialYear);
          setDashboard(nextDashboard);
        }
      }
      setActiveView("done");
      setMessage({ tone: "success", text: "Debit note created in Tally." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not approve proposal." });
    } finally {
      setApprovingId("");
    }
  }

  async function sendWhatsappForProposal(
    proposal: DebitNoteProposal,
    options?: { recipientPhone?: string; savePhoneToTally?: boolean; connectionId?: string }
  ) {
    const response = await apiFetch(`/api/collections/debit-note-proposals/${proposal.id}/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options ?? {}),
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json().catch(() => ({}))) as WhatsappSendResult;
  }

  async function readTallyLedgerPhone(connectionId: string, ledgerName: string) {
    const response = await apiFetch(`/api/tally/connections/${connectionId}/masters?type=ledger&limit=5000`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json()) as { masters?: TallyMaster[] };
    const ledger = (payload.masters ?? []).find(
      (master) => master.name.trim().toLowerCase() === ledgerName.trim().toLowerCase()
    );
    return ledger?.phone ?? null;
  }

  async function prepareNativeTallyPdf(proposal: DebitNoteProposal) {
    if (proposal.nativeTallyPdfVerified) return proposal;
    const response = await apiFetch(`/api/collections/debit-note-proposals/${proposal.id}/native-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: selectedConnectionId }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json().catch(() => ({}))) as {
      command?: TallyCommand;
      ready?: boolean;
      proposal?: DebitNoteProposal;
    };
    const command = payload.command;
    if (command?.id) {
      const commandConnectionId = command.connectionId ?? selectedConnectionId;
      if (!commandConnectionId) throw new Error("The Tally PDF export command has no connection.");
      await pollCommand(commandConnectionId, command.id);
    } else if (!payload.ready) {
      throw new Error("The native Tally PDF export could not be started.");
    }
    if (selectedConnectionId) {
      const nextDashboard = await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName, selectedCompany?.financialYear);
      setDashboard(nextDashboard);
    }
    return { ...(payload.proposal ?? proposal), nativeTallyPdfVerified: true };
  }

  async function openWhatsappDialog(proposalsToSend: DebitNoteProposal[]) {
    const sendable = proposalsToSend.filter(
      (proposal) => proposal.communicationStatus !== "sent" || needsUpdatedPdfDelivery(proposal)
    );
    if (sendable.length === 0) return;
    // Opening the dialog must be immediate. In particular, a user needs to
    // see and enter a missing phone number before we ask Tally for a PDF.
    const nextInputs: Record<string, string> = {};
    for (const proposal of sendable) {
      // Keep the number shown to the user in dialog state. PDF preparation
      // can return a raw proposal row before its contact field is persisted.
      nextInputs[proposal.id] = getTenDigitPhone(proposal.partyPhone ?? "") ?? "";
    }
    setWhatsappDialogProposals(sendable);
    setWhatsappPhoneInputs(nextInputs);
    setWhatsappSaveToTally(true);
    setMessage(null);
  }

  async function downloadNativeTallyPdf(proposal: DebitNoteProposal) {
    try {
      const response = await apiFetch(`/api/collections/debit-note-proposals/${proposal.id}/native-pdf?download=1`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const pdf = await response.blob();
      if (pdf.size === 0) throw new Error("The verified Tally PDF was empty.");
      const objectUrl = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${proposal.tallyVoucherNumber || "debit-note"}.pdf`;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not download the official Tally PDF." });
    }
  }

  async function sendWhatsappFromDialog() {
    if (whatsappDialogProposals.length === 0) return;

    const requestedPhones = new Map<string, { phone: string; saveToTally: boolean }>();
    for (const proposal of whatsappDialogProposals) {
      const phone = getTenDigitPhone(whatsappPhoneInputs[proposal.id] ?? proposal.partyPhone ?? "");
      if (!phone) {
        setMessage({ tone: "error", text: "Enter valid 10-digit WhatsApp numbers for all selected debit notes." });
        return;
      }
      requestedPhones.set(proposal.id, {
        phone,
        // Existing dashboard contact data was recovered from the synced Tally
        // ledger, so it does not need an unnecessary alter-ledger command.
        saveToTally: whatsappSaveToTally && !getTenDigitPhone(proposal.partyPhone ?? ""),
      });
    }

    try {
      setWhatsappDialogSending(true);
      setBulkSendingWhatsapp(whatsappDialogProposals.length > 1);
      const preparedProposals: DebitNoteProposal[] = [];
      for (const proposal of whatsappDialogProposals) {
        if (!proposal.nativeTallyPdfVerified) {
          setPreparingNativePdfId(proposal.id);
          preparedProposals.push(await prepareNativeTallyPdf(proposal));
        } else {
          preparedProposals.push(proposal);
        }
      }
      const pendingTallyPhoneSaves: Array<{ ledgerName: string; phone: string; commandId: string; connectionId: string }> = [];
      let requestedTallyPhoneSaves = 0;
      let failedTallyPhoneQueues = 0;
      for (const proposal of preparedProposals) {
        setSendingWhatsappId(proposal.id);
        const requestedPhone = requestedPhones.get(proposal.id);
        if (!requestedPhone) throw new Error("The WhatsApp number was not available for this debit note.");
        const sendResult = await sendWhatsappForProposal(
          proposal,
          {
            recipientPhone: requestedPhone.phone,
            savePhoneToTally: requestedPhone.saveToTally,
            connectionId: selectedConnectionId,
          }
        );
        if (requestedPhone.saveToTally && sendResult.phoneSaveCommandId && sendResult.phoneSaveConnectionId) {
          requestedTallyPhoneSaves += 1;
          pendingTallyPhoneSaves.push({
            ledgerName: proposal.partyLedgerName,
            phone: requestedPhone.phone,
            commandId: sendResult.phoneSaveCommandId,
            connectionId: sendResult.phoneSaveConnectionId,
          });
        } else if (requestedPhone.saveToTally) {
          requestedTallyPhoneSaves += 1;
          failedTallyPhoneQueues += 1;
        }
      }

      // WhatsApp has already been accepted at this point. Do not hold the
      // customer-facing dialog open while the optional Tally ledger update is
      // claimed, processed, re-synced, and re-read. That work is queued by the
      // API and the next refresh will show its final state.
      setMessage({
        tone: "success",
        text: `${
          preparedProposals.length === 1
            ? "WhatsApp message sent."
            : `${preparedProposals.length} WhatsApp messages sent.`
        }${
          requestedTallyPhoneSaves === 0
            ? ""
            : failedTallyPhoneQueues === 0 && pendingTallyPhoneSaves.length === requestedTallyPhoneSaves
              ? ` ${requestedTallyPhoneSaves === 1 ? "Number save was" : "Number saves were"} queued for Tally.`
              : ` ${failedTallyPhoneQueues} number${failedTallyPhoneQueues === 1 ? " could" : "s could"} not be queued for Tally.`
        }`,
      });
      setWhatsappDialogProposals([]);
      setWhatsappPhoneInputs({});
      setSelectedCreatedIds(new Set());
      if (selectedConnectionId) {
        const nextDashboard = await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName, selectedCompany?.financialYear);
        setDashboard(nextDashboard);
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not send WhatsApp message." });
    } finally {
      setWhatsappDialogSending(false);
      setBulkSendingWhatsapp(false);
      setSendingWhatsappId("");
      setPreparingNativePdfId("");
    }
  }

  function chooseView(view: ActiveView) {
    setActiveView(view);
  }

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedConnectionId) {
      setLiveTallyConnection(null);
      setCheckingLiveTallyCompany(false);
      return;
    }
    void refreshLiveTallyCompany(selectedConnectionId).catch(() => undefined);
  }, [refreshLiveTallyCompany, selectedConnectionId]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    const company = selectedCompany;
    if (!isLiveTallyCompanyMatch(liveTallyConnection, selectedConnectionId, company)) {
      // A user can still choose another company to express their intent, but
      // no stale scan, cached result, or calculation may be shown for it.
      lastLoadedConnectionRef.current = "";
      setDashboard(null);
      setLoading(false);
      return;
    }
    const loadKey = `${selectedConnectionId}::${company?.companyName ?? ""}`;
    if (lastLoadedConnectionRef.current === loadKey) return;
    lastLoadedConnectionRef.current = loadKey;
    void (async () => {
      setLoading(true);
      setDashboard(null);
      try {
        // A company switch must read a new live snapshot. Loading the old saved
        // scan here can show bills belonging to the previously selected company.
        const nextDashboard = await refreshTallyOpenBills(selectedConnectionId, company?.companyName, company?.financialYear);
        setDashboard(nextDashboard);
        setMessage(null);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." });
      } finally {
        setLoading(false);
      }
    })();
  }, [liveTallyConnection, refreshTallyOpenBills, selectedCompany, selectedConnectionId]);

  const proposals = dashboard?.tabs?.debitNoteQueue ?? [];
  const paymentFollowUps = useMemo(() => dashboard?.tabs?.paymentFollowUps ?? [], [dashboard]);
  const sortedPaymentFollowUps = useMemo(
    () => sortPaymentFollowUpRows(paymentFollowUps, paymentFollowUpSort),
    [paymentFollowUpSort, paymentFollowUps]
  );
  const narrationAnalysis = dashboard?.narrationAnalysis ?? [];

  const activeTallyCompanyName = liveTallyConnection?.lastCompanyName?.trim() ?? "";
  const tallyCompanyVerified =
    !checkingLiveTallyCompany &&
    isLiveTallyCompanyMatch(liveTallyConnection, selectedConnectionId, selectedCompany);
  const tallyCompanyMismatch = Boolean(
    !checkingLiveTallyCompany &&
      selectedCompany?.companyName &&
      activeTallyCompanyName &&
      normalizeCompanyName(selectedCompany.companyName) !==
        normalizeCompanyName(activeTallyCompanyName)
  );
  const liveCompanyCheckPending = Boolean(
    selectedConnectionId &&
      (checkingLiveTallyCompany || liveTallyConnection?.id !== selectedConnectionId)
  );
  const companyContextBlocked = Boolean(selectedCompany && !liveCompanyCheckPending && !tallyCompanyVerified);
  const companyContextLocked = liveCompanyCheckPending || companyContextBlocked;
  const scanFailed = Boolean(!loading && !dashboard && message?.tone === "error" && !companyContextLocked);

  const pendingProposals = proposals.filter(isPendingDebitNote);
  const createdProposals = proposals.filter(isCreatedDebitNote);
  const selectablePendingProposals = tallyCompanyVerified ? pendingProposals.filter(canCreateInTally) : [];
  const selectedPendingProposals = selectablePendingProposals.filter((proposal) => selectedPendingIds.has(proposal.id));
  const selectableCreatedProposals = createdProposals.filter(
    (proposal) => proposal.communicationStatus !== "sent" || needsUpdatedPdfDelivery(proposal)
  );
  const selectedCreatedProposals = selectableCreatedProposals.filter((proposal) => selectedCreatedIds.has(proposal.id));
  const allPendingSelected =
    selectablePendingProposals.length > 0 && selectablePendingProposals.every((proposal) => selectedPendingIds.has(proposal.id));
  const allCreatedSelected =
    selectableCreatedProposals.length > 0 && selectableCreatedProposals.every((proposal) => selectedCreatedIds.has(proposal.id));
  const pendingRecoverableTotal = sumRecoverable(pendingProposals);
  const createdRecoverableTotal = sumRecoverable(createdProposals);
  const paymentFollowUpTotal = paymentFollowUps.reduce((total, item) => total + (Number(item.outstandingAmount) || 0), 0);
  const companyReady = tallyCompanyVerified;
  const whatsappDialogMissingCount = whatsappDialogProposals.filter((proposal) => !proposal.partyPhone).length;
  const allPhonesValid = whatsappDialogProposals.every((proposal) => {
    const phone = getTenDigitPhone(whatsappPhoneInputs[proposal.id] ?? proposal.partyPhone ?? "");
    return Boolean(phone);
  });

  function togglePendingSelection(id: string, checked: boolean) {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllPending(checked: boolean) {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      for (const proposal of selectablePendingProposals) {
        if (checked) next.add(proposal.id);
        else next.delete(proposal.id);
      }
      return next;
    });
  }

  function toggleCreatedSelection(id: string, checked: boolean) {
    setSelectedCreatedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllCreated(checked: boolean) {
    setSelectedCreatedIds((current) => {
      const next = new Set(current);
      for (const proposal of selectableCreatedProposals) {
        if (checked) next.add(proposal.id);
        else next.delete(proposal.id);
      }
      return next;
    });
  }

  async function approveSelectedProposals() {
    if (!tallyCompanyVerified) {
      setMessage({ tone: "error", text: `Tally is open to ${activeTallyCompanyName || "another company"}. Switch it to ${selectedCompany?.companyName || "the selected company"}, refresh, then create debit notes.` });
      return;
    }
    if (selectedPendingProposals.length === 0) return;
    const currentOutstanding = selectedPendingProposals.reduce(
      (sum, proposal) => sum + (Number(proposal.pendingAmount) || 0),
      0
    );
    const proposedReversals = sumRecoverable(selectedPendingProposals);
    const confirmed = window.confirm(
      `Review ${selectedPendingProposals.length} debit note${selectedPendingProposals.length === 1 ? "" : "s"} before posting.\n\nCurrent Tally outstanding: ${formatMoney(currentOutstanding)}\nNew debit notes: ${formatMoney(proposedReversals)}\nOutstanding after posting: ${formatMoney(currentOutstanding + proposedReversals)}\n\nContinue only if the selected invoices were recorded net of the expired discount.`
    );
    if (!confirmed) return;

    try {
      setBulkCreating(true);
      setMessage({ tone: "info", text: `Creating ${selectedPendingProposals.length} debit notes in Tally...` });
      for (const proposal of selectedPendingProposals) {
        setApprovingId(proposal.id);
        await createDebitNoteForProposal(proposal);
      }
      if (selectedConnectionId) {
        const nextDashboard = await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName, selectedCompany?.financialYear);
        setDashboard(nextDashboard);
      }
      setSelectedPendingIds(new Set());
      setActiveView("done");
      setMessage({ tone: "success", text: `${selectedPendingProposals.length} debit notes created in Tally.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not create selected debit notes." });
    } finally {
      setApprovingId("");
      setBulkCreating(false);
    }
  }

  async function sendSelectedWhatsappMessages() {
    if (selectedCreatedProposals.length === 0) return;
    await openWhatsappDialog(selectedCreatedProposals);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-y-auto px-6 pb-8 pt-5 text-[#1a1a1a] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 border-b border-[#e5ddd0] pb-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/50 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            <Sparkles className="h-3 w-3 text-amber-600 animate-spin duration-3000" />
            {isDedicatedFollowUpsPage ? "Customer Collections" : "Collections Ledgers"}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a] mt-2 flex items-center gap-2">
            {isDedicatedFollowUpsPage ? "Payment Follow-ups" : "Cash Discounts"}
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {isDedicatedFollowUpsPage
              ? "Review overdue customer payments and prioritize collection follow-ups."
              : "Review, track, and post debit notes for missed cash discounts."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <label className="w-full sm:w-[280px]">
            <span className="sr-only">Company to review from the currently active Tally company</span>
            <select
              className="h-10 w-full rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#1a1a1a] shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              onChange={(event) => {
                const company = companies.find((item) => item.id === event.target.value) ?? null;
                setSelectedCompanyId(event.target.value);
                setSelectedConnectionId(company?.connectionId || "");
              }}
              value={selectedCompany?.id || selectedCompanyId}
            >
              {companies.length === 0 ? <option value="">No Tally company found</option> : null}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {formatCompanyOptionLabel(company)}
                </option>
              ))}
            </select>
          </label>

          <div className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs shadow-sm transition-colors ${
            companyReady
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
              : tallyCompanyMismatch
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-[#e5ddd0] bg-white text-slate-500"
          }`}>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                companyReady
                  ? "border-emerald-250 bg-emerald-50 text-emerald-800"
                  : tallyCompanyMismatch
                    ? "border-amber-300 bg-amber-100 text-amber-900"
                    : "border-amber-250 bg-amber-50 text-amber-800"
              }`}
            >
              {liveCompanyCheckPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : companyReady ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <TriangleAlert className="h-3.5 w-3.5" />
              )}
              {liveCompanyCheckPending
                ? "Verifying active Tally company"
                : companyReady
                  ? "Tally company verified"
                  : tallyCompanyMismatch
                    ? "Switch company in Tally"
                    : "Tally company not ready"}
            </span>
            <span className={`hidden h-4 w-px sm:block ${
              companyReady
                ? "bg-emerald-200"
                : tallyCompanyMismatch
                  ? "bg-amber-300"
                  : "bg-[#e5ddd0]"
            }`} />
            <span className={`whitespace-nowrap font-semibold ${
              companyReady
                ? "text-emerald-700"
                : tallyCompanyMismatch
                  ? "text-amber-800"
                  : ""
            }`}>
              Selected: {selectedCompany?.companyName || "Not selected"} · Tally: {liveCompanyCheckPending ? "Checking…" : activeTallyCompanyName || "Not detected"}
            </span>
          </div>

          <button
            className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-[#e5ddd0] bg-white px-4 text-xs font-bold text-[#5a5046] hover:bg-[#faf8f4] hover:text-[#1a1a1a] shadow-sm transition-all"
            onClick={() => void refreshAll()}
            type="button"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </button>
        </div>
      </div>

      {message?.tone === "info" ? (
        <div
          className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span>{message.text}</span>
        </div>
      ) : message ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          {message.text}
        </div>
      ) : null}

      {companyContextLocked ? (
        <section
          className={`mb-6 overflow-hidden rounded-2xl border shadow-[0_10px_30px_rgba(94,67,31,0.08)] ${
            companyContextBlocked ? "border-amber-200 bg-[#fffaf0]" : "border-sky-200 bg-[#f7fbff]"
          }`}
        >
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  companyContextBlocked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700"
                }`}
              >
                {liveCompanyCheckPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TriangleAlert className="h-4 w-4" />}
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#1a1a1a]">
                  {liveCompanyCheckPending ? "Verifying the live Tally company" : "Cash Discount review is locked"}
                </h2>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-600">
                  {liveCompanyCheckPending
                    ? "The page waits for Tally to confirm its active company before reading bills or calculating discounts."
                    : liveTallyConnection?.tallyReachable === false
                      ? "Tally is not responding to the connector. Reopen Tally with the required company, wait for it to finish loading, then check again. No bills were scanned and no cash-discount calculation is being shown."
                    : activeTallyCompanyName
                      ? <>Tally is open to <strong>{activeTallyCompanyName}</strong>, while the selected company is <strong>{selectedCompany?.companyName}</strong>. No bills were scanned and no cash-discount calculation is being shown. Switch Tally to the selected company, then refresh this page.</>
                      : "Open the required company in Tally, then refresh this page. Until Tally confirms the active company, no bills are scanned or calculated."}
                </p>
              </div>
            </div>
            <button
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#d9c8ac] bg-white px-3 text-xs font-bold text-[#5a5046] shadow-sm transition hover:bg-[#fffdf9]"
              onClick={() => void refreshAll()}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check Tally again
            </button>
          </div>
        </section>
      ) : null}

      {dashboard?.setupRequired && !companyContextLocked ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 shadow-sm">
          Cash Discounts tables are not ready. Run the database migration.
        </div>
      ) : null}

      {scanFailed ? (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-red-900">Cash Discount results are unavailable</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-red-800">
                The latest Tally scan did not complete, so this page is not reporting zero open bills or zero recoverable amount.
              </p>
            </div>
            <button
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-800 shadow-sm transition hover:bg-red-100"
              onClick={() => void refreshAll()}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Tally scan
            </button>
          </div>
        </section>
      ) : null}

      {!companyContextLocked && !scanFailed && showWorkflowSummary ? <section className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <WorkflowButton
            active={activeView === "needsAction"}
            count={pendingProposals.length}
            detail={`${formatMoney(pendingRecoverableTotal)} recoverable`}
            label="To create"
            onClick={() => chooseView("needsAction")}
          />
          <WorkflowButton
            active={activeView === "done"}
            count={createdProposals.length}
            detail={`${formatMoney(createdRecoverableTotal)} created in Tally`}
            label="Created"
            onClick={() => chooseView("done")}
          />
        </div>
      </section> : null}



      {!companyContextLocked && !scanFailed && activeView === "needsAction" ? (
        <Section
          action={
            selectedPendingProposals.length > 0 ? (
              <button
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#2d2d2d] px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={bulkCreating}
                onClick={() => void approveSelectedProposals()}
                type="button"
              >
                {bulkCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Create {selectedPendingProposals.length} debit note{selectedPendingProposals.length === 1 ? "" : "s"}
              </button>
            ) : null
          }
          description={`${formatMoney(pendingRecoverableTotal)} can be recovered from open Tally bills.`}
          title="To create"
        >
          {pendingProposals.length === 0 ? (
            <EmptyState>
              Nothing needs action right now.
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
              <div className="hidden max-h-[calc(100vh-430px)] overflow-y-auto xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#fcfbfa]">
                    <tr className="border-b border-[#e5ddd0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="w-10 px-4 py-3.5 bg-[#fcfbfa]">
                        <input
                          aria-label="Select all debit notes to create"
                          checked={allPendingSelected}
                          className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d]"
                          disabled={selectablePendingProposals.length === 0 || bulkCreating}
                          onChange={(event) => toggleAllPending(event.target.checked)}
                          type="checkbox"
                        />
                      </th>
                      <th className="w-[15%] px-3 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[18%] px-3 py-3.5 bg-[#fcfbfa]">Invoice</th>
                      <th className="w-[37%] px-3 py-3.5 bg-[#fcfbfa]">Why eligible</th>
                      <th className="w-[125px] px-3 py-3.5 text-right bg-[#fcfbfa]">Debit note amount</th>
                      <th className="w-[155px] px-3 py-3.5 text-right bg-[#fcfbfa]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {pendingProposals.map((proposal) => {
                      const createEnabled = tallyCompanyVerified && canCreateInTally(proposal);
                      const displayAmount = proposal.recoverableAmount;
                      const lateByDays = daysPast(proposal.discountDeadline);

                      return (
                        <tr className="align-top hover:bg-[#fcfbfa]/60 transition-colors" key={proposal.id}>
                          <td className="px-3 py-4">
                            <input
                              aria-label={`Select debit note for ${proposal.partyLedgerName}`}
                              checked={selectedPendingIds.has(proposal.id)}
                              className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                              disabled={!createEnabled || bulkCreating}
                              onChange={(event) => togglePendingSelection(proposal.id, event.target.checked)}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            {proposal.lastError ? (
                              <div className="mt-1 max-w-[280px] truncate text-[11px] text-red-600 font-semibold">
                                {proposal.lastError}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.linkedInvoiceNumber ?? ""}>
                              {shortText(proposal.linkedInvoiceNumber, "No invoice")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</div>
                            <div className="mt-1.5 text-[11px] font-semibold text-slate-600">
                              Outstanding {formatMoney(proposal.pendingAmount)}
                              {Number(proposal.pendingAmount) !== Number(proposal.originalInvoiceAmount)
                                ? ` · Invoice ${formatMoney(proposal.originalInvoiceAmount)}`
                                : ""}
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-sm font-semibold text-[#1a1a1a]">{issueLabel(proposal)}</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{whyNowSummary(proposal, lateByDays)}</div>
                            <div className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                              {conciseTermsLabel(proposal)}
                            </div>
                            {proposal.cashDiscountAnalysis?.sourceNarration ? (
                              <div className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-500" title={proposal.cashDiscountAnalysis.sourceNarration}>
                                <span className="font-bold text-slate-600">Narration:</span> {proposal.cashDiscountAnalysis.sourceNarration}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <div className="tabular-nums text-sm font-semibold text-[#1a1a1a]">{formatMoney(displayAmount)}</div>
                            <div className="mt-1 text-[11px] font-medium text-slate-500">To add in Tally</div>
                          </td>
                          <td className="px-3 py-4 text-right">
                            <button
                              className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#2d2d2d] px-2 py-2 text-[11px] font-bold leading-none text-white shadow-sm transition-all hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!createEnabled || approvingId === proposal.id}
                              onClick={() => {
                                if (createEnabled) {
                                  setReviewAcknowledged(false);
                                  setReviewingProposal(proposal);
                                }
                              }}
                              type="button"
                            >
                              {approvingId === proposal.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : <Send className="h-3.5 w-3.5" />}
                              {createButtonLabel(proposal)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#e5ddd0] xl:hidden">
                {pendingProposals.map((proposal) => {
                  const createEnabled = tallyCompanyVerified && canCreateInTally(proposal);
                  const lateByDays = daysPast(proposal.discountDeadline);
                  const displayAmount = proposal.recoverableAmount;

                  return (
                    <article className="p-4 sm:p-5" key={proposal.id}>
                      <div className="flex items-start gap-3">
                        <input
                          aria-label={`Select debit note for ${proposal.partyLedgerName}`}
                          checked={selectedPendingIds.has(proposal.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                          disabled={!createEnabled || bulkCreating}
                          onChange={(event) => togglePendingSelection(proposal.id, event.target.checked)}
                          type="checkbox"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-extrabold leading-snug text-[#1a1a1a]">
                            {proposal.partyLedgerName}
                          </div>
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 border-y border-[#eee7dc] py-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice</dt>
                          <dd className="mt-1 break-words font-bold leading-snug text-[#1a1a1a]">
                            {shortText(proposal.linkedInvoiceNumber, "No invoice")}
                          </dd>
                          <dd className="mt-1 text-[11px] font-medium text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</dd>
                          <dd className="mt-2 text-[11px] font-semibold text-slate-600">
                            Outstanding {formatMoney(proposal.pendingAmount)}
                            {Number(proposal.pendingAmount) !== Number(proposal.originalInvoiceAmount)
                              ? ` · Invoice ${formatMoney(proposal.originalInvoiceAmount)}`
                              : ""}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Why eligible</dt>
                          <dd className="mt-1 font-bold leading-snug text-[#1a1a1a]">{issueLabel(proposal)}</dd>
                          <dd className="mt-1 text-[11px] leading-relaxed text-slate-500">{whyNowSummary(proposal, lateByDays)}</dd>
                          <dd className="mt-1 text-[11px] font-semibold text-slate-600">
                            {conciseTermsLabel(proposal)}
                          </dd>
                          {proposal.cashDiscountAnalysis?.sourceNarration ? (
                            <dd className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-500" title={proposal.cashDiscountAnalysis.sourceNarration}>
                              <span className="font-bold text-slate-600">Narration:</span> {proposal.cashDiscountAnalysis.sourceNarration}
                            </dd>
                          ) : null}
                        </div>
                      </dl>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Debit note amount</div>
                          <div className="mt-0.5 tabular-nums text-sm font-extrabold text-[#1a1a1a]">{formatMoney(displayAmount)}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-slate-500">To add in Tally</div>
                        </div>
                        <button
                          className="inline-flex min-h-9 min-w-[154px] items-center justify-center gap-1.5 rounded-xl bg-[#2d2d2d] px-4 py-2 text-xs font-bold leading-none text-white shadow-sm transition-all hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!createEnabled || approvingId === proposal.id}
                          onClick={() => {
                            if (createEnabled) {
                              setReviewAcknowledged(false);
                              setReviewingProposal(proposal);
                            }
                          }}
                          type="button"
                        >
                          {approvingId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {createButtonLabel(proposal)}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {!companyContextLocked && !scanFailed && activeView === "followUps" ? (
        <Section
          action={
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sort
              <select
                aria-label="Sort payment follow-ups"
                className="h-9 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold normal-case tracking-normal text-[#1a1a1a] outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                onChange={(event) => setPaymentFollowUpSort(event.target.value as PaymentFollowUpSort)}
                value={paymentFollowUpSort}
              >
                <option value="priority">Priority</option>
                <option value="most_overdue">Most overdue</option>
                <option value="highest_outstanding">Highest outstanding</option>
                <option value="oldest_invoice">Oldest invoice</option>
                <option value="customer">Customer name</option>
              </select>
            </label>
          }
          description={`${formatMoney(paymentFollowUpTotal)} pending across bills at least 7 days overdue, or 7 days old when the due date is missing.`}
          title="Payment follow-ups"
        >
          {paymentFollowUps.length === 0 ? (
            <EmptyState>There are no payments to follow up from the latest Tally scan.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
              <div className="hidden max-h-[calc(100vh-430px)] overflow-y-auto xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#fcfbfa]">
                    <tr className="border-b border-[#e5ddd0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="w-[16%] px-3 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[17%] px-3 py-3.5 bg-[#fcfbfa]">Invoice</th>
                      <th className="w-[112px] px-3 py-3.5 text-right bg-[#fcfbfa]">Outstanding</th>
                      <th className="w-[18%] px-3 py-3.5 bg-[#fcfbfa]">Payment age</th>
                      <th className="w-[24%] px-3 py-3.5 bg-[#fcfbfa]">Next action</th>
                      <th className="w-[118px] px-3 py-3.5 bg-[#fcfbfa]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {sortedPaymentFollowUps.map((followUp) => {
                      const defaultPeriodApplied = followUp.terms.some((term) => term.periodSource === "default");
                      return (
                        <tr className="align-top transition-colors hover:bg-[#fcfbfa]/60" key={followUp.id}>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={followUp.partyLedgerName}>
                              {followUp.partyLedgerName}
                            </div>
                            <div className="mt-1 inline-flex rounded-full border border-[#e5ddd0] bg-[#fcfbfa] px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {followUp.partyPhone ? "WhatsApp ready" : followUp.partyEmail ? "Email only" : "No contact"}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={followUp.linkedInvoiceNumber ?? ""}>
                              {shortText(followUp.linkedInvoiceNumber, "No invoice")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{formatDate(followUp.linkedInvoiceDate)}</div>
                            <div className="mt-1.5 inline-flex rounded-full bg-[#f7f4ee] px-2 py-0.5 text-[11px] text-slate-600">
                              Invoice {formatMoney(followUp.originalInvoiceAmount)}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="tabular-nums text-sm font-semibold text-[#1a1a1a]">{formatMoney(followUp.outstandingAmount)}</div>
                            {followUp.amountReceived > 0 ? (
                              <div className="mt-1 text-[11px] font-medium text-slate-400">Received {formatMoney(followUp.amountReceived)}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-4">
                            <div className={`font-bold ${followUp.ageBasis === "missing_dates" ? "text-violet-700" : followUp.ageBasis === "due_date" ? "text-red-700" : "text-amber-700"}`}>
                              {followUp.ageLabel}
                            </div>
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                              {followUp.ageBasis === "due_date"
                                ? `Due ${formatDate(followUp.dueDate)}`
                                : followUp.ageBasis === "invoice_date"
                                  ? "Due date missing · invoice age used"
                                  : "Confirm invoice and due dates"}
                            </div>
                            {followUp.currentDiscount ? (
                              <div className="mt-2 text-[10px] font-semibold text-emerald-700">
                                Cash discount {followUp.currentDiscount.ratePercent}% until {formatDate(followUp.currentDiscount.discountDeadline)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-semibold text-[#1a1a1a]">{followUp.title}</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{followUp.nextAction}</div>
                            {followUp.termsLabel ? (
                              <div className="mt-1 text-[11px] font-semibold text-emerald-700" title={followUp.deterministicReason}>
                                {defaultPeriodApplied ? "Deterministic terms · default period applied" : "Deterministic terms from Tally narration"}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${followUpStatusClass(followUp.followUpStatus)}`}>
                              {followUpStatusLabel(followUp.followUpStatus)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#e5ddd0] xl:hidden">
                {sortedPaymentFollowUps.map((followUp) => {
                  const defaultPeriodApplied = followUp.terms.some((term) => term.periodSource === "default");
                  return (
                    <article className="p-4 sm:p-5" key={followUp.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-extrabold leading-snug text-[#1a1a1a]">{followUp.partyLedgerName}</div>
                          <div className="mt-1 inline-flex rounded-full border border-[#e5ddd0] bg-[#fcfbfa] px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            {followUp.partyPhone ? "WhatsApp ready" : followUp.partyEmail ? "Email only" : "No contact"}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${followUpStatusClass(followUp.followUpStatus)}`}>
                          {followUpStatusLabel(followUp.followUpStatus)}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 border-y border-[#eee7dc] py-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice</dt>
                          <dd className="mt-1 break-words font-bold leading-snug text-[#1a1a1a]">{shortText(followUp.linkedInvoiceNumber, "No invoice")}</dd>
                          <dd className="mt-1 text-[11px] text-slate-500">{formatDate(followUp.linkedInvoiceDate)}</dd>
                          <dd className="mt-2 text-[11px] font-semibold text-slate-600">Invoice {formatMoney(followUp.originalInvoiceAmount)}</dd>
                        </div>
                        <div className="min-w-0 sm:text-right">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</dt>
                          <dd className="mt-1 tabular-nums text-sm font-extrabold text-[#1a1a1a]">{formatMoney(followUp.outstandingAmount)}</dd>
                          {followUp.amountReceived > 0 ? <dd className="mt-1 text-[11px] text-slate-400">Received {formatMoney(followUp.amountReceived)}</dd> : null}
                        </div>
                      </dl>

                      <div className="mt-3 grid gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment age</div>
                          <div className={`mt-1 text-xs font-bold leading-relaxed ${followUp.ageBasis === "missing_dates" ? "text-violet-700" : followUp.ageBasis === "due_date" ? "text-red-700" : "text-amber-700"}`}>
                            {followUp.ageLabel}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {followUp.ageBasis === "due_date"
                              ? `Due ${formatDate(followUp.dueDate)}`
                              : followUp.ageBasis === "invoice_date"
                                ? "Due date missing · invoice age used"
                                : "Confirm invoice and due dates"}
                          </div>
                          {followUp.currentDiscount ? (
                            <div className="mt-1 text-[11px] font-semibold text-emerald-700">Cash discount {followUp.currentDiscount.ratePercent}% until {formatDate(followUp.currentDiscount.discountDeadline)}</div>
                          ) : null}
                        </div>
                        <div className="rounded-xl bg-[#fcfbfa] px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next action</div>
                          <div className="mt-1 text-xs font-bold text-[#1a1a1a]">{followUp.title}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{followUp.nextAction}</div>
                          {followUp.termsLabel ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">{defaultPeriodApplied ? "Deterministic terms · default period applied" : "Deterministic terms from Tally narration"}</div> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {!companyContextLocked && !scanFailed && activeView === "done" ? (
        <Section
          action={
            selectedCreatedProposals.length > 0 ? (
              <button
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#e5ddd0] bg-white px-4 text-xs font-bold text-[#5a5046] shadow-sm transition-all hover:bg-[#faf8f4] hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={bulkSendingWhatsapp}
                onClick={() => void sendSelectedWhatsappMessages()}
                type="button"
              >
                {bulkSendingWhatsapp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                Send WhatsApp ({selectedCreatedProposals.length})
              </button>
            ) : null
          }
          description={`${formatMoney(createdRecoverableTotal)} posted as debit notes.`}
          title="Created"
        >
          {createdProposals.length === 0 ? (
            <EmptyState>Nothing completed yet.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
              <div className="hidden max-h-[calc(100vh-430px)] overflow-y-auto xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#fcfbfa]">
                    <tr className="border-b border-[#e5ddd0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="w-10 px-4 py-3.5 bg-[#fcfbfa]">
                        <input
                          aria-label="Select all debit notes for WhatsApp"
                          checked={allCreatedSelected}
                          className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d]"
                          disabled={selectableCreatedProposals.length === 0 || bulkSendingWhatsapp}
                          onChange={(event) => toggleAllCreated(event.target.checked)}
                          type="checkbox"
                        />
                      </th>
                      <th className="w-[16%] px-3 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[12%] px-3 py-3.5 bg-[#fcfbfa]">Debit note</th>
                      <th className="w-[17%] px-3 py-3.5 bg-[#fcfbfa]">Linked invoice</th>
                      <th className="w-[92px] px-3 py-3.5 text-right bg-[#fcfbfa]">Amount</th>
                      <th className="w-[108px] px-3 py-3.5 bg-[#fcfbfa]">Result</th>
                      <th className="w-[224px] px-3 py-3.5 text-right bg-[#fcfbfa]">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {createdProposals.map((proposal) => {
                      const canMessage = proposal.communicationStatus !== "sent" || needsUpdatedPdfDelivery(proposal);
                      const sending = sendingWhatsappId === proposal.id;
                      const preparingNativePdf = preparingNativePdfId === proposal.id;

                      return (
                        <tr className="align-top hover:bg-[#fcfbfa]/60 transition-colors" key={proposal.id}>
                          <td className="px-3 py-4">
                            <input
                              aria-label={`Select WhatsApp for ${proposal.partyLedgerName}`}
                              checked={selectedCreatedIds.has(proposal.id)}
                              className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                              disabled={!canMessage || bulkSendingWhatsapp}
                              onChange={(event) => toggleCreatedSelection(proposal.id, event.target.checked)}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            <ContactMeta proposal={proposal} />
                          </td>
                          <td className="px-3 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.tallyVoucherNumber ?? ""}>
                              {shortText(proposal.tallyVoucherNumber, "Debit note created")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {formatDate(proposal.createdInTallyAt ?? proposal.tallyVoucherDate)}
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]">{shortText(proposal.linkedInvoiceNumber, "No invoice")}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                              <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-slate-600">
                                Invoice {formatMoney(proposal.originalInvoiceAmount)}
                              </span>
                              {typeof proposal.amountReceived === "number" ? (
                                <span className="rounded-full bg-[#eefcf5] px-2 py-0.5 text-emerald-800">
                                  Received {formatMoney(proposal.amountReceived)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums text-sm font-semibold text-[#1a1a1a]">
                            {formatMoney(proposal.recoverableAmount)}
                          </td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(proposal.status)}`}>
                              Created in Tally
                            </span>
                          </td>
                          <td className="px-3 py-4 text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              <span
                                className={`hidden rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider lg:inline-flex ${messageStatusClass(proposal.communicationStatus)}`}
                              >
                                {proposal.communicationStatus === "sent" ? "Sent" : proposal.communicationStatus === "failed" ? "Failed" : "Not sent"}
                              </span>
                              {proposal.nativeTallyPdfVerified ? (
                                <button
                                  aria-label={`Download verified Tally PDF for ${proposal.partyLedgerName}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#e5ddd0] bg-white text-[#5a5046] shadow-sm transition-all hover:bg-[#faf8f4] hover:text-[#1a1a1a]"
                                  onClick={() => void downloadNativeTallyPdf(proposal)}
                                  title="Download verified Tally PDF"
                                  type="button"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              <button
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#5a5046] hover:bg-[#faf8f4] hover:text-[#1a1a1a] shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                                disabled={!canMessage || sending || preparingNativePdf}
                                onClick={() => void openWhatsappDialog([proposal])}
                                type="button"
                              >
                                {sending || preparingNativePdf ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MessageCircle className="h-3.5 w-3.5" />
                                )}
                                {preparingNativePdf ? "Preparing PDF" : messageLabel(proposal)}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#e5ddd0] xl:hidden">
                {createdProposals.map((proposal) => {
                  const canMessage = proposal.communicationStatus !== "sent" || needsUpdatedPdfDelivery(proposal);
                  const sending = sendingWhatsappId === proposal.id;
                  const preparingNativePdf = preparingNativePdfId === proposal.id;
                  return (
                    <article className="p-4 sm:p-5" key={proposal.id}>
                      <div className="flex items-start gap-3">
                        <input
                          aria-label={`Select WhatsApp for ${proposal.partyLedgerName}`}
                          checked={selectedCreatedIds.has(proposal.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                          disabled={!canMessage || bulkSendingWhatsapp}
                          onChange={(event) => toggleCreatedSelection(proposal.id, event.target.checked)}
                          type="checkbox"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-extrabold leading-snug text-[#1a1a1a]">{proposal.partyLedgerName}</div>
                          <div className="mt-1"><ContactMeta proposal={proposal} /></div>
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 border-y border-[#eee7dc] py-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Debit note</dt>
                          <dd className="mt-1 break-words font-bold leading-snug text-[#1a1a1a]">{shortText(proposal.tallyVoucherNumber, "Debit note created")}</dd>
                          <dd className="mt-1 text-[11px] text-slate-500">{formatDate(proposal.createdInTallyAt ?? proposal.tallyVoucherDate)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked invoice</dt>
                          <dd className="mt-1 break-words font-bold leading-snug text-[#1a1a1a]">{shortText(proposal.linkedInvoiceNumber, "No invoice")}</dd>
                          <dd className="mt-1 text-[11px] text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</div>
                          <div className="mt-0.5 tabular-nums text-sm font-extrabold text-[#1a1a1a]">{formatMoney(proposal.recoverableAmount)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${messageStatusClass(proposal.communicationStatus)}`}>
                            {proposal.communicationStatus === "sent" ? "Sent" : proposal.communicationStatus === "failed" ? "Failed" : "Not sent"}
                          </span>
                          {proposal.nativeTallyPdfVerified ? (
                            <button
                              aria-label={`Download verified Tally PDF for ${proposal.partyLedgerName}`}
                              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#e5ddd0] bg-white px-3 text-[#5a5046] shadow-sm transition-all hover:bg-[#faf8f4] hover:text-[#1a1a1a]"
                              onClick={() => void downloadNativeTallyPdf(proposal)}
                              title="Download verified Tally PDF"
                              type="button"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#5a5046] shadow-sm transition-all hover:bg-[#faf8f4] hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canMessage || sending || preparingNativePdf}
                            onClick={() => void openWhatsappDialog([proposal])}
                            type="button"
                          >
                            {sending || preparingNativePdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                            {preparingNativePdf ? "Preparing PDF" : messageLabel(proposal)}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {reviewingProposal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div
            aria-labelledby="debit-note-review-title"
            aria-modal="true"
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e5ddd0] bg-white shadow-[0_24px_56px_-12px_rgba(0,0,0,0.24)] animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e5ddd0] bg-[#fcfbfa] px-5 py-5 sm:px-6">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#1a1a1a]" id="debit-note-review-title">Create debit note</h3>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                    Confirm the calculation before adding this debit note to Tally.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close debit note review"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
                disabled={approvingId === reviewingProposal.id}
                onClick={() => {
                  setReviewingProposal(null);
                  setReviewAcknowledged(false);
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-1 border-b border-[#eee7dc] pb-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{reviewingProposal.partyLedgerName}</div>
                  <div className="mt-1 text-lg font-extrabold text-[#1a1a1a]">{shortText(reviewingProposal.linkedInvoiceNumber, "No invoice reference")}</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">Invoice date {formatDate(reviewingProposal.linkedInvoiceDate)}</div>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e5ddd0] bg-[#fcfbfa] p-3.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice recorded in Tally</dt>
                  <dd className="mt-1 tabular-nums text-base font-extrabold text-[#1a1a1a]">{formatMoney(reviewingProposal.originalInvoiceAmount)}</dd>
                </div>
                <div className="rounded-xl border border-[#e5ddd0] bg-[#fcfbfa] p-3.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Tally outstanding</dt>
                  <dd className="mt-1 tabular-nums text-base font-extrabold text-[#1a1a1a]">{formatMoney(reviewingProposal.pendingAmount)}</dd>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Debit note to add</dt>
                  <dd className="mt-1 tabular-nums text-base font-extrabold text-amber-950">{formatMoney(reviewingProposal.recoverableAmount)}</dd>
                </div>
                <div className="rounded-xl border border-[#2d2d2d] bg-[#2d2d2d] p-3.5 text-white">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Outstanding after creation</dt>
                  <dd className="mt-1 tabular-nums text-base font-extrabold">
                    {formatMoney((Number(reviewingProposal.pendingAmount) || 0) + reviewingProposal.recoverableAmount)}
                  </dd>
                </div>
              </dl>

              {reviewingProposal.cashDiscountAnalysis?.reversalPlan ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs font-medium leading-relaxed text-amber-950">
                  <div className="font-bold">How this amount is calculated</div>
                  <div className="mt-1">
                    {formatMoney(reviewingProposal.originalInvoiceAmount)} was recorded after a {reviewingProposal.cashDiscountAnalysis.reversalPlan.initialDiscount.ratePercent}% discount. Gross value {formatMoney(reviewingProposal.cashDiscountAnalysis.reversalPlan.grossInvoiceAmount)} minus the recorded invoice value equals a debit note of {formatMoney(reviewingProposal.recoverableAmount)}.
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-[#e5ddd0] bg-white p-4 text-xs font-medium text-slate-600">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><span className="font-bold text-[#1a1a1a]">Discount deadline:</span> {formatDate(reviewingProposal.discountDeadline)}</div>
                  <div><span className="font-bold text-[#1a1a1a]">Applied rule:</span> {conciseTermsLabel(reviewingProposal).replace(/^Applied rule:\s*/i, "")}</div>
                  <div><span className="font-bold text-[#1a1a1a]">Sales ledger:</span> {shortText(reviewingProposal.sourceSalesLedgerName, "Not verified")}</div>
                  {reviewingProposal.receiptDate || Number(reviewingProposal.amountReceived) > 0 ? (
                    <div><span className="font-bold text-[#1a1a1a]">Payment received:</span> {formatMoney(reviewingProposal.amountReceived)} on {formatDate(reviewingProposal.receiptDate)}</div>
                  ) : null}
                </div>
                <div className="mt-3 border-t border-[#eee7dc] pt-3">
                  <div className="font-bold text-[#1a1a1a]">Source narration</div>
                  <div className="mt-1 leading-relaxed">{reviewingProposal.cashDiscountAnalysis?.sourceNarration || "No narration returned by Tally."}</div>
                </div>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs font-medium leading-relaxed text-amber-950">
                <input
                  checked={reviewAcknowledged}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-amber-400 text-[#2d2d2d] focus:ring-2 focus:ring-amber-500"
                  onChange={(event) => setReviewAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>I confirm that the invoice and debit note amount shown above are correct.</span>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#e5ddd0] bg-[#fcfbfa] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#e5ddd0] bg-white px-5 text-xs font-bold text-[#5a5046] transition hover:bg-[#faf8f4]"
                disabled={approvingId === reviewingProposal.id}
                onClick={() => {
                  setReviewingProposal(null);
                  setReviewAcknowledged(false);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2d2d2d] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!reviewAcknowledged || approvingId === reviewingProposal.id}
                onClick={() => void approveProposal(reviewingProposal)}
                type="button"
              >
                {approvingId === reviewingProposal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Create debit note in Tally
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {whatsappDialogProposals.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[#e5ddd0] bg-white p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#e5ddd0]/60">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1a1a1a]">Send WhatsApp</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {whatsappDialogProposals.length} debit note{whatsappDialogProposals.length === 1 ? "" : "s"} selected.
                    {whatsappDialogMissingCount > 0 ? (
                      <span className="text-amber-600"> Add {whatsappDialogMissingCount} missing number{whatsappDialogMissingCount === 1 ? "" : "s"} before sending.</span>
                    ) : (
                      <span className="text-emerald-600"> Ready to prepare PDFs and send.</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-slate-400 hover:bg-[#faf8f4] hover:text-slate-700 transition duration-150"
                disabled={whatsappDialogSending}
                onClick={() => setWhatsappDialogProposals([])}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 max-h-[450px] overflow-auto rounded-xl border border-[#e5ddd0]/80">
              <table className="w-full min-w-[620px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#fcfbfa]">
                  <tr className="border-b border-[#e5ddd0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="w-[32%] px-4 py-3 bg-[#fcfbfa]">Customer</th>
                    <th className="w-[20%] px-4 py-3 bg-[#fcfbfa]">Debit note</th>
                    <th className="w-[18%] px-4 py-3 text-right bg-[#fcfbfa]">Amount</th>
                    <th className="w-[30%] px-4 py-3 bg-[#fcfbfa]">WhatsApp number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                  {whatsappDialogProposals.map((proposal) => {
                    const inputValue = whatsappPhoneInputs[proposal.id] ?? "";
                    const inputInvalid = Boolean(inputValue) && !getTenDigitPhone(inputValue);

                    return (
                      <tr className="align-middle hover:bg-[#fcfbfa]/40 transition-colors" key={proposal.id}>
                        <td className="px-4 py-3">
                          <div className="break-words text-sm font-semibold text-[#1a1a1a]" title={proposal.partyLedgerName}>
                            {proposal.partyLedgerName}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="break-words text-xs font-semibold text-slate-500" title={proposal.tallyVoucherNumber ?? ""}>
                            {shortText(proposal.tallyVoucherNumber, "Debit note")}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-[#1a1a1a]">
                          {formatMoney(proposal.recoverableAmount)}
                        </td>
                        <td className="px-4 py-2.5">
                          {proposal.partyPhone ? (() => {
                            const tenDigit = getTenDigitPhone(proposal.partyPhone ?? "");
                            const displayPhone = tenDigit ? `+91 ${tenDigit}` : proposal.partyPhone;
                            return (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-250 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {displayPhone}
                              </span>
                            );
                          })() : (
                            <div>
                              <input
                                className={`h-9 w-full rounded-xl border bg-white px-3 text-sm font-semibold text-[#1a1a1a] outline-none transition duration-150 ${
                                  inputInvalid
                                    ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                    : "border-[#e5ddd0] focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                }`}
                                inputMode="tel"
                                maxLength={14}
                                onChange={(event) =>
                                  setWhatsappPhoneInputs((current) => ({
                                    ...current,
                                    [proposal.id]: event.target.value,
                                  }))
                                }
                                placeholder="9765723830"
                                value={inputValue}
                              />
                              {inputInvalid ? (
                                <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                                  <TriangleAlert className="h-3 w-3" /> Enter a valid 10-digit number.
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {whatsappDialogMissingCount > 0 ? (
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200/50 bg-amber-50/30 p-3.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50/50 cursor-pointer">
                <input
                  checked={whatsappSaveToTally}
                  className="mt-0.5 h-4.5 w-4.5 rounded border-[#d6cabb] text-amber-600 focus:ring-amber-500"
                  onChange={(event) => setWhatsappSaveToTally(event.target.checked)}
                  type="checkbox"
                />
                <div className="flex-1 leading-relaxed">
                  <div className="font-bold text-amber-950">Update Tally Customer Ledgers</div>
                  <div className="mt-0.5 text-slate-500 text-[11px]">Also save entered numbers back to Tally. We will verify each save before confirming it.</div>
                </div>
              </label>
            ) : null}

            <div className="mt-6 flex justify-end gap-3 border-t border-[#e5ddd0]/60 pt-4">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#e5ddd0] bg-white px-5 text-xs font-bold text-[#5a5046] hover:bg-[#faf8f4] transition duration-150"
                disabled={whatsappDialogSending}
                onClick={() => setWhatsappDialogProposals([])}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2d2d2d] hover:bg-[#1a1a1a] px-6 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition duration-150"
                disabled={whatsappDialogSending || !allPhonesValid}
                onClick={() => void sendWhatsappFromDialog()}
                type="button"
              >
                {whatsappDialogSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                Prepare PDF & send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
