import type { CaseDoc, Mismatch, QueuedUpload } from "@/types/pipeline";

export type SavedCaseRecord = {
  id: string;
  slug: string;
  displayName: string;
  buyerName: string | null;
  poNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  riskScore: number;
  uploadCount: number;
  documentCount: number;
  mismatchCount: number;
  createdAt: string;
};

export type SavedCaseFile = {
  id: string;
  originalName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  signedUrl: string | null;
};

export type SavedCaseDocument = {
  id: string;
  clientDocumentId: string | null;
  sourceFileName: string | null;
  sourceHint: string | null;
  documentType: string;
  title: string;
  pageCount: number;
  extractedFields: Record<string, unknown>;
  markdown: string;
  createdAt: string;
};

export type SavedCaseMismatch = {
  id: string;
  clientMismatchId: string | null;
  fieldName: string;
  values: Array<{ docId?: string; value?: string | number | null }>;
  analysis: string | null;
  fixPlan: string | null;
  createdAt: string;
};

export type SavedCaseDetail = {
  case: SavedCaseRecord & {
    processingMeta?: Record<string, unknown>;
  };
  files: SavedCaseFile[];
  documents: SavedCaseDocument[];
  mismatches: SavedCaseMismatch[];
};

type CreateCaseResponse = {
  case: SavedCaseRecord;
};

type RecentCasesResponse = {
  cases: SavedCaseRecord[];
};

type CaseDetailResponse = SavedCaseDetail;

function extractApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const errorValue = (payload as { error?: unknown }).error;
  if (typeof errorValue === "string" && errorValue.trim().length > 0) {
    return errorValue;
  }

  if (errorValue && typeof errorValue === "object") {
    const record = errorValue as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

export async function persistProcessedCase(params: {
  uploads: QueuedUpload[];
  documents: CaseDoc[];
  mismatches: Mismatch[];
}): Promise<CreateCaseResponse> {
  const formData = new FormData();
  formData.set("documents", JSON.stringify(params.documents));
  formData.set("mismatches", JSON.stringify(params.mismatches));

  for (const upload of params.uploads) {
    if (upload.file) {
      formData.append("files", upload.file, upload.file.name || upload.name);
    }
  }

  const response = await fetch("/api/cases", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<CreateCaseResponse> & {
    error?: string;
  };

  if (!response.ok || !payload.case) {
    throw new Error(extractApiError(payload, "Failed to save processed case to Supabase."));
  }

  return { case: payload.case };
}

export async function fetchRecentCases(limit = 12): Promise<RecentCasesResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));

  const response = await fetch(`/api/cases?${query.toString()}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as Partial<RecentCasesResponse> & {
    error?: string;
  };

  if (!response.ok || !Array.isArray(payload.cases)) {
    throw new Error(extractApiError(payload, "Failed to load saved cases."));
  }

  return { cases: payload.cases };
}

export async function fetchCaseDetail(caseId: string): Promise<CaseDetailResponse> {
  const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as Partial<CaseDetailResponse> & {
    error?: string;
  };

  if (
    !response.ok ||
    !payload.case ||
    !Array.isArray(payload.files) ||
    !Array.isArray(payload.documents) ||
    !Array.isArray(payload.mismatches)
  ) {
    throw new Error(extractApiError(payload, "Failed to load case details."));
  }

  return {
    case: payload.case,
    files: payload.files,
    documents: payload.documents,
    mismatches: payload.mismatches,
  };
}
