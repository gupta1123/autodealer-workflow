import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { suggestBankLedgerForTransaction } from "@/lib/bank-statement-ledger-matching";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
  suggestion_reason: string | null;
  confirmed_ledger_name: string | null;
  ledger_mapping_source: string | null;
  raw_payload?: unknown;
  tally_status: string;
  tally_voucher_id: string | null;
  tally_posted_at: string | null;
};

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasPostingAmount(row: BankTransactionRow) {
  return Math.max(toNumber(row.debit_amount) ?? 0, toNumber(row.credit_amount) ?? 0) > 0;
}

function normalizeLedgerName(value?: string | null) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeReferenceNumber(value?: string | null) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 3 ? normalized : "";
}

function isSuspenseLedger(value?: string | null) {
  const normalized = normalizeLedgerName(value);
  return normalized === "suspense" || normalized === "suspenseac" || normalized === "suspenseaccount";
}

function hasAiStoredLedgerSuggestion(row: BankTransactionRow) {
  const rawPayload = row.raw_payload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return false;
  const ledgerMatch = (rawPayload as { ledgerMatch?: unknown }).ledgerMatch;
  if (!ledgerMatch || typeof ledgerMatch !== "object" || Array.isArray(ledgerMatch)) return false;
  return (ledgerMatch as { source?: unknown }).source === "ai_match";
}

function serializeTransaction(row: BankTransactionRow, suggestion?: Awaited<ReturnType<typeof suggestBankLedgerForTransaction>>) {
  const strongSuggestedLedger =
    suggestion?.ledgerName && !isSuspenseLedger(suggestion.ledgerName) && suggestion.confidence >= 0.85
      ? suggestion.ledgerName
      : null;
  const confirmedLedgerName =
    row.confirmed_ledger_name && !(isSuspenseLedger(row.confirmed_ledger_name) && strongSuggestedLedger)
      ? row.confirmed_ledger_name
      : null;
  const storedSuggestedLedgerName =
    row.suggested_ledger_name &&
    hasAiStoredLedgerSuggestion(row) &&
    !(isSuspenseLedger(row.suggested_ledger_name) && strongSuggestedLedger)
      ? row.suggested_ledger_name
      : null;
  const suggestedLedgerName = confirmedLedgerName || strongSuggestedLedger || storedSuggestedLedgerName || suggestion?.ledgerName || null;
  const suggestionConfidence =
    suggestedLedgerName === suggestion?.ledgerName
      ? suggestion.confidence
      : toNumber(row.suggestion_confidence) ?? suggestion?.confidence ?? null;

  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    transactionDate: row.transaction_date,
    valueDate: row.value_date,
    description: row.description,
    referenceNumber: row.reference_number,
    debitAmount: row.debit_amount,
    creditAmount: row.credit_amount,
    balanceAmount: row.balance_amount,
    transactionType: row.transaction_type,
    category: row.category,
    counterpartyName: row.counterparty_name || suggestion?.counterpartyName || null,
    suggestedLedgerName,
    suggestionConfidence,
    suggestionReason: row.suggestion_reason || suggestion?.reason || null,
    confirmedLedgerName: confirmedLedgerName || (strongSuggestedLedger ? null : row.confirmed_ledger_name),
    ledgerMappingSource: row.ledger_mapping_source || suggestion?.mappingSource || null,
    tallyStatus: row.tally_status,
    tallyVoucherId: row.tally_voucher_id,
    tallyPostedAt: row.tally_posted_at,
    needsLedgerConfirmation: !suggestedLedgerName || (suggestionConfidence ?? 0) < 0.85,
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim();
    const importId = url.searchParams.get("importId")?.trim();
    const connectionId = url.searchParams.get("connectionId")?.trim() || null;
    const status = url.searchParams.get("status")?.trim() || "pending";

    if (!accountId) {
      return jsonWithCors(request, { error: "Bank account is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: account, error: accountError } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return jsonWithCors(request, { error: "Bank account not found." }, { status: 404 });
    }

    let builder = supabase
      .from("bank_transactions")
      .select("*")
      .eq("owner_user_id", user.id)
      .eq("bank_account_id", accountId)
      .order("transaction_date", { ascending: true })
      .limit(200);

    if (importId) {
      builder = builder.eq("statement_import_id", importId);
    }

    if (status === "queueable") {
      builder = builder.in("tally_status", ["pending", "failed"]);
    } else if (status) {
      builder = builder.eq("tally_status", status);
    }

    const { data, error } = await builder;
    if (error) throw error;

    const allRows = (data ?? []) as unknown as BankTransactionRow[];
    let rows = status === "queueable" ? allRows.filter(hasPostingAmount) : allRows;

    if (status === "queueable" && rows.length > 0) {
      const references = Array.from(
        new Set(rows.map((row) => normalizeReferenceNumber(row.reference_number)).filter(Boolean))
      );
      const { data: postedLogRows, error: postedLogError } = references.length
        ? await supabase
            .from("bank_transaction_posting_log")
            .select("reference_number, tally_voucher_id")
            .eq("owner_user_id", user.id)
            .eq("bank_account_id", accountId)
            .eq("status", "posted")
        : { data: [], error: null };

      if (postedLogError) throw postedLogError;

      const postedReferences = new Set(
        ((postedLogRows ?? []) as Array<{ reference_number: string | null; tally_voucher_id: string | null }>).flatMap(
          (row) =>
            [normalizeReferenceNumber(row.reference_number), normalizeReferenceNumber(row.tally_voucher_id)].filter(
              Boolean
            )
        )
      );
      rows = rows.filter((row) => !postedReferences.has(normalizeReferenceNumber(row.reference_number)));
    }

    const suggestions = await Promise.all(
      rows.map((row) =>
        suggestBankLedgerForTransaction({
          supabase,
          ownerUserId: user.id,
          connectionId,
          accountId,
          transaction: {
            description: row.description,
            category: row.category,
            counterpartyName: row.counterparty_name,
          },
        })
      )
    );

    return jsonWithCors(request, {
      transactions: rows.map((row, index) => serializeTransaction(row, suggestions[index])),
    });
  } catch (error) {
    console.error("Error in GET /api/bank-statements/transactions:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
