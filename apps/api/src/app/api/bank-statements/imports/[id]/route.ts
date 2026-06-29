import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  findBankAccountCandidates,
  maskAccountNumber,
  serializeAccount,
} from "@/lib/bank-statements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function serializeImport(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    bankAccountId: row.bank_account_id ? String(row.bank_account_id) : null,
    originalFileName: String(row.original_file_name ?? ""),
    status: String(row.status ?? ""),
    extractedBankName: row.extracted_bank_name ? String(row.extracted_bank_name) : null,
    extractedAccountNumber: row.extracted_account_number ? String(row.extracted_account_number) : null,
    extractedAccountHolderName: row.extracted_account_holder_name
      ? String(row.extracted_account_holder_name)
      : null,
    extractedIfscCode: row.extracted_ifsc_code ? String(row.extracted_ifsc_code) : null,
    importedTransactionCount: Number(row.imported_transaction_count ?? 0),
    duplicateTransactionCount: Number(row.duplicate_transaction_count ?? 0),
    createdAt: String(row.created_at ?? ""),
  };
}

function serializePreviewTransaction(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    transactionDate: row.transaction_date ? String(row.transaction_date) : null,
    valueDate: row.value_date ? String(row.value_date) : null,
    description: row.description ? String(row.description) : null,
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    debitAmount: row.debit_amount ?? null,
    creditAmount: row.credit_amount ?? null,
    balanceAmount: row.balance_amount ?? null,
    transactionType: row.transaction_type ? String(row.transaction_type) : null,
    category: row.category ? String(row.category) : null,
    counterpartyName: row.counterparty_name ? String(row.counterparty_name) : null,
    suggestedLedgerName: row.suggested_ledger_name ? String(row.suggested_ledger_name) : null,
    suggestionConfidence:
      typeof row.suggestion_confidence === "number"
        ? row.suggestion_confidence
        : row.suggestion_confidence
          ? Number(row.suggestion_confidence)
          : null,
    suggestionReason: row.suggestion_reason ? String(row.suggestion_reason) : null,
    confirmedLedgerName: row.confirmed_ledger_name ? String(row.confirmed_ledger_name) : null,
    rawPayload: readRecord(row.raw_payload),
  };
}

function isPreviewTransactionArray(value: unknown) {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data: importRow, error: importError } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .single();

    if (importError || !importRow) {
      return jsonWithCors(request, { error: "Bank statement import was not found." }, { status: 404 });
    }

    const { data: latestJobRow, error: jobError } = await supabase
      .from("bank_statement_extraction_jobs")
      .select("*")
      .eq("import_id", id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jobError) throw jobError;
    let jobRow = latestJobRow;

    const { data: previewRows, error: previewError } = await supabase
      .from("bank_statement_import_preview_transactions")
      .select("*")
      .eq("import_id", id)
      .eq("owner_user_id", user.id)
      .order("row_index", { ascending: true });

    if (previewError) throw previewError;

    const processingMeta = readRecord(importRow.processing_meta);
    const previewMeta = readRecord(processingMeta.preview);
    const previewAccount = readRecord(previewMeta.account);
    const storedPreviewTransactions = isPreviewTransactionArray(previewMeta.transactions);
    const tablePreviewTransactions = (previewRows ?? []) as Array<Record<string, unknown>>;
    const transactions =
      tablePreviewTransactions.length > 0
        ? tablePreviewTransactions.map((row) => serializePreviewTransaction(row))
        : storedPreviewTransactions;
    const analysis = readRecord(processingMeta.analysis);
    const analysisStatus = typeof analysis.status === "string" ? analysis.status : "";
    const jobStatus = typeof jobRow?.status === "string" ? jobRow.status : "";
    const jobIsTerminal = ["succeeded", "failed", "cancelled"].includes(jobStatus);
    const processing =
      !jobIsTerminal &&
      (importRow.status === "processing" || analysisStatus === "queued" || analysisStatus === "processing");

    if (!jobRow && processing) {
      const { data: repairedJobRow, error: repairJobError } = await supabase
        .from("bank_statement_extraction_jobs")
        .insert({
          import_id: id,
          owner_user_id: user.id,
          status: "queued",
          progress: Number(analysis.progress ?? 5),
          stage: typeof analysis.stage === "string" ? analysis.stage : "Statement uploaded",
          result: {},
        })
        .select("*")
        .single();

      if (repairJobError) throw repairJobError;
      jobRow = repairedJobRow;
    }

    const requiresManualExtraction =
      importRow.status === "manual_review_required" ||
      importRow.status === "failed" ||
      Boolean(previewMeta.requiresManualExtraction) ||
      (!processing && transactions.length === 0);
    const account = {
      bankName:
        typeof previewAccount.bankName === "string"
          ? previewAccount.bankName
          : importRow.extracted_bank_name ?? null,
      accountNumber:
        typeof previewAccount.accountNumber === "string"
          ? previewAccount.accountNumber
          : importRow.extracted_account_number ?? null,
      accountNumberMasked:
        typeof previewAccount.accountNumberMasked === "string"
          ? previewAccount.accountNumberMasked
          : maskAccountNumber(importRow.extracted_account_number),
      accountHolderName:
        typeof previewAccount.accountHolderName === "string"
          ? previewAccount.accountHolderName
          : importRow.extracted_account_holder_name ?? null,
      ifscCode:
        typeof previewAccount.ifscCode === "string"
          ? previewAccount.ifscCode
          : importRow.extracted_ifsc_code ?? null,
      tallyLedgerName:
        typeof processingMeta.tallyLedgerName === "string" ? processingMeta.tallyLedgerName : null,
    };
    const candidates = Array.isArray(previewMeta.candidates)
      ? previewMeta.candidates
      : ["ready_to_review", "ready_to_confirm", "needs_account_selection"].includes(importRow.status)
      ? await findBankAccountCandidates(supabase, user.id, {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountHolderName: account.accountHolderName,
          ifscCode: account.ifscCode,
        })
      : [];

    return jsonWithCors(request, {
      import: serializeImport(importRow as Record<string, unknown>),
      account,
      candidates: Array.isArray(previewMeta.candidates) ? candidates : candidates.map(serializeAccount),
      transactions,
      requiresManualExtraction,
      extractionSource: previewMeta.extractionSource ?? processingMeta.extractionSource ?? null,
      extractionError: previewMeta.extractionError ?? processingMeta.extractionError ?? null,
      extractionDiagnostics: previewMeta.extractionDiagnostics ?? processingMeta.extractionDiagnostics ?? null,
      processing,
      job: jobRow
        ? {
            id: jobRow.id,
            status: jobRow.status,
            progress: jobRow.progress,
            stage: jobRow.stage,
            error: jobRow.error,
          }
        : {
            id: String(importRow.id),
            status: analysisStatus || (processing ? "processing" : "completed"),
            progress: Number(analysis.progress ?? (processing ? 5 : 100)),
            stage: typeof analysis.stage === "string" ? analysis.stage : null,
            error: typeof analysis.error === "string" ? analysis.error : null,
          },
    });
  } catch (error) {
    console.error("Error in GET /api/bank-statements/imports/[id]:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
