"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Settings2,
  TriangleAlert,
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

type CashDiscountRule = {
  id: string;
  ruleName: string;
  discountType: string;
  discountValue: number;
  eligibilityDays: number;
  graceDays: number;
  missedCdTreatment: string;
  label: string;
};

type DebitNoteProposal = {
  id: string;
  partyLedgerName: string;
  partyGstin: string | null;
  partyEmail: string | null;
  partyPhone: string | null;
  partyContactPerson: string | null;
  partyAddress: string | null;
  linkedInvoiceNumber: string | null;
  linkedInvoiceDate: string | null;
  originalInvoiceAmount: number | null;
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
  communicationRecipient?: string | null;
  communicationSentAt?: string | null;
};

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
    cashDiscountTracker?: DebitNoteProposal[];
    debitNoteQueue?: DebitNoteProposal[];
  };
  rules?: CashDiscountRule[];
  notes?: string[];
};

type ActiveView = "needsAction" | "done" | "rules";

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
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

function statusClass(value?: string) {
  if (value === "created_in_tally") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "queued_in_tally" || value === "approved") return "border-amber-200 bg-amber-50 text-amber-800";
  if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-stone-200 bg-white text-stone-700";
}

function messageStatusClass(value?: string | null) {
  if (value === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-stone-200 bg-white text-stone-700";
}

function proposalStatusLabel(value: string) {
  return value.replace(/_/g, " ");
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

function calculateShortfall(proposal: DebitNoteProposal) {
  if (typeof proposal.originalInvoiceAmount !== "number" || typeof proposal.amountReceived !== "number") return null;
  return proposal.originalInvoiceAmount - proposal.amountReceived;
}

function issueLabel(proposal: DebitNoteProposal) {
  if (proposal.lastError) return "Tally action failed";
  if (proposal.status === "queued_in_tally" || proposal.status === "approved") return "Creating debit note";
  return "Late short payment";
}

function createButtonLabel(status: string) {
  if (status === "failed") return "Retry";
  if (status === "approved" || status === "queued_in_tally") return "Queued";
  return "Create";
}

function canCreateInTally(status: string) {
  return ["draft", "pending_approval", "failed"].includes(status);
}

function messageLabel(proposal: DebitNoteProposal) {
  if (proposal.communicationStatus === "sent") return "Sent";
  if (proposal.communicationStatus === "failed") return "Retry";
  if (!proposal.partyPhone) return "No phone";
  return "Send";
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
    <section className="rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#eee7dc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base text-[#1a1a1a]">{title}</h3>
          {description ? <p className="mt-1 text-sm text-[#756a5f]">{description}</p> : null}
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
      className={`min-h-28 rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[#24170f] bg-[#24170f] text-white shadow-sm"
          : "border-[#e5ddd0] bg-white text-[#1a1a1a] hover:border-[#c9b9a6] hover:bg-[#fbfaf8]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`text-[11px] uppercase tracking-[0.14em] ${active ? "text-[#d8ccbc]" : "text-[#8a7f72]"}`}>
        {label}
      </span>
      <span className="mt-3 block text-3xl leading-none">{count}</span>
      <span className={`mt-3 block text-sm leading-5 ${active ? "text-[#efe7dc]" : "text-[#756a5f]"}`}>{detail}</span>
    </button>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8ccbc] bg-[#fbfaf8] px-4 py-8 text-center text-sm text-[#756a5f]">
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

export function CollectionsDashboardPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("needsAction");
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState(false);
  const [approvingId, setApprovingId] = useState("");
  const [sendingWhatsappId, setSendingWhatsappId] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const initialLoadStartedRef = useRef(false);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.connectionId === selectedConnectionId) ?? companies[0] ?? null,
    [companies, selectedConnectionId]
  );

  const loadCompanies = useCallback(async () => {
    const response = await apiFetch("/api/tally/companies", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const payload = (await response.json()) as { companies?: CompanyOption[]; selectedCompanyId?: string | null };
    const nextCompanies = payload.companies ?? [];
    setCompanies(nextCompanies);
    setSelectedConnectionId((current) =>
      nextCompanies.some((company) => company.connectionId === current)
        ? current
        : nextCompanies[0]?.connectionId || payload.selectedCompanyId || ""
    );
    return nextCompanies;
  }, []);

  const loadDashboard = useCallback(
    async (connectionId = selectedConnectionId) => {
      if (!connectionId) {
        setDashboard(null);
        return;
      }
      const params = new URLSearchParams({ connectionId });
      const response = await apiFetch(`/api/collections/dashboard?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as DashboardPayload;
      if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`);
      setDashboard(payload);
    },
    [selectedConnectionId]
  );

  const refreshAll = useCallback(
    async (options?: { quiet?: boolean }) => {
      try {
        if (!options?.quiet) setLoading(true);
        setMessage(null);
        const nextCompanies = await loadCompanies();
        const connectionId = selectedConnectionId || nextCompanies[0]?.connectionId || "";
        await loadDashboard(connectionId);
      } catch (error) {
        setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." });
      } finally {
        setLoading(false);
      }
    },
    [loadCompanies, loadDashboard, selectedConnectionId]
  );

  async function createDefaultRule() {
    if (!selectedConnectionId) return;
    try {
      setSavingRule(true);
      const response = await apiFetch("/api/collections/cash-discount-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          ruleName: "2% CD within 15 days",
          discountType: "percentage",
          discountValue: 2,
          eligibilityDays: 15,
          graceDays: 0,
          paymentCondition: "full_payment",
          missedCdTreatment: "debit_note_proposal",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage({ tone: "success", text: "Cash Discount rule added." });
      await loadDashboard();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not add rule." });
    } finally {
      setSavingRule(false);
    }
  }

  async function approveProposal(id: string) {
    try {
      setApprovingId(id);
      const response = await apiFetch(`/api/collections/debit-note-proposals/${id}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readError(response));
      setActiveView("done");
      setMessage({ tone: "success", text: "Debit note queued in Tally. It will appear here once Tally confirms it." });
      await loadDashboard();
      await wait(1800);
      await loadDashboard();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not approve proposal." });
    } finally {
      setApprovingId("");
    }
  }

  async function sendWhatsappMessage(proposal: DebitNoteProposal) {
    if (!proposal.partyPhone || proposal.communicationStatus === "sent") return;
    try {
      setSendingWhatsappId(proposal.id);
      const response = await apiFetch(`/api/collections/debit-note-proposals/${proposal.id}/whatsapp`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage({ tone: "success", text: "WhatsApp message sent." });
      await loadDashboard();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not send WhatsApp message." });
      await loadDashboard().catch(() => undefined);
    } finally {
      setSendingWhatsappId("");
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
    if (!selectedConnectionId) return;
    void loadDashboard(selectedConnectionId).catch((error) =>
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load Cash Discounts data." })
    );
  }, [loadDashboard, selectedConnectionId]);

  const proposals = dashboard?.tabs?.debitNoteQueue ?? [];
  const rules = dashboard?.rules ?? [];

  const pendingProposals = proposals.filter(isPendingDebitNote);
  const createdProposals = proposals.filter(isCreatedDebitNote);
  const companyReady = selectedCompany?.companyLoaded === true;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-y-auto px-6 pb-8 pt-5 text-[#1a1a1a]">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="text-xl tracking-tight">Cash Discounts</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
          <label className="w-full sm:w-[280px]">
            <span className="sr-only">Company</span>
            <select
              className="h-10 w-full rounded-xl border border-[#d8ccbc] bg-white px-3 text-sm text-[#1a1a1a] shadow-sm outline-none transition focus:border-[#b9a68e] focus:ring-2 focus:ring-[#eadfce]"
              onChange={(event) => setSelectedConnectionId(event.target.value)}
              value={selectedConnectionId}
            >
              {companies.length === 0 ? <option value="">No Tally company found</option> : null}
              {companies.map((company) => (
                <option key={company.connectionId} value={company.connectionId}>
                  {company.companyName} - {company.financialYear}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e5ddd0] bg-[#fbfaf8] px-3 text-xs text-[#756a5f] shadow-sm">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                companyReady
                  ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                  : "border-[#f59e0b]/20 bg-[#fff7e6] text-[#a16207]"
              }`}
            >
              {companyReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
              {companyReady ? "Tally ready" : "Waiting for Tally"}
            </span>
            <span className="hidden h-4 w-px bg-[#e5ddd0] sm:block" />
            <span className="whitespace-nowrap">Heartbeat {formatDate(selectedCompany?.lastHeartbeatAt)}</span>
          </div>

          <button
            className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-[#e5ddd0] bg-white px-4 text-sm text-[#1a1a1a] shadow-sm hover:bg-[#f3eee7]"
            onClick={() => void refreshAll()}
            type="button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            message.tone === "success"
              ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
              : message.tone === "error"
                ? "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
                : "border-[#e5ddd0] bg-white text-[#756a5f]"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {dashboard?.setupRequired ? (
        <div className="mb-4 rounded-xl border border-[#f59e0b]/20 bg-[#fff7e6] px-4 py-3 text-sm text-[#a16207]">
          Cash Discounts tables are not ready. Run the Supabase migration first.
        </div>
      ) : null}

      <section className="mb-5">
        <div className="grid gap-3 md:grid-cols-3">
          <WorkflowButton
            active={activeView === "needsAction"}
            count={pendingProposals.length}
            detail="Review and act on open items."
            label="Needs action"
            onClick={() => chooseView("needsAction")}
          />
          <WorkflowButton
            active={activeView === "done"}
            count={createdProposals.length}
            detail="Completed items and audit trail."
            label="Done"
            onClick={() => chooseView("done")}
          />
          <WorkflowButton
            active={activeView === "rules"}
            count={rules.length}
            detail="Active recovery logic."
            label="Rules"
            onClick={() => chooseView("rules")}
          />
        </div>
      </section>

      {activeView === "needsAction" ? (
        <Section
          description="Only items that need a user decision or retry are shown here."
          title="Needs action"
        >
          {pendingProposals.length === 0 ? (
            <EmptyState>
              Nothing needs action right now.
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#eee5da] bg-white">
              <div className="max-h-[calc(100vh-430px)] overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[#eee5da] bg-[#fbf7f1] text-[10px] uppercase tracking-[0.14em] text-[#8a7f72]">
                      <th className="px-3 py-3">Customer</th>
                      <th className="w-44 px-3 py-3">Invoice</th>
                      <th className="w-44 px-3 py-3">Issue</th>
                      <th className="w-32 px-3 py-3 text-right">Amount</th>
                      <th className="w-36 px-3 py-3">Status</th>
                      <th className="w-28 px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee5da] text-sm">
                    {pendingProposals.map((proposal) => {
                      const shortfall = calculateShortfall(proposal);
                      const createEnabled = canCreateInTally(proposal.status);

                      return (
                        <tr className="align-top hover:bg-[#fffaf2]" key={proposal.id}>
                          <td className="px-3 py-3">
                            <div className="max-w-[280px] truncate text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            <ContactMeta proposal={proposal} />
                            {proposal.lastError ? (
                              <div className="mt-1 max-w-[280px] truncate text-xs text-[#b91c1c]">
                                {proposal.lastError}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <div className="truncate text-[#1a1a1a]" title={proposal.linkedInvoiceNumber ?? ""}>
                              {shortText(proposal.linkedInvoiceNumber, "No invoice")}
                            </div>
                            <div className="mt-1 text-xs text-[#8a7f72]">{formatDate(proposal.linkedInvoiceDate)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div>{issueLabel(proposal)}</div>
                            {typeof shortfall === "number" && shortfall > 0 ? (
                              <div className="mt-1 text-xs text-[#8a7f72]">
                                Received {formatMoney(proposal.amountReceived)} against {formatMoney(proposal.originalInvoiceAmount)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-[#1a1a1a]">
                            {formatMoney(proposal.recoverableAmount)}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(proposal.status)}`}>
                              {proposalStatusLabel(proposal.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 text-xs text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!createEnabled || approvingId === proposal.id}
                              onClick={() => {
                                if (createEnabled) void approveProposal(proposal.id);
                              }}
                              type="button"
                            >
                              {approvingId === proposal.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {createButtonLabel(proposal.status)}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {activeView === "done" ? (
        <Section
          description="Completed items are kept here for quick reference."
          title="Done"
        >
          {createdProposals.length === 0 ? (
            <EmptyState>Nothing completed yet.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#eee5da] bg-white">
              <div className="max-h-[calc(100vh-430px)] overflow-auto">
                <table className="w-full min-w-[1040px] border-collapse text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[#eee5da] bg-[#fbf7f1] text-[10px] uppercase tracking-[0.14em] text-[#8a7f72]">
                      <th className="px-3 py-3">Document</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="w-44 px-3 py-3">Linked invoice</th>
                      <th className="w-32 px-3 py-3 text-right">Amount</th>
                      <th className="w-36 px-3 py-3">Date</th>
                      <th className="w-40 px-3 py-3">Result</th>
                      <th className="w-40 px-3 py-3 text-right">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee5da] text-sm">
                    {createdProposals.map((proposal) => {
                      const canMessage = Boolean(proposal.partyPhone) && proposal.communicationStatus !== "sent";
                      const sending = sendingWhatsappId === proposal.id;

                      return (
                        <tr className="align-top hover:bg-[#fffaf2]" key={proposal.id}>
                          <td className="px-3 py-3">
                            <div className="truncate text-[#1a1a1a]" title={proposal.tallyVoucherNumber ?? ""}>
                              {shortText(proposal.tallyVoucherNumber, "Debit note created")}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="max-w-[260px] truncate text-[#1a1a1a]" title={proposal.partyLedgerName}>
                              {proposal.partyLedgerName}
                            </div>
                            <ContactMeta proposal={proposal} />
                          </td>
                          <td className="px-3 py-3">
                            <div className="truncate">{shortText(proposal.linkedInvoiceNumber, "No invoice")}</div>
                            <div className="mt-1 text-xs text-[#8a7f72]">{formatDate(proposal.linkedInvoiceDate)}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatMoney(proposal.recoverableAmount)}
                          </td>
                          <td className="px-3 py-3">{formatDate(proposal.createdInTallyAt ?? proposal.tallyVoucherDate)}</td>
                          <td className="px-3 py-3">
                            <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(proposal.status)}`}>
                              {proposalStatusLabel(proposal.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={`hidden rounded-full border px-2.5 py-1 text-xs lg:inline-flex ${messageStatusClass(proposal.communicationStatus)}`}
                              >
                                {proposal.communicationStatus === "sent" ? "Sent" : proposal.communicationStatus === "failed" ? "Failed" : "Not sent"}
                              </span>
                              <button
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e5ddd0] bg-white px-3 text-xs text-[#1a1a1a] hover:bg-[#f3eee7] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canMessage || sending}
                                onClick={() => void sendWhatsappMessage(proposal)}
                                title={!proposal.partyPhone ? "Customer phone number missing" : undefined}
                                type="button"
                              >
                                {sending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MessageCircle className="h-3.5 w-3.5" />
                                )}
                                {messageLabel(proposal)}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      ) : null}

      {activeView === "rules" ? (
        <Section
          action={
            <button
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e5ddd0] bg-white px-3 text-sm text-[#1a1a1a] hover:bg-[#f3eee7] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedConnectionId || savingRule}
              onClick={() => void createDefaultRule()}
              type="button"
            >
              {savingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Add default rule
            </button>
          }
          description="Keep the active recovery rule simple and visible."
          title="Rules"
        >
          <div className="space-y-2">
            {rules.length === 0 ? (
              <EmptyState>No rule configured.</EmptyState>
            ) : (
              rules.map((rule) => (
                <div className="rounded-xl border border-[#eee7dc] px-4 py-3" key={rule.id}>
                  <div className="text-sm text-[#1a1a1a]">{rule.ruleName}</div>
                  <div className="mt-1 text-xs text-[#8a7f72]">
                    {rule.discountValue}% within {rule.eligibilityDays} days - {rule.missedCdTreatment.replace(/_/g, " ")}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
