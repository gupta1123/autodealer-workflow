import { createClient } from "@supabase/supabase-js";

const importId = process.env.KALIKA_LEDGER_DIAG_IMPORT_ID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!importId) throw new Error("KALIKA_LEDGER_DIAG_IMPORT_ID is required.");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service credentials are required.");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: importRow, error: importError } = await supabase
  .from("bank_statement_imports")
  .select("id, owner_user_id, bank_account_id, processing_meta")
  .eq("id", importId)
  .single();
if (importError) throw importError;

const { data: rows, error: rowError } = await supabase
  .from("bank_statement_import_preview_transactions")
  .select("row_index, transaction_date, value_date, description, reference_number, debit_amount, credit_amount, balance_amount, transaction_type, category, counterparty_name")
  .eq("import_id", importId)
  .order("row_index", { ascending: true });
if (rowError) throw rowError;

const selectedContext = importRow.processing_meta?.selectedContext || {};
const analysisContext = importRow.processing_meta?.analysis || {};
const connectionId = selectedContext.connectionId || analysisContext.connectionId || null;
const { suggestBankLedgersForTransactions } = await import(
  "../apps/api/src/lib/bank-statement-ledger-matching.ts"
);

const startedAt = performance.now();
const suggestions = await suggestBankLedgersForTransactions({
  supabase,
  ownerUserId: importRow.owner_user_id,
  connectionId,
  transactions: rows.map((row) => ({
    accountId: String(importRow.bank_account_id || ""),
    transaction: {
      transactionDate: row.transaction_date || "",
      valueDate: row.value_date || null,
      description: row.description || "",
      referenceNumber: row.reference_number || null,
      debitAmount: row.debit_amount ?? null,
      creditAmount: row.credit_amount ?? null,
      balanceAmount: row.balance_amount ?? null,
      transactionType: row.transaction_type || undefined,
      category: row.category || undefined,
      counterpartyName: row.counterparty_name || null,
    },
  })),
});

console.log(
  JSON.stringify(
    {
      event: "ledger_diagnostic_result",
      importId,
      durationMs: Math.round(performance.now() - startedAt),
      rows: rows.map((row, index) => ({
        rowIndex: row.row_index,
        description: row.description,
        referenceNumber: row.reference_number,
        suggestion: suggestions[index],
      })),
    },
    null,
    2
  )
);
