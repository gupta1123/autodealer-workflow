import { NextResponse } from "next/server";

import {
  getRecycleBinDeletedAt,
  isCaseRecycled,
  withRecycleBinMetadata,
  withoutRecycleBinMetadata,
} from "@/lib/recycle-bin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "packet-files";

function isRecycleBinSchemaMissing(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = [
    record.message,
    record.error,
    record.details,
    record.hint,
    record.error_description,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  const mentionsRecycleColumns = /deleted_at|deleted_by_user_id/i.test(message);
  const isMissingColumnError =
    /schema cache|could not find|column .* does not exist|42703|PGRST/i.test(`${code} ${message}`);

  return mentionsRecycleColumns && isMissingColumnError;
}

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
      const combined = parts.join(" ");
      if (/deleted_at|deleted_by_user_id/i.test(combined)) {
        return `${combined} Run the recycle bin migration in Supabase using supabase/packet_recycle_bin_backend_v3.sql, then retry.`;
      }
      return combined;
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
  deleted_at?: string | null;
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
    deletedAt: row.deleted_at ?? getRecycleBinDeletedAt(row.processing_meta),
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

    let caseRow:
      | {
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
          deleted_at?: string | null;
        }
      | null = null;

    try {
      const result = await supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, owner_user_id, deleted_at"
        )
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .is("deleted_at", null)
        .single();

      if (result.error) {
        if (result.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw result.error;
      }

      caseRow = result.data;
    } catch (error) {
      if (!isRecycleBinSchemaMissing(error)) {
        throw error;
      }

      const fallback = await supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, owner_user_id"
        )
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .single();

      if (fallback.error) {
        if (fallback.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw fallback.error;
      }

      if (isCaseRecycled(fallback.data.processing_meta)) {
        return NextResponse.json({ error: "Case not found." }, { status: 404 });
      }

      caseRow = {
        ...fallback.data,
        deleted_at: getRecycleBinDeletedAt(fallback.data.processing_meta),
      };
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "hard" ? "hard" : "soft";

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    if (mode === "hard") {
      let canHardDeleteWithColumn = true;

      try {
        const { error: schemaCheckError } = await supabase
          .from("packet_cases")
          .select("deleted_at")
          .eq("id", id)
          .limit(1);

        if (schemaCheckError) {
          throw schemaCheckError;
        }
      } catch (error) {
        if (!isRecycleBinSchemaMissing(error)) {
          throw error;
        }
        canHardDeleteWithColumn = false;
      }

      const { data: storedFiles, error: filesError } = await supabase
        .from("packet_case_files")
        .select("storage_bucket, storage_path")
        .eq("case_id", id);

      if (filesError) {
        throw filesError;
      }

      const filesByBucket = new Map<string, string[]>();
      for (const file of storedFiles ?? []) {
        const bucketName = file.storage_bucket || STORAGE_BUCKET;
        const currentPaths = filesByBucket.get(bucketName) ?? [];
        currentPaths.push(file.storage_path);
        filesByBucket.set(bucketName, currentPaths);
      }

      for (const [bucketName, paths] of filesByBucket.entries()) {
        if (!paths.length) continue;
        const { error: removeError } = await supabase.storage.from(bucketName).remove(paths);
        if (removeError) {
          throw removeError;
        }
      }

      if (!canHardDeleteWithColumn) {
        const existing = await supabase
          .from("packet_cases")
          .select(
            "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
          )
          .eq("id", id)
          .eq("owner_user_id", user.id)
          .single();

        if (existing.error) {
          if (existing.error.code === "PGRST116") {
            return NextResponse.json({ error: "Case not found." }, { status: 404 });
          }
          throw existing.error;
        }

        if (!isCaseRecycled(existing.data.processing_meta)) {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }

        const removed = await supabase
          .from("packet_cases")
          .delete()
          .eq("id", id)
          .eq("owner_user_id", user.id)
          .select(
            "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
          )
          .single();

        if (removed.error) {
          if (removed.error.code === "PGRST116") {
            return NextResponse.json({ error: "Case not found." }, { status: 404 });
          }
          throw removed.error;
        }

        return NextResponse.json({ case: mapCaseRow(existing.data) });
      }

      const { data, error } = await supabase
        .from("packet_cases")
        .delete()
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .not("deleted_at", "is", null)
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, deleted_at"
        )
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw error;
      }

      return NextResponse.json({ case: mapCaseRow(data) });
    }

    let data:
      | {
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
          deleted_at?: string | null;
        }
      | null = null;

    try {
      const result = await supabase
        .from("packet_cases")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user.id,
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .is("deleted_at", null)
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, deleted_at"
        )
        .single();

      if (result.error) {
        if (result.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw result.error;
      }

      data = result.data;
    } catch (error) {
      if (!isRecycleBinSchemaMissing(error)) {
        throw error;
      }

      const existing = await supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
        )
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .single();

      if (existing.error) {
        if (existing.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw existing.error;
      }

      if (isCaseRecycled(existing.data.processing_meta)) {
        return NextResponse.json({ error: "Case not found." }, { status: 404 });
      }

      const deletedAt = new Date().toISOString();
      const updated = await supabase
        .from("packet_cases")
        .update({
          processing_meta: withRecycleBinMetadata(existing.data.processing_meta, deletedAt, user.id),
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
        )
        .single();

      if (updated.error) {
        throw updated.error;
      }

      data = {
        ...updated.data,
        deleted_at: deletedAt,
      };
    }

    return NextResponse.json({ case: mapCaseRow(data) });
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeError(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { action?: string };

    if (payload.action !== "restore") {
      return NextResponse.json({ error: "Unsupported case action." }, { status: 400 });
    }

    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    let data:
      | {
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
          deleted_at?: string | null;
        }
      | null = null;

    try {
      const result = await supabase
        .from("packet_cases")
        .update({
          deleted_at: null,
          deleted_by_user_id: null,
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .not("deleted_at", "is", null)
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, deleted_at"
        )
        .single();

      if (result.error) {
        if (result.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw result.error;
      }

      data = result.data;
    } catch (error) {
      if (!isRecycleBinSchemaMissing(error)) {
        throw error;
      }

      const existing = await supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
        )
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .single();

      if (existing.error) {
        if (existing.error.code === "PGRST116") {
          return NextResponse.json({ error: "Case not found." }, { status: 404 });
        }
        throw existing.error;
      }

      if (!isCaseRecycled(existing.data.processing_meta)) {
        return NextResponse.json({ error: "Case not found." }, { status: 404 });
      }

      const updated = await supabase
        .from("packet_cases")
        .update({
          processing_meta: withoutRecycleBinMetadata(existing.data.processing_meta),
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
        )
        .single();

      if (updated.error) {
        throw updated.error;
      }

      data = {
        ...updated.data,
        deleted_at: null,
      };
    }

    return NextResponse.json({ case: mapCaseRow(data) });
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeError(error),
      },
      { status: 500 }
    );
  }
}
