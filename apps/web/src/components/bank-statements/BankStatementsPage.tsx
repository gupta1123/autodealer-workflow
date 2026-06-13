"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  FileUp,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";

type BankAccount = {
  id: string;
  bankName: string | null;
  accountNumberMasked: string;
  accountHolderName: string | null;
  ifscCode: string | null;
  tallyLedgerName: string | null;
  lastImportedTransactionAt: string | null;
  lastTallyPostedTransactionAt: string | null;
  createdAt: string;
  updatedAt: string;
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

type DraftAccount = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
};

type DraftTransaction = {
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
  confirmedLedgerName: string;
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
};

type PreviewResponse = {
  import: BankStatementImport;
  account: {
    bankName: string | null;
    accountNumber: string | null;
    accountNumberMasked: string;
    accountHolderName: string | null;
    ifscCode: string | null;
  };
  candidates: BankAccount[];
  transactions: PreviewTransaction[];
  requiresManualExtraction: boolean;
};

type TallyMaster = {
  key: string;
  name: string;
  type: string;
};

type QueueTransaction = {
  id: string;
  transactionDate: string;
  description: string;
  referenceNumber: string | null;
  debitAmount: string | number | null;
  creditAmount: string | number | null;
  category: string;
  counterpartyName: string | null;
  suggestedLedgerName: string | null;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  confirmedLedgerName: string | null;
  selectedLedgerName: string;
  saveMapping: boolean;
  needsLedgerConfirmation: boolean;
  createLedgerName: string;
  createLedgerParentName: string;
  creatingLedger: boolean;
};

const LEDGER_PARENT_OPTIONS = [
  "Indirect Expenses",
  "Indirect Incomes",
  "Duties & Taxes",
  "Sundry Creditors",
  "Sundry Debtors",
  "Current Assets",
  "Current Liabilities",
];

const EMPTY_ACCOUNT: DraftAccount = {
  bankName: "",
  accountNumber: "",
  accountHolderName: "",
  ifscCode: "",
};

function createEmptyTransaction(): DraftTransaction {
  return {
    id: crypto.randomUUID(),
    transactionDate: new Date().toISOString().slice(0, 10),
    valueDate: "",
    description: "",
    referenceNumber: "",
    debitAmount: "",
    creditAmount: "",
    balanceAmount: "",
    transactionType: "unknown",
    category: "unknown",
    counterpartyName: "",
    suggestedLedgerName: "",
    suggestionConfidence: null,
    suggestionReason: "",
    confirmedLedgerName: "",
  };
}

function normalizeDraftTransaction(transaction: PreviewTransaction): DraftTransaction {
  return {
    id: transaction.id || crypto.randomUUID(),
    transactionDate: transaction.transactionDate || "",
    valueDate: transaction.valueDate || "",
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
    suggestedLedgerName: transaction.suggestedLedgerName || "",
    suggestionConfidence: transaction.suggestionConfidence ?? null,
    suggestionReason: transaction.suggestionReason || "",
    confirmedLedgerName: transaction.confirmedLedgerName || "",
  };
}

