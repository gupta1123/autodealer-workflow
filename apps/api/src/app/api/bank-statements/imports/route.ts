import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storagePath = buildStoragePath(user.id, file.name || "bank-statement");
    const supabase = createSupabaseAdminClient();

    const upload = await supabase.storage.from(BANK_STATEMENT_BUCKET).upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const parsed = await extractBankStatementFile({
      bytes,
      fileName: file.name || "bank-statement",
      mimeType: file.type || null,
    });

    const account = {
      bankName: manualAccount.bankName || parsed.account.bankName || null,
      accountNumber: manualAccount.accountNumber || parsed.account.accountNumber || null,
      accountHolderName: manualAccount.accountHolderName || parsed.account.accountHolderName || null,
      ifscCode: manualAccount.ifscCode || parsed.account.ifscCode || null,
    };
    const candidates = await findBankAccountCandidates(supabase, user.id, account);
    const status = resolveImportStatus(candidates.length);
    const selectedAccountId = candidates.length === 1 ? candidates[0].id : null;

    const insertPayload = {
      owner_user_id: user.id,
      bank_account_id: selectedAccountId,
      original_file_name: file.name || "bank-statement",
      storage_bucket: BANK_STATEMENT_BUCKET,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      statement_period_start: parsed.statementPeriodStart,
      statement_period_end: parsed.statementPeriodEnd,
      extracted_bank_name: account.bankName,
      extracted_account_number: account.accountNumber,
      extracted_account_holder_name: account.accountHolderName,
      extracted_ifsc_code: account.ifscCode,
      status,
      processing_meta: {
        source: "bank_statement_upload",
        parser: parsed.extractionSource,
        extractionError: parsed.extractionError ?? null,
        normalizedAccountNumber: normalizeAccountNumber(account.accountNumber),
        maskedAccountNumber: maskAccountNumber(account.accountNumber),
        ifscCode: account.ifscCode,
        previewTransactionCount: parsed.transactions.length,
      },
    };

    const { data: createdImport, error: insertError } = await supabase
      .from("bank_statement_imports")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    return jsonWithCors(request, {
      import: serializeImport(createdImport as Record<string, unknown>),
      account: {
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountNumberMasked: maskAccountNumber(account.accountNumber),
        accountHolderName: account.accountHolderName,
        ifscCode: account.ifscCode,
      },
      candidates: candidates.map(serializeAccount),
      transactions: parsed.transactions,
      requiresManualExtraction: parsed.extractionSource === "manual_review_required_v1" || parsed.transactions.length === 0,
      extractionSource: parsed.extractionSource,
      extractionError: parsed.extractionError ?? null,
    });
  } catch (error) {
    console.error("Error in POST /api/bank-statements/imports:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
