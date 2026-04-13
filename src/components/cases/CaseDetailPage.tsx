"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Folder,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Database,
  Play,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { AnalysisOptionsDialog } from "@/components/workspace/AnalysisOptionsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  areComparableValuesEqual,
  getComparableFieldValue,
  getComparisonDisplayLabel,
  pickCanonicalComparableValue,
  readComparisonOptions,
} from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  getFieldDefinitionsByKeys,
  getFieldDefinitionsForDocType,
  shouldConsiderFieldKey,
} from "@/lib/document-schema";
import {
  fetchCaseDetail,
  saveCaseAnalysis,
  updateCaseDecision,
  type CaseDecision,
  type SavedCaseDetail,
} from "@/lib/case-persistence";
import { orchestrateUploads } from "@/services/orchestration";
import type {
  ComparisonOptions,
  DocType,
  FieldKey,
  PipelineStageId,
  PipelineStageProgress,
  QueuedUpload,
} from "@/types/pipeline";

type LoadState = "loading" | "ready" | "error";
type ActiveTab = "preview" | "data" | "ocr";

const DETAIL_TABS: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "data", label: "Extracted Data", icon: Database },
  { id: "ocr", label: "OCR Text", icon: FileText },
];

const STAGE_SEQUENCE: PipelineStageId[] = [
  "upload_received",
  "classifying",
  "ocr",
  "extracting",
  "validating",
  "complete",
];

const FIELD_LABEL_LOOKUP = ACTIVE_FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<string, string>
);

