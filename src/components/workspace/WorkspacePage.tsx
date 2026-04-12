"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppShell } from "@/components/dashboard/AppShell";
import { summarizeCase } from "@/lib/case-summary";
import { useDocumentPipeline } from "@/hooks/useDocumentPipeline";
import {
  Eye,
  FileText,
  GitCompare,
  Loader2,
  Play,
  Sparkles,
  TriangleAlert,
  Upload,
  Trash2,
} from "lucide-react";
import type {
  CaseDoc,
  DocType,
  FieldKey,
  PipelineStageId,
} from "@/types/pipeline";
import {
  CORE_PACKET_GROUPS,
  FIELD_DEFINITIONS,
  getFieldDefinitionsByKeys,
  getFieldDefinitionsForDocType,
  getFieldKeysForDocType,
} from "@/lib/document-schema";
import { SAMPLE_DOCS, matchSampleByIndex } from "@/services/templates";

// ------------------------------------------------------------
// Dummy data & types
// ------------------------------------------------------------

type FieldSummary = {
  canonical: string;
  values: Record<string, string>;
  mismatchingDocs: string[];
};

type FieldMismatch = {
  field: FieldKey;
  label: string;
  canonical: string;
  mismatchingDocs: string[];
  values: Array<{ docId: string; value: string | number | null | undefined }>;
};

const DUMMY_DOCS: CaseDoc[] = SAMPLE_DOCS;
const ALL_FIELDS = FIELD_DEFINITIONS;

const FIELD_LABEL_LOOKUP: Record<string, string> = FIELD_DEFINITIONS.reduce(
  (acc, { key, label }) => {
    acc[key] = label;
    return acc;
  },
  {} as Record<string, string>
);

// ------------------------------------------------------------
// Utility helpers
// ------------------------------------------------------------

const STAGE_META: Record<PipelineStageId, { label: string; description: string }> = {
  upload_received: {
    label: "Upload received",
    description: "File added to processing queue.",
  },
  classifying: {
    label: "Classifying document type",
    description: "Matching against procurement document templates.",
  },
  ocr: {
    label: "Digitizing page images",
    description: "Running OCR and layout detection on every page.",
  },
  extracting: {
    label: "Extracting key fields",
    description: "Parsing document numbers, vendors, buyers, quantities, and amounts.",
  },
  validating: {
    label: "Reconciling & validating",
    description: "Cross-checking values across documents and business rules.",
  },
  complete: {
    label: "Complete",
    description: "Document passed validation.",
  },
  failed: {
    label: "Failed",
    description: "Processing stopped due to an error.",
  },
};

const PIPELINE_STAGES: Array<{
  id: PipelineStageId;
  label: string;
  description: string;
  start: number;
  end: number;
}> = [
    {
      id: "classifying",
      label: STAGE_META.classifying.label,
      description: STAGE_META.classifying.description,
      start: 0,
      end: 0.25,
    },
    {
      id: "ocr",
      label: STAGE_META.ocr.label,
      description: STAGE_META.ocr.description,
      start: 0.25,
      end: 0.55,
    },
    {
      id: "extracting",
      label: STAGE_META.extracting.label,
      description: STAGE_META.extracting.description,
      start: 0.55,
      end: 0.85,
    },
    {
      id: "validating",
      label: STAGE_META.validating.label,
      description: STAGE_META.validating.description,
      start: 0.85,
      end: 1,
    },
  ];

