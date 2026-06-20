import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { suggestBankLedgerForTransaction } from "@/lib/bank-statement-ledger-matching";
import {
  BANK_STATEMENT_BUCKET,
  buildStoragePath,
  extractBankStatementFile,
  findBankAccountCandidates,
  maskAccountNumber,
  normalizeAccountNumber,
  resolveImportStatus,
  serializeAccount,
  type BankAccountInput,
  type ParsedBankTransaction,
} from "@/lib/bank-statements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function readJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
    statementPeriodStart: row.statement_period_start ? String(row.statement_period_start) : null,
    statementPeriodEnd: row.statement_period_end ? String(row.statement_period_end) : null,
    importedTransactionCount: Number(row.imported_transaction_count ?? 0),
    duplicateTransactionCount: Number(row.duplicate_transaction_count ?? 0),
    createdAt: String(row.created_at ?? ""),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function enrichTransactionsWithLedgerRecommendations(input: {
  ownerUserId: string;
  connectionId: string;
  accountId: string;
  transactions: ParsedBankTransaction[];
}) {
  if (!input.connectionId) {
    return input.transactions;
  }

  const supabase = createSupabaseAdminClient();

  return Promise.all(
    input.transactions.map(async (transaction) => {
      const suggestion = await suggestBankLedgerForTransaction({
        supabase,
        ownerUserId: input.ownerUserId,
        connectionId: input.connectionId,
        accountId: input.accountId,
        transaction,
      });
      const ledgerName =
        suggestion.ledgerName ||
        transaction.confirmedLedgerName ||
        transaction.suggestedLedgerName ||
        "Suspense";
      const action = suggestion.ledgerName
        ? suggestion.mappingSource === "category"
          ? "use_standard_ledger"
          : suggestion.mappingSource === "close_match"
            ? "needs_review"
            : "use_existing_ledger"
        : "use_suspense";
      const reason =
        suggestion.reason ||
        (action === "use_suspense"
          ? "No matching Tally ledger was found. This row will go to Suspense unless changed."
          : null);

      return {
        ...transaction,
        counterpartyName: transaction.counterpartyName || suggestion.counterpartyName || null,
        suggestedLedgerName: ledgerName,
        suggestionConfidence: suggestion.ledgerName ? suggestion.confidence : ledgerName ? 0.6 : 0,
        suggestionReason: reason,
        rawPayload: {
          ...(transaction.rawPayload ?? {}),
          aiLedgerRecommendation: {
            action,
            ledgerName,
            ledgerGroup: null,
            confidence: suggestion.ledgerName ? suggestion.confidence : ledgerName ? 0.6 : 0,
            requiresUserConfirmation: suggestion.mappingSource === "close_match",
            reason,
          },
        },
      };
    })
  );
}

function serializePreviewFromMeta(row: Record<string, unknown>) {
  const meta = readRecord(row.processing_meta);
  const preview = readRecord(meta.preview);
  const analysis = readRecord(meta.analysis);

  return {
    import: serializeImport(row),
    account: readRecord(preview.account),
    candidates: Array.isArray(preview.candidates) ? preview.candidates : [],
    transactions: Array.isArray(preview.transactions) ? preview.transactions : [],
    requiresManualExtraction: Boolean(preview.requiresManualExtraction),
    extractionSource: preview.extractionSource ?? null,
    extractionError: preview.extractionError ?? null,
    extractionDiagnostics: preview.extractionDiagnostics ?? null,
    processing: analysis.status === "processing" || analysis.status === "queued",
    job: {
      id: String(row.id),
      status: String(analysis.status ?? "completed"),
      progress: Number(analysis.progress ?? 100),
      stage: typeof analysis.stage === "string" ? analysis.stage : null,
      error: typeof analysis.error === "string" ? analysis.error : null,
    },
  };
}

