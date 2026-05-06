import { jsonWithCors } from "@/lib/api/cors";
import { resolveCaseDisplayNameWithAI } from "@/lib/case-naming";
import { serializeFieldsWithLineItems } from "@/lib/line-items";
import { processStoredCaseFiles } from "@/lib/processing/pipeline";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CaseAnalysisMode } from "@/types/pipeline";

const WORKER_SECRET = process.env.WORKER_SECRET || "";

function unauthorized(request: Request) {
  return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function readAnalysisMode(value: unknown): CaseAnalysisMode {
  return value === "smart_split" ? "smart_split" : "standard";
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

  const { data: caseRow, error: caseError } = await supabase
    .from("packet_cases")
    .select("id, upload_count, processing_meta")
    .eq("id", job.case_id)
    .single();

  if (caseError) {
    return jsonWithCors(request, { error: toMessage(caseError) }, { status: 500 });
  }

  const updateJob = async (fields: Record<string, unknown>, options?: { onlyWhenRunning?: boolean }) => {
    let query = supabase.from("packet_processing_jobs").update(fields).eq("id", id);
    if (options?.onlyWhenRunning) {
      query = query.eq("status", "running");
    }
    const { error } = await query;
    if (error) {
      throw error;
    }
  };

  try {
    await updateJob({
      stage: "Preparing files",
      progress: 2,
      error: null,
      locked_at: now,
    });

    const jobResult = job.result && typeof job.result === "object" ? (job.result as Record<string, unknown>) : {};
    const analysisMode = readAnalysisMode(jobResult.analysisMode);
    const comparisonOptions = jobResult.comparisonOptions;

    const processed = await processStoredCaseFiles({
      caseId: job.case_id,
      analysisMode,
      comparisonOptions,
      onProgress: async ({ progress, stage }) => {
        await updateJob({
          progress,
          stage,
          error: null,
        }, { onlyWhenRunning: true });
      },
    });
    const displayName = await resolveCaseDisplayNameWithAI(
      processed.documents,
      processed.summary
    );

    await updateJob({
      stage: "Saving extracted results",
      progress: 96,
    });

    const [
      { count: uploadCount, error: countError },
      { error: documentDeleteError },
      { error: mismatchDeleteError },
    ] = await Promise.all([
      supabase
        .from("packet_case_files")
        .select("id", { count: "exact", head: true })
        .eq("case_id", job.case_id),
      supabase.from("packet_documents").delete().eq("case_id", job.case_id),
      supabase.from("packet_mismatches").delete().eq("case_id", job.case_id),
    ]);

    if (countError) throw countError;
    if (documentDeleteError) throw documentDeleteError;
    if (mismatchDeleteError) throw mismatchDeleteError;

    const documentRows = processed.documents.map((document) => ({
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

    if (processed.mismatches.length > 0) {
      const mismatchRows = processed.mismatches.map((mismatch) => ({
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

    const existingMeta =
      caseRow.processing_meta && typeof caseRow.processing_meta === "object"
        ? (caseRow.processing_meta as Record<string, unknown>)
        : {};

    const { error: updateCaseError } = await supabase
      .from("packet_cases")
      .update({
        slug: processed.summary.slug,
        display_name: displayName,
        buyer_name: processed.summary.buyerName || null,
        po_number: processed.summary.poNumber || null,
        invoice_number: processed.summary.invoiceNumber || null,
        status: "completed",
        risk_score: processed.summary.riskScore,
        upload_count: uploadCount ?? caseRow.upload_count,
        document_count: processed.documents.length,
        mismatch_count: processed.mismatches.length,
        processing_meta: {
          ...existingMeta,
          draft: false,
          analyzedAt: new Date().toISOString(),
          caseCategory: processed.summary.category,
          packetCategory: processed.summary.packetCategory,
          documentTypes: processed.summary.documentTypes,
          missingDocumentGroups: processed.summary.missingDocTypes,
          paymentGap: processed.summary.paymentGap,
          analysisMode,
          comparisonOptions: processed.comparisonOptions,
          verificationGroups: processed.verificationGroups,
          lastProcessingError: null,
        },
      })
      .eq("id", job.case_id);

    if (updateCaseError) {
      throw updateCaseError;
    }

    await updateJob({
      status: "succeeded",
      progress: 100,
      stage: "Completed",
      error: null,
      result: {
        summary: processed.summary,
        analysisMode,
        documentCount: processed.documents.length,
        mismatchCount: processed.mismatches.length,
        verificationGroupCount: processed.verificationGroups.length,
      },
      finished_at: new Date().toISOString(),
    });

    return jsonWithCors(request, { ok: true });
  } catch (error) {
    const message = toMessage(error);
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