function normalize(v?: string) {
  return (v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function pickCanonical(values: string[]) {
  // choose the mode (most frequent non-empty) as canonical
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = normalize(v);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  // return original value matching best key, else first non-empty
  return (
    values.find((v) => normalize(v) === best) || values.find((v) => !!normalize(v)) || ""
  );
}

function currencyishToNumber(v?: string) {
  if (!v) return undefined;
  const n = Number(v.replace(/[₹,\s]/g, ""));
  return isNaN(n) ? undefined : n;
}

function getDocumentFieldDefinitions(doc: CaseDoc) {
  const relevantKeys = getFieldKeysForDocType(doc.type);
  const presentKeys = FIELD_DEFINITIONS.filter(({ key }) => Boolean(doc.fields[key])).map(
    ({ key }) => key
  );
  const orderedKeys = [...new Set<FieldKey>([...relevantKeys, ...presentKeys])];

  if (orderedKeys.length === 0) {
    return getFieldDefinitionsForDocType(doc.type);
  }

  return getFieldDefinitionsByKeys(orderedKeys);
}

function getComparisonFieldDefinitions(docs: CaseDoc[]) {
  const orderedKeys: FieldKey[] = [];
  const seen = new Set<FieldKey>();

  const pushKey = (key: FieldKey) => {
    if (!seen.has(key)) {
      seen.add(key);
      orderedKeys.push(key);
    }
  };

  docs.forEach((doc) => {
    getFieldKeysForDocType(doc.type).forEach(pushKey);
  });

  docs.forEach((doc) => {
    FIELD_DEFINITIONS.forEach(({ key }) => {
      if (doc.fields[key]) {
        pushKey(key);
      }
    });
  });

  if (orderedKeys.length === 0) {
    FIELD_DEFINITIONS.filter(({ important }) => important).forEach(({ key }) => pushKey(key));
  }

  return getFieldDefinitionsByKeys(orderedKeys);
}

// Compute mismatches across documents per field
function useMismatchReport(docs: CaseDoc[]) {
  return useMemo(() => {
    const byField = ALL_FIELDS.reduce(
      (acc, { key }) => {
        acc[key] = {
          canonical: "",
          values: {} as Record<string, string>,
          mismatchingDocs: [],
        };
        return acc;
      },
      {} as Record<FieldKey, FieldSummary>
    );

    for (const { id, fields } of docs) {
      for (const { key } of ALL_FIELDS) {
        const current = fields[key];
        if (current) byField[key].values[id] = current;
      }
    }

    for (const { key } of ALL_FIELDS) {
      const values = Object.values(byField[key].values);
      const canonical = pickCanonical(values);
      byField[key].canonical = canonical;
      const mismatchingDocs: string[] = [];
      for (const [docId, v] of Object.entries(byField[key].values)) {
        if (normalize(v) && canonical && normalize(v) !== normalize(canonical)) {
          mismatchingDocs.push(docId);
        }
      }
      byField[key].mismatchingDocs = mismatchingDocs;
    }

    const allMismatches: FieldMismatch[] = [];
    for (const { key, label } of ALL_FIELDS) {
      const ent = byField[key];
      if (!ent || ent.mismatchingDocs.length === 0) continue;
      allMismatches.push({
        field: key,
        label,
        canonical: ent.canonical,
        mismatchingDocs: ent.mismatchingDocs,
        values: docs
          .map((doc) => ({ docId: doc.id, value: doc.fields[key] }))
          .filter((entry) => entry.value !== undefined && entry.value !== ""),
      });
    }

    const hasAnyType = (targets: DocType[]) => docs.some((doc) => targets.includes(doc.type));

    const missingDocTypes = CORE_PACKET_GROUPS
      .filter((group) => !hasAnyType(group.types))
      .map((group) => group.label);
    const amountA = currencyishToNumber(byField.totalAmount.canonical);
    const amountB = currencyishToNumber(byField.paidAmount.canonical);
    const paymentGap = amountA && amountB ? Math.abs(amountA - amountB) : 0;
    const risk = Math.min(100, allMismatches.length * 10 + missingDocTypes.length * 12 + (paymentGap > 0 ? 10 : 0));

    return {
      byField,
      allMismatches,
      missingDocTypes,
      paymentGap,
      risk,
    };
  }, [docs]);
}

// ------------------------------------------------------------
// UI Components
// ------------------------------------------------------------

function ValueBadge({ ok, value }: { ok: boolean; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <Badge variant={ok ? "default" : "destructive"} className="rounded-full">
      {ok ? "Match" : "Mismatch"}
    </Badge>
  );
}

function FieldValue({ value }: { value?: string }) {
  return (
    <span className="font-mono text-xs">{value || <em className="opacity-60">—</em>}</span>
  );
}

export function WorkspacePage() {
  const {
    status: pipelineStatus,
    queuedUploads,
    documents,
    mismatches: pipelineMismatches,
    progress: pipelineProgress,
    error: pipelineError,
    activeUploadId,
    persistence,
    queueFiles,
    removeUpload,
    startProcessing,
    reset: resetPipeline,
  } = useDocumentPipeline();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeMismatchId, setActiveMismatchId] = useState<string | null>(null);

  const docs = documents.length ? documents : DUMMY_DOCS;
  const docTitleLookup = useMemo(() => new Map(docs.map((doc) => [doc.id, doc])), [docs]);
  const showAiMismatches = pipelineMismatches.length > 0;

  const { byField, allMismatches, paymentGap, risk } = useMismatchReport(docs);

  const activeDoc = activeDocId ? docs.find((d) => d.id === activeDocId) : undefined;
  const activeDocFieldDefinitions = useMemo(
    () => (activeDoc ? getDocumentFieldDefinitions(activeDoc) : []),
    [activeDoc]
  );
  const comparisonFieldDefinitions = useMemo(() => getComparisonFieldDefinitions(docs), [docs]);

  const activeDocIndex = useMemo(() => {
    if (!activeDoc) return -1;
    return docs.findIndex((d) => d.id === activeDoc.id);
  }, [activeDoc, docs]);

  const activeFileUrl = useMemo(() => {
    if (activeDocIndex === -1 || documents.length === 0) return null;
    const upload = queuedUploads[activeDocIndex];
    if (upload && upload.file) {
      return URL.createObjectURL(upload.file);
    }
    return null;
  }, [activeDocIndex, queuedUploads, documents]);

  const activeMismatch = useMemo(() => {
    if (!activeMismatchId) return null;
    if (showAiMismatches) {
      return pipelineMismatches.find((m) => m.id === activeMismatchId);
    }
    const nonAi = allMismatches.find((m) => m.field === activeMismatchId);
    if (nonAi) {
      return {
        ...nonAi,
        id: nonAi.field,
        values: Array.isArray(nonAi.values) ? nonAi.values : [],
      };
    }
    return null;
  }, [activeMismatchId, pipelineMismatches, allMismatches, showAiMismatches]);

  useEffect(() => {
    if (showAiMismatches && pipelineMismatches.length > 0) {
      setActiveMismatchId(pipelineMismatches[0].id);
    } else if (allMismatches.length > 0) {
      setActiveMismatchId(allMismatches[0].field);
    } else {
      setActiveMismatchId(null);
    }
  }, [pipelineMismatches, allMismatches, showAiMismatches]);

  const caseSummary = useMemo(
    () => summarizeCase(documents.length ? documents : docs, pipelineMismatches),
    [documents, docs, pipelineMismatches]
  );
  const caseName = caseSummary.displayName;
  const hasUploads = queuedUploads.length > 0;
  const renderWithSidebar = (content: React.ReactNode) => <AppShell>{content}</AppShell>;

  useEffect(() => {
    if (pipelineStatus === "ready" && documents.length) {
      setActiveDocId((prev) => prev ?? documents[0].id);
    }
    if (pipelineStatus === "idle") {
      setActiveDocId(null);
    }
  }, [pipelineStatus, documents]);

  useEffect(() => {
    if (activeFileUrl) {
      const url = activeFileUrl;
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [activeFileUrl]);

  if (pipelineStatus === "idle") {
    return renderWithSidebar(
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f5]">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-[#e5ddd0]/40 blur-3xl" />
          <div className="absolute right-[14%] bottom-[15%] h-80 w-80 rounded-full bg-[#d4c9b8]/30 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-10 px-6 py-16 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e5ddd0] bg-white px-4 py-1.5 text-xs font-medium text-[#5a5046] shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#8a7f72]" />
            Procurement Workflow Demo
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Procurement Packet Comparator
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600">
              Upload client case packets containing invoices, purchase orders, e-way bills, weighment slips, lorry receipts, RC/DL/PAN cards, FASTag toll proofs, test certificates, transport permits, and truck photos. The app extracts key fields, cross-references shared values, and highlights mismatches before review.
            </p>
          </div>
          <div className="w-full max-w-3xl space-y-6">
            <label className="relative flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[#c8bfb2] bg-white px-8 py-10 text-[#5a5046] shadow-sm transition hover:border-[#8a7f72] hover:bg-white cursor-pointer">
              <Upload className="h-6 w-6 text-[#8a7f72]" />
              <div className="text-base font-medium">Upload packet documents</div>
              <p className="text-sm text-slate-500">
                Case PDFs with tax invoices, purchase orders, e-way bills, weighment slips, LR copies, RCs, driving licences, PAN cards, FASTag toll proofs, test certificates, transport permits, and photo evidence
              </p>
              <input
                type="file"
                multiple
                accept="application/pdf"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  queueFiles(e.target.files);
                  if (e.target.value) e.target.value = "";
                }}
              />
            </label>

            {hasUploads && (
              <div className="w-full max-w-3xl space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-700">Procurement documents ready for processing</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {queuedUploads.length} document{queuedUploads.length > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="flex items-center gap-3 pb-1">
                    {queuedUploads.map((upload, index) => {
                      const fallbackTemplate = matchSampleByIndex(index);
                      const inferredType = upload.resultDoc?.type ?? upload.classifiedType ?? fallbackTemplate.type;
                      return (
                        <Popover key={upload.id}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-slate-900"
                            >
                              <FileText className="h-5 w-5" />
                              <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                                {index + 1}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="center" side="top" className="w-64 text-left">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  {upload.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Slot {index + 1} · {inferredType}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="rounded-full border border-slate-200 p-1 text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                                onClick={() => removeUpload(upload.id)}
                                aria-label="Remove file"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              Pipeline stages: upload, classify, OCR, extract, validate. Status updates appear as processing runs.
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {hasUploads && (
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <Button
                size="lg"
                disabled={!hasUploads}
                className="group relative overflow-hidden rounded-2xl px-8 py-6 text-base font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                onClick={startProcessing}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 opacity-95 transition-opacity group-hover:opacity-100" />
                <span className="relative z-10 flex items-center gap-2 tracking-tight text-white">
                  <Play className="h-5 w-5 fill-white" />
                  Process documents
                </span>
              </Button>
            </motion.div>
          )}
        </motion.div>
      </section>
    );
  }

  if (pipelineStatus === "processing") {
    const totalDocs = queuedUploads.length || SAMPLE_DOCS.length;
    const activeIndex = activeUploadId
      ? queuedUploads.findIndex((upload) => upload.id === activeUploadId)
      : queuedUploads.findIndex((upload) =>
        upload.stages.some((stage) => stage.status === "active")
      );
    const fallbackIndex = activeIndex >= 0 ? activeIndex : Math.max(0, Math.min(totalDocs - 1, queuedUploads.length - 1));
    const currentUpload = queuedUploads[fallbackIndex] ?? queuedUploads[queuedUploads.length - 1];
    const fallbackDoc = SAMPLE_DOCS[fallbackIndex % SAMPLE_DOCS.length];
    const currentDoc = currentUpload?.resultDoc ?? fallbackDoc;
    const stageCount = currentUpload?.stages.length ?? 1;
    const completedStages = currentUpload
      ? currentUpload.stages.filter((stage) => stage.status === "done" || stage.status === "complete").length
      : 0;
    const docProgress = Math.min(1, Math.max(0, completedStages / stageCount));
    const secondsElapsed = Math.min(15, Math.round(pipelineProgress * 15));
    const activeStageEntry = currentUpload?.stages.find((stage) => stage.status === "active");
    const nextStageEntry = currentUpload?.stages.find((stage) => stage.status === "pending");
    const currentStageMeta = activeStageEntry
      ? STAGE_META[activeStageEntry.stage] ?? STAGE_META.classifying
      : currentUpload?.stages.some(
        (stage) => stage.stage === "complete" && (stage.status === "done" || stage.status === "complete")
      )
        ? STAGE_META.complete
        : nextStageEntry
          ? STAGE_META[nextStageEntry.stage] ?? STAGE_META.classifying
          : STAGE_META.upload_received;
    const classificationComplete = currentUpload
      ? currentUpload.stages.some(
        (stage) => stage.stage === "classifying" && (stage.status === "done" || stage.status === "complete")
      )
      : false;
    const sourceName = currentUpload?.name || currentDoc.sourceHint || `${currentDoc.id}.pdf`;
    const processedCount = queuedUploads.filter((upload) =>
      upload.stages.some(
        (stage) => stage.stage === "complete" && (stage.status === "done" || stage.status === "complete")
      )
    ).length;
    const currentOrdinal = currentUpload
      ? Math.max(1, queuedUploads.findIndex((upload) => upload.id === currentUpload.id) + 1)
      : Math.min(totalDocs, processedCount + 1);

    function stageStatus(stage: (typeof PIPELINE_STAGES)[number]) {
      if (docProgress >= stage.end) return "done";
      if (docProgress >= stage.start && docProgress < stage.end) return "active";
      return "pending";
    }

    return renderWithSidebar(
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f5] text-[#1a1a1a]">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-[12%] top-[8%] h-72 w-72 rounded-full bg-[#e5ddd0]/40 blur-3xl" />
          <div className="absolute right-[10%] bottom-[12%] h-80 w-80 rounded-full bg-[#d4c9b8]/30 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Document intake pipeline
              </span>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Classifying, digitizing, and validating uploads…
              </h1>
            </div>
            <div className="rounded-2xl border border-[#e5ddd0] bg-white px-4 py-3 text-right shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Elapsed</div>
              <div className="text-lg font-semibold text-slate-900">{secondsElapsed}s</div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#e5ddd0] bg-white px-6 py-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f0ece6] text-[#8a7f72] shadow-inner">
                  <Sparkles className="h-6 w-6 animate-pulse text-[#8a7f72]" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Global progress
                  </div>
                  <div className="text-3xl font-semibold text-slate-900">
                    {Math.round(pipelineProgress * 100)}%
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Analyzing{" "}
                <span className="font-semibold text-slate-900">{currentOrdinal}</span>{" "}
                of {totalDocs} documents
              </div>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-600"
                animate={{ width: `${pipelineProgress * 100}%` }}
                transition={{ ease: "easeInOut", duration: 0.3 }}
              />
            </div>
          </div>

          <div>
            <motion.div
              key={currentDoc.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex h-full flex-col rounded-3xl border border-[#e5ddd0] bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Current document
                  </div>
                  <div className="mt-2 min-h-[56px]">
                    <AnimatePresence mode="wait">
                      {classificationComplete ? (
                        <motion.div
                          key="identified"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25 }}
                        >
                          <h2 className="text-lg font-semibold leading-tight text-slate-900">
                            {currentDoc.title}
                          </h2>
                          <div className="mt-1 text-sm text-slate-500">{currentDoc.type}</div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="upload"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25 }}
                        >
                          <h2 className="text-lg font-semibold leading-tight text-slate-900">
                            {sourceName}
                          </h2>
                          <div className="mt-1 text-sm text-slate-500">
                            Identifying document type
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="text-xs text-slate-400">Source file · {sourceName}</div>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-[#e5ddd0] bg-[#f0ece6] px-3 py-1 text-xs text-[#5a5046]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8a7f72]" />
                  {currentStageMeta.label}
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {PIPELINE_STAGES.map((stage) => {
                  const status = stageStatus(stage);
                  const dotClass =
                    status === "done"
                      ? "bg-indigo-600"
                      : status === "active"
                        ? "bg-indigo-600 animate-pulse"
                        : "bg-zinc-300";
                  const textClass =
                    status === "pending" ? "text-slate-400" : "text-slate-900";
                  return (
                    <div key={stage.id} className="flex gap-3">
                      <span className={`mt-2 h-2 w-2 rounded-full ${dotClass}`} />
                      <div>
                        <div className={`text-sm font-medium ${textClass}`}>
                          {stage.label}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                  <span>Document progress</span>
                  <span>{Math.round(docProgress * 100)}%</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-zinc-100">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-600"
                    animate={{ width: `${docProgress * 100}%` }}
                    transition={{ ease: "easeInOut", duration: 0.25 }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>
    );
  }

  if (pipelineStatus === "error") {
    return renderWithSidebar(
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f7f7f5] text-center text-[#5a5046]">
        <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">Something went wrong while processing documents.</p>
          {pipelineError && <p className="mt-2 text-xs text-red-600">{pipelineError}</p>}
        </div>
        <Button onClick={resetPipeline} className="rounded-2xl px-6 py-3">
          Try again
        </Button>
      </section>
    );
  }

  // Safety check for activeDoc
  if (!activeDoc) {
    return renderWithSidebar(
      <section className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <p className="text-zinc-600">No document selected</p>
      </section>
    );
  }

  return renderWithSidebar(
    <TooltipProvider>
      <section className="w-full">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">Dashboard</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Add Case
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Review extracted packet documents, compare shared fields, inspect mismatches, and
              save authenticated case runs to Supabase.
            </p>
          </div>

          <label className="relative inline-flex items-center self-start">
            <input
              type="file"
              multiple
              className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
              onChange={(e) => {
                queueFiles(e.target.files);
                if (e.target.value) e.target.value = "";
              }}
            />
            <Button className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
              <Upload className="h-4 w-4" /> Upload
            </Button>
          </label>
        </div>

        {/* Hero Header Card */}
        <Card className="mb-4 border-zinc-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow">
                  <Eye className="h-5 w-5" />
                </div>
              <div>
                <div className="text-sm text-zinc-500">Current Case</div>
                <div className="font-medium">{caseName}</div>
                {paymentGap > 0 && (
                  <div className="text-xs text-amber-600">
                    Payment gap detected: {paymentGap}
                  </div>
                )}
                {persistence.status === "saving" && (
                  <div className="text-xs text-zinc-500">
                    Saving original PDFs, extracted fields, and mismatch analysis to Supabase...
                  </div>
                )}
                {persistence.status === "saved" && persistence.savedCase && (
                  <div className="text-xs text-emerald-600">
                    Stored in Supabase with case ID {persistence.savedCase.id} on{" "}
                    {new Date(persistence.savedCase.createdAt).toLocaleString("en-IN")}
                  </div>
                )}
                {persistence.status === "error" && persistence.error && (
                  <div className="text-xs text-red-600">
                    Processing finished, but saving to Supabase failed: {persistence.error}
                  </div>
                )}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border bg-white px-3 py-2 text-right shadow-sm">
                  <div className="text-xs text-zinc-500">Risk Score</div>
                  <div className="text-lg font-semibold tracking-tight">{risk}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Derived from mismatch count, missing document types, and payment reconciliation checks
              </TooltipContent>
            </Tooltip>
          </CardContent>
        </Card>

        {/* Workspace */}
        <Tabs defaultValue="review" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3 sm:w-auto sm:grid-cols-3">
            <TabsTrigger value="review" className="gap-2">
              <Eye className="h-4 w-4" /> Review
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <GitCompare className="h-4 w-4" /> Compare
            </TabsTrigger>
            <TabsTrigger value="issues" className="gap-2">
              <TriangleAlert className="h-4 w-4" /> Mismatches
            </TabsTrigger>
          </TabsList>

          {/* REVIEW TAB: Side-by-side document + extracted + Markdown OCR */}
          <TabsContent value="review">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
              {/* Left: Document browser */}
              <Card className="border-zinc-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4" />
                      <span>Documents</span>
                    </div>
                    <div className="text-xs text-zinc-500">Click a doc to preview source & fields</div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-200px)] p-3">
                    <div className="space-y-2">
                      {docs.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => setActiveDocId(d.id)}
                          className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left transition hover:bg-zinc-50 ${activeDocId === d.id ? "border-zinc-900" : "border-zinc-200"
                            }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="line-clamp-2 text-sm font-medium leading-tight">{d.title}</div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <Badge variant="outline" className="rounded-full text-[9px]">{d.type}</Badge>
                              <span className="truncate">{d.sourceHint}</span>
                            </div>
                            <div className="text-[11px] uppercase tracking-wide text-zinc-400">
                              {d.pages} page{d.pages > 1 ? "s" : ""}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Middle: Source preview */}
              <Card className="border-zinc-200">
                <div className="flex h-[calc(100vh-200px)] min-w-0 flex-col overflow-hidden">
                  <div className="flex-shrink-0 space-y-1 border-b px-3 py-2">
                    <div className="line-clamp-2 text-sm font-medium leading-tight">{activeDoc.title}</div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Badge variant="secondary" className="rounded-full text-[10px]">{activeDoc.type}</Badge>
                      <span className="truncate">{activeDoc.sourceHint || "source-file.pdf"}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    {activeFileUrl ? (
                      <iframe
                        src={`${activeFileUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitV&zoom=Fit`}
                        className="w-full h-full border-0"
                        title="Document Preview"
                      />
                    ) : (
                      <div className="p-6">
                        <div className="mx-auto aspect-[3/4] w-full max-w-sm rounded-xl border bg-white p-4 shadow-sm">
                          <div className="mb-2 text-xs text-zinc-500">Source preview (placeholder)</div>
                          <div className="h-full rounded-md border bg-zinc-50" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Right: Extracted fields + OCR insights */}
              <Card className="border-zinc-200 flex flex-col overflow-hidden">
                <Tabs defaultValue="fields" className="flex flex-col h-[calc(100vh-200px)]">
                  <CardHeader className="flex-shrink-0 pb-0">
                    <CardTitle className="text-base">Document insights</CardTitle>
                    <TabsList className="mt-4 grid w-full grid-cols-2">
                      <TabsTrigger value="fields">Extracted fields</TabsTrigger>
                      <TabsTrigger value="ocr">OCR markdown</TabsTrigger>
                    </TabsList>
                  </CardHeader>
                  <CardContent className="flex-1 pt-4 min-h-0">
                    <TabsContent value="fields" className="h-full m-0">
                      <ScrollArea className="h-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Field</TableHead>
                              <TableHead>Value</TableHead>
                              <TableHead className="w-24">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeDocFieldDefinitions.map(({ key, label }) => {
                              const v = activeDoc.fields[key];
                              const canonical = byField[key]?.canonical;
                              const ok = !v || !canonical || normalize(v) === normalize(canonical);
                              return (
                                <TableRow key={key}>
                                  <TableCell className="whitespace-nowrap text-sm">{label}</TableCell>
                                  <TableCell className="text-sm">
                                    <div className="break-words whitespace-pre-wrap">
                                      <FieldValue value={v} />
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <ValueBadge ok={ok} value={v} />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="ocr" className="h-full m-0">
                      <div className="h-full flex flex-col">
                        <ScrollArea className="flex-1">
                          <div className="rounded-xl border bg-zinc-50 p-4">
                            <div className="prose prose-sm max-w-none prose-slate">
                              <ReactMarkdown>
                                {activeDoc.md}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            </div>
          </TabsContent>

          {/* COMPARE TAB: Cross-doc matrix */}
          <TabsContent value="compare">
            <Card className="border-zinc-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cross‑Document Field Comparison</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto h-[600px]">
                  <Table className="min-w-[800px]">
                    <TableCaption className="text-left">Canonical value is computed as the most frequent value across documents.</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px] sticky left-0 bg-white">Field</TableHead>
                        {docs.map((d) => (
                          <TableHead key={d.id} className="w-[200px]">{d.title}</TableHead>
                        ))}
                        <TableHead className="min-w-[160px]">Canonical</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonFieldDefinitions.map(({ key, label }) => (
                        <TableRow key={key}>
                          <TableCell className="text-sm font-medium min-w-[160px] sticky left-0 bg-white">{label}</TableCell>
                          {docs.map((d) => {
                            const v = d.fields[key];
                            const ok = !v || normalize(v) === normalize(byField[key]?.canonical);
                            return (
                              <TableCell key={d.id} className="align-top max-w-[200px]">
                                <div className="flex flex-col gap-1">
                                  <div className="text-xs break-words whitespace-pre-wrap">
                                    <FieldValue value={v} />
                                  </div>
                                  <div>
                                    <ValueBadge ok={ok} value={v} />
                                  </div>
                                </div>
                              </TableCell>
                            );
                          })}
                          <TableCell className="min-w-[160px]">
                            <div className="rounded-lg border bg-zinc-50 p-2 font-mono text-xs break-words whitespace-pre-wrap">
                              {byField[key]?.canonical || <em className="opacity-60">—</em>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ISSUES TAB: Mismatch list with quick-fix guidance */}
          <TabsContent value="issues">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <Card className="border-zinc-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Mismatches & Checks</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[520px]">
                      <div className="divide-y">
                        {showAiMismatches ? (
                          pipelineMismatches.map((mismatch) => (
                            <button
                              key={mismatch.id}
                              onClick={() => setActiveMismatchId(mismatch.id)}
                              className={`w-full text-left p-4 hover:bg-zinc-50 ${activeMismatchId === mismatch.id ? 'bg-zinc-100' : ''
                                }`}
                            >
                              <div className="font-medium">{FIELD_LABEL_LOOKUP[mismatch.field] ?? mismatch.field}</div>
                            </button>
                          ))
                        ) : (
                          allMismatches.map((mismatch) => (
                            <button
                              key={mismatch.field}
                              onClick={() => setActiveMismatchId(mismatch.field)}
                              className={`w-full text-left p-4 hover:bg-zinc-50 ${activeMismatchId === mismatch.field ? 'bg-zinc-100' : ''
                                }`}
                            >
                              <div className="font-medium">{mismatch.label}</div>
                            </button>
                          ))
                        )}
                        {(!pipelineMismatches.length && !allMismatches.length) && (
                          <div className="p-6 text-sm text-zinc-600">No mismatches detected. You&apos;re good! 🎉</div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
              <div className="lg:col-span-2">
                <Card className="border-zinc-200">
                  <CardContent className="p-6">
                    {activeMismatch ? (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-zinc-500">Field</div>
                          <div className="font-medium">
                            {FIELD_LABEL_LOOKUP[activeMismatch.field] ?? activeMismatch.field}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Observed Values</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(activeMismatch.values ?? []).map((value) => (
                              <div
                                key={`${activeMismatch.id}-${value.docId}`}
                                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs"
                              >
                                <span className="font-medium">
                                  {docTitleLookup.get(value.docId)?.title ?? value.docId}
                                </span>
                                {": "}
                                <span className="font-mono">
                                  {value.value === null || value.value === undefined
                                    ? "—"
                                    : String(value.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {activeMismatch.analysis && (
                          <div>
                            <div className="text-xs text-zinc-500">Analysis</div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>
                                  {activeMismatch.analysis}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                        {activeMismatch.fixPlan && (
                          <div>
                            <div className="text-xs text-zinc-500">Recommended Fix</div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                              <div className="prose prose-sm max-w-none prose-emerald">
                                <ReactMarkdown>
                                  {activeMismatch.fixPlan}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-zinc-600">Select a mismatch to view details.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </TooltipProvider>
  );
}
