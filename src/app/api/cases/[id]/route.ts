import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "packet-files";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts: string[] = [];

    const message = [record.message, record.error_description, record.error].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );

    if (message) {
      parts.push(message);
    }
    if (typeof record.details === "string" && record.details.trim().length > 0) {
      parts.push(record.details);
    }
    if (typeof record.hint === "string" && record.hint.trim().length > 0) {
      parts.push(`Hint: ${record.hint}`);
    }

    if (parts.length > 0) {
      return parts.join(" ");
    }

    return JSON.stringify(error);
  }

  return String(error ?? "Unknown error");
}

function mapCaseRow(row: {
  id: string;
  slug: string;
  display_name: string;
  buyer_name: string | null;
  po_number: string | null;
  invoice_number: string | null;
  status: string;
  risk_score: number;
  upload_count: number;
  document_count: number;
  mismatch_count: number;
  created_at: string;
  processing_meta?: unknown;
}) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    buyerName: row.buyer_name,
    poNumber: row.po_number,
    invoiceNumber: row.invoice_number,
    status: row.status,
    riskScore: row.risk_score,
    uploadCount: row.upload_count,
    documentCount: row.document_count,
    mismatchCount: row.mismatch_count,
    createdAt: row.created_at,
    processingMeta: row.processing_meta ?? {},
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("packet_cases")
      .select(
        "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, owner_user_id"
      )
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .single();

    if (caseError) {
      if (caseError.code === "PGRST116") {
        return NextResponse.json({ error: "Case not found." }, { status: 404 });
      }
      throw caseError;
    }

    const [{ data: files, error: filesError }, { data: documents, error: docsError }, { data: mismatches, error: mismatchesError }] =
      await Promise.all([
        supabase
          .from("packet_case_files")
          .select("id, original_name, storage_bucket, storage_path, mime_type, size_bytes, created_at")
          .eq("case_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("packet_documents")
          .select(
            "id, client_document_id, source_file_name, source_hint, document_type, title, page_count, extracted_fields, markdown, created_at"
          )
          .eq("case_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("packet_mismatches")
          .select("id, client_mismatch_id, field_name, values_json, analysis, fix_plan, created_at")
          .eq("case_id", id)
          .order("created_at", { ascending: true }),
      ]);

    if (filesError) throw filesError;
    if (docsError) throw docsError;
    if (mismatchesError) throw mismatchesError;

    const filesWithUrls = await Promise.all(
      (files ?? []).map(async (file) => {
        const bucketName = file.storage_bucket || STORAGE_BUCKET;
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(file.storage_path, 60 * 60);

        return {
          id: file.id,
          originalName: file.original_name,
          storageBucket: bucketName,
          storagePath: file.storage_path,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          createdAt: file.created_at,
          signedUrl: signedError ? null : signedData?.signedUrl ?? null,
        };
      })
    );

    return NextResponse.json({
      case: mapCaseRow(caseRow),
      files: filesWithUrls,
      documents: (documents ?? []).map((document) => ({
        id: document.id,
        clientDocumentId: document.client_document_id,
        sourceFileName: document.source_file_name,
        sourceHint: document.source_hint,
        documentType: document.document_type,
        title: document.title,
        pageCount: document.page_count,
        extractedFields:
          document.extracted_fields && typeof document.extracted_fields === "object"
            ? document.extracted_fields
            : {},
        markdown: document.markdown,
        createdAt: document.created_at,
      })),
      mismatches: (mismatches ?? []).map((mismatch) => ({
        id: mismatch.id,
        clientMismatchId: mismatch.client_mismatch_id,
        fieldName: mismatch.field_name,
        values: Array.isArray(mismatch.values_json) ? mismatch.values_json : [],
        analysis: mismatch.analysis,
        fixPlan: mismatch.fix_plan,
        createdAt: mismatch.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeError(error),
      },
      { status: 500 }
    );
  }
}
