"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type BankAccount = {
  id: string;
  bankName: string | null;
  accountNumber: string | null;
  accountNumberMasked: string;
  accountHolderName: string | null;
  ifscCode: string | null;
  tallyLedgerName: string | null;
  lastImportedTransactionAt: string | null;
  lastTallyPostedTransactionAt: string | null;
};

type BankStatementImport = {
  id: string;
  status: string;
  originalFileName: string;
  importedTransactionCount: number;
  duplicateTransactionCount: number;
  createdAt: string;
};

type TallyConnection = {
  id: string;
  displayName: string;
  status: string;
  lastCompanyName: string | null;
};

type TallyCommand = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

type DraftAccount = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
  tallyLedgerName: string;
};

type PreviewTransaction = {
  id?: string;
  transactionDate?: string | null;
  valueDate?: string | null;
  description?: string | null;
  referenceNumber?: string | null;
  debitAmount?: string | number | null;
  creditAmount?: string | number | null;
  balanceAmount?: string | number | null;
  transactionType?: string | null;
  category?: string | null;
  counterpartyName?: string | null;
  suggestedLedgerName?: string | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  confirmedLedgerName?: string | null;
  rawPayload?: {
    aiLedgerRecommendation?: LedgerRecommendation | null;
  } | null;
};

type LedgerRecommendationAction =
  | "use_existing_ledger"
  | "create_new_ledger"
  | "use_standard_ledger"
  | "use_suspense"
  | "needs_review";

type LedgerRecommendation = {
  action: LedgerRecommendationAction;
  ledgerName: string | null;
  ledgerGroup: string | null;
  confidence: number;
  requiresUserConfirmation: boolean;
  reason: string | null;
};

type ReviewTransaction = {
  id: string;
  transactionDate: string;
  valueDate: string;
  description: string;
  referenceNumber: string;
  debitAmount: string;
  creditAmount: string;
  balanceAmount: string;
  transactionType: string;
  category: string;
  counterpartyName: string;
  suggestedLedgerName: string;
  suggestionConfidence: number | null;
  suggestionReason: string;
  selectedLedgerName: string;
  ledgerAction: LedgerRecommendationAction;
  ledgerGroup: string;
  requiresUserConfirmation: boolean;
};

type PreviewResponse = {
  import: BankStatementImport;
  account: {
    bankName: string | null;
    accountNumber: string | null;
    accountNumberMasked: string;
    accountHolderName: string | null;
    ifscCode: string | null;
    tallyLedgerName?: string | null;
  };
  candidates: BankAccount[];
  transactions: PreviewTransaction[];
  requiresManualExtraction: boolean;
  extractionError?: string | null;
  extractionDiagnostics?: {
    rawAiTransactionCount?: number;
    normalizedAiTransactionCount?: number;
  } | null;
  ledgerRecommendationError?: string | null;
};

type TallyMaster = {
  key: string;
  name: string;
  type: string;
  parent?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
};

type QueueTransaction = {
  id: string;
  transactionDate: string;
  description: string;
  referenceNumber: string | null;
  debitAmount: string | number | null;
  creditAmount: string | number | null;
  suggestedLedgerName: string | null;
  confirmedLedgerName: string | null;
};

const EMPTY_ACCOUNT: DraftAccount = {
  bankName: "",
  accountNumber: "",
  accountHolderName: "",
  ifscCode: "",
  tallyLedgerName: "",
};