function getOrderedDocumentEntries(
  documentType: string,
  extractedFields: Record<string, unknown>
) {
  const visibleEntries = Object.entries(extractedFields).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  const relevantDefinitions = getFieldDefinitionsForDocType(documentType);
  const relevantKeys = relevantDefinitions.map(({ key }) => key);
  const relevantKeySet = new Set(relevantKeys);
  const remainingKeys = visibleEntries
    .map(([key]) => key)
    .filter((key) => !relevantKeySet.has(key as (typeof relevantKeys)[number]));

  return getFieldDefinitionsByKeys([...relevantKeys, ...remainingKeys]).flatMap(({ key }) => {
    const value = extractedFields[key];
    if (value === null || value === undefined || value === "") {
      return [];
    }
    return [[key, value] as [string, unknown]];
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getSourceFileLabel(mimeType?: string | null, sourceName?: string | null) {
  if (mimeType?.startsWith("image/")) return "Image";
  if (mimeType === "application/pdf") return "PDF";
  if (sourceName && /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(sourceName)) return "Image";
  if (sourceName && /\.pdf$/i.test(sourceName)) return "PDF";
  return "File";
}

function getCaseStatusLabel(status: string) {
  if (status === "draft") return "Draft";
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "completed") return "Completed";
  return "Pending";
}

function getCaseStatusClassName(status: string) {
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "processing") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function buildInitialStages(): PipelineStageProgress[] {
  return STAGE_SEQUENCE.map((stage, index) => ({
    stage,
    status: index === 0 ? "active" : "pending",
    startedAt: index === 0 ? Date.now() : undefined,
  }));
}

async function savedFileToUpload(
  file: SavedCaseDetail["files"][number],
  index: number
): Promise<QueuedUpload> {
  if (!file.signedUrl) {
    throw new Error(`Unable to access ${file.originalName}. Please refresh and try again.`);
  }

  const response = await fetch(file.signedUrl);
  if (!response.ok) {
    throw new Error(`Unable to download ${file.originalName} for analysis.`);
  }

  const blob = await response.blob();
  const uploadFile = new File([blob], file.originalName, {
    type: file.mimeType || blob.type || "application/pdf",
  });

  return {
    id: `${file.id}-${index}`,
    name: file.originalName,
    file: uploadFile,
    stages: buildInitialStages(),
  };
}

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "processing" | "saving" | "error">("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOptionsOpen, setAnalysisOptionsOpen] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "updating" | "error">("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");

  useEffect(() => {
    let active = true;

    fetchCaseDetail(caseId)
      .then((payload) => {
        if (!active) return;
        setDetail(payload);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load case details.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (!detail) return;
    setActiveDocumentId((current) => {
      if (current && detail.documents.some((document) => document.id === current)) {
        return current;
      }
      return detail.documents[0]?.id ?? null;
    });
  }, [detail]);

  const fileLookup = useMemo(() => {
    const map = new Map<string, SavedCaseDetail["files"][number]>();
    detail?.files.forEach((file) => {
      map.set(normalizeText(file.originalName), file);
    });
    return map;
  }, [detail]);

  const activeDocument = useMemo(() => {
    if (!detail || !activeDocumentId) return null;
    return detail.documents.find((document) => document.id === activeDocumentId) ?? null;
  }, [detail, activeDocumentId]);

  const visibleMismatches = useMemo(
    () => detail?.mismatches.filter((mismatch) => shouldConsiderFieldKey(mismatch.fieldName)) ?? [],
    [detail]
  );

  const activeDocumentEntries = useMemo(() => {
    if (!activeDocument) return [];
    return getOrderedDocumentEntries(activeDocument.documentType, activeDocument.extractedFields);
  }, [activeDocument]);

  const activeDocumentFile = useMemo(() => {
    if (!detail || !activeDocument) return null;

    const candidates = [activeDocument.sourceFileName, activeDocument.sourceHint]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeText(value));

    for (const candidate of candidates) {
      const exactMatch = fileLookup.get(candidate);
      if (exactMatch) return exactMatch;
    }

    const partialMatch = detail.files.find((file) =>
      candidates.some((candidate) => normalizeText(file.originalName).includes(candidate))
    );

    if (partialMatch) return partialMatch;
    return detail.files.length === 1 ? detail.files[0] : null;
  }, [activeDocument, detail, fileLookup]);

  const activeFileUrl = activeDocumentFile?.signedUrl ?? null;
  const activeSourceFileLabel = getSourceFileLabel(
    activeDocumentFile?.mimeType,
    activeDocument?.sourceFileName || activeDocument?.sourceHint
  );
  const activeSourceIsImage =
    activeDocumentFile?.mimeType?.startsWith("image/") ||
    Boolean(
      (activeDocument?.sourceFileName || activeDocument?.sourceHint) &&
        /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(
          activeDocument?.sourceFileName || activeDocument?.sourceHint || ""
        )
    );

  const comparisonOptions = useMemo(
    () =>
      readComparisonOptions(
        detail?.case.processingMeta && typeof detail.case.processingMeta === "object"
          ? (detail.case.processingMeta as Record<string, unknown>).comparisonOptions
          : undefined
      ),
    [detail]
  );

  const fieldCanonicalValues = useMemo(() => {
    if (!detail) return {} as Record<string, string>;
    const result: Record<string, string> = {};
    const comparableDocuments = detail.documents.map((document) => ({
      type: document.documentType as DocType,
      fields: document.extractedFields as Partial<Record<FieldKey, string>>,
    }));

    ACTIVE_FIELD_DEFINITIONS.forEach(({ key }) => {
      const values = comparableDocuments
        .map((document) => getComparableFieldValue(document, key))
        .filter(
          (value): value is string =>
            value !== undefined && value !== null && String(value).trim().length > 0
        );
      result[key] = pickCanonicalComparableValue(values, comparisonOptions);
    });
    return result;
  }, [comparisonOptions, detail]);

  async function handleAnalyzeDraftCase(comparisonOptions: ComparisonOptions) {
    if (!detail || detail.files.length === 0) return;

    try {
      setAnalysisStatus("processing");
      setAnalysisError(null);
      setAnalysisProgress(5);

      const uploads = await Promise.all(detail.files.map(savedFileToUpload));
      const totalStageEvents = Math.max(1, uploads.length * STAGE_SEQUENCE.length);
      let stageEvents = 0;

      const result = await orchestrateUploads(
        uploads,
        () => {
          stageEvents += 1;
          setAnalysisProgress(Math.min(90, Math.round((stageEvents / totalStageEvents) * 90)));
        },
        comparisonOptions
      );

      setAnalysisStatus("saving");
      setAnalysisProgress(95);
      await saveCaseAnalysis(detail.case.id, {
        ...result,
        comparisonOptions,
      });
      const refreshed = await fetchCaseDetail(detail.case.id);
      setDetail(refreshed);
      setAnalysisProgress(100);
      setAnalysisStatus("idle");
    } catch (analysisFailure) {
      setAnalysisError(
        analysisFailure instanceof Error ? analysisFailure.message : "Failed to analyze this case."
      );
      setAnalysisStatus("error");
    }
  }

  async function handleCaseDecision(decision: CaseDecision) {
    if (!detail) return;

    try {
      setDecisionStatus("updating");
      setDecisionError(null);
      const updated = await updateCaseDecision(detail.case.id, decision);
      setDetail((current) =>
        current
          ? {
              ...current,
              case: {
                ...current.case,
                ...updated.case,
              },
            }
          : current
      );
      setDecisionStatus("idle");
    } catch (decisionFailure) {
      setDecisionError(
        decisionFailure instanceof Error
          ? decisionFailure.message
          : `Failed to ${decision === "accepted" ? "accept" : "reject"} case.`
      );
      setDecisionStatus("error");
    }
  }

  if (status === "ready" && detail?.case.status === "draft") {
    const isAnalyzing = analysisStatus === "processing" || analysisStatus === "saving";

    return (
      <AppShell>
        <div className="flex min-h-full flex-col bg-[#f7f7f5] animate-in fade-in duration-500">
          <header className="flex flex-col gap-4 border-b border-[#e5ddd0] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/cases" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8a7f72] hover:bg-[#ede6d9] hover:text-[#1a1a1a]">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5ddd0] bg-[#f0ece6] text-[#5a5046]">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-slate-900">{detail.case.displayName}</h1>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`rounded-full ${getCaseStatusClassName(detail.case.status)}`}
                  >
                    {getCaseStatusLabel(detail.case.status)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-[#e5ddd0] bg-[#f0ece6] text-[#5a5046]"
                  >
                    {detail.case.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-[#e5ddd0] bg-[#f0ece6] text-[#5a5046]"
                  >
                    {comparisonOptions.considerFormatting
                      ? "Formatting compared exactly"
                      : "Formatting ignored"}
                  </Badge>
                  <span className="text-xs font-medium text-slate-400">
                    {detail.files.length} file{detail.files.length === 1 ? "" : "s"} uploaded
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-[#e5ddd0] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
                    Ready for analysis
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    Analyze this case from the saved draft
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    These files are already saved and visible in the case list. Run analysis here to extract fields,
                    compare values, generate mismatches, and convert the draft into a completed case.
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={isAnalyzing || detail.files.length === 0}
                  className="rounded-2xl bg-slate-900 px-7 py-6 text-white hover:bg-slate-800"
                  onClick={() => setAnalysisOptionsOpen(true)}
                >
                  {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-white" />}
                  {analysisStatus === "saving" ? "Saving analysis..." : isAnalyzing ? "Analyzing case..." : "Analyze case"}
                </Button>
              </div>

              {isAnalyzing && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    <span>{analysisStatus === "saving" ? "Saving results" : "Analysis progress"}</span>
                    <span>{analysisProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${analysisProgress}%` }} />
                  </div>
                </div>
              )}

              {analysisStatus === "error" && analysisError && (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  {analysisError}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {detail.files.map((file, index) => (
                <div key={file.id} className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f0ece6] text-[#5a5046]">
                      <FileText className="h-5 w-5" />
                    </div>
	                    <div className="min-w-0 flex-1">
	                      <div className="truncate text-sm font-bold text-slate-900">{file.originalName}</div>
	                      <div className="mt-1 text-xs font-medium text-slate-500">
	                        {getSourceFileLabel(file.mimeType, file.originalName)} {index + 1} •{" "}
	                        {file.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : "Stored file"}
	                      </div>
	                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
          <AnalysisOptionsDialog
            open={analysisOptionsOpen}
            onOpenChange={setAnalysisOptionsOpen}
            onSelect={(nextOptions) => {
              setAnalysisOptionsOpen(false);
              void handleAnalyzeDraftCase(nextOptions);
            }}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex min-h-full flex-col bg-[#f7f7f5] animate-in fade-in duration-500">

        {/* =========================================
            TOP HEADER
            ========================================= */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#e5ddd0] bg-white px-4 py-3 sm:px-6 gap-4 sm:gap-6">
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4 w-full sm:w-auto">
            <Link href="/cases" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8a7f72] hover:bg-[#ede6d9] hover:text-[#1a1a1a] transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f0ece6] text-[#5a5046] border border-[#e5ddd0]">
              <FileText className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {detail?.case.displayName || "Loading Case..."}
              </h1>

              {detail && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-0.5">
                  <Badge
                    variant="outline"
                    className={`rounded-full px-2.5 font-medium shadow-sm shrink-0 ${getCaseStatusClassName(detail.case.status)}`}
                  >
                    {getCaseStatusLabel(detail.case.status)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full bg-[#f0ece6] text-[#5a5046] border-[#e5ddd0] px-2.5 font-medium shadow-sm shrink-0"
                  >
                    {detail.case.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full bg-[#f0ece6] text-[#5a5046] border-[#e5ddd0] px-2.5 font-medium shadow-sm shrink-0"
                  >
                    {comparisonOptions.considerFormatting
                      ? "Formatting compared exactly"
                      : "Formatting ignored"}
                  </Badge>
                  {detail.case.riskScore > 0 ? (
                    <Badge variant="outline" className="rounded-full bg-[#f0ece6] text-[#5a5046] border-[#e5ddd0] px-2.5 font-medium flex items-center gap-1 shadow-sm shrink-0">
                      <Sparkles className="h-3 w-3" /> AI AUDITED
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full bg-[#f0ece6] text-[#5a5046] border-[#e5ddd0] px-2.5 font-medium flex items-center gap-1 shadow-sm shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> RECONCILED
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* =========================================
            STATE MANAGEMENT (LOADING / ERROR)
            ========================================= */}
        {status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center py-24 text-[#8a7f72]">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#8a7f72]" />
            <p className="text-sm font-medium">Retrieving case workspace...</p>
          </div>
        )}

        {status === "error" && (
          <div className="p-4 sm:p-8">
            <div className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm max-w-2xl mx-auto">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
              <div>
                <h3 className="font-bold text-lg">Unable to load case</h3>
                <p className="mt-1 text-sm font-medium opacity-90">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            MAIN SPLIT LAYOUT
            ========================================= */}
        {status === "ready" && detail && (
          <>
            {detail.case.status !== "draft" && (
              <div className="border-b border-[#e5ddd0] bg-[#faf8f4] px-4 py-4 sm:px-6">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 rounded-2xl border border-[#e5ddd0] bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">Case decision</div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getCaseStatusClassName(detail.case.status)}`}
                      >
                        {getCaseStatusLabel(detail.case.status)}
                      </span>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      Review the extracted data and mismatches here, then accept the case when it is ready for downstream use or reject it when corrections are needed.
                    </p>
                    {decisionStatus === "error" && decisionError && (
                      <p className="mt-2 text-xs font-medium text-red-600">{decisionError}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      disabled={decisionStatus === "updating" || detail.case.status === "accepted"}
                      className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => handleCaseDecision("accepted")}
                    >
                      {decisionStatus === "updating" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Accept case
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={decisionStatus === "updating" || detail.case.status === "rejected"}
                      className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => handleCaseDecision("rejected")}
                    >
                      <TriangleAlert className="h-4 w-4" />
                      Reject case
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-1 flex-col overflow-visible xl:flex-row xl:overflow-hidden">

              {/* MOBILE ONLY: Context Cards (Stacked above the viewer) */}
              <div className="space-y-4 border-b border-[#e5ddd0] bg-[#faf8f4] p-4 xl:hidden">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
                    Receiver
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900" title={detail.case.receiverName || "—"}>
                    {detail.case.receiverName || "—"}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
                    Category
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900" title={detail.case.category}>
                    {detail.case.category}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
                    Mismatches
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {visibleMismatches.length}
                  </div>
                </div>
              </div>

              {/* Mobile Document Selector (Horizontal Scroll) */}
              <div className="rounded-2xl border border-[#e5ddd0] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#8a7f72] shrink-0" />
                    <h3 className="text-sm font-bold text-[#1a1a1a]">Documents</h3>
                  </div>
                  <Badge variant="secondary" className="bg-[#e8ddd0] text-[#5a5046] font-bold shrink-0">
                    {detail.documents.length}
                  </Badge>
                </div>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:hidden[-ms-overflow-style:none] [scrollbar-width:none]">
                  {detail.documents.map((document) => {
                    const isActive = activeDocumentId === document.id;
                    return (
                      <button
                        key={document.id}
                        onClick={() => setActiveDocumentId(document.id)}
                        className={`min-w-[220px] max-w-[260px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-all ${isActive
                            ? "border-[#d4c9b8] bg-[#ede6d9]"
                            : "border-[#e5ddd0] bg-[#faf8f4] hover:bg-[#f0ece6]"
                          }`}
                      >
                        <div className="line-clamp-2 text-sm font-bold text-[#1a1a1a]">
                          {document.title}
                        </div>
                        <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {document.documentType}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>

              {/* DESKTOP ONLY: LEFT PANEL (Metadata & Context) */}
              <div className="w-full max-w-md flex-shrink-0 border-r border-[#e5ddd0] bg-[#faf8f4] overflow-y-auto hidden xl:block">
              <div className="p-6 space-y-6">

                {/* Location Card */}
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-4 w-4 text-[#8a7f72]" />
                    <h3 className="font-bold text-[#1a1a1a] text-sm">Location</h3>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 text-sm text-slate-600 font-medium">
                    <Folder className="h-4 w-4 text-[#5a5046]" />
                    <span className="text-[#5a5046] cursor-pointer hover:underline">Root</span>
                    <span className="text-slate-300">/</span>
                    <span>Cases</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900 truncate max-w-[120px]" title={detail.case.slug}>{detail.case.slug}</span>
                  </div>
                </div>

                {/* Details Card */}
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-5">
                    <Info className="h-4 w-4 text-[#8a7f72]" />
                    <h3 className="font-bold text-[#1a1a1a] text-sm">Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Receiver</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight truncate" title={detail.case.receiverName || "—"}>
                        {detail.case.receiverName || "—"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Category</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight truncate" title={detail.case.category}>
                        {detail.case.category}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Uploaded</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight truncate">
                        {formatDateTime(detail.case.createdAt)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Invoice Ref</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight truncate" title={detail.case.invoiceNumber || "—"}>
                        {detail.case.invoiceNumber || "—"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">PO Number</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight truncate" title={detail.case.poNumber || "—"}>
                        {detail.case.poNumber || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Document Selector Card */}
                <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-[#8a7f72] shrink-0" />
                      <h3 className="font-bold text-[#1a1a1a] text-sm truncate">Packet Documents</h3>
                    </div>
                    <Badge variant="secondary" className="bg-[#e8ddd0] text-[#5a5046] font-bold shrink-0">{detail.documents.length}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {detail.documents.map((d) => {
                      const isActive = activeDocumentId === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setActiveDocumentId(d.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${isActive ? "bg-[#ede6d9] border border-[#d4c9b8]" : "hover:bg-[#f0ece6] border border-transparent"
                            }`}
                        >
                          <div className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-lg ${isActive ? 'bg-[#e5ddd0] text-[#5a5046]' : 'bg-[#f0ece6] text-[#8a7f72]'}`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-bold truncate ${isActive ? 'text-[#1a1a1a]' : 'text-[#5a5046]'}`}>
                              {d.title}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate mt-0.5">
                              {d.documentType}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop AI Summary / Risk Card */}
                <div className={`rounded-2xl border p-6 shadow-sm ${visibleMismatches.length === 0 ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className={`h-4 w-4 ${visibleMismatches.length === 0 ? 'text-[#166534]' : 'text-amber-700'}`} />
                    <h3 className={`font-bold text-sm ${visibleMismatches.length === 0 ? 'text-[#166534]' : 'text-amber-900'}`}>AI Summary</h3>
                  </div>

                  {visibleMismatches.length === 0 ? (
                    <div className="text-sm text-[#166534] font-medium leading-relaxed">
                      This case has been successfully reconciled. All extracted data points match perfectly across the provided documents with 100% integrity. No further action is required.
                    </div>
                  ) : (
                    <div className="text-sm text-amber-900 font-medium leading-relaxed">
                      This packet requires attention. We detected conflicting values across the provided documents.
                      <p className="mt-3 font-bold">Key Discrepancies:</p>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4 marker:text-amber-500">
                        {visibleMismatches.map((m) => (
                          <li key={m.id}>
                            {getComparisonDisplayLabel(m.fieldName, FIELD_LABEL_LOOKUP[m.fieldName])}
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        variant="link"
                        className="p-0 h-auto mt-4 text-amber-700 font-bold"
                      >
                        <Link href={`/cases/${caseId}/mismatches`}>View all mismatches &rarr;</Link>
                      </Button>
                    </div>
                  )}
                </div>

              </div>
              </div>

              {/* RIGHT PANEL (Viewer & Tabs) */}
              <div className="relative flex min-w-0 flex-1 flex-col bg-[#f7f7f5] p-3 sm:p-4 lg:p-6 xl:overflow-hidden">
              <div className="flex flex-col overflow-hidden rounded-[1.5rem] border border-[#e5ddd0] bg-white shadow-sm h-auto xl:h-full">

                {/* Viewer Header */}
                <div className="flex flex-col items-start justify-between border-b border-[#e5ddd0] p-4 gap-4 xl:flex-row xl:items-center sm:px-6">
	                  <div className="flex items-center gap-3">
	                    <Eye className="h-5 w-5 text-[#8a7f72] shrink-0" />
	                    <h2 className="text-base font-bold text-[#1a1a1a] truncate">Document Viewer</h2>
	                    <Badge variant="secondary" className="bg-[#f0ece6] text-[#5a5046] font-bold uppercase text-[10px] tracking-wider ml-1 sm:ml-2 shrink-0">
	                      {activeSourceFileLabel}
	                    </Badge>
	                  </div>

                  {/* Segmented Control Tabs (Horizontal Scroll on Mobile) */}
                  <div className="w-full xl:w-auto bg-[#ede6d9] p-1 rounded-xl flex items-center shadow-inner overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                          ? "bg-white text-[#1a1a1a] shadow-sm"
                          : "text-[#8a7f72] hover:text-[#1a1a1a] hover:bg-[#e5ddd0]/60"
                          }`}
                      >
                        <tab.icon className="w-4 h-4 shrink-0" />
                        {tab.label}
                      </button>
                    ))}
                    <Link
                      href={`/cases/${caseId}/mismatches`}
                      className="ml-1 flex shrink-0 items-center gap-2 rounded-lg px-3 sm:px-4 py-1.5 text-sm font-bold whitespace-nowrap text-[#8a7f72] transition-all hover:bg-[#e5ddd0]/60 hover:text-[#1a1a1a]"
                    >
                      <TriangleAlert className="w-4 h-4 shrink-0" />
                      Mismatches
                      {visibleMismatches.length > 0 && (
                        <span className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[9px] text-rose-600">
                          {visibleMismatches.length}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>

                {/* File Sub-header */}
                {activeDocument && (
                  <div className="flex items-center gap-3 border-b border-[#e5ddd0] bg-[#faf8f4] px-4 py-3 sm:px-6">
                    <FileText className="w-4 h-4 text-[#8a7f72] shrink-0" />
                    <span className="text-sm font-semibold text-[#1a1a1a] truncate">{activeDocument.sourceFileName || activeDocument.title}</span>
                    <span className="text-[#c8bfb2] shrink-0">•</span>
                    <span className="text-xs font-medium text-[#8a7f72] flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Processed {formatDateTime(activeDocument.createdAt)}</span>
                      <span className="sm:hidden">{formatDateTime(activeDocument.createdAt).split(',')[0]}</span>
                    </span>
                  </div>
                )}

                {/* Content Area */}
                <Tabs value={activeTab} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f0ece6] p-3 sm:p-4 md:p-6">

                  {/* TAB: PREVIEW */}
                  <TabsContent value="preview" className="m-0 h-full min-h-0 w-full">
                    <div className="flex h-[60vh] min-h-[450px] xl:h-full w-full flex-col overflow-hidden rounded-xl border border-slate-300 bg-[#2d2d2d] shadow-lg">
                      {/* Dark Toolbar */}
                      <div className="h-12 bg-[#1e1e1e] flex items-center px-3 sm:px-4 justify-between shrink-0">
                        <div className="bg-[#3d3d3d] text-white text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-md">
                          1 / {activeDocument?.pageCount || 1}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 text-slate-300">
                          <button className="hover:text-white transition-colors text-lg font-light w-8 h-8 flex items-center justify-center">−</button>
                          <button className="hover:text-white transition-colors text-lg font-light w-8 h-8 flex items-center justify-center">+</button>
                          <div className="w-px h-4 bg-slate-600 mx-1 sm:mx-2 shrink-0"></div>
                          <button className="hover:text-white transition-colors text-[10px] sm:text-xs font-semibold tracking-wider">FIT</button>
                        </div>
                      </div>
	                      <div className="flex-1 bg-[#525659] relative">
	                        {activeFileUrl ? (
	                          activeSourceIsImage ? (
	                            <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[#202124] p-4">
	                              <Image
	                                src={activeFileUrl}
	                                alt={activeDocument?.sourceFileName || activeDocument?.title || "Document preview"}
	                                fill
	                                unoptimized
	                                sizes="100vw"
	                                className="object-contain p-4"
	                              />
	                            </div>
	                          ) : (
	                            <iframe
	                              src={`${activeFileUrl}#toolbar=0&navpanes=0`}
	                              className="absolute inset-0 w-full h-full border-0 bg-white"
	                              title="Document Preview"
	                            />
	                          )
	                        ) : (
                          <div className="flex items-center justify-center h-full flex-col text-slate-400 gap-3 px-4 text-center">
                            <FileText className="w-10 h-10 opacity-50" />
                            <p className="text-sm font-medium">Source preview not available for this document.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB: EXTRACTED DATA */}
                  <TabsContent value="data" className="m-0 h-full min-h-0 w-full">
                    <div className="bg-white rounded-xl h-[60vh] min-h-[450px] xl:h-full w-full min-h-0 shadow-sm border border-[#e5ddd0] overflow-hidden flex flex-col">
                      <ScrollArea className="min-h-0 flex-1 p-4 sm:p-6">
                        <div className="max-w-3xl mx-auto space-y-6">
                          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6 border-b border-slate-100 pb-4">Extracted Data Fields</h2>
                          {activeDocumentEntries.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 font-medium">No fields extracted.</div>
                          ) : (
                            <div className="grid gap-x-8 gap-y-4 sm:gap-y-6 grid-cols-1 sm:grid-cols-2">
                              {activeDocumentEntries.map(([key, value]) => {
                                const currentValue = typeof value === "string" ? value : displayValue(value);
                                const canonical = fieldCanonicalValues[key];
                                const ok =
                                  !canonical ||
                                  areComparableValuesEqual(currentValue, canonical, comparisonOptions);

                                return (
                                  <div key={key} className="flex flex-col border-b border-slate-100 pb-3 last:border-0 group">
                                    <div className="flex justify-between items-start sm:items-center mb-1.5 gap-2">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 break-words">
                                        {FIELD_LABEL_LOOKUP[key] || key}
                                      </span>
                                      {!ok && (
                                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-[9px] uppercase px-1.5 py-0 shrink-0">
                                          Conflict
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-sm font-semibold text-slate-900 break-words">
                                      {currentValue || <em className="text-slate-400 font-normal">Not detected</em>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  {/* TAB: OCR TEXT */}
                  <TabsContent value="ocr" className="m-0 h-full min-h-0 w-full">
                    <div className="bg-slate-900 rounded-xl h-[60vh] min-h-[450px] xl:h-full w-full min-h-0 shadow-lg border border-slate-800 overflow-hidden flex flex-col text-slate-300">
                      <ScrollArea className="min-h-0 flex-1 p-4 sm:p-6">
                        <div className="max-w-4xl mx-auto font-mono text-xs sm:text-sm leading-relaxed opacity-90 break-words">
                          <ReactMarkdown>
                            {activeDocument?.markdown || "No OCR transcription available."}
                          </ReactMarkdown>
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              </div>

            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