function transactionIsValid(transaction: DraftTransaction) {
  return Boolean(transaction.transactionDate && transaction.description.trim());
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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

function defaultLedgerParent(transaction: Pick<QueueTransaction, "description" | "category">) {
  const text = `${transaction.category} ${transaction.description}`.toLowerCase();
  if (/\binterest\b/.test(text)) return "Indirect Incomes";
  if (/\bcharge|charges|fee\b/.test(text)) return "Indirect Expenses";
  if (/\btax|gst|tds\b/.test(text)) return "Duties & Taxes";
  return "Sundry Creditors";
}

function defaultCreateLedgerName(transaction: Pick<QueueTransaction, "suggestedLedgerName" | "counterpartyName" | "category">) {
  if (transaction.suggestedLedgerName?.trim()) return transaction.suggestedLedgerName.trim();
  if (transaction.counterpartyName?.trim()) return transaction.counterpartyName.trim();
  if (transaction.category === "bank_charges") return "Bank Charges";
  if (transaction.category === "receipt") return "Interest Income";
  return "";
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

export function BankStatementsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState<DraftAccount>(EMPTY_ACCOUNT);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [recentImports, setRecentImports] = useState<BankStatementImport[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [tallyConnectionId, setTallyConnectionId] = useState("");
  const [tallyAccountId, setTallyAccountId] = useState("");
  const [bankLedgerName, setBankLedgerName] = useState("");
  const [ledgerMasters, setLedgerMasters] = useState<TallyMaster[]>([]);
  const [queueTransactions, setQueueTransactions] = useState<QueueTransaction[]>([]);
  const [transactions, setTransactions] = useState<DraftTransaction[]>([createEmptyTransaction()]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [loadingQueueRows, setLoadingQueueRows] = useState(false);
  const [queueRowsRefreshKey, setQueueRowsRefreshKey] = useState(0);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(
    null
  );

  const validTransactions = useMemo(
    () => transactions.filter(transactionIsValid),
    [transactions]
  );
  const selectedAccount = useMemo(
    () => preview?.candidates.find((candidate) => candidate.id === selectedAccountId) ?? null,
    [preview?.candidates, selectedAccountId]
  );
  const unresolvedQueueRows = useMemo(
    () => queueTransactions.filter((transaction) => !(transaction.selectedLedgerName || "").trim()).length,
    [queueTransactions]
  );
  const createReadyRows = useMemo(
    () =>
      queueTransactions.filter((transaction) => {
        const name = transaction.createLedgerName || defaultCreateLedgerName(transaction);
        return !(transaction.selectedLedgerName || "").trim() && name.trim();
      }).length,
    [queueTransactions]
  );

  function ledgerExists(name?: string | null) {
    if (!name) return false;
    return ledgerMasters.some((ledger) => ledger.name === name);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [importsResponse, accountsResponse] = await Promise.all([
        apiFetch("/api/bank-statements/imports", { cache: "no-store" }),
        apiFetch("/api/bank-statements/accounts", { cache: "no-store" }),
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

      const connectionsResponse = await apiFetch("/api/tally/connections", { cache: "no-store" });
      if (!cancelled && connectionsResponse.ok) {
        const payload = (await connectionsResponse.json()) as { connections?: TallyConnection[] };
        const loadedConnections = payload.connections ?? [];
        setConnections(loadedConnections);
        setTallyConnectionId((current) => current || loadedConnections[0]?.id || "");
      }
    }

    loadSummary().catch(() => {
      if (!cancelled) {
        setBanner({ tone: "error", text: "Could not load bank statement summary." });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLedgers() {
      if (!tallyConnectionId) {
        setLedgerMasters([]);
        return;
      }

      const response = await apiFetch(
        `/api/tally/connections/${tallyConnectionId}/masters?type=ledger&limit=500`,
        { cache: "no-store" }
      );
      if (cancelled || !response.ok) return;
      const payload = (await response.json()) as { masters?: TallyMaster[] };
      setLedgerMasters(payload.masters ?? []);
    }

    loadLedgers().catch(() => {
      if (!cancelled) setLedgerMasters([]);
    });

    return () => {
      cancelled = true;
    };
  }, [tallyConnectionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadQueueRows() {
      if (!tallyAccountId) {
        setQueueTransactions([]);
        return;
      }

      setLoadingQueueRows(true);
      const params = new URLSearchParams({
        accountId: tallyAccountId,
        status: "queueable",
      });
      if (tallyConnectionId) params.set("connectionId", tallyConnectionId);

      const response = await apiFetch(`/api/bank-statements/transactions?${params.toString()}`, {
        cache: "no-store",
      });
      if (cancelled) return;

      if (!response.ok) {
        setQueueTransactions([]);
        setBanner({ tone: "error", text: `Could not load pending ledger matches. ${await readError(response)}` });
        return;
      }

      const payload = (await response.json()) as { transactions?: QueueTransaction[] };
      setQueueTransactions(
        (payload.transactions ?? []).map((transaction) => ({
          ...transaction,
          selectedLedgerName: transaction.confirmedLedgerName || transaction.suggestedLedgerName || "",
          saveMapping: true,
          createLedgerName:
            transaction.suggestedLedgerName ||
            transaction.counterpartyName ||
            (transaction.category === "bank_charges" ? "Bank Charges" : ""),
          createLedgerParentName: defaultLedgerParent(transaction),
          creatingLedger: false,
        }))
      );
    }

    loadQueueRows()
      .catch((error) => {
        if (!cancelled) {
          setQueueTransactions([]);
          setBanner({
            tone: "error",
            text:
              error instanceof Error
                ? `Could not load pending ledger matches. ${error.message}`
                : "Could not load pending ledger matches.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingQueueRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tallyAccountId, tallyConnectionId, queueRowsRefreshKey]);

  async function handlePreview() {
    if (!file) {
      setBanner({ tone: "error", text: "Select a bank statement file." });
      return;
    }

    try {
      setLoading(true);
      setBanner(null);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("account", JSON.stringify(account));

      const response = await apiFetch("/api/bank-statements/imports", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as PreviewResponse;
      setPreview(payload);
      setAccount({
        bankName: payload.account.bankName ?? account.bankName,
        accountNumber: payload.account.accountNumber ?? account.accountNumber,
        accountHolderName: payload.account.accountHolderName ?? account.accountHolderName,
        ifscCode: payload.account.ifscCode ?? account.ifscCode,
      });
      setSelectedAccountId(payload.candidates.length === 1 ? payload.candidates[0].id : null);
      setTransactions(
        payload.transactions.length
          ? payload.transactions.map(normalizeDraftTransaction)
          : [createEmptyTransaction()]
      );
      setBanner({
        tone: payload.requiresManualExtraction ? "info" : "success",
        text: payload.requiresManualExtraction
          ? "File stored. Add or verify transaction rows before confirming."
          : "Statement extracted. Review the account and transactions.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Bank statement preview failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  function updateTransaction(id: string, field: keyof DraftTransaction, value: string) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === id ? { ...transaction, [field]: value } : transaction
      )
    );
  }

  function removeTransaction(id: string) {
    setTransactions((current) =>
      current.length <= 1 ? [createEmptyTransaction()] : current.filter((item) => item.id !== id)
    );
  }

  async function handleCreateLedger(transaction: QueueTransaction) {
    if (!tallyConnectionId) {
      setBanner({ tone: "error", text: "Select a Tally connection before creating a ledger." });
      return;
    }
    const ledgerName = (transaction.createLedgerName || defaultCreateLedgerName(transaction)).trim();
    const parentName = (transaction.createLedgerParentName || defaultLedgerParent(transaction)).trim();

    if (!ledgerName || !parentName) {
      setBanner({ tone: "error", text: "Ledger name and parent group are required." });
      return;
    }

    try {
      setQueueTransactions((current) =>
        current.map((item) => (item.id === transaction.id ? { ...item, creatingLedger: true } : item))
      );
      const response = await apiFetch(`/api/tally/connections/${tallyConnectionId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandType: "create_ledger",
          payload: {
            name: ledgerName,
            parentName,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setBanner({
        tone: "success",
        text: `Ledger create queued for ${ledgerName}. After the bridge logs success, queue the voucher.`,
      });
      setLedgerMasters((current) =>
        current.some((ledger) => ledger.name === ledgerName)
          ? current
          : [
              ...current,
              {
                key: `pending:${ledgerName}`,
                name: ledgerName,
                type: "ledger",
              },
            ]
      );
      setQueueTransactions((current) =>
        current.map((item) =>
          item.id === transaction.id
            ? {
                ...item,
                createLedgerName: ledgerName,
                createLedgerParentName: parentName,
                selectedLedgerName: ledgerName,
              }
            : item
        )
      );
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not queue ledger creation.",
      });
    } finally {
      setQueueTransactions((current) =>
        current.map((item) => (item.id === transaction.id ? { ...item, creatingLedger: false } : item))
      );
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    if (preview.candidates.length > 1 && !selectedAccountId) {
      setBanner({ tone: "error", text: "Select the matching account before confirming." });
      return;
    }
    if (validTransactions.length === 0) {
      setBanner({ tone: "error", text: "Add at least one valid transaction." });
      return;
    }

    try {
      setConfirming(true);
      setBanner(null);

      const response = await apiFetch(`/api/bank-statements/imports/${preview.import.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          account,
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
            confirmedLedgerName: transaction.confirmedLedgerName || null,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as {
        account: BankAccount;
        import: BankStatementImport;
        importedTransactionCount: number;
        duplicateTransactionCount: number;
      };

      setAccounts((current) => {
        const remaining = current.filter((item) => item.id !== payload.account.id);
        return [payload.account, ...remaining];
      });
      setRecentImports((current) => [payload.import, ...current.filter((item) => item.id !== payload.import.id)]);
      setTallyAccountId(payload.account.id);
      setBankLedgerName(payload.account.tallyLedgerName || payload.account.bankName || bankLedgerName);
      setQueueTransactions([]);
      setQueueRowsRefreshKey((current) => current + 1);
      setPreview(null);
      setSelectedAccountId(null);
      setTransactions([createEmptyTransaction()]);
      setFile(null);
      setBanner({
        tone: "success",
        text: `${payload.importedTransactionCount} transactions imported, ${payload.duplicateTransactionCount} duplicates skipped.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not confirm bank statement.",
      });
    } finally {
      setConfirming(false);
    }
  }

  async function handleQueueTally() {
    if (preview) {
      setBanner({ tone: "error", text: "Confirm the bank statement import before queueing vouchers to Tally." });
      return;
    }
    if (!tallyConnectionId || !tallyAccountId) {
      setBanner({ tone: "error", text: "Select a Tally connection and bank account." });
      return;
    }
    if (!bankLedgerName.trim()) {
      setBanner({ tone: "error", text: "Enter the Tally bank ledger name." });
      return;
    }
    if (queueTransactions.length === 0) {
      setBanner({ tone: "error", text: "No pending or failed transactions are available for this account." });
      return;
    }
    const unresolvedRows = queueTransactions.filter((transaction) => !transaction.selectedLedgerName.trim());
    if (unresolvedRows.length > 0) {
      setBanner({ tone: "error", text: "Select a counterparty ledger for every queued transaction." });
      return;
    }

    try {
      setQueueing(true);
      setBanner(null);
      const response = await apiFetch("/api/bank-statements/tally/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: tallyConnectionId,
          accountId: tallyAccountId,
          transactionIds: queueTransactions.map((transaction) => transaction.id),
          bankLedgerName,
          transactions: queueTransactions.map((transaction) => ({
            transactionId: transaction.id,
            counterpartyLedgerName: transaction.selectedLedgerName,
            saveMapping: transaction.saveMapping,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { queuedCount?: number };
      setBanner({
        tone: "success",
        text: `${payload.queuedCount ?? 0} bank voucher commands queued for the Tally bridge.`,
      });
      setQueueTransactions([]);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not queue Tally vouchers.",
      });
    } finally {
      setQueueing(false);
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
                Import account transactions, resolve account matches, and queue confirmed rows for Tally posting.
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

          <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <div className="rounded-2xl border border-[#e3d6c6] bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#6f6256]">
                    Upload
                  </h2>
                  <p className="mt-1 text-xs font-medium text-[#9a8d7f]">
                    CSV/text parses rows automatically. PDF/image files are stored for review.
                  </p>
                </div>
                <FileUp className="h-5 w-5 text-[#8a7f72]" />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.pdf,image/*"
                className="hidden"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#d6c8b8] bg-[#fdfaf6] px-4 py-6 text-center transition hover:border-[#9c7a52] hover:bg-[#fbf4ea]"
              >
                <Banknote className="mb-2 h-7 w-7 text-[#7c5f3f]" />
                <span className="text-sm font-bold text-[#2b241d]">
                  {file ? file.name : "Select statement file"}
                </span>
                <span className="mt-1 text-xs font-medium text-[#8a7f72]">
                  PDF, image, CSV, or text
                </span>
              </button>

              <div className="mt-5 space-y-3">
                <Input
                  value={account.bankName}
                  onChange={(event) => setAccount((current) => ({ ...current, bankName: event.target.value }))}
                  placeholder="Bank name"
                />
                <Input
                  value={account.accountNumber}
                  onChange={(event) =>
                    setAccount((current) => ({ ...current, accountNumber: event.target.value }))
                  }
                  placeholder="Account number"
                />
                <Input
                  value={account.accountHolderName}
                  onChange={(event) =>
                    setAccount((current) => ({ ...current, accountHolderName: event.target.value }))
                  }
                  placeholder="Account holder name"
                />
                <Input
                  value={account.ifscCode}
                  onChange={(event) =>
                    setAccount((current) => ({ ...current, ifscCode: event.target.value.toUpperCase() }))
                  }
                  placeholder="IFSC code"
                />
              </div>

              <Button
                className="mt-5 w-full bg-[#4b3828] text-white hover:bg-[#38291d]"
                onClick={handlePreview}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Preview Import
              </Button>
            </div>

            <div className="rounded-2xl border border-[#e3d6c6] bg-white shadow-sm">
              <div className="border-b border-[#eee5da] px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#6f6256]">
                      Review
                    </h2>
                    <p className="mt-1 text-xs font-medium text-[#9a8d7f]">
                      Confirmed transactions are stored locally and marked pending for Tally.
                    </p>
                  </div>
                  {preview && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-[#d6c8b8] bg-[#f6efe6] text-[#6f4e2f]" variant="outline">
                        {preview.import.status.replaceAll("_", " ")}
                      </Badge>
                      <Button
                        className="bg-[#4b3828] text-white hover:bg-[#38291d]"
                        size="sm"
                        onClick={handleConfirm}
                        disabled={confirming}
                      >
                        {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Confirm Import
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {!preview ? (
                <div className="flex min-h-[440px] flex-col items-center justify-center px-6 text-center">
                  <Landmark className="mb-3 h-10 w-10 text-[#d6c8b8]" />
                  <div className="text-sm font-bold text-[#3b332b]">No statement in review</div>
                  <div className="mt-1 max-w-sm text-xs font-medium text-[#8a7f72]">
                    Upload a file to review account matching and transaction rows.
                  </div>
                </div>
              ) : (
                <div className="space-y-5 p-5">
                  <div className="grid gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        Bank
                      </div>
                      <div className="mt-1 text-sm font-black">{account.bankName || "Not set"}</div>
                    </div>
                    <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        Account
                      </div>
                      <div className="mt-1 text-sm font-black">
                        {preview.account.accountNumberMasked || account.accountNumber || "Not set"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        Holder
                      </div>
                      <div className="mt-1 text-sm font-black">{account.accountHolderName || "Not set"}</div>
                    </div>
                    <div className="rounded-xl border border-[#eee5da] bg-[#fdfaf6] p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        IFSC
                      </div>
                      <div className="mt-1 text-sm font-black">{account.ifscCode || "Not set"}</div>
                    </div>
                  </div>

                  {preview.candidates.length > 1 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-900">
                        <AlertTriangle className="h-4 w-4" />
                        Multiple matching accounts
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {preview.candidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => setSelectedAccountId(candidate.id)}
                            className={`rounded-xl border p-3 text-left transition ${
                              selectedAccountId === candidate.id
                                ? "border-[#5f452d] bg-white shadow-sm"
                                : "border-amber-200 bg-[#fffaf0] hover:border-[#9c7a52]"
                            }`}
                          >
                            <div className="text-sm font-black text-[#2b241d]">
                              {candidate.accountHolderName || "Unnamed account"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-[#7c6f62]">
                              {candidate.bankName || "Bank"} · {candidate.accountNumberMasked}
                            </div>
                            <div className="mt-2 text-[11px] font-semibold text-[#9a8d7f]">
                              Last import: {formatDate(candidate.lastImportedTransactionAt)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.candidates.length === 1 && selectedAccount && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      Matched existing account: {selectedAccount.accountHolderName || "Unnamed account"} ·{" "}
                      {selectedAccount.accountNumberMasked}
                    </div>
                  )}

                  {preview.candidates.length === 0 && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                      New bank account will be created after confirmation. Enter the account number on the left first.
                    </div>
                  )}

                  <div className="overflow-hidden rounded-xl border border-[#eee5da]">
                    <div className="flex items-center justify-between border-b border-[#eee5da] bg-[#fbf7f1] px-4 py-3">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#6f6256]">
                        Transactions
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTransactions((current) => [...current, createEmptyTransaction()])}
                      >
                        <Plus className="h-4 w-4" />
                        Row
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-36">Date</TableHead>
                            <TableHead className="min-w-56">Description</TableHead>
                            <TableHead className="min-w-32">Reference</TableHead>
                            <TableHead className="min-w-28">Debit</TableHead>
                            <TableHead className="min-w-28">Credit</TableHead>
                            <TableHead className="min-w-28">Balance</TableHead>
                            <TableHead className="min-w-32">Type</TableHead>
                            <TableHead className="min-w-32">Category</TableHead>
                            <TableHead className="min-w-40">Counterparty</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell>
                                <Input
                                  type="date"
                                  value={transaction.transactionDate}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "transactionDate", event.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={transaction.description}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "description", event.target.value)
                                  }
                                  placeholder="Narration"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={transaction.referenceNumber}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "referenceNumber", event.target.value)
                                  }
                                  placeholder="UTR / ref"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  value={transaction.debitAmount}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "debitAmount", event.target.value)
                                  }
                                  placeholder="0.00"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  value={transaction.creditAmount}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "creditAmount", event.target.value)
                                  }
                                  placeholder="0.00"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  value={transaction.balanceAmount}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "balanceAmount", event.target.value)
                                  }
                                  placeholder="0.00"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={transaction.transactionType}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "transactionType", event.target.value)
                                  }
                                  placeholder="neft"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={transaction.category}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "category", event.target.value)
                                  }
                                  placeholder="payment"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={transaction.counterpartyName}
                                  onChange={(event) =>
                                    updateTransaction(transaction.id, "counterpartyName", event.target.value)
                                  }
                                  placeholder="Detected party"
                                />
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => removeTransaction(transaction.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-[#9a8d7f] hover:bg-rose-50 hover:text-rose-700"
                                  aria-label="Remove transaction"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[#eee5da] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold text-[#7c6f62]">
                      {validTransactions.length} valid rows ready for import
                    </div>
                    <Button
                      className="bg-[#4b3828] text-white hover:bg-[#38291d]"
                      onClick={handleConfirm}
                      disabled={confirming}
                    >
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Confirm Import
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div className="rounded-2xl border border-[#e3d6c6] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#6f6256]">
                    Bank Accounts
                  </h2>
                  <p className="mt-1 text-xs font-medium text-[#9a8d7f]">
                    Latest import and Tally posting timestamps stay separate.
                  </p>
                </div>
                <Landmark className="h-5 w-5 text-[#8a7f72]" />
              </div>
              <div className="overflow-hidden rounded-xl border border-[#eee5da]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Last Import</TableHead>
                      <TableHead>Last Tally Post</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm font-medium text-[#8a7f72]">
                          No bank accounts yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      accounts.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-bold">{item.accountHolderName || "Unnamed account"}</div>
                            <div className="text-xs font-medium text-[#8a7f72]">{item.accountNumberMasked}</div>
                          </TableCell>
                          <TableCell>{item.bankName || "Not set"}</TableCell>
                          <TableCell>{formatDate(item.lastImportedTransactionAt)}</TableCell>
                          <TableCell>{formatDate(item.lastTallyPostedTransactionAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dfd0bd] bg-white shadow-sm">
              <div className="border-b border-[#eee5da] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#5f4d3d]">
                      Queue To Tally
                    </h2>
                    <p className="mt-1 text-xs font-medium leading-5 text-[#8a7f72]">
                      Confirm ledgers first; only matched rows are posted.
                    </p>
                  </div>
                  <Badge className="border-[#d6c8b8] bg-[#fbf7f1] text-[#6f4e2f]" variant="outline">
                    {queueTransactions.length ? `${queueTransactions.length - unresolvedQueueRows}/${queueTransactions.length} ready` : "No rows"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Tally connection
                    </span>
                    <select
                      value={tallyConnectionId}
                      onChange={(event) => setTallyConnectionId(event.target.value)}
                      className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                    >
                      <option value="">Select Tally connection</option>
                      {connections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.displayName} · {connection.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Imported bank account
                    </span>
                    <select
                      value={tallyAccountId}
                      onChange={(event) => {
                        const nextAccount = accounts.find((item) => item.id === event.target.value);
                        setTallyAccountId(event.target.value);
                        setBankLedgerName(nextAccount?.tallyLedgerName || nextAccount?.bankName || bankLedgerName);
                      }}
                      className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                    >
                      <option value="">Select bank account</option>
                      {accounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.accountHolderName || "Unnamed account"} · {item.accountNumberMasked}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Tally bank ledger
                    </span>
                    <Input
                      value={bankLedgerName}
                      onChange={(event) => setBankLedgerName(event.target.value)}
                      placeholder="Tally bank ledger name"
                      list="bank-ledger-options"
                    />
                  </label>
                  <datalist id="bank-ledger-options">
                    {ledgerMasters.map((ledger) => (
                      <option key={ledger.key} value={ledger.name} />
                    ))}
                  </datalist>
                </div>

                {queueTransactions.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#eee5da] bg-[#fbf7f1] p-2 text-center">
                    <div>
                      <div className="text-lg font-black text-[#2b241d]">{queueTransactions.length}</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a8d7f]">Rows</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-emerald-700">
                        {queueTransactions.length - unresolvedQueueRows}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a8d7f]">Matched</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-amber-700">{createReadyRows}</div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a8d7f]">Can create</div>
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-xl border border-[#eee5da]">
                  <div className="flex items-center justify-between border-b border-[#eee5da] bg-[#fbf7f1] px-4 py-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-[#6f6256]">
                        Ledger Matches
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[#9a8d7f]">
                        Pick an existing ledger or create the suggested one.
                      </div>
                    </div>
                    <Badge className="border-[#d6c8b8] bg-white text-[#6f4e2f]" variant="outline">
                      {loadingQueueRows ? "Loading" : `${queueTransactions.length} rows`}
                    </Badge>
                  </div>

                  <div className="max-h-[540px] space-y-3 overflow-auto bg-[#fffdf9] p-3">
                    {queueTransactions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#d6c8b8] px-4 py-8 text-center text-sm font-semibold text-[#8a7f72]">
                        {loadingQueueRows
                          ? "Loading pending transactions..."
                          : tallyAccountId
                            ? "No pending or failed transactions loaded for this account."
                            : "Select an account with pending transactions."}
                      </div>
                    ) : (
                      queueTransactions.map((transaction, index) => {
                        const suggestedName = defaultCreateLedgerName(transaction);
                        const suggestedExists = ledgerExists(transaction.suggestedLedgerName);
                        const selectedLedger = transaction.selectedLedgerName || "";
                        const debit = formatAmount(transaction.debitAmount);
                        const credit = formatAmount(transaction.creditAmount);

                        return (
                          <div
                            key={transaction.id}
                            className={`rounded-lg border p-3 shadow-sm ${
                              selectedLedger
                                ? "border-emerald-200 bg-emerald-50/50"
                                : "border-amber-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-[#f0e7da] px-2 py-1 text-[11px] font-black text-[#6f4e2f]">
                                    {index + 1}
                                  </span>
                                  <span className="text-xs font-bold text-[#7c6f62]">
                                    {formatDate(transaction.transactionDate)}
                                  </span>
                                  {(debit || credit) && (
                                    <span className="text-xs font-black text-[#2b241d]">
                                      {debit ? `Dr ${debit}` : `Cr ${credit}`}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 text-sm font-black leading-5 text-[#2b241d]">
                                  {transaction.description}
                                </div>
                                <div className="mt-1 text-xs font-semibold text-[#8a7f72]">
                                  {transaction.counterpartyName || transaction.category}
                                </div>
                              </div>
                              {selectedLedger ? (
                                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
                              ) : (
                                <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
                              )}
                            </div>

                            <div className="mt-3 rounded-md border border-[#eee5da] bg-white px-3 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                                    Suggested
                                  </div>
                                  <div className="mt-1 text-sm font-bold text-[#2b241d]">
                                    {transaction.suggestedLedgerName || suggestedName || "Needs selection"}
                                  </div>
                                </div>
                                <Badge
                                  className={
                                    suggestedExists
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }
                                  variant="outline"
                                >
                                  {suggestedExists ? "Exists" : "Missing"}
                                </Badge>
                              </div>
                              <div className="mt-1 text-[11px] font-medium text-[#8a7f72]">
                                {transaction.suggestionReason ||
                                  (transaction.needsLedgerConfirmation ? "Confirm before queueing" : "Ready")}
                              </div>
                            </div>

                            <label className="mt-3 block space-y-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                                Existing ledger
                              </span>
                              <select
                                value={selectedLedger}
                                onChange={(event) =>
                                  setQueueTransactions((current) =>
                                    current.map((item) =>
                                      item.id === transaction.id
                                        ? { ...item, selectedLedgerName: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                              >
                                <option value="">Select existing ledger</option>
                                {transaction.suggestedLedgerName && suggestedExists && (
                                  <option value={transaction.suggestedLedgerName}>
                                    {transaction.suggestedLedgerName}
                                  </option>
                                )}
                                {ledgerMasters
                                  .filter((ledger) => ledger.name !== transaction.suggestedLedgerName)
                                  .map((ledger) => (
                                    <option key={ledger.key} value={ledger.name}>
                                      {ledger.name}
                                    </option>
                                  ))}
                              </select>
                            </label>

                            {!selectedLedger && (
                              <div className="mt-3 rounded-md border border-[#ead8bd] bg-[#fff8ed] p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a6b2f]">
                                      Create suggested ledger
                                    </div>
                                    <div className="mt-1 text-sm font-black text-[#2b241d]">
                                      {transaction.createLedgerName || suggestedName || "No name suggested"}
                                    </div>
                                    <div className="mt-1 text-[11px] font-semibold text-[#8a7f72]">
                                      Parent: {transaction.createLedgerParentName || defaultLedgerParent(transaction)}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCreateLedger(transaction)}
                                    disabled={transaction.creatingLedger || !suggestedName}
                                  >
                                    {transaction.creatingLedger ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                    Create
                                  </Button>
                                </div>

                                <details className="mt-3">
                                  <summary className="cursor-pointer text-xs font-bold text-[#7c5f3f]">
                                    Change name or group
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    <Input
                                      value={transaction.createLedgerName || ""}
                                      onChange={(event) =>
                                        setQueueTransactions((current) =>
                                          current.map((item) =>
                                            item.id === transaction.id
                                              ? { ...item, createLedgerName: event.target.value }
                                              : item
                                          )
                                        )
                                      }
                                      placeholder={suggestedName || "New ledger name"}
                                    />
                                    <select
                                      value={transaction.createLedgerParentName || defaultLedgerParent(transaction)}
                                      onChange={(event) =>
                                        setQueueTransactions((current) =>
                                          current.map((item) =>
                                            item.id === transaction.id
                                              ? { ...item, createLedgerParentName: event.target.value }
                                              : item
                                          )
                                        )
                                      }
                                      className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                                    >
                                      {LEDGER_PARENT_OPTIONS.map((parentName) => (
                                        <option key={parentName} value={parentName}>
                                          {parentName}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </details>
                              </div>
                            )}

                            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#7c6f62]">
                              <input
                                type="checkbox"
                                checked={transaction.saveMapping}
                                onChange={(event) =>
                                  setQueueTransactions((current) =>
                                    current.map((item) =>
                                      item.id === transaction.id
                                        ? { ...item, saveMapping: event.target.checked }
                                        : item
                                    )
                                  )
                                }
                                className="h-4 w-4 accent-[#4b3828]"
                              />
                              Save this narration-to-ledger mapping
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <Button
                  className="w-full bg-[#4b3828] text-white hover:bg-[#38291d]"
                  onClick={handleQueueTally}
                  disabled={queueing || queueTransactions.length === 0}
                >
                  {queueing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Queue Pending Vouchers
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
