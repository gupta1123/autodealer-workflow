import { withTeamAccess } from '@/lib/access/route-boundary';
import {teamBankParsing} from '@/lib/access/bank-parsing';
import {accessFailureResponse} from '@/lib/access/failures';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { canStartBankLocalV2 } from "@/lib/processing/bank-local-v2-gate";
import { createAgentJobToken } from "@/lib/tally/agent-job-token";
import { wakeTallyConnector } from "@/lib/tally/command-wake";
import { requireRequestUser } from "@/lib/api/request-auth";
import { listAccessPredicate } from "@/lib/access/list-scope";
import { AccessError } from "@/lib/access/server";
import {
  BANK_STATEMENT_BUCKET,
  type BankAccountInput,
} from "@/lib/bank-statements";
import { createBankStatementJobResult } from "@/lib/bank-statement-worker-pool";
import { PdfSecurityError, unlockPdfIfNeeded } from "@/lib/pdf-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bankParsingPolicy } from "@/lib/processing/local-bank-parsing.mjs";
import {
  ensureStorageAsset,
  removeStorageObjectsIfUnreferenced,
  type StorageObjectCandidate,
} from "@/lib/storage-assets";

export const runtime = "nodejs";
const BANK_STATEMENT_MAX_UPLOAD_BYTES = Math.max(
  1,
  Number(process.env.BANK_STATEMENT_MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024)
);

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

function readLiveLedgerNames(value: FormDataEntryValue | null) {
  return Array.from(new Set(
    readJsonField<unknown[]>(value, [])
      .map((name) => typeof name === "string" ? name.trim().slice(0, 500) : "")
      .filter(Boolean)
  )).slice(0, 20_000);
}

function readLiveBankCandidates(value: FormDataEntryValue | null) {
  return readJsonField<unknown[]>(value, []).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    const ledgerName = typeof row.ledgerName === "string" ? row.ledgerName.trim().slice(0, 500) : "";
    const accountNumber = typeof row.accountNumber === "string"
      ? row.accountNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 40)
      : "";
    return ledgerName && accountNumber ? [{ ledgerName, accountNumber }] : [];
  }).slice(0, 1_000);
}

function isPdfUpload(file: { type: string; name: string }) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
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