function normalizeName(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findLedgerByNormalizedName(ledgerMasters: TallyMaster[], ledgerName?: string | null) {
  const normalizedLedgerName = normalizeName(ledgerName);
  if (!normalizedLedgerName) return null;

  return (
    ledgerMasters.find((ledger) => normalizeName(ledger.name) === normalizedLedgerName) ?? null
  );
}

function readRecommendation(transaction: PreviewTransaction): LedgerRecommendation | null {
  return transaction.rawPayload?.aiLedgerRecommendation ?? null;
}

function normalizeReviewTransaction(transaction: PreviewTransaction, ledgerMasters: TallyMaster[]): ReviewTransaction {
  const recommendation = readRecommendation(transaction);
  const suggestedLedgerName = transaction.suggestedLedgerName || "";
  const action = recommendation?.action ?? "needs_review";
  const recommendedLedgerName = recommendation?.ledgerName || suggestedLedgerName;
  const matchedLedger = findLedgerByNormalizedName(ledgerMasters, recommendedLedgerName);
  const selectedLedgerName =
    transaction.confirmedLedgerName ||
    matchedLedger?.name ||
    (action === "create_new_ledger" || action === "use_suspense" ? recommendedLedgerName : "") ||
    "";

  return {
    id: transaction.id || crypto.randomUUID(),
    transactionDate: transaction.transactionDate || "",
    valueDate: transaction.valueDate || transaction.transactionDate || "",
    description: transaction.description || "",
    referenceNumber: transaction.referenceNumber || "",
    debitAmount:
      transaction.debitAmount === null || transaction.debitAmount === undefined
        ? ""
        : String(transaction.debitAmount),
    creditAmount:
      transaction.creditAmount === null || transaction.creditAmount === undefined
        ? ""
        : String(transaction.creditAmount),
    balanceAmount:
      transaction.balanceAmount === null || transaction.balanceAmount === undefined
        ? ""
        : String(transaction.balanceAmount),
    transactionType: transaction.transactionType || "unknown",
    category: transaction.category || "unknown",
    counterpartyName: transaction.counterpartyName || "",
    suggestedLedgerName: recommendedLedgerName,
    suggestionConfidence: recommendation?.confidence ?? transaction.suggestionConfidence ?? null,
    suggestionReason: recommendation?.reason || transaction.suggestionReason || "",
    selectedLedgerName,
    ledgerAction: action,
    ledgerGroup: recommendation?.ledgerGroup || "",
    requiresUserConfirmation: recommendation?.requiresUserConfirmation ?? false,
  };
}

function transactionIsValid(transaction: ReviewTransaction) {
  return Boolean(transaction.transactionDate && transaction.description.trim());
}

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed === 0) return "";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(parsed);
}

