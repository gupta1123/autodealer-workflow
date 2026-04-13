import type { CaseDoc, ComparisonOptions, Mismatch, QueuedUpload } from "@/types/pipeline";

export type SavedCaseRecord = {
  id: string;
  slug: string;
  displayName: string;
  buyerName: string | null;
  receiverName: string | null;
  category: string;
  poNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  riskScore: number;
  uploadCount: number;
  documentCount: number;
  mismatchCount: number;
  createdAt: string;
  deletedAt: string | null;
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
export type CaseListScope = "active" | "deleted";
export type CaseDecision = "accepted" | "rejected";

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
  comparisonOptions?: ComparisonOptions;
}): Promise<CreateCaseResponse> {
  const formData = new FormData();
  formData.set("documents", JSON.stringify(params.documents));
  formData.set("mismatches", JSON.stringify(params.mismatches));
  if (params.comparisonOptions) {
    formData.set("comparisonOptions", JSON.stringify(params.comparisonOptions));
  }

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

export async function createDraftCase(params: {
  uploads: QueuedUpload[];
}): Promise<CreateCaseResponse> {
  const formData = new FormData();
  formData.set("mode", "draft");

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
    throw new Error(extractApiError(payload, "Failed to create draft case."));
  }

  return { case: payload.case };
}

export async function appendCaseFiles(
  caseId: string,
  uploads: QueuedUpload[],
  mode: "append" | "overwrite" = "append"
): Promise<CreateCaseResponse> {
  const formData = new FormData();
  formData.set("mode", mode);

  for (const upload of uploads) {
    if (upload.file) {
      formData.append("files", upload.file, upload.file.name || upload.name);
    }
  }

  const response = await fetch(`/api/cases/${caseId}/files`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<CreateCaseResponse> & {
    error?: string;
  };

  if (!response.ok || !payload.case) {
    throw new Error(extractApiError(payload, "Failed to add files to case."));
  }

  return { case: payload.case };
}

export async function saveCaseAnalysis(
  caseId: string,
  params: {
    documents: CaseDoc[];
    mismatches: Mismatch[];
    comparisonOptions?: ComparisonOptions;
  }
): Promise<CreateCaseResponse> {
  const formData = new FormData();
  formData.set("documents", JSON.stringify(params.documents));
  formData.set("mismatches", JSON.stringify(params.mismatches));
  if (params.comparisonOptions) {
    formData.set("comparisonOptions", JSON.stringify(params.comparisonOptions));
  }

  const response = await fetch(`/api/cases/${caseId}/analysis`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<CreateCaseResponse> & {
    error?: string;
  };

  if (!response.ok || !payload.case) {
    throw new Error(extractApiError(payload, "Failed to save case analysis."));
  }

  return { case: payload.case };
}

export async function fetchRecentCases(limit = 12): Promise<RecentCasesResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  query.set("scope", "active");

  const response = await fetch(`/api/cases?${query.toString()}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as Partial<RecentCasesResponse> & {
    error?: string;
  };

  if (!response.ok || !Array.isArray(payload.cases)) {
    throw new Error(extractApiError(payload, "Failed to load saved cases."));
  }

  return { cases: payload.cases };
}

export async function fetchCasesByScope(
  scope: CaseListScope,
  limit = 100
): Promise<RecentCasesResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  query.set("scope", scope);

  const response = await fetch(`/api/cases?${query.toString()}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as Partial<RecentCasesResponse> & {
    error?: string;
  };

  if (!response.ok || !Array.isArray(payload.cases)) {
    throw new Error(extractApiError(payload, "Failed to load saved cases."));
  }

  return { cases: payload.cases };
}

async function mutateCase(
  caseId: string,
  init: RequestInit,
  fallback: string,
  path = `/api/cases/${caseId}`
): Promise<{ case: SavedCaseRecord }> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as Partial<CreateCaseResponse> & {
    error?: unknown;
  };

  if (!response.ok || !payload.case) {
    throw new Error(extractApiError(payload, fallback));
  }

  return { case: payload.case };
}

export async function recycleCase(caseId: string) {
  return mutateCase(
    caseId,
    { method: "DELETE" },
    "Failed to move case to the recycle bin."
  );
}

export async function restoreCase(caseId: string) {
  return mutateCase(
    caseId,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    },
    "Failed to restore case from the recycle bin."
  );
}

export async function updateCaseDecision(caseId: string, decision: CaseDecision) {
  return mutateCase(
    caseId,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: decision === "accepted" ? "accept" : "reject" }),
    },
    `Failed to ${decision === "accepted" ? "accept" : "reject"} case.`
  );
}

export async function deleteCaseForever(caseId: string) {
  return mutateCase(
    caseId,
    { method: "DELETE" },
    "Failed to permanently delete case.",
    `/api/cases/${caseId}?mode=hard`
  );
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