async function GETHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const accessPredicate=await listAccessPredicate(request,user.id,"bank.view");
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .or(accessPredicate)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return jsonWithCors(request, {
      imports: (data ?? []).map((row) => serializeImport(row as Record<string, unknown>)),
    });
  } catch (error) {
    if(error instanceof AccessError)return jsonWithCors(request,{error:error.message},{status:error.status});
    console.error("Error in GET /api/bank-statements/imports:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}

async function POSTHandler(request: Request) {
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let uploadedAsset: StorageObjectCandidate | null = null;
  let v2Attempt = false;
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    v2Attempt = readTextField(formData.get('pipelineVersion')) === '2';
    const uploadedFile = formData.get("file");
    const localDocument = readJsonField<{ name: string; size: number; sha256: string } | null>(formData.get("localDocument"), null);
    if (localDocument && (uploadedFile instanceof File || typeof localDocument.name !== "string" || localDocument.name.length > 250 || !localDocument.name.toLowerCase().endsWith(".pdf") || !Number.isInteger(localDocument.size) || localDocument.size < 1 || localDocument.size > 25 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(localDocument.sha256))) {
      return jsonWithCors(request, { error: "Invalid local PDF metadata." }, { status: 400 });
    }
    const file = localDocument ? { name: localDocument.name, size: localDocument.size, type: "application/pdf" } : uploadedFile;
    if (!file || typeof file === "string") {
      return jsonWithCors(request, { error: "Upload a bank statement file." }, { status: 400 });
    }
    if (file.size <= 0) {
      return jsonWithCors(request, { error: "The bank statement file is empty." }, { status: 400 });
    }
    if (file.size > BANK_STATEMENT_MAX_UPLOAD_BYTES) {
      return jsonWithCors(
        request,
        { error: `The bank statement is larger than the ${Math.round(BANK_STATEMENT_MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.` },
        { status: 413 }
      );
    }

    const manualAccount = readJsonField<BankAccountInput>(formData.get("account"), {});
    const connectionId = readTextField(formData.get("connectionId"));
    const companyName = readTextField(formData.get("companyName"));
    const financialYear = readTextField(formData.get("financialYear"));
    const bankLedgerName = readTextField(formData.get("bankLedgerName"));
    const syncBeforeAnalysis = readTextField(formData.get("syncBeforeAnalysis")) !== "false";
    const liveTallyLedgerNames = readLiveLedgerNames(formData.get("liveTallyLedgerNames"));
    const liveTallyBankAccountCandidates = readLiveBankCandidates(
      formData.get("liveTallyBankAccountCandidates")
    );
    const statementPasswordValue = formData.get("statementPassword");
    const statementPassword = typeof statementPasswordValue === "string" ? statementPasswordValue : "";

    if (!connectionId) {
      return jsonWithCors(request, { error: "Select a Tally company before upload." }, { status: 400 });
    }
    supabase = createSupabaseAdminClient();
    const team=process.env.TEAM_ACCESS_ENFORCEMENT==='true'?await teamBankParsing(request,connectionId,{companyName,financialYear,
      companyGuid:readTextField(formData.get('companyGuid')),companyId:readTextField(formData.get('companyId'))}):null;
    const { data: parsingConnection, error: parsingConnectionError } = team?{data:team.connection,error:null}:await supabase.from("tally_connections")
      .select("*").eq("id", connectionId).eq("owner_user_id", user.id).maybeSingle();
    if (parsingConnectionError) throw parsingConnectionError;
    let localParsing: ReturnType<typeof bankParsingPolicy> & { browserUpload?: { tokenHash: string; origin: string; sizeBytes: number; expiresAt: number } } = isPdfUpload(file)
      ? team?.policy||bankParsingPolicy(parsingConnection, { companyName, year: financialYear, ownerUserId: user.id })
      : { mode: "backend" };
    if ((localParsing.mode === "local_agent") !== Boolean(localDocument)) {
      return jsonWithCors(request, { error: "Parsing mode changed. Local PDFs must go directly to the agent, never to cloud storage. Retry with the current settings." }, { status: 409 });
    }
    if(team&&localParsing.mode==='local_agent'&&!v2Attempt)throw new AccessError('Shared local parsing requires the v2 pipeline. Update the agent before retrying.',409);
    let uploadToken: string | undefined;
    if (localDocument) {
      if (!parsingConnection.agent_capabilities?.includes("browser-document-upload-v1")) throw new Error("Update the Local Agent for direct PDF transfer.");
      const origin = request.headers.get("origin") || new URL(request.url).origin;
      const allowedOrigins = [process.env.FRONTEND_ORIGIN, process.env.APP_BASE_URL, "http://localhost:3000", "http://127.0.0.1:3000"].filter(Boolean);
      if (!allowedOrigins.includes(origin)) return jsonWithCors(request, { error: "Browser origin is not configured for local PDF transfer." }, { status: 403 });
      uploadToken = randomBytes(32).toString("hex");
      localParsing = { ...localParsing, browserUpload: { tokenHash: createHash("sha256").update(uploadToken).digest("hex"), origin, sizeBytes: localDocument.size, expiresAt: Date.now() + 240_000 } };
    }
    if (v2Attempt) {
      if (!localDocument || !uploadToken || !localParsing.identity ||
        !await canStartBankLocalV2(supabase, parsingConnection.agent_capabilities)) {
        return jsonWithCors(request, { error: 'The selected local pipeline is no longer available. Retry before transferring the document.' }, { status: 409 });
      }
      // Context belongs to the authenticated loopback session, never the import
      // metadata or command row. No document bytes have been read by this route.
      if (formData.has('liveTallyLedgerNames') || formData.has('liveTallyBankAccountCandidates')) {
        return jsonWithCors(request, { error: 'V2 ledger context must be sent directly to the selected agent.' }, { status: 400 });
      }
      const importId = randomUUID(), jobId = randomUUID(), commandId = randomUUID();
      const apiBase = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
      const { data: created, error: createError } = await supabase.rpc(team?'access_bank_local_create':'bank_local_v2_create', {
        ...(team?{p_actor:user.id,p_org:team.scope.access.organizationId,p_company:team.scope.link.company_id}:{}),
        p_import_id: importId, p_job_id: jobId, p_command_id: commandId, p_identity: localParsing.identity,
        p_file: { ...localDocument, manualAccount, bankLedgerName }, p_upload: localParsing.browserUpload,
        p_result_url: new URL('/api/tally/agent/document-result', apiBase).toString(),
        p_result_token: createAgentJobToken({ jobId: commandId, connectionId, ownerUserId: localParsing.identity.ownerUserId, ttlSeconds: 900 }),
        p_global_limit: Math.max(1, Math.min(32, Number(process.env.BANK_LOCAL_V2_MAX_ACTIVE) || 1)),
      });
      if (createError) throw createError;
      if (created?.state === 'busy') return jsonWithCors(request, {
        error: 'Another bank statement is being analyzed. Retry shortly.', retryAfterSeconds: created.retryAfterSeconds,
      }, { status: 429, headers: { 'Retry-After': String(created.retryAfterSeconds || 5) } });
      if (!created?.import) throw new Error('Atomic local job creation did not return its import. Check status before retrying.');
      void wakeTallyConnector(connectionId);
      return jsonWithCors(request, { ...serializePreviewFromMeta(created.import), pipelineVersion: 2,
        job: { id: jobId, status: 'running', progress: 5, stage: 'Preparing document', error: null },
        localUpload: { token: uploadToken, url: 'http://127.0.0.1:17843/document', identity: localParsing.identity, jobId, commandId },
      });
    }
    // Local mode carries metadata only. Empty legacy storage fields mean no
    // cloud object; cleanup paths already skip empty paths. No migration needed.
    const bytes = uploadedFile instanceof File ? new Uint8Array(await uploadedFile.arrayBuffer()) : null;
    const uploadBytes = bytes && isPdfUpload(file) ? await unlockPdfIfNeeded(bytes, statementPassword) : bytes;
    const asset = localDocument ? {
      id: null, storageBucket: "", storagePath: "", contentSha256: localDocument.sha256.toUpperCase(), sizeBytes: localDocument.size, createdObject: false,
    } : await ensureStorageAsset({
      supabase,
      ownerUserId: user.id,
      storageBucket: BANK_STATEMENT_BUCKET,
      bytes: uploadBytes!,
      contentType: file.type || "application/octet-stream",
    });
    if (asset.createdObject) {
      uploadedAsset = {
        storageAssetId: asset.id,
        storageBucket: asset.storageBucket,
        storagePath: asset.storagePath,
      };
    }

    const insertPayload = {
      owner_user_id: user.id,
      bank_account_id: null,
      original_file_name: file.name || "bank-statement",
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      storage_asset_id: asset.id,
      content_sha256: asset.contentSha256,
      mime_type: file.type || null,
      size_bytes: asset.sizeBytes,
      status: "processing",
      statement_period_start: null,
      statement_period_end: null,
      processing_meta: {
        source: localDocument ? "bank_statement_local_document" : "bank_statement_upload",
        sourceRetention: localDocument ? "local_only" : "cloud",
        tallyLedgerName: bankLedgerName,
        selectedContext: {
          localParsing,
          connectionId,
          companyName,
          financialYear,
          bankLedgerName,
          syncBeforeAnalysis,
          liveTallyLedgerNames,
          liveTallyBankAccountCandidates,
        },
        analysis: {
          status: "queued",
          progress: 5,
          stage: localDocument ? "Preparing document" : "Statement uploaded",
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

    if(team) {
      const scope=team.scope;
      const {data:createdImport,error}=await supabase.rpc('access_bank_backend_create',{
        p_actor:user.id,p_org:scope.access.organizationId,p_company:scope.link.company_id,
        p_scope:{connectionId,installationId:scope.connection.installation_id,sessionGeneration:scope.connection.session_generation,
          companyGuid:scope.link.company_guid,financialYear:scope.link.financial_year,companyName:scope.link.company_name,
          organizationId:scope.access.organizationId,companyId:scope.link.company_id},
        p_import:insertPayload,p_job_result:createBankStatementJobResult(),
      });
      if(error)throw error;
      return jsonWithCors(request,serializePreviewFromMeta(createdImport));
    }

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
      ...(localDocument ? { max_attempts: 1 } : {}),
      progress: 5,
      stage: localDocument ? "Preparing document" : "Statement uploaded",
      result: createBankStatementJobResult(),
    });

    if (jobInsertError) throw jobInsertError;

    return jsonWithCors(request, { ...serializePreviewFromMeta(createdImport as Record<string, unknown>),
      ...(uploadToken ? { localUpload: { token: uploadToken, url: "http://127.0.0.1:17843/document" } } : {}),
    });
  } catch (error) {
    const denied=accessFailureResponse(request,error);if(denied)return denied;
    if (v2Attempt) {
      // Database error details can contain an entire rejected command row,
      // including its upload authorization. Never log/return that row.
      console.warn('[bank-v2] Atomic import creation failed. No pipeline fallback was attempted.');
      return jsonWithCors(request, { error: 'Could not create the local analysis job. Check import status before retrying.' }, { status: 500 });
    }
    if (supabase && uploadedAsset) {
      await removeStorageObjectsIfUnreferenced(supabase, [uploadedAsset]);
    }
    if (error instanceof PdfSecurityError) {
      const status =
        error.code === "BANK_STATEMENT_PASSWORD_REQUIRED"
          ? 423
          : error.code === "BANK_STATEMENT_PDF_SERVICE_UNAVAILABLE"
            ? 503
            : 400;
      return jsonWithCors(
        request,
        { error: error.message, code: error.code },
        { status }
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

export const GET = withTeamAccess(GETHandler);
export const POST = withTeamAccess(POSTHandler);
