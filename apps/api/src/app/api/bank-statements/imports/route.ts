import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  BANK_STATEMENT_BUCKET,
  buildStoragePath,
  type BankAccountInput,
} from "@/lib/bank-statements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

type BankStatementPasswordErrorCode =
  | "BANK_STATEMENT_PASSWORD_REQUIRED"
  | "BANK_STATEMENT_PASSWORD_INCORRECT"
  | "BANK_STATEMENT_PASSWORD_UNSUPPORTED";

class BankStatementPasswordError extends Error {
  code: BankStatementPasswordErrorCode;

  constructor(code: BankStatementPasswordErrorCode, message: string) {
    super(message);
    this.name = "BankStatementPasswordError";
    this.code = code;
  }
}

function readJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readTextField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isPdfUpload(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function execFileWithInput(command: string, args: string[], input: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin?.end(input);
  });
}

async function unlockPdfIfNeeded(bytes: Uint8Array, password: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-statement-unlock-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "unlocked.pdf");
  const script = `
import json
import sys
from pathlib import Path

try:
    from PyPDF2 import PdfReader, PdfWriter
except Exception:
    print(json.dumps({"ok": False, "code": "unsupported"}))
    sys.exit(0)

input_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
password = sys.stdin.read()

try:
    reader = PdfReader(str(input_path))
    if not reader.is_encrypted:
        print(json.dumps({"ok": True, "encrypted": False}))
        sys.exit(0)

    if not password:
        print(json.dumps({"ok": False, "code": "password_required"}))
        sys.exit(0)

    decrypt_result = reader.decrypt(password)
    if not decrypt_result:
        print(json.dumps({"ok": False, "code": "incorrect_password"}))
        sys.exit(0)

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    with output_path.open("wb") as output_file:
        writer.write(output_file)

    print(json.dumps({"ok": True, "encrypted": True}))
except Exception:
    print(json.dumps({"ok": False, "code": "unsupported"}))
`;

  try {
    fs.writeFileSync(inputPath, Buffer.from(bytes));
    try {
      const { stdout } = await execFileWithInput("pdfinfo", [inputPath], "");
      if (/Encrypted:\s*no\b/i.test(stdout)) {
        return bytes;
      }
      if (/Encrypted:\s*yes\b/i.test(stdout) && !password) {
        throw new BankStatementPasswordError(
          "BANK_STATEMENT_PASSWORD_REQUIRED",
          "This bank statement is password protected. Enter the statement password to continue."
        );
      }
    } catch (error) {
      if (error instanceof BankStatementPasswordError) throw error;
      const diagnostic = `${(error as { stderr?: unknown }).stderr ?? ""} ${(error as Error).message ?? ""}`;
      if (/password|encrypted/i.test(diagnostic) && !password) {
        throw new BankStatementPasswordError(
          "BANK_STATEMENT_PASSWORD_REQUIRED",
          "This bank statement is password protected. Enter the statement password to continue."
        );
      }
    }

    const { stdout } = await execFileWithInput("python3", ["-c", script, inputPath, outputPath], password);
    const result = JSON.parse(stdout || "{}") as { ok?: boolean; encrypted?: boolean; code?: string };
    if (result.ok && result.encrypted && fs.existsSync(outputPath)) {
      return new Uint8Array(fs.readFileSync(outputPath));
    }
    if (result.ok) {
      return bytes;
    }
    if (result.code === "password_required") {
      throw new BankStatementPasswordError(
        "BANK_STATEMENT_PASSWORD_REQUIRED",
        "This bank statement is password protected. Enter the statement password to continue."
      );
    }
    if (result.code === "incorrect_password") {
      throw new BankStatementPasswordError(
        "BANK_STATEMENT_PASSWORD_INCORRECT",
        "The password did not unlock this statement. Check the password and try again."
      );
    }
    throw new BankStatementPasswordError(
      "BANK_STATEMENT_PASSWORD_UNSUPPORTED",
      "This statement is password protected with an encryption type Kalika cannot unlock. Remove the password in your bank PDF viewer, export a new PDF, then upload it again."
    );
  } catch (error) {
    if (error instanceof BankStatementPasswordError) throw error;
    throw new BankStatementPasswordError(
      "BANK_STATEMENT_PASSWORD_UNSUPPORTED",
      "Kalika could not check this password-protected PDF on this server. Remove the password, export a new PDF, then upload it again."
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function getEffectiveImportStatus(row: Record<string, unknown>) {
  const rawStatus = String(row.status ?? "");
  const meta = readRecord(row.processing_meta);
  const analysis = readRecord(meta.analysis);
  const analysisStatus = typeof analysis.status === "string" ? analysis.status : "";
  const jobStatus = typeof meta.jobStatus === "string" ? meta.jobStatus : "";

  if (
    rawStatus === "processing" &&
    (analysisStatus === "completed" || jobStatus === "completed")
  ) {
    const previewTransactionCount = Number(meta.previewTransactionCount ?? 0);
    return previewTransactionCount > 0 ? "ready_to_review" : "manual_review_required";
  }

  return rawStatus;
}

function serializeImport(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    bankAccountId: row.bank_account_id ? String(row.bank_account_id) : null,
    originalFileName: String(row.original_file_name ?? ""),
    status: getEffectiveImportStatus(row),
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
    const connectionId = readTextField(formData.get("connectionId"));
    const companyName = readTextField(formData.get("companyName"));
    const financialYear = readTextField(formData.get("financialYear"));
    const bankLedgerName = readTextField(formData.get("bankLedgerName"));
    const syncBeforeAnalysis = readTextField(formData.get("syncBeforeAnalysis")) !== "false";
    const statementPassword = readTextField(formData.get("statementPassword"));

    if (!connectionId) {
      return jsonWithCors(request, { error: "Select a Tally company before upload." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadBytes = isPdfUpload(file) ? await unlockPdfIfNeeded(bytes, statementPassword) : bytes;
    const storagePath = buildStoragePath(user.id, file.name || "bank-statement");
    const supabase = createSupabaseAdminClient();

    const upload = await supabase.storage.from(BANK_STATEMENT_BUCKET).upload(storagePath, uploadBytes, {
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
      statement_period_start: null,
      statement_period_end: null,
      processing_meta: {
        source: "bank_statement_upload",
        tallyLedgerName: bankLedgerName,
        selectedContext: {
          connectionId,
          companyName,
          financialYear,
          bankLedgerName,
          syncBeforeAnalysis,
        },
        analysis: {
          status: "queued",
          progress: 5,
          stage: "Statement uploaded",
          error: null,
          connectionId,
          companyName,
          financialYear,
          bankLedgerName,
          syncBeforeAnalysis,
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

    const { error: jobInsertError } = await supabase.from("bank_statement_extraction_jobs").insert({
      import_id: createdImport.id,
      owner_user_id: user.id,
      status: "queued",
      progress: 5,
      stage: "Statement uploaded",
      result: {},
    });

    if (jobInsertError) throw jobInsertError;

    return jsonWithCors(request, serializePreviewFromMeta(createdImport as Record<string, unknown>));
  } catch (error) {
    if (error instanceof BankStatementPasswordError) {
      return jsonWithCors(
        request,
        { error: error.message, code: error.code },
        { status: error.code === "BANK_STATEMENT_PASSWORD_REQUIRED" ? 423 : 400 }
      );
    }
    console.error("Error in POST /api/bank-statements/imports:", error);
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
