"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";

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
  totalPayableAmount: number;
  createdTierReversalAmount: number;
  pendingTierReversalAmount: number;
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

function formatDateForFileName(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
    .format(safeDate)
    .replace(/\s+/g, "_");
}

function safeFileNamePart(value: unknown, fallback: string, maxLength = 80) {
  const text = String(value ?? "").trim().slice(0, maxLength) || fallback;
  return text
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || fallback;
}

function cashDiscountDebitNoteDownloadName(proposal: DebitNoteProposal) {
  const partyName = safeFileNamePart(proposal.partyLedgerName, "Party", 90);
  const voucherNumber = safeFileNamePart(
    proposal.tallyVoucherNumber,
    `Debit_Note_${proposal.id.slice(0, 8)}`,
    60
  );
  const voucherDate = formatDateForFileName(
    proposal.tallyVoucherDate ?? proposal.debitNoteDate ?? proposal.createdInTallyAt
  );
  return `Cash_Discount_Debit_Note_${partyName}_${voucherNumber}_${voucherDate}.pdf`;
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

function followUpStatusClass(kind: PaymentFollowUp["kind"]) {
  if (kind === "discount_window_open") return "border-sky-200 bg-sky-50 text-sky-800";
  if (kind === "full_payment_due") return "border-amber-250 bg-amber-50 text-amber-800";
  if (kind === "payment_review") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-slate-200 bg-white text-slate-600";
}

function followUpStatusLabel(kind: PaymentFollowUp["kind"]) {
  if (kind === "discount_window_open") return "Discount window open";
  if (kind === "full_payment_due") return "Full payment due";
  if (kind === "payment_review") return "Review payment";
  return "Payment due";
}

function proposalStatusLabel(value: string) {
  return value.replace(/_/g, " ");
}

function actionStatusLabel(proposal: DebitNoteProposal) {
  if (proposal.lastError) return "Retry";
  if (proposal.status === "approved" || proposal.status === "queued_in_tally") return "Queued";
  if (proposal.sourceKind === "tally_open_bill") return "Ready";
  return proposalStatusLabel(proposal.status);
}

function isPendingDebitNote(proposal: DebitNoteProposal) {
  return ["draft", "pending_approval", "approved", "queued_in_tally", "failed"].includes(proposal.status);
}

function isCreatedDebitNote(proposal: DebitNoteProposal) {
  return proposal.status === "created_in_tally";
}

function shortText(value?: string | null, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeCompanyName(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function issueLabel(proposal: DebitNoteProposal) {
  if (proposal.lastError) return "Tally action failed";
  if (proposal.status === "queued_in_tally" || proposal.status === "approved") return "Creating debit note";
  if (proposal.issueType === "unpaid_discount_tier_reversal") return "Discount expired; payment still open";
  if (proposal.issueType === "invoice_unpaid") return "Payment still outstanding";
  if (proposal.issueType === "partial_unpaid") return "Payment still partly outstanding";
  return "Payment short after discount expiry";
}

function conciseTermsLabel(proposal: DebitNoteProposal) {
  const terms = proposal.cashDiscountAnalysis?.terms ?? [];
  if (terms.length > 0) {
    return `Terms: ${terms.map((term) => `${term.ratePercent}% / ${term.eligibilityDays}d${term.periodSource === "default" ? " default" : ""}`).join(" · ")}`;
  }
  return proposal.cashDiscountAnalysis?.termsLabel || proposal.cashDiscountRuleName || "Cash discount terms";
}

function expiredDiscountLabel(proposal: DebitNoteProposal) {
  const terms = proposal.cashDiscountAnalysis?.terms ?? [];
  if (terms.length > 0) {
    return `${terms.map((term) => `${term.ratePercent}%`).join(" / ")} expired`;
  }
  return "Expired discount";
}

function whyNowSummary(proposal: DebitNoteProposal, lateByDays: number | null) {
  const lateSuffix = lateByDays && lateByDays > 0 ? ` ${lateByDays} day${lateByDays === 1 ? "" : "s"} late.` : "";
  const finalTerm = proposal.cashDiscountAnalysis?.terms.at(-1);

  if (proposal.issueType === "discount_shortfall") {
    const deadline = finalTerm ? `${finalTerm.ratePercent}% / ${finalTerm.eligibilityDays}-day` : "cash-discount";
    return `${formatMoney(proposal.pendingAmount)} remains on the original invoice. Add ${formatMoney(proposal.recoverableAmount)} for the missed discount after the ${deadline} deadline.${lateSuffix}`;
  }
  if (proposal.issueType === "unpaid_discount_tier_reversal") {
    return `${formatMoney(proposal.pendingAmount)} remains unpaid. Reverse the expired discount by ${formatMoney(proposal.recoverableAmount)}.`;
  }
  if (proposal.issueType === "partial_unpaid") {
    return `${formatMoney(proposal.pendingAmount)} remains outstanding after the discount deadline.${lateSuffix}`;
  }
  return `No payment received after ${formatDate(proposal.discountDeadline)}.${lateSuffix}`;
}

function createButtonLabel(proposal: DebitNoteProposal) {
  if (proposal.canCreateDebitNote === false) return "Review required";
  const status = proposal.status;
  if (status === "failed") return "Retry";
  if (status === "approved" || status === "queued_in_tally") return "Queued";
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

function isDebtorLedger(master: TallyMaster) {
  return String(master.parent ?? "").trim().toLowerCase() === "sundry debtors";
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

interface CollectionsDashboardPageProps {
  initialView?: ActiveView;
  showWorkflowSummary?: boolean;
}

export function CollectionsDashboardPage({
  initialView = "needsAction",
  showWorkflowSummary = true,
}: CollectionsDashboardPageProps) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [liveTallyConnection, setLiveTallyConnection] = useState<LiveTallyConnection | null>(null);
  const [checkingLiveTallyCompany, setCheckingLiveTallyCompany] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>(initialView);
  const [loading, setLoading] = useState(true);
  const [cashDiscountLoadStep, setCashDiscountLoadStep] = useState("");
  const [approvingId, setApprovingId] = useState("");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [sendingWhatsappId, setSendingWhatsappId] = useState("");
  const [preparingNativePdfId, setPreparingNativePdfId] = useState("");
  const [bulkSendingWhatsapp, setBulkSendingWhatsapp] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(() => new Set());
  const [selectedCreatedIds, setSelectedCreatedIds] = useState<Set<string>>(() => new Set());
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
    const response = await apiFetch("/api/tally/companies", { cache: "no-store" });
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
  }, [selectedCompanyId]);

  const loadDashboard = useCallback(
    async (connectionId = selectedConnectionId, companyName = selectedCompany?.companyName ?? "") => {
      if (!connectionId) {
        setDashboard(null);
        return;
      }
      const params = new URLSearchParams({ connectionId });
      if (companyName) params.set("companyName", companyName);
      const response = await apiFetch(`/api/collections/dashboard?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as DashboardPayload;
      if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`);
      setDashboard(payload);
    },
    [selectedCompany?.companyName, selectedConnectionId]
  );

  const loadDebtorLedgers = useCallback(async (connectionId: string) => {
    const params = new URLSearchParams({
      type: "ledger",
      parent: "Sundry Debtors",
      limit: "5000",
    });
    const response = await apiFetch(`/api/tally/connections/${connectionId}/masters?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json()) as { masters?: TallyMaster[] };
    return (payload.masters ?? []).filter(isDebtorLedger).map((master) => master.name).filter(Boolean);
  }, []);

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
      if (command?.status === "succeeded") return;
      if (command?.status === "failed" || command?.status === "canceled") {
        throw new Error(command.error || "Tally command failed.");
      }
    }
    throw new Error(
      options?.pendingMessage ?? "The Tally command is still pending. Check the connector status, then refresh."
    );
  }, []);

  const pollCommands = useCallback(async (
    connectionId: string,
    commandIds: string[],
    options?: { timeoutSeconds?: number; pendingMessage?: string }
  ) => {
    const pending = new Set(commandIds);
    if (pending.size === 0) return;

    const timeoutSeconds = options?.timeoutSeconds ?? Math.max(90, pending.size * 60);
    for (let attempt = 0; attempt < timeoutSeconds; attempt += 1) {
      await wait(1000);
      const response = await apiFetch(
        `/api/tally/connections/${connectionId}/commands?${new URLSearchParams({
          ids: Array.from(pending).join(","),
          limit: String(Math.max(pending.size, 1)),
        }).toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { commands?: TallyCommand[] };

      for (const command of payload.commands ?? []) {
        if (!pending.has(command.id)) continue;
        if (command.status === "succeeded") {
          pending.delete(command.id);
        } else if (command.status === "failed" || command.status === "canceled") {
          throw new Error(command.error || "Tally command failed.");
        }
      }

      if (pending.size === 0) return;
    }

    throw new Error(
      options?.pendingMessage ?? "The Tally commands are still pending. Check the connector status, then refresh."
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

  const syncCurrentCompanyLedgers = useCallback(
    async (connectionId: string, companyName?: string | null) => {
      const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandType: "sync_masters",
          payload: {
            companyName,
            requestedMasterTypes: ["ledger"],
          },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { command?: TallyCommand };
      if (!payload.command?.id) throw new Error("Tally ledger sync could not be started.");
      await pollCommand(connectionId, payload.command.id);
    },
    [pollCommand]
  );

  const refreshTallyOpenBills = useCallback(
    async (
      connectionId: string,
      companyName?: string | null,
      options?: { onProgress?: (message: string) => void }
    ) => {
      // Refresh the ledger list first. A connection may have previously synced a
      // different company, in which case using its old debtor list would omit
      // valid bills or query the wrong parties.
      options?.onProgress?.("Syncing customer ledgers from Tally...");
      await syncCurrentCompanyLedgers(connectionId, companyName);
      options?.onProgress?.("Loading customer ledgers...");
      const ledgerNames = await loadDebtorLedgers(connectionId);
      if (ledgerNames.length === 0) return;

      // One page refresh can require several Tally commands when there are many
      // customer ledgers. Keep those commands together so the dashboard can use
      // this refresh as one consistent snapshot rather than mixing old chunks.
      const scanId = crypto.randomUUID();
      const chunks = chunkValues(ledgerNames, 80);
      const commandIds: string[] = [];

      options?.onProgress?.(`Queueing open-bill scan for ${ledgerNames.length} customer ledgers...`);
      for (const chunk of chunks) {
        const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commandType: "fetch_customer_open_bills",
            payload: {
              ledgerName: chunk[0],
              ledgerNames: chunk,
              companyName,
              scanId,
            },
          }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const payload = (await response.json()) as { command?: TallyCommand };
        if (payload.command?.id) {
          commandIds.push(payload.command.id);
        }
      }

      options?.onProgress?.(`Scanning open bills from Tally (${commandIds.length} batch${commandIds.length === 1 ? "" : "es"})...`);
      await pollCommands(connectionId, commandIds, {
        timeoutSeconds: Math.max(90, commandIds.length * 60),
        pendingMessage: "The Tally open-bill scan is still pending. Keep the connector open, then refresh.",
      });
    },
    [loadDebtorLedgers, pollCommands, syncCurrentCompanyLedgers]
  );

  const refreshAll = useCallback(
    async (options?: { quiet?: boolean; refreshTally?: boolean }) => {
      try {
        if (!options?.quiet) setLoading(true);
        if (!options?.quiet) setCashDiscountLoadStep("Checking the active Tally company...");
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
        if (connectionId && options?.refreshTally !== false) {
          setCashDiscountLoadStep("Syncing ledgers and scanning open bills from Tally...");
          await refreshTallyOpenBills(connectionId, company?.companyName, {
            onProgress: setCashDiscountLoadStep,
          });
        }
        setCashDiscountLoadStep("Calculating cash discounts from the latest Tally scan...");
        await loadDashboard(connectionId, company?.companyName);
        lastLoadedConnectionRef.current = `${connectionId}::${company?.companyName ?? ""}`;
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." });
      } finally {
        setCashDiscountLoadStep("");
        setLoading(false);
      }
    },
    [loadCompanies, loadDashboard, refreshLiveTallyCompany, refreshTallyOpenBills, selectedCompanyId, selectedConnectionId]
  );

  async function approveTallySuggestion(proposal: DebitNoteProposal) {
    const response = await apiFetch("/api/collections/tally-debit-notes/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: selectedConnectionId,
        companyName: selectedCompany?.companyName ?? proposal.companyName,
        proposal: {
          connectionId: proposal.connectionId,
          partyLedgerName: proposal.partyLedgerName,
          linkedInvoiceNumber: proposal.linkedInvoiceNumber,
          financialYear: selectedCompany?.financialYear ?? proposal.financialYear,
        },
      }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json().catch(() => ({}))) as { command?: TallyCommand };
    return payload.command ?? null;
  }

  async function createDebitNoteForProposal(proposal: DebitNoteProposal) {
    const id = proposal.id;
    let command: TallyCommand | null = null;
    if (proposal.sourceKind === "tally_open_bill" || id.startsWith("tally:")) {
      command = await approveTallySuggestion(proposal);
    } else {
      const response = await apiFetch(`/api/collections/debit-note-proposals/${id}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json().catch(() => ({}))) as { command?: TallyCommand };
      command = payload.command ?? null;
    }

    const commandConnectionId = command?.connectionId ?? selectedConnectionId;
    if (command?.id && commandConnectionId) {
      await pollCommand(commandConnectionId, command.id, {
        timeoutSeconds: 75,
        pendingMessage: "The official Tally PDF is still being prepared. Check the connector status, then retry once it is online.",
      });
    } else {
      await wait(1800);
    }
  }

  async function approveProposal(proposal: DebitNoteProposal) {
    if (!tallyCompanyVerified) {
      setMessage({ tone: "error", text: `Tally is open to ${activeTallyCompanyName || "another company"}. Switch it to ${selectedCompany?.companyName || "the selected company"}, refresh, then create the debit note.` });
      return;
    }
    const id = proposal.id;
    try {
      setApprovingId(id);
      setMessage({ tone: "info", text: "Creating debit note in Tally..." });
      await createDebitNoteForProposal(proposal);
      if (selectedConnectionId) {
        await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName);
        await loadDashboard(selectedConnectionId, selectedCompany?.companyName);
      } else {
        await loadDashboard();
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
    const params = new URLSearchParams({
      type: "ledger",
      name: ledgerName,
      limit: "1",
    });
    const response = await apiFetch(`/api/tally/connections/${connectionId}/masters?${params.toString()}`, {
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
    await loadDashboard(selectedConnectionId, selectedCompany?.companyName);
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
      link.download = cashDiscountDebitNoteDownloadName(proposal);
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
      await loadDashboard();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not send WhatsApp message." });
      await loadDashboard().catch(() => undefined);
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
    setActiveView(initialView);
  }, [initialView]);

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
      setCashDiscountLoadStep("Syncing ledgers and scanning open bills from Tally...");
      setDashboard(null);
      try {
        // A company switch must read a new live snapshot. Loading the old saved
        // scan here can show bills belonging to the previously selected company.
        await refreshTallyOpenBills(selectedConnectionId, company?.companyName, {
          onProgress: setCashDiscountLoadStep,
        });
        setCashDiscountLoadStep("Calculating cash discounts from the latest Tally scan...");
        await loadDashboard(selectedConnectionId, company?.companyName);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." });
      } finally {
        setCashDiscountLoadStep("");
        setLoading(false);
      }
    })();
  }, [liveTallyConnection, loadDashboard, refreshTallyOpenBills, selectedCompany, selectedConnectionId]);

  const proposals = dashboard?.tabs?.debitNoteQueue ?? [];
  const paymentFollowUps = dashboard?.tabs?.paymentFollowUps ?? [];
  const narrationAnalysis = dashboard?.narrationAnalysis ?? [];

  const activeTallyCompanyName = liveTallyConnection?.lastCompanyName?.trim() ?? "";
  const tallyCompanyVerified =
    !checkingLiveTallyCompany &&
    isLiveTallyCompanyMatch(liveTallyConnection, selectedConnectionId, selectedCompany);
  const liveCompanyCheckPending = Boolean(
    selectedConnectionId &&
      (checkingLiveTallyCompany || liveTallyConnection?.id !== selectedConnectionId)
  );
  const companyContextBlocked = Boolean(selectedCompany && !liveCompanyCheckPending && !tallyCompanyVerified);
  const companyContextLocked = liveCompanyCheckPending || companyContextBlocked;

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
  const paymentFollowUpTotal = paymentFollowUps.reduce((total, item) => total + (Number(item.totalPayableAmount) || 0), 0);
  const companyReady = tallyCompanyVerified;
  const selectedCompanyLabel = selectedCompany?.companyName || "Choose a company";
  const tallyStatusLabel = liveCompanyCheckPending
    ? "Checking active company..."
    : companyReady
      ? `Connected to ${activeTallyCompanyName || selectedCompanyLabel}`
      : activeTallyCompanyName
        ? `Opened to ${activeTallyCompanyName}`
        : liveTallyConnection?.tallyReachable === false
          ? "Connector/Tally not reachable"
          : "No active Tally company detected";
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
    const confirmed = window.confirm(
      `Create ${selectedPendingProposals.length} debit note${selectedPendingProposals.length === 1 ? "" : "s"} in Tally?`
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
        await refreshTallyOpenBills(selectedConnectionId, selectedCompany?.companyName);
        await loadDashboard(selectedConnectionId, selectedCompany?.companyName);
      } else {
        await loadDashboard();
      }
      setSelectedPendingIds(new Set());
      setActiveView("done");
      setMessage({ tone: "success", text: `${selectedPendingProposals.length} debit notes created in Tally.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not create selected debit notes." });
      await loadDashboard().catch(() => undefined);
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
            Collections Ledgers
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a] mt-2 flex items-center gap-2">
            Cash Discounts
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Review, track, and post debit notes for missed cash discounts.
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

          <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e5ddd0] bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                companyReady
                  ? "border-emerald-250 bg-emerald-50 text-emerald-800"
                  : "border-amber-250 bg-amber-50 text-amber-800"
              }`}
            >
              {companyReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
              {liveCompanyCheckPending
                ? "Verifying active Tally company"
                : companyReady
                  ? "Tally company verified"
                  : activeTallyCompanyName
                    ? "Company context locked"
                    : "Tally company not ready"}
            </span>
            <span className="hidden h-4 w-px bg-[#e5ddd0] sm:block" />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold">
              <span className="whitespace-nowrap">App company: {selectedCompanyLabel}</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="whitespace-nowrap">Tally status: {tallyStatusLabel}</span>
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

      {message ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : message.tone === "info"
                ? "border-sky-200 bg-sky-50 text-sky-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          {message.text}
        </div>
      ) : null}

      {loading && !companyContextLocked ? (
        <section
          aria-live="polite"
          className="mb-6 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 shadow-[0_10px_30px_rgba(94,67,31,0.08)]"
        >
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#1a1a1a]">Loading Cash Discounts data</h2>
                <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-slate-600">
                  {cashDiscountLoadStep || "Reading the latest Tally data. Keep the connector open; this can take a little time for larger companies."}
                </p>
              </div>
            </div>
            <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-sky-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-sky-800">
              In progress
            </span>
          </div>
        </section>
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

      {!companyContextLocked && showWorkflowSummary ? <section className="mb-6">
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

      {!companyContextLocked && !showWorkflowSummary && activeView === "followUps" ? (
        <section className="mb-6">
          <div className="grid gap-4 md:grid-cols-1">
            <WorkflowButton
              active
              count={paymentFollowUps.length}
              detail={`${formatMoney(paymentFollowUpTotal)} outstanding`}
              label="Pending payment follow-ups"
              onClick={() => undefined}
            />
          </div>
        </section>
      ) : null}



      {!companyContextLocked && activeView === "needsAction" ? (
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
                Create {selectedPendingProposals.length} debit notes
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
              <div className="hidden max-h-[calc(100vh-430px)] overflow-auto lg:block">
                <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
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
                      <th className="w-1/5 px-4 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[22%] px-4 py-3.5 bg-[#fcfbfa]">Invoice</th>
                      <th className="w-[28%] px-4 py-3.5 bg-[#fcfbfa]">Why now</th>
                      <th className="w-32 px-4 py-3.5 text-right bg-[#fcfbfa]">Discount reversal</th>
                      <th className="w-28 px-4 py-3.5 bg-[#fcfbfa]">Status</th>
                      <th className="w-52 px-4 py-3.5 text-right bg-[#fcfbfa]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {pendingProposals.map((proposal) => {
                      const createEnabled = tallyCompanyVerified && canCreateInTally(proposal);
                      const displayAmount = proposal.recoverableAmount;
                      const lateByDays = daysPast(proposal.discountDeadline);

                      return (
                        <tr className="align-top hover:bg-[#fcfbfa]/60 transition-colors" key={proposal.id}>
                          <td className="px-4 py-4">
                            <input
                              aria-label={`Select debit note for ${proposal.partyLedgerName}`}
                              checked={selectedPendingIds.has(proposal.id)}
                              className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                              disabled={!createEnabled || bulkCreating}
                              onChange={(event) => togglePendingSelection(proposal.id, event.target.checked)}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            {proposal.lastError ? (
                              <div className="mt-1 max-w-[280px] truncate text-[11px] text-red-600 font-semibold">
                                {proposal.lastError}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.linkedInvoiceNumber ?? ""}>
                              {shortText(proposal.linkedInvoiceNumber, "No invoice")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                              <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-slate-600">
                                Invoice {formatMoney(proposal.originalInvoiceAmount)}
                              </span>
                              {typeof proposal.pendingAmount === "number" ? (
                                <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-amber-800">
                                  Pending {formatMoney(proposal.pendingAmount)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-semibold text-[#1a1a1a]">{issueLabel(proposal)}</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{whyNowSummary(proposal, lateByDays)}</div>
                            {proposal.cashDiscountAnalysis ? (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {proposal.cashDiscountAnalysis.termsLabel ? (
                                  <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {conciseTermsLabel(proposal)}
                                  </span>
                                ) : null}
                                <span
                                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                                  title={proposal.cashDiscountAnalysis.deterministicReason}
                                >
                                  Deterministic
                                </span>
                                {proposal.cashDiscountAnalysis.terms.some((term) => term.periodSource === "default") ? (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                    Default period applied
                                  </span>
                                ) : null}
                                <details className="group relative">
                                  <summary className="cursor-pointer list-none rounded-full border border-[#e5ddd0] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:border-[#cfc0ad] hover:text-[#1a1a1a]">
                                    Receipt & narration
                                  </summary>
                                  <div className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-[#e5ddd0] bg-white p-3 text-[11px] font-medium leading-relaxed text-slate-600 shadow-xl">
                                    <div className="font-bold text-[#1a1a1a]">Narration</div>
                                    <div className="mt-0.5">{proposal.cashDiscountAnalysis.sourceNarration || "No narration returned by Tally."}</div>
                                    <div className="mt-2 border-t border-[#eee7dc] pt-2">
                                      Context: {proposal.cashDiscountAnalysis.matchedCashDiscountContext || "payment terms"}
                                    </div>
                                    {proposal.cashDiscountAnalysis.receiptDate ? (
                                      <div className="mt-2 border-t border-[#eee7dc] pt-2">
                                        Receipt: {formatDate(proposal.cashDiscountAnalysis.receiptDate)}
                                        {typeof proposal.cashDiscountAnalysis.matchedReceiptAmount === "number"
                                          ? ` · ${formatMoney(proposal.cashDiscountAnalysis.matchedReceiptAmount)}`
                                          : ""}
                                      </div>
                                    ) : null}
                                    <div className="mt-2 border-t border-[#eee7dc] pt-2 text-slate-500">
                                      {proposal.cashDiscountAnalysis.deterministicReason}
                                    </div>
                                  </div>
                                </details>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="tabular-nums text-sm font-semibold text-[#1a1a1a]">{formatMoney(displayAmount)}</div>
                            <div className="mt-1 text-[11px] font-medium text-slate-400">
                              {expiredDiscountLabel(proposal)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(proposal.status)}`}>
                              {actionStatusLabel(proposal)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              className="inline-flex min-h-9 min-w-[150px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#2d2d2d] px-4 py-2 text-xs font-bold leading-none text-white shadow-sm transition-all hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!createEnabled || approvingId === proposal.id}
                              onClick={() => {
                                if (createEnabled) void approveProposal(proposal);
                              }}
                              type="button"
                            >
                              {approvingId === proposal.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {createButtonLabel(proposal)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#e5ddd0] lg:hidden">
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
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(proposal.status)}`}>
                          {actionStatusLabel(proposal)}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 border-y border-[#eee7dc] py-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice</dt>
                          <dd className="mt-1 break-words font-bold leading-snug text-[#1a1a1a]">
                            {shortText(proposal.linkedInvoiceNumber, "No invoice")}
                          </dd>
                          <dd className="mt-1 text-[11px] font-medium text-slate-500">{formatDate(proposal.linkedInvoiceDate)}</dd>
                          <dd className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-slate-600">Invoice {formatMoney(proposal.originalInvoiceAmount)}</span>
                            {typeof proposal.pendingAmount === "number" ? (
                              <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-amber-800">Pending {formatMoney(proposal.pendingAmount)}</span>
                            ) : null}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Why now</dt>
                          <dd className="mt-1 font-bold leading-snug text-[#1a1a1a]">{issueLabel(proposal)}</dd>
                          <dd className="mt-1 text-[11px] leading-relaxed text-slate-500">{whyNowSummary(proposal, lateByDays)}</dd>
                          <dd className="mt-1 text-[11px] font-semibold text-slate-600">
                            {conciseTermsLabel(proposal)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Discount reversal</div>
                          <div className="mt-0.5 tabular-nums text-sm font-extrabold text-[#1a1a1a]">{formatMoney(displayAmount)}</div>
                        </div>
                        <button
                          className="inline-flex min-h-9 min-w-[154px] items-center justify-center gap-1.5 rounded-xl bg-[#2d2d2d] px-4 py-2 text-xs font-bold leading-none text-white shadow-sm transition-all hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!createEnabled || approvingId === proposal.id}
                          onClick={() => {
                            if (createEnabled) void approveProposal(proposal);
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

      {!companyContextLocked && activeView === "followUps" ? (
        <Section
          description={`${formatMoney(paymentFollowUpTotal)} remains outstanding from customers. Follow up on these pending payments and create any required debit notes before collection.`}
          title="Pending payment follow-ups"
        >
          {paymentFollowUps.length === 0 ? (
            <EmptyState>There are no payments to follow up from the latest Tally scan.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
              <div className="hidden max-h-[calc(100vh-430px)] overflow-auto lg:block">
                <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#fcfbfa]">
                    <tr className="border-b border-[#e5ddd0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="w-[18%] px-4 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[20%] px-4 py-3.5 bg-[#fcfbfa]">Invoice</th>
                      <th className="w-36 px-4 py-3.5 text-right bg-[#fcfbfa]">Outstanding</th>
                      <th className="w-[23%] px-4 py-3.5 bg-[#fcfbfa]">Discount position</th>
                      <th className="w-[25%] px-4 py-3.5 bg-[#fcfbfa]">Next follow-up</th>
                      <th className="w-36 px-4 py-3.5 bg-[#fcfbfa]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {paymentFollowUps.map((followUp) => {
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
                            {Math.abs(followUp.totalPayableAmount - followUp.outstandingAmount) > 0.01 ? (
                              <div className="mt-1 text-[11px] font-semibold text-amber-700">
                                After reversal {formatMoney(followUp.totalPayableAmount)}
                              </div>
                            ) : null}
                            {followUp.amountReceived > 0 ? (
                              <div className="mt-1 text-[11px] font-medium text-slate-400">Received {formatMoney(followUp.amountReceived)}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            {followUp.reversalPlan ? (
                              <>
                                <div className="font-semibold text-[#1a1a1a]">
                                  Gross basis {formatMoney(followUp.reversalPlan.grossInvoiceAmount)}
                                </div>
                                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                  Initially net after {followUp.reversalPlan.initialDiscount.ratePercent}%.
                                  {followUp.currentDiscount
                                    ? ` ${followUp.currentDiscount.ratePercent}% remains until ${formatDate(followUp.currentDiscount.discountDeadline)}.`
                                    : " All discount tiers have expired."}
                                </div>
                                {followUp.pendingTierReversalAmount > 0 ? (
                                  <div className="mt-1 text-[11px] font-semibold text-amber-700">
                                    Debit note to create {formatMoney(followUp.pendingTierReversalAmount)}
                                  </div>
                                ) : followUp.createdTierReversalAmount > 0 ? (
                                  <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                                    Debit note created {formatMoney(followUp.createdTierReversalAmount)}
                                  </div>
                                ) : null}
                              </>
                            ) : followUp.currentDiscount ? (
                              <>
                                <div className="font-semibold text-sky-800">
                                  {followUp.currentDiscount.ratePercent}% available until {formatDate(followUp.currentDiscount.discountDeadline)}
                                </div>
                                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                  Discount {formatMoney(followUp.currentDiscount.discountAmount)}
                                  {followUp.paymentAmountIfPaidToday !== null
                                    ? ` · Payable now ${formatMoney(followUp.paymentAmountIfPaidToday)}`
                                    : ""}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-[#1a1a1a]">{followUp.termsLabel || "No discount terms"}</div>
                                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                  {followUp.discountDeadline ? `Final window ended ${formatDate(followUp.discountDeadline)}` : "Full outstanding amount is due"}
                                </div>
                              </>
                            )}
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
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${followUpStatusClass(followUp.kind)}`}>
                              {followUpStatusLabel(followUp.kind)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#e5ddd0] lg:hidden">
                {paymentFollowUps.map((followUp) => {
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
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${followUpStatusClass(followUp.kind)}`}>
                          {followUpStatusLabel(followUp.kind)}
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
                          {Math.abs(followUp.totalPayableAmount - followUp.outstandingAmount) > 0.01 ? (
                            <dd className="mt-1 text-[11px] font-semibold text-amber-700">After reversal {formatMoney(followUp.totalPayableAmount)}</dd>
                          ) : null}
                          {followUp.amountReceived > 0 ? <dd className="mt-1 text-[11px] text-slate-400">Received {formatMoney(followUp.amountReceived)}</dd> : null}
                        </div>
                      </dl>

                      <div className="mt-3 grid gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Discount position</div>
                          <div className="mt-1 text-xs font-semibold leading-relaxed text-[#1a1a1a]">
                            {followUp.reversalPlan
                              ? `Gross basis ${formatMoney(followUp.reversalPlan.grossInvoiceAmount)}. ${followUp.currentDiscount ? `${followUp.currentDiscount.ratePercent}% remains until ${formatDate(followUp.currentDiscount.discountDeadline)}.` : "All discount tiers have expired."}`
                              : followUp.currentDiscount
                                ? `${followUp.currentDiscount.ratePercent}% available until ${formatDate(followUp.currentDiscount.discountDeadline)}`
                                : followUp.termsLabel || "No discount terms"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#fcfbfa] px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next follow-up</div>
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

      {!companyContextLocked && activeView === "done" ? (
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
              <div className="hidden max-h-[calc(100vh-430px)] overflow-auto lg:block">
                <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
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
                      <th className="w-1/5 px-4 py-3.5 bg-[#fcfbfa]">Customer</th>
                      <th className="w-[18%] px-4 py-3.5 bg-[#fcfbfa]">Debit note</th>
                      <th className="w-1/5 px-4 py-3.5 bg-[#fcfbfa]">Linked invoice</th>
                      <th className="w-32 px-4 py-3.5 text-right bg-[#fcfbfa]">Amount</th>
                      <th className="w-36 px-4 py-3.5 bg-[#fcfbfa]">Result</th>
                      <th className="w-56 px-4 py-3.5 text-right bg-[#fcfbfa]">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5ddd0] text-xs font-semibold text-slate-600">
                    {createdProposals.map((proposal) => {
                      const canMessage = proposal.communicationStatus !== "sent" || needsUpdatedPdfDelivery(proposal);
                      const sending = sendingWhatsappId === proposal.id;
                      const preparingNativePdf = preparingNativePdfId === proposal.id;

                      return (
                        <tr className="align-top hover:bg-[#fcfbfa]/60 transition-colors" key={proposal.id}>
                          <td className="px-4 py-4">
                            <input
                              aria-label={`Select WhatsApp for ${proposal.partyLedgerName}`}
                              checked={selectedCreatedIds.has(proposal.id)}
                              className="h-4 w-4 rounded border-[#d6cabb] text-[#2d2d2d] focus:ring-[#2d2d2d] disabled:opacity-40"
                              disabled={!canMessage || bulkSendingWhatsapp}
                              onChange={(event) => toggleCreatedSelection(proposal.id, event.target.checked)}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            <ContactMeta proposal={proposal} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="break-words text-sm font-semibold leading-snug text-[#1a1a1a]" title={proposal.tallyVoucherNumber ?? ""}>
                              {shortText(proposal.tallyVoucherNumber, "Debit note created")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {formatDate(proposal.createdInTallyAt ?? proposal.tallyVoucherDate)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
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
                          <td className="px-4 py-4 text-right tabular-nums text-sm font-semibold text-[#1a1a1a]">
                            {formatMoney(proposal.recoverableAmount)}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(proposal.status)}`}>
                              Created in Tally
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
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
              <div className="divide-y divide-[#e5ddd0] lg:hidden">
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
