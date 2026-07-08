import { jsonWithCors } from "@/lib/api/cors";
import { resolveCaseDisplayNameWithAI } from "@/lib/case-naming";
import { summarizeCase } from "@/lib/case-summary";
import { getPersistedPacketFieldConfiguration } from "@/lib/field-settings-service";
import { serializeFieldsWithLineItems } from "@/lib/line-items";
import { mergePersistedStructuredData } from "@/lib/persisted-structured-data";
import {
  splitAnalyzedCaseIntoShipmentCases,
  type CaseFileRowForSplit,
} from "@/lib/processing/case-splitting";
import {
  assessCaseTermsComplianceDetailed,
  enrichProcessedDocuments,
  processStoredCaseFiles,
  reviewAndCorrectExtractedDocuments,
  verifyProcessedDocuments,
} from "@/lib/processing/pipeline";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TERMS_COMPLIANCE_MISMATCH_MODE } from "@/lib/terms-compliance";
import type { CaseAnalysisMode } from "@/types/pipeline";
import { randomUUID } from "crypto";

const WORKER_SECRET = process.env.WORKER_SECRET || "";
const STALE_JOB_RUN_MESSAGE = "This processing run was superseded by another worker run.";

class StaleJobRunError extends Error {
  constructor(message = STALE_JOB_RUN_MESSAGE) {
    super(message);
    this.name = "StaleJobRunError";
  }
}

