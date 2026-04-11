import { NextResponse } from "next/server";

import { summarizeCase } from "@/lib/case-summary";
import { getRecycleBinDeletedAt, isCaseRecycled } from "@/lib/recycle-bin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseDoc, Mismatch } from "@/types/pipeline";

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
    if (typeof record.code === "string" && record.code.trim().length > 0) {
      parts.push(`Code: ${record.code}`);
    }

    const combined = parts.join(" ");
    if (combined) {
      if (/owner_user_id|schema cache/i.test(combined)) {
        return `${combined} Run the auth migration in Supabase using supabase/packet_auth_backend_v2.sql, then retry.`;
      }
      if (/deleted_at|deleted_by_user_id/i.test(combined)) {
        return `${combined} Run the recycle bin migration in Supabase using supabase/packet_recycle_bin_backend_v3.sql, then retry.`;
      }
      return combined;
    }

    return JSON.stringify(error);
  }

  return String(error ?? "Unknown error");
}

function parseJsonField<T>(value: FormDataEntryValue | null, fieldName: string): T {
  if (typeof value !== "string") {
    throw new Error(`Missing ${fieldName} payload.`);
  }
  return JSON.parse(value) as T;
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "upload.pdf";
}

function isFileEntry(entry: FormDataEntryValue): entry is File {
  return typeof entry !== "string";
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
  };
}

export async function GET(request: Request) {
  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? "12");
    const requestedScope = url.searchParams.get("scope");
    const scope = requestedScope === "deleted" ? "deleted" : "active";
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 200)
        : 12;

    let data:
      | Array<{
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
        }>
      | null = null;

    try {
      let query = supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta, deleted_at"
        )
        .eq("owner_user_id", user.id)
        .limit(limit);

      query =
        scope === "deleted"
          ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
          : query.is("deleted_at", null).order("created_at", { ascending: false });

      const result = await query;
      if (result.error) {
        throw result.error;
      }
      data = result.data;
    } catch (error) {
      if (!isRecycleBinSchemaMissing(error)) {
        throw error;
      }

      const fallback = await supabase
        .from("packet_cases")
        .select(
          "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at, processing_meta"
        )
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (fallback.error) {
        throw fallback.error;
      }

      const rows = (fallback.data ?? []).map((row) => ({
        ...row,
        deleted_at: getRecycleBinDeletedAt(row.processing_meta),
      }));

      data =
        scope === "deleted"
          ? rows
              .filter((row) => isCaseRecycled(row.processing_meta))
              .sort((a, b) => {
                const aTime = new Date(a.deleted_at ?? 0).getTime();
                const bTime = new Date(b.deleted_at ?? 0).getTime();
                return bTime - aTime;
              })
          : rows.filter((row) => !isCaseRecycled(row.processing_meta));
    }

    return NextResponse.json({
      cases: (data ?? []).map(mapCaseRow),
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

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  const uploadedPaths: string[] = [];
  let caseId = "";

  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    supabase = createSupabaseAdminClient();
    const formData = await request.formData();
    const documents = parseJsonField<CaseDoc[]>(formData.get("documents"), "documents");
    const mismatches = parseJsonField<Mismatch[]>(formData.get("mismatches"), "mismatches");
    const files = formData.getAll("files").filter(isFileEntry);

    if (!documents.length) {
      return NextResponse.json(
        { error: "No processed documents were provided to save." },
        { status: 400 }
      );
    }

    const summary = summarizeCase(documents, mismatches);
    caseId = crypto.randomUUID();

    const fileRows = [];
    for (const file of files) {
      const storagePath = `${caseId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const binary = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, binary, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

      if (uploadError) {
        throw uploadError;
      }

      uploadedPaths.push(storagePath);
      fileRows.push({
        case_id: caseId,
        original_name: file.name,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size,
      });
    }

    const caseRow = {
      id: caseId,
      owner_user_id: user.id,
      slug: summary.slug,
      display_name: summary.displayName,
      buyer_name: summary.buyerName || null,
      po_number: summary.poNumber || null,
      invoice_number: summary.invoiceNumber || null,
      status: "completed",
      risk_score: summary.riskScore,
      upload_count: files.length,
      document_count: documents.length,
      mismatch_count: mismatches.length,
      processing_meta: {
        documentTypes: summary.documentTypes,
        missingDocumentGroups: summary.missingDocTypes,
        paymentGap: summary.paymentGap,
      },
    };

    const { data: insertedCase, error: caseError } = await supabase
      .from("packet_cases")
      .insert(caseRow)
      .select(
        "id, slug, display_name, buyer_name, po_number, invoice_number, status, risk_score, upload_count, document_count, mismatch_count, created_at"
      )
      .single();

    if (caseError) {
      throw caseError;
    }

    if (fileRows.length) {
      const { error: fileInsertError } = await supabase.from("packet_case_files").insert(fileRows);
      if (fileInsertError) {
        throw fileInsertError;
      }
    }

    const documentRows = documents.map((document) => ({
      case_id: caseId,
      client_document_id: document.id,
      source_file_name: document.sourceHint ?? null,
      source_hint: document.sourceHint ?? null,
      document_type: document.type,
      title: document.title,
      page_count: document.pages,
      extracted_fields: document.fields ?? {},
      markdown: document.md ?? "",
    }));

    const { error: documentInsertError } = await supabase.from("packet_documents").insert(documentRows);
    if (documentInsertError) {
      throw documentInsertError;
    }

    if (mismatches.length) {
      const mismatchRows = mismatches.map((mismatch) => ({
        case_id: caseId,
        client_mismatch_id: mismatch.id,
        field_name: mismatch.field,
        values_json: mismatch.values ?? [],
        analysis: mismatch.analysis ?? null,
        fix_plan: mismatch.fixPlan ?? null,
      }));

      const { error: mismatchInsertError } = await supabase.from("packet_mismatches").insert(mismatchRows);
      if (mismatchInsertError) {
        throw mismatchInsertError;
      }
    }

    return NextResponse.json(
      {
        case: mapCaseRow(insertedCase),
      },
      { status: 201 }
    );
  } catch (error) {
    if (supabase && uploadedPaths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
    }

    if (supabase && caseId) {
      await supabase.from("packet_cases").delete().eq("id", caseId);
    }

    return NextResponse.json(
      {
        error: serializeError(error),
      },
      { status: 500 }
    );
  }
}
