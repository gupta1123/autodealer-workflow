import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { normalizeName } from "@/lib/bank-statements";
import {
  buildBankAccountLedgerSourceKey,
  buildBankNarrationLedgerSourceKey,
  buildLedgerMappingTarget,
  suggestBankLedgerForTransaction,
} from "@/lib/bank-statement-ledger-matching";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NON_PARTY_TALLY_FALLBACK_LEDGER = "Suspense";

type QueuePayload = {
  connectionId?: string;
  transactionIds?: string[];
  accountId?: string;
  bankLedgerName?: string;
  counterpartyLedgerName?: string;
  transactions?: Array<{
    transactionId?: string;
    counterpartyLedgerName?: string;
    createLedgerName?: string;
    createLedgerParentName?: string;
    saveMapping?: boolean;
  }>;
};

type BankTransactionRow = {
  id: string;
  bank_account_id: string;
  statement_import_id: string | null;
  transaction_date: string;
  value_date: string | null;
  description: string;
  reference_number: string | null;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  balance_amount: number | string | null;
  transaction_type: string;
  category: string;
  counterparty_name: string | null;
  suggested_ledger_name: string | null;
  suggestion_confidence: number | string | null;
  confirmed_ledger_name: string | null;
  fingerprint: string;
};

type BankAccountRow = {
  id: string;
  bank_name: string | null;
  account_number_masked: string;
  account_holder_name: string | null;
  tally_ledger_name: string | null;
};

type BankStatementImportRow = {
  id: string;
  extracted_bank_name: string | null;
};

type PostingLogRow = {
  fingerprint: string;
  status: string;
  command_id: string | null;
};

type ExistingCommandRow = {
  id: string;
  status: string;
};

type TransactionStatusSummaryRow = {
  tally_status: string;
};

type TallyLedgerRow = {
  tally_name: string;
  parent_name: string | null;
};

type MappingRow = {
  connection_id: string;
  owner_user_id: string;
  mapping_type: string;
  source_key: string;
  source_label: string;
  target_master_type: string;
  target_master_key: string;
  target_master_name: string;
  status: string;
  notes: string;
};

type TransactionLedgerSelection = {
  counterpartyLedgerName: string;
  createLedgerName: string;
  createLedgerParentName: string;
};

type TallyCommandInsert = {
  connection_id: string;
  owner_user_id: string;
  command_type: "create_ledger" | "post_bank_voucher";
  status: "queued";
  priority: number;
  payload: Record<string, unknown>;
};

function toText(value: unknown, maxLength = 500) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSuspenseLedger(value?: string | null) {
  const normalized = normalizeName(value);
  return normalized === "suspense" || normalized === "suspenseac" || normalized === "suspenseaccount";
}

function isValidTransactionDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

function getVoucherType(transaction: BankTransactionRow) {
  const debit = toNumber(transaction.debit_amount);
  const credit = toNumber(transaction.credit_amount);
  if (debit > 0 && credit <= 0) return "Payment";
  if (credit > 0 && debit <= 0) return "Receipt";
  return "Contra";
}

function getTransactionAmount(transaction: BankTransactionRow) {
  return Math.max(toNumber(transaction.debit_amount), toNumber(transaction.credit_amount));
}

function bankEntryIsDebit(transaction: BankTransactionRow) {
  return toNumber(transaction.credit_amount) > 0 && toNumber(transaction.debit_amount) <= 0;
}

function getVoucherReferencePrefix(transaction: BankTransactionRow) {
  const text = `${transaction.transaction_type} ${transaction.category} ${transaction.description}`.toLowerCase();
  if (/\bcharge|charges|fee|gst\b/.test(text)) return "CHG";
  if (/\binterest\b/.test(text)) return "INT";
  if (/\bupi\b/.test(text)) return "UPI";
  if (/\brtgs\b/.test(text)) return "RTGS";
  if (/\bneft\b/.test(text)) return "NEFT";
  if (/\bimps\b/.test(text)) return "IMPS";
  if (toNumber(transaction.credit_amount) > 0 && toNumber(transaction.debit_amount) <= 0) return "RCT";
  if (toNumber(transaction.debit_amount) > 0 && toNumber(transaction.credit_amount) <= 0) return "PMT";
  return "BNK";
}