function maskAccountNumber(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function isBankLedgerMaster(ledger: TallyMaster) {
  const text = `${ledger.name} ${ledger.parent ?? ""}`.toLowerCase();
  return (
    /\bbank\b/.test(text) ||
    /\b(hdfc|icici|sbi|axis|kotak|idfc|indusind|canara|yes bank|federal|standard chartered|bank of baroda|bank of india)\b/.test(text)
  );
}

function getLedgerChoices(transaction: ReviewTransaction, ledgerMasters: TallyMaster[]) {
  const names = new Set<string>();
  const suggested = transaction.suggestedLedgerName.trim();
  if (suggested) names.add(suggested);

  const searchTerms = [
    transaction.counterpartyName,
    transaction.suggestedLedgerName,
    transaction.category,
  ].map(normalizeName).filter(Boolean);

  for (const ledger of ledgerMasters) {
    const normalizedLedger = normalizeName(ledger.name);
    if (
      searchTerms.some(
        (term) =>
          term.length >= 4 &&
          (normalizedLedger.includes(term) || term.includes(normalizedLedger))
      )
    ) {
      names.add(ledger.name);
    }
    if (names.size >= 4) break;
  }

  const suspense = ledgerMasters.find((ledger) => normalizeName(ledger.name) === "suspense");
  if (suspense) names.add(suspense.name);

  for (const ledger of ledgerMasters) {
    names.add(ledger.name);
  }

  return Array.from(names).filter(Boolean);
}

function LedgerSearchSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeName(query);
    const matches = normalizedQuery
      ? uniqueOptions.filter((option) => normalizeName(option).includes(normalizedQuery))
      : uniqueOptions;

    return matches.slice(0, 60);
  }, [query, uniqueOptions]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8d7f]" />
        <input
          className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 pl-9 text-sm font-medium text-[#2b241d] outline-none transition placeholder:text-[#9a8d7f] focus:border-[#7c5f3f] focus:ring-2 focus:ring-[#7c5f3f]/10"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          value={open ? query : value}
        />
      </div>

      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[#d8cbbb] bg-white p-1 shadow-xl">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-[#fbf4ea] ${
                  option === value ? "bg-[#f6efe6] text-[#4b3828]" : "text-[#2b241d]"
                }`}
                key={option}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                  setQuery("");
                  setOpen(false);
                }}
                type="button"
              >
                <span className="truncate">{option}</span>
                {option === value ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm font-semibold text-[#8a7f72]">
              No matching ledger found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getLedgerActionLabel(transaction: ReviewTransaction) {
  if (transaction.ledgerAction === "create_new_ledger") return "Create new";
  if (transaction.ledgerAction === "use_suspense") return "Suspense";
  if (transaction.ledgerAction === "use_standard_ledger") return "Standard";
  if (transaction.ledgerAction === "use_existing_ledger") return "Matched";
  return transaction.selectedLedgerName ? "Selected" : "Needs review";
}

function getLedgerActionTone(transaction: ReviewTransaction) {
  if (!transaction.selectedLedgerName.trim()) return "warning";
  if (transaction.ledgerAction === "create_new_ledger" || transaction.ledgerAction === "use_suspense") {
    return "warning";
  }
  return "success";
}

function transactionQueueKey(transaction: {
  transactionDate: string;
  description: string;
  referenceNumber?: string | null;
  debitAmount?: string | number | null;
  creditAmount?: string | number | null;
}) {
  return [
    transaction.transactionDate,
    transaction.referenceNumber || "",
    transaction.description,
    String(transaction.debitAmount ?? ""),
    String(transaction.creditAmount ?? ""),
  ].join("|");
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    diagnostics?: unknown;
  };
  const message = payload.error || `Request failed with status ${response.status}`;
  if (!payload.diagnostics) return message;

  return `${message} ${JSON.stringify(payload.diagnostics)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BankStatementsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [account, setAccount] = useState<DraftAccount>(EMPTY_ACCOUNT);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [recentImports, setRecentImports] = useState<BankStatementImport[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [tallyConnectionId, setTallyConnectionId] = useState("");
  const [bankLedgerName, setBankLedgerName] = useState("");
  const [ledgerMasters, setLedgerMasters] = useState<TallyMaster[]>([]);
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [editingLedgerIds, setEditingLedgerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingMasters, setSyncingMasters] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const validTransactions = useMemo(
    () => transactions.filter(transactionIsValid),
    [transactions]
  );
  const selectedAccount = useMemo(
    () => preview?.candidates.find((candidate) => candidate.id === selectedAccountId) ?? null,
    [preview?.candidates, selectedAccountId]
  );
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === tallyConnectionId) ?? null,
    [connections, tallyConnectionId]
  );
  const bankLedgerOptions = useMemo(() => {
    const bankLedgers = ledgerMasters.filter(isBankLedgerMaster);
    return bankLedgers.length > 0 ? bankLedgers : ledgerMasters;
  }, [ledgerMasters]);
  const missingLedgerCount = useMemo(
    () => transactions.filter((transaction) => !transaction.selectedLedgerName.trim()).length,
    [transactions]
  );
  const matchedLedgerCount = transactions.filter(
    (transaction) =>
      transaction.selectedLedgerName.trim() &&
      (transaction.ledgerAction === "use_existing_ledger" || transaction.ledgerAction === "use_standard_ledger")
  ).length;
  const createLedgerCount = transactions.filter(
    (transaction) => transaction.ledgerAction === "create_new_ledger"
  ).length;
  const accountMatchLabel = selectedAccount
    ? `${selectedAccount.accountHolderName || "Saved account"} · ${selectedAccount.accountNumberMasked}`
    : `${account.accountHolderName || "New account"}${account.accountNumber ? ` · ${maskAccountNumber(account.accountNumber)}` : ""}`;

  const loadLedgerMasters = useCallback(async (connectionId: string) => {
    if (!connectionId) {
      setLedgerMasters([]);
      return;
    }

    const response = await apiFetch(
      `/api/tally/connections/${connectionId}/masters?type=ledger&limit=800`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const payload = (await response.json()) as { masters?: TallyMaster[] };
    setLedgerMasters(payload.masters ?? []);
  }, []);

  const waitForCommand = useCallback(async (connectionId: string, commandId: string) => {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await wait(2000);
      const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = (await response.json()) as { commands?: TallyCommand[] };
      const command = (payload.commands ?? []).find((item) => item.id === commandId);
      if (!command) continue;
      if (command.status === "succeeded" || command.status === "failed" || command.status === "canceled") {
        return command;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [importsResponse, accountsResponse, connectionsResponse] = await Promise.all([
        apiFetch("/api/bank-statements/imports", { cache: "no-store" }),
        apiFetch("/api/bank-statements/accounts", { cache: "no-store" }),
        apiFetch("/api/tally/connections", { cache: "no-store" }),
      ]);

      if (cancelled) return;

      if (importsResponse.ok) {
        const payload = (await importsResponse.json()) as { imports?: BankStatementImport[] };
        setRecentImports(payload.imports ?? []);
      }
      if (accountsResponse.ok) {
        const payload = (await accountsResponse.json()) as { accounts?: BankAccount[] };
        setAccounts(payload.accounts ?? []);
      }
      if (connectionsResponse.ok) {
        const payload = (await connectionsResponse.json()) as { connections?: TallyConnection[] };
        const loadedConnections = payload.connections ?? [];
        setConnections(loadedConnections);
        setTallyConnectionId((current) => current || loadedConnections[0]?.id || "");
      }
    }

    loadSummary().catch(() => {
      if (!cancelled) {
        setBanner({ tone: "error", text: "Could not load bank statement details." });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadLedgerMasters(tallyConnectionId).catch(() => {
      if (!cancelled) setLedgerMasters([]);
    });

    return () => {
      cancelled = true;
    };
  }, [loadLedgerMasters, tallyConnectionId]);

  useEffect(() => {
    if (ledgerMasters.length === 0) return;

    setTransactions((current) =>
      current.map((transaction) => {
        if (transaction.selectedLedgerName.trim() || !transaction.suggestedLedgerName.trim()) {
          return transaction;
        }

        const matchedLedger = findLedgerByNormalizedName(ledgerMasters, transaction.suggestedLedgerName);
        return matchedLedger ? { ...transaction, selectedLedgerName: matchedLedger.name } : transaction;
      })
    );
  }, [ledgerMasters]);

  function updateTransaction(id: string, field: keyof ReviewTransaction, value: string) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              [field]: value,
              ...(field === "selectedLedgerName"
                ? {
                    ledgerAction:
                      normalizeName(value) === "suspense" ? "use_suspense" : "use_existing_ledger",
                    ledgerGroup: "",
                    requiresUserConfirmation: false,
                  }
                : {}),
            }
          : transaction
      )
    );
  }

  function applyTallyBankLedgerSelection(ledgerName: string) {
    const ledger = ledgerMasters.find((item) => item.name === ledgerName);
    const mappedAccount = accounts.find((item) => item.tallyLedgerName === ledgerName);
    const ledgerAccountNumber =
      mappedAccount?.accountNumber?.trim() || ledger?.bankAccountNumber?.trim() || "";

    setAccount((current) => ({
      ...current,
      tallyLedgerName: ledgerName,
      bankName: mappedAccount?.bankName || ledger?.bankName || ledger?.name || current.bankName,
      accountNumber: ledgerAccountNumber || current.accountNumber,
      accountHolderName:
        mappedAccount?.accountHolderName ||
        ledger?.accountHolderName ||
        ledger?.name ||
        current.accountHolderName,
      ifscCode: mappedAccount?.ifscCode || ledger?.ifscCode || current.ifscCode,
    }));
    setBankLedgerName(ledgerName);
  }

  function applyPreviewPayload(payload: PreviewResponse, fallbackAccount = account) {
    const singleCandidate = payload.candidates.length === 1 ? payload.candidates[0] : null;
    const nextTallyLedgerName =
      singleCandidate?.tallyLedgerName ||
      payload.account.tallyLedgerName ||
      fallbackAccount.tallyLedgerName;

    setPreview(payload);
    setAccount({
      bankName: payload.account.bankName ?? fallbackAccount.bankName,
      accountNumber: payload.account.accountNumber ?? fallbackAccount.accountNumber,
      accountHolderName: payload.account.accountHolderName ?? fallbackAccount.accountHolderName,
      ifscCode: payload.account.ifscCode ?? fallbackAccount.ifscCode,
      tallyLedgerName: nextTallyLedgerName,
    });
    setSelectedAccountId(singleCandidate?.id || "");
    setBankLedgerName(nextTallyLedgerName || "");
    setTransactions(payload.transactions.map((transaction) => normalizeReviewTransaction(transaction, ledgerMasters)));
    setEditingLedgerIds(new Set());
  }

  async function analyzeFile(nextFile = file) {
    if (!nextFile) {
      setBanner({ tone: "error", text: "Select a bank statement file." });
      return;
    }

    try {
      setLoading(true);
      setBanner(null);
      setFile(nextFile);
      const formData = new FormData();
      formData.set("file", nextFile);
      formData.set("account", JSON.stringify(account));
      if (tallyConnectionId) {
        formData.set("connectionId", tallyConnectionId);
      }

      const response = await apiFetch("/api/bank-statements/imports", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as PreviewResponse;
      applyPreviewPayload(payload);

      const extractionIssue = payload.extractionError
        ? payload.extractionError
        : payload.extractionDiagnostics?.rawAiTransactionCount
          ? `AI found ${payload.extractionDiagnostics.rawAiTransactionCount} row(s), but ${payload.extractionDiagnostics.normalizedAiTransactionCount ?? 0} passed validation.`
          : "No transaction rows were extracted.";
      setBanner({
        tone: payload.requiresManualExtraction || payload.ledgerRecommendationError ? "info" : "success",
        text: payload.requiresManualExtraction
          ? `File stored. ${extractionIssue} Please verify rows before sending.`
          : payload.ledgerRecommendationError
            ? `Statement analyzed, but ledger recommendations need review: ${payload.ledgerRecommendationError}`
            : "Statement analyzed. Review the rows, then send to Tally.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Bank statement analysis failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncLedgerMasters() {
    const connection = connections.find((item) => item.id === tallyConnectionId);
    if (!connection) {
      setBanner({ tone: "error", text: "Select a Tally connection before syncing ledgers." });
      return;
    }

    try {
      setSyncingMasters(true);
      setBanner(null);
      const response = await apiFetch(`/api/tally/connections/${connection.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandType: "sync_masters",
          payload: {
            companyName: connection.lastCompanyName,
            requestedMasterTypes: ["ledger", "group"],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { command?: TallyCommand };
      const command = payload.command;
      if (!command?.id) {
        throw new Error("Tally ledger sync was queued, but no command id was returned.");
      }
      setBanner({
        tone: "info",
        text: "Tally ledger sync is running. Keep the connector open.",
      });
      const completedCommand = await waitForCommand(connection.id, command.id);
      if (!completedCommand) {
        setBanner({
          tone: "info",
          text: "Tally ledger sync is still pending. Keep the connector running and try again shortly.",
        });
        return;
      }
      if (completedCommand.status !== "succeeded") {
        throw new Error(completedCommand.error || `Tally ledger sync ${completedCommand.status}.`);
      }

      await loadLedgerMasters(connection.id);
      setBanner({ tone: "success", text: "Tally ledgers refreshed." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not sync Tally ledgers.",
      });
    } finally {
      setSyncingMasters(false);
    }
  }

  async function sendToTally() {
    if (!preview) return;
    if (!tallyConnectionId) {
      setBanner({ tone: "error", text: "Select a Tally connection." });
      return;
    }
    if (!bankLedgerName.trim()) {
      setBanner({ tone: "error", text: "Select the Tally bank ledger." });
      return;
    }
    if (validTransactions.length === 0) {
      setBanner({ tone: "error", text: "No valid rows are available to send." });
      return;
    }
    if (missingLedgerCount > 0) {
      setBanner({ tone: "error", text: "Select a ledger for every row before sending to Tally." });
      return;
    }

    try {
      setSending(true);
      setBanner(null);
      const confirmResponse = await apiFetch(`/api/bank-statements/imports/${preview.import.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId || null,
          account: {
            ...account,
            tallyLedgerName: bankLedgerName,
          },
          transactions: validTransactions.map((transaction) => ({
            transactionDate: transaction.transactionDate,
            valueDate: transaction.valueDate || transaction.transactionDate,
            description: transaction.description,
            referenceNumber: transaction.referenceNumber || null,
            debitAmount: parseNumber(transaction.debitAmount),
            creditAmount: parseNumber(transaction.creditAmount),
            balanceAmount: parseNumber(transaction.balanceAmount),
            transactionType: transaction.transactionType,
            category: transaction.category,
            counterpartyName: transaction.counterpartyName || null,
            suggestedLedgerName: transaction.suggestedLedgerName || null,
            suggestionConfidence: transaction.suggestionConfidence,
            suggestionReason: transaction.suggestionReason || null,
            confirmedLedgerName: transaction.selectedLedgerName || null,
          })),
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error(await readError(confirmResponse));
      }

      const confirmPayload = (await confirmResponse.json()) as {
        account: BankAccount;
        import: BankStatementImport;
        importedTransactionCount: number;
        duplicateTransactionCount: number;
      };

      const transactionsResponse = await apiFetch(
        `/api/bank-statements/transactions?${new URLSearchParams({
          accountId: confirmPayload.account.id,
          status: "queueable",
          connectionId: tallyConnectionId,
        }).toString()}`,
        { cache: "no-store" }
      );
      if (!transactionsResponse.ok) {
        throw new Error(await readError(transactionsResponse));
      }

      const queuePayload = (await transactionsResponse.json()) as { transactions?: QueueTransaction[] };
      const queueRows = queuePayload.transactions ?? [];
      const reviewedTransactionsByKey = new Map(
        validTransactions.map((transaction) => [transactionQueueKey(transaction), transaction])
      );
      if (queueRows.length === 0) {
        setAccounts((current) => [confirmPayload.account, ...current.filter((item) => item.id !== confirmPayload.account.id)]);
        setRecentImports((current) => [confirmPayload.import, ...current.filter((item) => item.id !== confirmPayload.import.id)]);
        setPreview(null);
        setTransactions([]);
        setFile(null);
        setBanner({
          tone: "success",
          text: `${confirmPayload.importedTransactionCount} transactions imported. No new rows needed Tally posting.`,
        });
        return;
      }

      const queueResponse = await apiFetch("/api/bank-statements/tally/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: tallyConnectionId,
          accountId: confirmPayload.account.id,
          transactionIds: queueRows.map((transaction) => transaction.id),
          bankLedgerName,
          transactions: queueRows.map((transaction) => ({
            transactionId: transaction.id,
            ...(() => {
              const reviewedTransaction = reviewedTransactionsByKey.get(transactionQueueKey(transaction));
              if (reviewedTransaction?.ledgerAction === "create_new_ledger") {
                return {
                  counterpartyLedgerName: "",
                  createLedgerName: reviewedTransaction.selectedLedgerName,
                  createLedgerParentName: reviewedTransaction.ledgerGroup || "Sundry Creditors",
                };
              }
              return {
                counterpartyLedgerName:
                  reviewedTransaction?.selectedLedgerName ||
                  transaction.confirmedLedgerName ||
                  transaction.suggestedLedgerName ||
                  "Suspense",
                createLedgerName: "",
                createLedgerParentName: "",
              };
            })(),
            saveMapping: true,
          })),
        }),
      });

      if (!queueResponse.ok) {
        throw new Error(await readError(queueResponse));
      }

      const queuedPayload = (await queueResponse.json()) as { queuedCount?: number };
      setAccounts((current) => [confirmPayload.account, ...current.filter((item) => item.id !== confirmPayload.account.id)]);
      setRecentImports((current) => [confirmPayload.import, ...current.filter((item) => item.id !== confirmPayload.import.id)]);
      setPreview(null);
      setTransactions([]);
      setFile(null);
      setSelectedAccountId("");
      setBanner({
        tone: "success",
        text: `${confirmPayload.importedTransactionCount} transactions imported. ${queuedPayload.queuedCount ?? 0} voucher(s) queued for Tally.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not send bank statement to Tally.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[#f7f4ee] px-4 py-6 text-[#1a1a1a] sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-[#d8cbbb] bg-[#fffaf2] shadow-sm">
                <Landmark className="h-5 w-5 text-[#69513a]" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#181512] sm:text-3xl">
                Bank Statements
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-[#7c6f62]">
                Upload a statement, check the rows, and send them to Tally.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="rounded-xl border border-[#e3d6c6] bg-white px-4 py-3 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a8d7f]">
                  Accounts
                </div>
                <div className="mt-1 text-2xl font-black">{accounts.length}</div>
              </div>
              <div className="rounded-xl border border-[#e3d6c6] bg-white px-4 py-3 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9a8d7f]">
                  Imports
                </div>
                <div className="mt-1 text-2xl font-black">{recentImports.length}</div>
              </div>
            </div>
          </header>

          {banner && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                banner.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : banner.tone === "info"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {banner.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4" />
              )}
              <span>{banner.text}</span>
            </div>
          )}

          {!preview ? (
            <section className="rounded-2xl border border-[#e3d6c6] bg-white p-5 shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.pdf,image/*"
                className="hidden"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  if (nextFile) void analyzeFile(nextFile);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const nextFile = event.dataTransfer.files?.[0] ?? null;
                  if (nextFile) void analyzeFile(nextFile);
                }}
                className={`flex min-h-[420px] w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition ${
                  dragActive
                    ? "border-[#7c5f3f] bg-[#fbf4ea]"
                    : "border-[#d6c8b8] bg-[#fdfaf6] hover:border-[#9c7a52] hover:bg-[#fbf4ea]"
                }`}
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4b3828] text-white shadow-sm">
                  {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                </div>
                <div className="text-xl font-black text-[#2b241d]">
                  {loading ? "Analyzing statement..." : "Drop bank statement here"}
                </div>
                <div className="mt-2 max-w-md text-sm font-medium leading-6 text-[#8a7f72]">
                  Click to upload or drag a PDF, image, CSV, or text file.
                </div>
                {file ? (
                  <div className="mt-5 rounded-full border border-[#e3d6c6] bg-white px-4 py-2 text-sm font-bold text-[#6f4e2f]">
                    {file.name}
                  </div>
                ) : null}
              </button>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[#e3d6c6] bg-white p-5 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Tally
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {selectedConnection?.status === "company_loaded" || selectedConnection?.status === "tally_reachable" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                      )}
                      <div className="text-sm font-black text-[#2b241d]">
                        {selectedConnection ? selectedConnection.displayName : "No connection selected"}
                      </div>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-[#8a7f72]">
                      {selectedConnection?.status?.replaceAll("_", " ") || "Select connection"}
                    </div>
                    {connections.length > 1 ? (
                      <select
                        value={tallyConnectionId}
                        onChange={(event) => setTallyConnectionId(event.target.value)}
                        className="mt-3 h-9 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                      >
                        <option value="">Select Tally connection</option>
                        {connections.map((connection) => (
                          <option key={connection.id} value={connection.id}>
                            {connection.displayName}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        Bank ledger
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncLedgerMasters}
                        disabled={!tallyConnectionId || syncingMasters}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#d8cbbb] bg-white px-2 text-[11px] font-bold text-[#6f4e2f] hover:bg-[#fbf7f1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {syncingMasters ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Sync
                      </button>
                    </div>
                    {bankLedgerName ? (
                      <div className="mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                        <div className="text-sm font-black text-[#2b241d]">{bankLedgerName}</div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <LedgerSearchSelect
                          onChange={applyTallyBankLedgerSelection}
                          options={bankLedgerOptions.map((ledger) => ledger.name)}
                          placeholder="Search bank ledger"
                          value={bankLedgerName}
                        />
                      </div>
                    )}
                    {bankLedgerName ? (
                      <button
                        type="button"
                        onClick={() => setBankLedgerName("")}
                        className="mt-2 text-xs font-bold text-[#6f4e2f] underline-offset-2 hover:underline"
                      >
                        Change
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Bank account
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <div className="text-sm font-black text-[#2b241d]">{accountMatchLabel}</div>
                    </div>
                    {preview.candidates.length > 1 ? (
                      <select
                        value={selectedAccountId || "new"}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedAccountId(value === "new" ? "" : value);
                          const candidate = preview.candidates.find((item) => item.id === value);
                          if (candidate) {
                            setAccount({
                              bankName: candidate.bankName || account.bankName,
                              accountNumber: candidate.accountNumber || account.accountNumber,
                              accountHolderName: candidate.accountHolderName || account.accountHolderName,
                              ifscCode: candidate.ifscCode || account.ifscCode,
                              tallyLedgerName: candidate.tallyLedgerName || account.tallyLedgerName,
                            });
                            if (candidate.tallyLedgerName) setBankLedgerName(candidate.tallyLedgerName);
                          }
                        }}
                        className="mt-3 h-9 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                      >
                        <option value="new">Use extracted account</option>
                        {preview.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.accountHolderName || "Saved account"} · {candidate.accountNumberMasked}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e3d6c6] bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-[#eee5da] px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#6f6256]">
                      Review statement
                    </h2>
                    <p className="mt-1 text-xs font-medium text-[#9a8d7f]">
                      Most rows are ready automatically. Only review rows marked Needs ledger.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-[#d6c8b8] bg-[#f6efe6] text-[#6f4e2f]" variant="outline">
                      {validTransactions.length} rows
                    </Badge>
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
                      {matchedLedgerCount} matched
                    </Badge>
                    {createLedgerCount > 0 ? (
                      <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">
                        {createLedgerCount} create new
                      </Badge>
                    ) : null}
                    <Badge
                      className={
                        missingLedgerCount === 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }
                      variant="outline"
                    >
                      {missingLedgerCount === 0 ? "Ready" : `${missingLedgerCount} need ledger`}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-[#eee5da] bg-[#fdfaf6] p-4 md:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Bank
                    </div>
                    <div className="mt-1 rounded-md border border-[#e3d6c6] bg-white px-3 py-2 text-sm font-bold text-[#2b241d]">
                      {account.bankName || "Not found"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Account
                    </div>
                    <div className="mt-1 rounded-md border border-[#e3d6c6] bg-white px-3 py-2 text-sm font-bold text-[#2b241d]">
                      {account.accountNumber || "Not found"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Holder
                    </div>
                    <div className="mt-1 rounded-md border border-[#e3d6c6] bg-white px-3 py-2 text-sm font-bold text-[#2b241d]">
                      {account.accountHolderName || "Not found"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      IFSC
                    </div>
                    <div className="mt-1 rounded-md border border-[#e3d6c6] bg-white px-3 py-2 text-sm font-bold text-[#2b241d]">
                      {account.ifscCode || "Not found"}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-[#eee5da]">
                  {transactions.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm font-semibold text-[#8a7f72]">
                      No rows were extracted. Upload another file or add rows after extraction support improves.
                    </div>
                  ) : (
                    transactions.map((transaction, index) => {
                      const debit = formatAmount(transaction.debitAmount);
                      const credit = formatAmount(transaction.creditAmount);
                      const choices = getLedgerChoices(transaction, ledgerMasters);

                      const isEditingLedger = editingLedgerIds.has(transaction.id);
                      const needsLedger = !transaction.selectedLedgerName.trim();
                      const actionTone = getLedgerActionTone(transaction);
                      const showLedgerSelect = needsLedger || isEditingLedger || transaction.ledgerAction === "needs_review";

                      return (
                        <div key={transaction.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[64px_1.8fr_150px_300px]">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0e7da] text-sm font-black text-[#6f4e2f]">
                            {index + 1}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-[#2b241d]">{transaction.transactionDate || "No date"}</span>
                              <span className="text-xs font-semibold text-[#8a7f72]">
                                {transaction.referenceNumber || transaction.transactionType || "No reference"}
                              </span>
                            </div>
                            <div className="mt-2 truncate text-sm font-bold text-[#2b241d]" title={transaction.description}>
                              {transaction.description || "No narration"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-[#8a7f72]">
                              {transaction.counterpartyName || transaction.category || "Counterparty not found"}
                            </div>
                          </div>

                          <div className="rounded-lg border border-[#eee5da] bg-[#fdfaf6] px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                              Amount
                            </div>
                            <div className="mt-1 text-sm font-black text-[#2b241d]">
                              {debit ? `Dr ${debit}` : credit ? `Cr ${credit}` : "0"}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div
                              className={`rounded-lg border px-3 py-2 ${
                                actionTone === "warning"
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-emerald-200 bg-emerald-50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                                    Tally ledger
                                  </div>
                                  <div className="mt-1 truncate text-sm font-black text-[#2b241d]">
                                    {transaction.selectedLedgerName ||
                                      transaction.suggestedLedgerName ||
                                      transaction.counterpartyName ||
                                      "Choose ledger"}
                                  </div>
                                </div>
                                <Badge
                                  className={
                                    actionTone === "warning"
                                      ? "border-amber-200 bg-white text-amber-800"
                                      : "border-emerald-200 bg-white text-emerald-800"
                                  }
                                  variant="outline"
                                >
                                  {getLedgerActionLabel(transaction)}
                                </Badge>
                              </div>
                              {transaction.ledgerAction === "create_new_ledger" && transaction.ledgerGroup ? (
                                <div className="mt-1 text-[11px] font-semibold text-[#8a7f72]">
                                  Group: {transaction.ledgerGroup}
                                </div>
                              ) : null}
                              {transaction.suggestionReason ? (
                                <div className="mt-1 text-[11px] font-medium text-[#8a7f72]">
                                  {transaction.suggestionReason}
                                </div>
                              ) : null}
                            </div>
                            {showLedgerSelect ? (
                              <LedgerSearchSelect
                                onChange={(value) => {
                                  updateTransaction(transaction.id, "selectedLedgerName", value);
                                  setEditingLedgerIds((current) => {
                                    const next = new Set(current);
                                    next.delete(transaction.id);
                                    return next;
                                  });
                                }}
                                options={choices}
                                placeholder="Search ledger"
                                value={transaction.selectedLedgerName}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingLedgerIds((current) => new Set(current).add(transaction.id))
                                }
                                className="text-left text-xs font-bold text-[#6f4e2f] underline-offset-2 hover:underline"
                              >
                                Change ledger
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-[#eee5da] bg-[#fbf7f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-[#7c6f62]">
                    {validTransactions.length} row(s) ready after review.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="border-[#d8cbbb] bg-white text-[#2b241d] hover:bg-[#f7efe5]"
                      onClick={() => {
                        setPreview(null);
                        setTransactions([]);
                        setFile(null);
                        setBanner(null);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Upload Another
                    </Button>
                    <Button
                      className="bg-[#4b3828] text-white hover:bg-[#38291d]"
                      onClick={sendToTally}
                      disabled={sending || validTransactions.length === 0}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Send To Tally
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