async function processBankStatementImport(importId: string, ownerUserId: string) {
  const supabase = createSupabaseAdminClient();

  async function updateAnalysis(next: Record<string, unknown>) {
    const { data: current } = await supabase
      .from("bank_statement_imports")
      .select("processing_meta")
      .eq("id", importId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    const currentMeta = readRecord(current?.processing_meta);
    const currentAnalysis = readRecord(currentMeta.analysis);

    await supabase
      .from("bank_statement_imports")
      .update({
        processing_meta: {
          ...currentMeta,
          analysis: {
            ...currentAnalysis,
            ...next,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", importId)
      .eq("owner_user_id", ownerUserId);
  }

  try {
    await updateAnalysis({ status: "processing", progress: 10, stage: "Reading uploaded statement" });

    const { data: importRow, error: importError } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("id", importId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (importError) throw importError;
    if (!importRow) throw new Error("Bank statement import not found.");

    const meta = readRecord(importRow.processing_meta);
    const analysis = readRecord(meta.analysis);
    const manualAccount = readRecord(analysis.manualAccount) as BankAccountInput;
    const connectionId = typeof analysis.connectionId === "string" ? analysis.connectionId : "";

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(String(importRow.storage_bucket || BANK_STATEMENT_BUCKET))
      .download(String(importRow.storage_path));
    if (downloadError) throw downloadError;
    if (!fileData) throw new Error("Uploaded bank statement file could not be read.");

    await updateAnalysis({ status: "processing", progress: 30, stage: "Extracting transactions" });
    const parsed = await extractBankStatementFile({
      bytes: new Uint8Array(await fileData.arrayBuffer()),
      fileName: String(importRow.original_file_name || "bank-statement"),
      mimeType: typeof importRow.mime_type === "string" ? importRow.mime_type : null,
    });

    await updateAnalysis({ status: "processing", progress: 75, stage: "Matching bank account" });
    const account = {
      bankName: manualAccount.bankName || parsed.account.bankName || null,
      accountNumber: manualAccount.accountNumber || parsed.account.accountNumber || null,
      accountHolderName: manualAccount.accountHolderName || parsed.account.accountHolderName || null,
      ifscCode: manualAccount.ifscCode || parsed.account.ifscCode || null,
    };
    const candidates = await findBankAccountCandidates(supabase, ownerUserId, account);
    const selectedAccountId = candidates.length === 1 ? candidates[0].id : null;
    const recommendationAccountId =
      selectedAccountId ||
      normalizeAccountNumber(account.accountNumber) ||
      String(importRow.id);
    const transactions = await enrichTransactionsWithLedgerRecommendations({
      ownerUserId,
      connectionId,
      accountId: recommendationAccountId,
      transactions: parsed.transactions,
    });
    const status =
      transactions.length === 0 ? "manual_review_required" : resolveImportStatus(candidates.length);

    const preview = {
      account: {
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountNumberMasked: maskAccountNumber(account.accountNumber),
        accountHolderName: account.accountHolderName,
        ifscCode: account.ifscCode,
      },
      candidates: candidates.map(serializeAccount),
      transactions,
      requiresManualExtraction:
        parsed.extractionSource === "manual_review_required_v1" || transactions.length === 0,
      extractionSource: parsed.extractionSource,
      extractionError: parsed.extractionError ?? null,
      extractionDiagnostics: parsed.extractionDiagnostics ?? null,
    };

    const nextMeta = {
      ...meta,
      preview,
      analysis: {
        ...analysis,
        status: "completed",
        progress: 100,
        stage: "Statement analyzed",
        error: null,
        connectionId,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      parser: parsed.extractionSource,
      extractionError: parsed.extractionError ?? null,
      extractionDiagnostics: parsed.extractionDiagnostics ?? null,
      normalizedAccountNumber: normalizeAccountNumber(account.accountNumber),
      maskedAccountNumber: maskAccountNumber(account.accountNumber),
      ifscCode: account.ifscCode,
      previewTransactionCount: transactions.length,
    };

    const { error: updateError } = await supabase
      .from("bank_statement_imports")
      .update({
        bank_account_id: selectedAccountId,
        statement_period_start: parsed.statementPeriodStart,
        statement_period_end: parsed.statementPeriodEnd,
        extracted_bank_name: account.bankName,
        extracted_account_number: account.accountNumber,
        extracted_account_holder_name: account.accountHolderName,
        extracted_ifsc_code: account.ifscCode,
        status,
        processing_meta: nextMeta,
      })
      .eq("id", importId)
      .eq("owner_user_id", ownerUserId);
    if (updateError) throw updateError;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bank statement analysis failed.";
    await updateAnalysis({
      status: "failed",
      progress: 100,
      stage: "Analysis failed",
      error: message,
      failedAt: new Date().toISOString(),
    });
    await supabase
      .from("bank_statement_imports")
      .update({ status: "failed" })
      .eq("id", importId)
      .eq("owner_user_id", ownerUserId);
    console.error("Bank statement background analysis failed:", error);
  }
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

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return jsonWithCors(request, {
      imports: (data ?? []).map((row) => serializeImport(row as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("Error in GET /api/bank-statements/imports:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonWithCors(request, { error: "Upload a bank statement file." }, { status: 400 });
    }

    const manualAccount = readJsonField<BankAccountInput>(formData.get("account"), {});
    const connectionId = typeof formData.get("connectionId") === "string"
      ? String(formData.get("connectionId")).trim()
      : "";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storagePath = buildStoragePath(user.id, file.name || "bank-statement");
    const supabase = createSupabaseAdminClient();

    const upload = await supabase.storage.from(BANK_STATEMENT_BUCKET).upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const insertPayload = {
      owner_user_id: user.id,
      bank_account_id: null,
      original_file_name: file.name || "bank-statement",
      storage_bucket: BANK_STATEMENT_BUCKET,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      status: "processing",
      processing_meta: {
        source: "bank_statement_upload",
        analysis: {
          status: "queued",
          progress: 5,
          stage: "Statement uploaded",
          error: null,
          connectionId,
          manualAccount,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    };

    const { data: createdImport, error: insertError } = await supabase
      .from("bank_statement_imports")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    void processBankStatementImport(String(createdImport.id), user.id);

    return jsonWithCors(request, serializePreviewFromMeta(createdImport as Record<string, unknown>));
  } catch (error) {
    console.error("Error in POST /api/bank-statements/imports:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