function unauthorized(request: Request) {
  return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function readAnalysisMode(value: unknown): CaseAnalysisMode {
  return value === "smart_split" ? "smart_split" : "standard";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!WORKER_SECRET || request.headers.get("x-worker-secret") !== WORKER_SECRET) {
    return unauthorized(request);
  }

  const { id } = await context.params;
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: job, error: jobError } = await supabase
    .from("packet_processing_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (jobError) {
    return jsonWithCors(request, { error: toMessage(jobError) }, { status: 500 });
  }

  if (job.status !== "running") {
    return jsonWithCors(request, { error: "Job is not in a runnable state." }, { status: 409 });
  }

  const runId = randomUUID();
  const jobResult = readRecord(job.result);
  const lockedBy = typeof job.locked_by === "string" && job.locked_by.trim() ? job.locked_by : null;
  const attemptCount = asNumber(job.attempt_count);
  if (!lockedBy) {
    return jsonWithCors(request, { error: "Job has no worker lock." }, { status: 409 });
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("packet_cases")
    .select("id, owner_user_id, upload_count, processing_meta")
    .eq("id", job.case_id)
    .single();

  if (caseError) {
    return jsonWithCors(request, { error: toMessage(caseError) }, { status: 500 });
  }

  const assertCurrentRun = async () => {
    const { data: currentJob, error } = await supabase
      .from("packet_processing_jobs")
      .select("status, locked_by, attempt_count, result")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    const currentResult = readRecord(currentJob.result);
    if (
      currentJob.status !== "running" ||
      currentJob.locked_by !== lockedBy ||
      asNumber(currentJob.attempt_count) !== attemptCount ||
      currentResult.activeRunId !== runId
    ) {
      throw new StaleJobRunError();
    }
  };

  const updateCurrentJob = async (fields: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from("packet_processing_jobs")
      .update(fields)
      .eq("id", id)
      .eq("status", "running")
      .eq("locked_by", lockedBy)
      .eq("attempt_count", attemptCount)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new StaleJobRunError();
    }
  };

  const deleteDuplicateAnalysisRows = async (caseId: string) => {
    const [{ data: documentRows, error: documentError }, { data: mismatchRows, error: mismatchError }] =
      await Promise.all([
        supabase
          .from("packet_documents")
          .select("id, client_document_id, source_file_name, source_hint, document_type, title, created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: false }),
        supabase
          .from("packet_mismatches")
          .select("id, client_mismatch_id, field_name, values_json, created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: false }),
      ]);

    if (documentError) throw documentError;
    if (mismatchError) throw mismatchError;

    const documentSeen = new Set<string>();
    const duplicateDocumentIds: string[] = [];
    for (const row of documentRows ?? []) {
      const key = [
        row.client_document_id || "",
        row.source_file_name || "",
        row.source_hint || "",
        row.document_type || "",
        row.title || "",
      ].join("::");
      if (documentSeen.has(key)) {
        duplicateDocumentIds.push(row.id);
      } else {
        documentSeen.add(key);
      }
    }

    const mismatchSeen = new Set<string>();
    const duplicateMismatchIds: string[] = [];
    for (const row of mismatchRows ?? []) {
      const key = [
        row.client_mismatch_id || "",
        row.field_name || "",
        JSON.stringify(row.values_json ?? []),
      ].join("::");
      if (mismatchSeen.has(key)) {
        duplicateMismatchIds.push(row.id);
      } else {
        mismatchSeen.add(key);
      }
    }

    await Promise.all([
      duplicateDocumentIds.length
        ? supabase.from("packet_documents").delete().in("id", duplicateDocumentIds)
        : Promise.resolve({ error: null }),
      duplicateMismatchIds.length
        ? supabase.from("packet_mismatches").delete().in("id", duplicateMismatchIds)
        : Promise.resolve({ error: null }),
    ]).then((results) => {
      for (const result of results) {
        if (result.error) throw result.error;
      }
    });
  };

  try {
    await updateCurrentJob({
      stage: "Preparing files",
      progress: 2,
      error: null,
      locked_at: now,
      result: {
        ...jobResult,
        activeRunId: runId,
        activeRunStartedAt: now,
      },
    });

    const analysisMode = readAnalysisMode(jobResult.analysisMode);
    const comparisonOptions = jobResult.comparisonOptions;
    const fieldConfiguration = await getPersistedPacketFieldConfiguration();

    const processed = await processStoredCaseFiles({
      caseId: job.case_id,
      analysisMode,
      comparisonOptions,
      onProgress: async ({ progress, stage }) => {
        await updateCurrentJob({
          progress,
          stage,
          error: null,
        });
      },
    });

    await assertCurrentRun();

    await updateCurrentJob({
      stage: "Preparing extracted results",
      progress: 93,
    });

    await assertCurrentRun();

    const [
      { data: existingDocuments, error: existingDocumentsError },
      { data: storedCaseFiles, error: caseFilesError },
      { error: documentDeleteError },
      { error: mismatchDeleteError },
    ] = await Promise.all([
      supabase
        .from("packet_documents")
        .select("client_document_id, source_file_name, source_hint, document_type, title, extracted_fields")
        .eq("case_id", job.case_id),
      supabase
        .from("packet_case_files")
        .select("id, original_name, storage_bucket, storage_path, mime_type, size_bytes, created_at")
        .eq("case_id", job.case_id)
        .order("created_at", { ascending: true }),
      supabase.from("packet_documents").delete().eq("case_id", job.case_id),
      supabase.from("packet_mismatches").delete().eq("case_id", job.case_id),
    ]);

    if (existingDocumentsError) throw existingDocumentsError;
    if (caseFilesError) throw caseFilesError;
    if (documentDeleteError) throw documentDeleteError;
    if (mismatchDeleteError) throw mismatchDeleteError;

    let documents = enrichProcessedDocuments(
      mergePersistedStructuredData(
        processed.documents,
        existingDocuments ?? [],
        fieldConfiguration
      )
    );
    await updateCurrentJob({
      stage: "Reviewing extraction accuracy",
      progress: 94,
    });
    await assertCurrentRun();

    const extractionReview = await reviewAndCorrectExtractedDocuments(documents);
    documents = enrichProcessedDocuments(extractionReview.documents);

    await updateCurrentJob({
      stage: "Saving reviewed results",
      progress: 96,
    });
    await assertCurrentRun();

    const existingMeta =
      caseRow.processing_meta && typeof caseRow.processing_meta === "object"
        ? (caseRow.processing_meta as Record<string, unknown>)
        : {};

    const splitResult = await splitAnalyzedCaseIntoShipmentCases({
      supabase,
      caseId: job.case_id,
      ownerUserId: caseRow.owner_user_id,
      existingMeta,
      documents,
      comparisonOptions: processed.comparisonOptions,
      analysisMode,
      fieldConfiguration,
      caseFiles: (storedCaseFiles ?? []) as CaseFileRowForSplit[],
      extractionReview: extractionReview.review,
    });

    if (splitResult) {
      await deleteDuplicateAnalysisRows(job.case_id);
      await assertCurrentRun();

      await updateCurrentJob({
        status: "succeeded",
        progress: 100,
        stage: "Completed",
        error: null,
        result: {
          summary: splitResult.primary.summary,
          analysisMode,
          documentCount: splitResult.primary.documents.length,
          mismatchCount: splitResult.primary.mismatches.length,
          verificationGroupCount: splitResult.primary.verificationGroups.length,
          splitResult: {
            strategy: splitResult.strategy,
            shipmentCount: splitResult.shipmentCount,
            primaryCaseId: splitResult.primary.caseId,
            childCaseIds: splitResult.children.map((child) => child.caseId),
          },
          extractionReview: extractionReview.review,
        },
        finished_at: new Date().toISOString(),
      });

      return jsonWithCors(request, { ok: true, splitResult: true });
    }

    const baseVerified = verifyProcessedDocuments(documents, processed.comparisonOptions);
    const termsCompliance = await assessCaseTermsComplianceDetailed(documents);
    const verified = {
      ...baseVerified,
      mismatches: [...baseVerified.mismatches, ...termsCompliance.mismatches],
    };
    const summary = summarizeCase(documents, verified.mismatches, fieldConfiguration);
    const displayName = await resolveCaseDisplayNameWithAI(documents, summary);

    const documentRows = documents.map((document) => ({
      case_id: job.case_id,
      client_document_id: document.id,
      source_file_name: document.sourceFileName ?? document.sourceHint ?? null,
      source_hint: document.sourceHint ?? null,
      document_type: document.type,
      title: document.title,
      page_count: document.pages,
      extracted_fields: serializeFieldsWithLineItems(document),
      markdown: document.md ?? "",
    }));

    const { error: insertDocumentError } = await supabase.from("packet_documents").insert(documentRows);
    if (insertDocumentError) {
      throw insertDocumentError;
    }

    if (verified.mismatches.length > 0) {
      const mismatchRows = verified.mismatches.map((mismatch) => ({
        case_id: job.case_id,
        client_mismatch_id: mismatch.id,
        field_name: mismatch.field,
        values_json: mismatch.values ?? [],
        analysis: mismatch.analysis ?? null,
        fix_plan: mismatch.fixPlan ?? null,
      }));

      const { error: insertMismatchError } = await supabase.from("packet_mismatches").insert(mismatchRows);
      if (insertMismatchError) {
        throw insertMismatchError;
      }
    }

    await deleteDuplicateAnalysisRows(job.case_id);
    await assertCurrentRun();

    const { error: updateCaseError } = await supabase
      .from("packet_cases")
      .update({
        slug: summary.slug,
        display_name: displayName,
        buyer_name: summary.buyerName || null,
        po_number: summary.poNumber || null,
        invoice_number: summary.invoiceNumber || null,
        status: "completed",
        risk_score: summary.riskScore,
        upload_count: storedCaseFiles?.length ?? caseRow.upload_count,
        document_count: documents.length,
        mismatch_count: verified.mismatches.length,
        processing_meta: {
          ...existingMeta,
          draft: false,
          analyzedAt: new Date().toISOString(),
          caseCategory: summary.category,
          packetCategory: summary.packetCategory,
          documentTypes: summary.documentTypes,
          missingDocumentGroups: summary.missingDocTypes,
          paymentGap: summary.paymentGap,
          analysisMode,
          comparisonOptions: processed.comparisonOptions,
          verificationGroups: verified.verificationGroups,
          termsComplianceChecklist: termsCompliance.checklist,
          termsComplianceMismatchMode: TERMS_COMPLIANCE_MISMATCH_MODE,
          extractionReview: extractionReview.review,
          lastProcessingError: null,
        },
      })
      .eq("id", job.case_id);

    if (updateCaseError) {
      throw updateCaseError;
    }

    await updateCurrentJob({
      status: "succeeded",
      progress: 100,
      stage: "Completed",
      error: null,
      result: {
        summary,
        analysisMode,
        documentCount: documents.length,
        mismatchCount: verified.mismatches.length,
        verificationGroupCount: verified.verificationGroups.length,
        extractionReview: extractionReview.review,
      },
      finished_at: new Date().toISOString(),
    });

    return jsonWithCors(request, { ok: true });
  } catch (error) {
    const message = toMessage(error);
    if (error instanceof StaleJobRunError) {
      return jsonWithCors(request, { ok: false, stale: true, error: message }, { status: 409 });
    }

    const shouldRetry = job.attempt_count < job.max_attempts;
    const nextRunAt = new Date(
      Date.now() + Math.min(60_000 * Math.pow(2, Math.max(0, job.attempt_count - 1)), 15 * 60_000)
    ).toISOString();

    await supabase
      .from("packet_processing_jobs")
      .update(
        shouldRetry
          ? {
              status: "queued",
              progress: 0,
              stage: "Queued for retry",
              error: message,
              locked_at: null,
              locked_by: null,
              next_run_at: nextRunAt,
            }
          : {
              status: "failed",
              progress: 100,
              stage: "Failed",
              error: message,
              finished_at: new Date().toISOString(),
            }
      )
      .eq("id", id);

    await supabase
      .from("packet_cases")
      .update({
        status: shouldRetry ? "processing" : "failed",
        processing_meta: {
          ...(caseRow.processing_meta && typeof caseRow.processing_meta === "object"
            ? (caseRow.processing_meta as Record<string, unknown>)
            : {}),
          lastProcessingError: message,
        },
      })
      .eq("id", job.case_id);

    return jsonWithCors(request, { error: message }, { status: 500 });
  }
}