function getVoucherReferenceBankCode(value?: string | null) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!normalized) return "BNK";
  if (normalized.includes("HDFC")) return "HDFC";
  if (normalized.includes("ICICI")) return "ICICI";
  if (normalized.includes("SBI")) return "SBI";
  if (normalized.includes("AXIS")) return "AXIS";
  return normalized.slice(0, 6);
}

function buildVoucherReference(transaction: BankTransactionRow, bankCode: string) {
  const hashNumber = Number.parseInt(transaction.fingerprint.slice(0, 8), 16);
  const suffix = Number.isFinite(hashNumber)
    ? String(hashNumber % 10_000).padStart(4, "0")
    : transaction.id.replace(/[^0-9]/g, "").slice(0, 4).padStart(4, "0");
  return `${getVoucherReferencePrefix(transaction)}-${bankCode}-${suffix}`;
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as QueuePayload;
    const submittedConnectionId = toText(body.connectionId, 80);
    const requestedTransactionIds = Array.isArray(body.transactionIds)
      ? body.transactionIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const ledgerSelectionByTransactionId = new Map<string, TransactionLedgerSelection>(
      (Array.isArray(body.transactions) ? body.transactions : []).flatMap((transaction) => {
        const transactionId = toText(transaction?.transactionId, 80);
        const counterpartyLedgerName = toText(transaction?.counterpartyLedgerName, 500);
        const createLedgerName = toText(transaction?.createLedgerName, 500);
        const createLedgerParentName = toText(transaction?.createLedgerParentName, 240);
        if (!transactionId || (!counterpartyLedgerName && !createLedgerName)) return [];

        return [
          [
            transactionId,
            {
              counterpartyLedgerName,
              createLedgerName,
              createLedgerParentName,
            },
          ] as const,
        ];
      })
    );
    const saveMappingTransactionIds = new Set(
      (Array.isArray(body.transactions) ? body.transactions : []).flatMap((transaction) => {
        const transactionId = toText(transaction?.transactionId, 80);
        return transactionId && transaction?.saveMapping !== false ? [transactionId] : [];
      })
    );
    const accountId = toText(body.accountId, 80);

    if (!submittedConnectionId) {
      return jsonWithCors(request, { error: "Tally connection is required." }, { status: 400 });
    }
    if (!accountId && requestedTransactionIds.length === 0) {
      return jsonWithCors(
        request,
        { error: "Provide an account or at least one transaction to queue." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: submittedConnection, error: submittedConnectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id, last_company_name")
      .eq("id", submittedConnectionId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (submittedConnectionError) throw submittedConnectionError;
    if (!submittedConnection) {
      return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    }

    const liveHeartbeatCutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: liveConnection, error: liveConnectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id, last_company_name")
      .eq("owner_user_id", user.id)
      .in("status", ["company_loaded", "tally_reachable", "bridge_connected"])
      .eq("last_tally_reachable", true)
      .gte("last_heartbeat_at", liveHeartbeatCutoff)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (liveConnectionError) throw liveConnectionError;
    if (!liveConnection) {
      return jsonWithCors(
        request,
        { error: "No active Tally bridge connection found. Refresh the connection and try again." },
        { status: 400 }
      );
    }

    const connection = liveConnection;
    const connectionId = connection.id;

    let query = supabase
      .from("bank_transactions")
      .select("*")
      .eq("owner_user_id", user.id)
      .in("tally_status", ["pending", "failed"])
      .order("transaction_date", { ascending: true })
      .limit(100);

    if (requestedTransactionIds.length) {
      query = query.in("id", requestedTransactionIds);
    } else {
      query = query.eq("bank_account_id", accountId);
    }

    const { data: transactionRows, error: transactionError } = await query;
    if (transactionError) throw transactionError;

    const transactions = (transactionRows ?? []) as unknown as BankTransactionRow[];
    if (transactions.length === 0) {
      let summaryQuery = supabase
        .from("bank_transactions")
        .select("tally_status")
        .eq("owner_user_id", user.id);

      if (requestedTransactionIds.length) {
        summaryQuery = summaryQuery.in("id", requestedTransactionIds);
      } else {
        summaryQuery = summaryQuery.eq("bank_account_id", accountId);
      }

      const { data: summaryRows, error: summaryError } = await summaryQuery;
      if (summaryError) throw summaryError;

      const statusCounts = ((summaryRows ?? []) as unknown as TransactionStatusSummaryRow[]).reduce(
        (counts, row) => {
          const status = row.tally_status || "unknown";
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );

      return jsonWithCors(
        request,
        {
          error:
            (summaryRows ?? []).length === 0
              ? "No transactions were found for the selected bank account."
              : "No pending or failed transactions were found to queue.",
          queuedCount: 0,
          commands: [],
          diagnostics: {
            selectedAccountId: accountId || null,
            requestedTransactionCount: requestedTransactionIds.length,
            transactionCount: (summaryRows ?? []).length,
            statusCounts,
          },
        },
        { status: 400 }
      );
    }

    const accountIds = Array.from(new Set(transactions.map((transaction) => transaction.bank_account_id)));
    const { data: accountRows, error: accountError } = await supabase
      .from("bank_accounts")
      .select("id, bank_name, account_number_masked, account_holder_name, tally_ledger_name")
      .eq("owner_user_id", user.id)
      .in("id", accountIds);

    if (accountError) throw accountError;
    const accountsById = new Map(
      ((accountRows ?? []) as unknown as BankAccountRow[]).map((account) => [account.id, account])
    );
    const importIds = Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.statement_import_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );
    const { data: importRows, error: importRowsError } = importIds.length
      ? await supabase
          .from("bank_statement_imports")
          .select("id, extracted_bank_name")
          .eq("owner_user_id", user.id)
          .in("id", importIds)
      : { data: [], error: null };

    if (importRowsError) throw importRowsError;

    const importsById = new Map(
      ((importRows ?? []) as unknown as BankStatementImportRow[]).map((importRow) => [
        importRow.id,
        importRow,
      ])
    );

    const fingerprints = transactions.map((transaction) => transaction.fingerprint);
    const { data: postingLogRows, error: postingLogError } = await supabase
      .from("bank_transaction_posting_log")
      .select("fingerprint, status, command_id")
      .eq("owner_user_id", user.id)
      .in("bank_account_id", accountIds)
      .in("fingerprint", fingerprints)
      .in("status", ["queued", "posted"]);

    if (postingLogError) throw postingLogError;

    const postingLogs = (postingLogRows ?? []) as unknown as PostingLogRow[];
    const queuedCommandIds = postingLogs
      .filter((row) => row.status === "queued" && row.command_id)
      .map((row) => row.command_id as string);
    const { data: existingCommandRows, error: existingCommandError } = queuedCommandIds.length
      ? await supabase
          .from("tally_bridge_commands")
          .select("id, status")
          .in("id", queuedCommandIds)
      : { data: [], error: null };

    if (existingCommandError) throw existingCommandError;

    const activeCommandIds = new Set(
      ((existingCommandRows ?? []) as unknown as ExistingCommandRow[])
        .filter((row) => row.status === "queued" || row.status === "claimed")
        .map((row) => row.id)
    );
    const blockedFingerprints = new Set(
      postingLogs
        .filter((row) => row.status === "posted" || (row.command_id && activeCommandIds.has(row.command_id)))
        .map((row) => row.fingerprint)
    );

    const skipped = {
      alreadyPostedOrActive: 0,
      missingAccount: 0,
      missingBankLedger: 0,
      missingCounterpartyLedger: 0,
      ledgerNotSynced: 0,
      bankLedgerNotSynced: 0,
      counterpartyLedgerNotSynced: 0,
      invalidDate: 0,
      invalidAmount: 0,
    };

    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("tally_masters")
      .select("tally_name, parent_name")
      .eq("owner_user_id", user.id)
      .eq("connection_id", connectionId)
      .eq("master_type", "ledger")
      .eq("is_active", true)
      .limit(5000);

    if (ledgerError) throw ledgerError;

    const syncedLedgerNames = new Set(
      ((ledgerRows ?? []) as unknown as TallyLedgerRow[]).map((ledger) => normalizeName(ledger.tally_name))
    );
    const ledgerParentByName = new Map(
      ((ledgerRows ?? []) as unknown as TallyLedgerRow[]).map((ledger) => [
        normalizeName(ledger.tally_name),
        ledger.parent_name ?? "",
      ])
    );

    function ledgerExists(ledgerName: string) {
      return syncedLedgerNames.has(normalizeName(ledgerName));
    }

    function isPartyParent(parentName: string) {
      const parent = normalizeName(parentName);
      return parent.includes("sundry debtor") || parent.includes("sundry creditor");
    }

    function isPartyLedger(ledgerName: string) {
      return isPartyParent(ledgerParentByName.get(normalizeName(ledgerName)) || "");
    }

    const commandInputs = await Promise.all(
      transactions.map(async (transaction) => {
        const suggestion = await suggestBankLedgerForTransaction({
          supabase,
          ownerUserId: user.id,
          connectionId,
          accountId: transaction.bank_account_id,
          transaction: {
            description: transaction.description,
            category: transaction.category,
            counterpartyName: transaction.counterparty_name,
          },
        });
        const selectedLedger = ledgerSelectionByTransactionId.get(transaction.id);
        const createLedgerName = selectedLedger?.createLedgerName || "";
        const legacyFallback = requestedTransactionIds.length === 1 ? toText(body.counterpartyLedgerName, 500) : "";
        const strongSuggestedLedger =
          suggestion.ledgerName && !isSuspenseLedger(suggestion.ledgerName) && suggestion.confidence >= 0.85
            ? suggestion.ledgerName
            : "";
        const confirmedLedgerName =
          transaction.confirmed_ledger_name && !(isSuspenseLedger(transaction.confirmed_ledger_name) && strongSuggestedLedger)
            ? transaction.confirmed_ledger_name
            : "";
        const storedSuggestedLedgerName =
          transaction.suggested_ledger_name && !(isSuspenseLedger(transaction.suggested_ledger_name) && strongSuggestedLedger)
            ? transaction.suggested_ledger_name
            : "";
        const counterpartyLedgerName =
          createLedgerName ||
          selectedLedger?.counterpartyLedgerName ||
          confirmedLedgerName ||
          strongSuggestedLedger ||
          (Number(transaction.suggestion_confidence ?? 0) >= 0.85 ? storedSuggestedLedgerName : "") ||
          legacyFallback;

        return {
          transaction,
          suggestion,
          counterpartyLedgerName,
          createLedgerName,
          createLedgerParentName: selectedLedger?.createLedgerParentName || "Sundry Creditors",
        };
      })
    );

    const queuedCreateLedgerKeys = new Set<string>();
    const commands: TallyCommandInsert[] = commandInputs.flatMap(
      ({ transaction, suggestion, counterpartyLedgerName, createLedgerName, createLedgerParentName }) => {
        if (blockedFingerprints.has(transaction.fingerprint)) {
          skipped.alreadyPostedOrActive += 1;
          return [];
        }
        const account = accountsById.get(transaction.bank_account_id);
        const amount = getTransactionAmount(transaction);
        const bankLedgerName = toText(body.bankLedgerName, 500) || account?.tally_ledger_name || "";
        if (!account) {
          skipped.missingAccount += 1;
          return [];
        }
        if (!isValidTransactionDate(transaction.transaction_date)) {
          skipped.invalidDate = (skipped.invalidDate ?? 0) + 1;
          return [];
        }
        if (!bankLedgerName) {
          skipped.missingBankLedger += 1;
          return [];
        }
        if (!counterpartyLedgerName) {
          skipped.missingCounterpartyLedger += 1;
          return [];
        }
        const shouldCreateCounterpartyLedger = Boolean(createLedgerName) && !ledgerExists(createLedgerName);
        const bankLedgerIsSynced = ledgerExists(bankLedgerName);
        const counterpartyLedgerIsReady = shouldCreateCounterpartyLedger || ledgerExists(counterpartyLedgerName);
        if (!bankLedgerIsSynced || !counterpartyLedgerIsReady) {
          if (!bankLedgerIsSynced) skipped.bankLedgerNotSynced += 1;
          if (!counterpartyLedgerIsReady) skipped.counterpartyLedgerNotSynced += 1;
          skipped.ledgerNotSynced += 1;
          return [];
        }
        if (amount <= 0) {
          skipped.invalidAmount += 1;
          return [];
        }
        const originalVoucherType = getVoucherType(transaction);
        const counterpartyIsPartyLedger = shouldCreateCounterpartyLedger
          ? isPartyParent(createLedgerParentName)
          : isPartyLedger(counterpartyLedgerName);
        const usesTallyFallbackLedger =
          !counterpartyIsPartyLedger &&
          (originalVoucherType === "Payment" || originalVoucherType === "Receipt") &&
          ledgerExists(NON_PARTY_TALLY_FALLBACK_LEDGER);
        const tallyCounterpartyLedgerName = usesTallyFallbackLedger
          ? NON_PARTY_TALLY_FALLBACK_LEDGER
          : counterpartyLedgerName;
        const statementImport = transaction.statement_import_id
          ? importsById.get(transaction.statement_import_id)
          : null;
        const referenceBankCode = getVoucherReferenceBankCode(
          statementImport?.extracted_bank_name || account.bank_name
        );
        const referenceNumber =
          transaction.reference_number || buildVoucherReference(transaction, referenceBankCode);

        const nextCommands: TallyCommandInsert[] = [];
        const createLedgerKey = normalizeName(createLedgerName);
        if (shouldCreateCounterpartyLedger && createLedgerKey && !queuedCreateLedgerKeys.has(createLedgerKey)) {
          queuedCreateLedgerKeys.add(createLedgerKey);
          nextCommands.push({
            connection_id: connectionId,
            owner_user_id: user.id,
            command_type: "create_ledger",
            status: "queued",
            priority: 30,
            payload: {
              name: createLedgerName,
              parentName: createLedgerParentName,
              companyName: connection.last_company_name,
              source: "bank_statement_queue",
            },
          });
        }

        nextCommands.push({
          connection_id: connectionId,
          owner_user_id: user.id,
          command_type: "post_bank_voucher",
          status: "queued",
          priority: 20,
          payload: {
            transactionId: transaction.id,
            bankAccountId: account.id,
            fingerprint: transaction.fingerprint,
            companyName: connection.last_company_name,
            voucherType: originalVoucherType,
            voucherDate: transaction.transaction_date,
            bankLedgerName,
            counterpartyLedgerName: tallyCounterpartyLedgerName,
            matchedLedgerName: counterpartyLedgerName,
            counterpartyIsPartyLedger: usesTallyFallbackLedger ? true : counterpartyIsPartyLedger,
            postingFallbackReason: usesTallyFallbackLedger ? "non_party_bank_adjustment" : null,
            bankLedgerEntryIsDebit: bankEntryIsDebit(transaction),
            amount,
            narration: transaction.description,
            referenceNumber,
            transactionType: transaction.transaction_type,
            category: transaction.category,
            counterpartyName: transaction.counterparty_name || suggestion.counterpartyName,
            accountNumberMasked: account.account_number_masked,
          },
        });

        return nextCommands;
      }
    );

    const voucherCommands = commands.filter((command) => command.command_type === "post_bank_voucher");

    if (voucherCommands.length === 0) {
      return jsonWithCors(
        request,
        {
          error: "No transactions could be queued. Check diagnostics for the skipped reason.",
          queuedCount: 0,
          commands: [],
          diagnostics: {
            eligibleTransactionCount: transactions.length,
            skipped,
          },
        },
        { status: 400 }
      );
    }

    const { data: createdCommands, error: commandError } = await supabase
      .from("tally_bridge_commands")
      .insert(commands)
      .select("*");

    if (commandError) throw commandError;

    const createdCommandRows = (createdCommands ?? []) as Array<{
      id: string;
      payload: Record<string, unknown>;
    }>;
    const logRows = createdCommandRows.flatMap((command) => {
      const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
      const transaction = transactions.find((row) => row.id === payload.transactionId);
      const account = transaction ? accountsById.get(transaction.bank_account_id) : null;
      if (!transaction || !account) return [];

      return [
        {
          owner_user_id: user.id,
          bank_account_id: transaction.bank_account_id,
          connection_id: connectionId,
          source_transaction_id: transaction.id,
          fingerprint: transaction.fingerprint,
          transaction_date: transaction.transaction_date,
          reference_number: transaction.reference_number,
          description: transaction.description,
          debit_amount: transaction.debit_amount,
          credit_amount: transaction.credit_amount,
          amount: getTransactionAmount(transaction),
          voucher_type: getVoucherType(transaction),
          bank_ledger_name: payload.bankLedgerName,
          counterparty_ledger_name: payload.counterpartyLedgerName,
          command_id: command.id,
          status: "queued",
          error: null,
          result: {},
        },
      ];
    });

    if (logRows.length > 0) {
      const { error: logError } = await supabase
        .from("bank_transaction_posting_log")
        .upsert(logRows, {
          onConflict: "owner_user_id,bank_account_id,fingerprint",
        });

      if (logError) throw logError;
    }

    const queuedTransactionIds = voucherCommands
      .map((command) => command.payload.transactionId)
      .filter((value): value is string => typeof value === "string");

    await supabase
      .from("bank_transactions")
      .update({ tally_status: "pending" })
      .eq("owner_user_id", user.id)
      .in("id", queuedTransactionIds);

    const transactionUpdates = createdCommandRows.flatMap((command) => {
      const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
      const transactionId = typeof payload.transactionId === "string" ? payload.transactionId : "";
      const counterpartyLedgerName =
        typeof payload.matchedLedgerName === "string"
          ? payload.matchedLedgerName
          : typeof payload.counterpartyLedgerName === "string"
            ? payload.counterpartyLedgerName
            : "";
      if (!transactionId || !counterpartyLedgerName) return [];
      return [{ transactionId, counterpartyLedgerName }];
    });

    await Promise.all(
      transactionUpdates.map((update) =>
        supabase
          .from("bank_transactions")
          .update({
            confirmed_ledger_name: update.counterpartyLedgerName,
            ledger_mapping_source: "queue_confirmation",
          })
          .eq("owner_user_id", user.id)
          .eq("id", update.transactionId)
      )
    );

    const mappingRows = createdCommandRows.flatMap((command) => {
      const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
      const transaction = transactions.find((row) => row.id === payload.transactionId);
      const account = transaction ? accountsById.get(transaction.bank_account_id) : null;
      const bankLedger = typeof payload.bankLedgerName === "string" ? payload.bankLedgerName.trim() : "";
      const counterpartyLedger =
        typeof payload.matchedLedgerName === "string"
          ? payload.matchedLedgerName.trim()
          : typeof payload.counterpartyLedgerName === "string"
            ? payload.counterpartyLedgerName.trim()
            : "";
      const rows: MappingRow[] = [];

      if (account && bankLedger) {
        rows.push({
          connection_id: connectionId,
          owner_user_id: user.id,
          mapping_type: "bank_account_ledger",
          source_key: buildBankAccountLedgerSourceKey(account.id),
          source_label: `${account.bank_name || "Bank"} ${account.account_number_masked}`.trim(),
          ...buildLedgerMappingTarget(bankLedger),
          status: "active",
          notes: "Saved from bank voucher queue confirmation.",
        });
      }

      if (transaction && counterpartyLedger && saveMappingTransactionIds.has(transaction.id)) {
        rows.push({
          connection_id: connectionId,
          owner_user_id: user.id,
          mapping_type: "bank_narration_ledger",
          source_key: buildBankNarrationLedgerSourceKey(transaction.bank_account_id, transaction.description),
          source_label: transaction.description.slice(0, 500),
          ...buildLedgerMappingTarget(counterpartyLedger),
          status: "active",
          notes: "Saved from bank voucher queue confirmation.",
        });
      }

      return rows;
    });
    const uniqueMappingRows = Array.from(
      new Map(
        mappingRows.map((row) => [
          `${row.connection_id}:${row.mapping_type}:${row.source_key}`,
          row,
        ])
      ).values()
    );

    if (uniqueMappingRows.length > 0) {
      const { error: mappingError } = await supabase
        .from("tally_mapping_settings")
        .upsert(uniqueMappingRows, { onConflict: "connection_id,mapping_type,source_key" });

      if (mappingError) throw mappingError;
    }

    const bankLedgerByAccountId = new Map(
      createdCommandRows.flatMap((command) => {
        const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
        const bankAccountId = typeof payload.bankAccountId === "string" ? payload.bankAccountId : "";
        const ledgerName = typeof payload.bankLedgerName === "string" ? payload.bankLedgerName : "";
        return bankAccountId && ledgerName ? [[bankAccountId, ledgerName] as const] : [];
      })
    );

    await Promise.all(
      Array.from(bankLedgerByAccountId.entries()).map(([bankAccountId, ledgerName]) =>
        supabase
          .from("bank_accounts")
          .update({ tally_connection_id: connectionId, tally_ledger_name: ledgerName })
          .eq("owner_user_id", user.id)
          .eq("id", bankAccountId)
      )
    );

    await supabase.from("tally_connection_events").insert({
      connection_id: connectionId,
      owner_user_id: user.id,
      event_type: "command_queued",
      message: "Bank voucher posting queued for bridge.",
      payload: {
        commandType: "post_bank_voucher",
        queuedCount: voucherCommands.length,
        commandCount: commands.length,
        transactionIds: queuedTransactionIds,
        savedMappingCount: uniqueMappingRows.length,
      },
    });

    return jsonWithCors(request, {
      queuedCount: voucherCommands.length,
      commandCount: commands.length,
      commands: createdCommands ?? [],
    });
  } catch (error) {
    console.error("Error in POST /api/bank-statements/tally/queue:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
