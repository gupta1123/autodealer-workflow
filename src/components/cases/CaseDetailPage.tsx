"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FIELD_DEFINITIONS,
  getFieldDefinitionsByKeys,
  getFieldDefinitionsForDocType,
} from "@/lib/document-schema";
import { fetchCaseDetail, type SavedCaseDetail } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";

const FIELD_LABEL_LOOKUP = FIELD_DEFINITIONS.reduce(
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
  return new Date(value).toLocaleString("en-IN", {
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

function pickCanonicalValue(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = 0;

  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }

  return (
    values.find((value) => normalizeText(value) === best) ??
    values.find((value) => normalizeText(value)) ??
    ""
  );
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getRiskTone(score: number) {
  if (score >= 70) {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      panel: "border-rose-100 bg-gradient-to-br from-rose-50/50 to-white",
      icon: "text-rose-600",
      label: "High risk",
    };
  }
  if (score >= 40) {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      panel: "border-amber-100 bg-gradient-to-br from-amber-50/50 to-white",
      icon: "text-amber-600",
      label: "Medium risk",
    };
  }
  return {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    panel: "border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white",
    icon: "text-emerald-600",
    label: "Low risk",
  };
}

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeMismatchId, setActiveMismatchId] = useState<string | null>(null);

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

  const metrics = useMemo(() => {
    if (!detail) {
      return {
        documents: 0,
        mismatches: 0,
      };
    }

    return {
      documents: detail.documents.length,
      mismatches: detail.mismatches.length,
    };
  }, [detail]);

  useEffect(() => {
    if (!detail) return;

    setActiveDocumentId((current) => {
      if (current && detail.documents.some((document) => document.id === current)) {
        return current;
      }
      return detail.documents[0]?.id ?? null;
    });

    setActiveMismatchId((current) => {
      if (current && detail.mismatches.some((mismatch) => mismatch.id === current)) {
        return current;
      }
      return detail.mismatches[0]?.id ?? null;
    });
  }, [detail]);

  const documentLookup = useMemo(() => {
    const map = new Map<string, SavedCaseDetail["documents"][number]>();

    detail?.documents.forEach((document) => {
      map.set(document.id, document);
      if (document.clientDocumentId) {
        map.set(document.clientDocumentId, document);
      }
    });

    return map;
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
      if (exactMatch) {
        return exactMatch;
      }
    }

    const partialMatch = detail.files.find((file) =>
      candidates.some((candidate) => normalizeText(file.originalName).includes(candidate))
    );

    if (partialMatch) {
      return partialMatch;
    }

    return detail.files.length === 1 ? detail.files[0] : null;
  }, [activeDocument, detail, fileLookup]);

  const activeMismatch = useMemo(() => {
    if (!detail || !activeMismatchId) return null;
    return detail.mismatches.find((mismatch) => mismatch.id === activeMismatchId) ?? null;
  }, [detail, activeMismatchId]);

  const fieldCanonicalValues = useMemo(() => {
    if (!detail) return {} as Record<string, string>;

    const result: Record<string, string> = {};

    FIELD_DEFINITIONS.forEach(({ key }) => {
      const values = detail.documents
        .map((document) => document.extractedFields[key])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      result[key] = pickCanonicalValue(values);
    });

    return result;
  }, [detail]);

  const riskTone = detail ? getRiskTone(detail.case.riskScore) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out pb-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Link
              href="/cases"
              className="mb-2 inline-flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Directory
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {detail?.case.displayName || "Loading Case..."}
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              Detailed inspection of uploaded files, extracted documents, and reconciliation findings.
            </p>
          </div>

          {detail && (
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="rounded-md border-slate-200 bg-slate-50/80 px-3 py-1 font-mono text-xs text-slate-600"
              >
                ID: {detail.case.slug}
              </Badge>
            </div>
          )}
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40 py-24 text-slate-500 shadow-sm">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">Retrieving case records from workspace...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-4 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
            <div>
              <h3 className="font-semibold">Unable to load case</h3>
              <p className="mt-1 text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        {status === "ready" && detail && (
          <>
            <div
              className={`grid gap-0 overflow-hidden rounded-3xl border shadow-sm sm:grid-cols-2 lg:grid-cols-4 ${
                riskTone?.panel || "border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40"
              }`}
            >
              <div className="flex flex-col justify-center border-b border-slate-200/70 p-6 sm:border-b-0 sm:border-r">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <Building2 className="h-3.5 w-3.5" /> Buyer Entity
                </div>
                <div className="truncate text-lg font-semibold text-slate-900" title={detail.case.buyerName || "—"}>
                  {detail.case.buyerName || "—"}
                </div>
              </div>

              <div className="flex flex-col justify-center border-b border-slate-200/70 p-6 sm:border-b-0 sm:border-r">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <Receipt className="h-3.5 w-3.5" /> Invoice / PO Ref
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="max-w-[120px] truncate text-lg font-semibold text-slate-900"
                    title={detail.case.invoiceNumber || "—"}
                  >
                    {detail.case.invoiceNumber || "—"}
                  </span>
                  <span className="text-sm font-mono text-slate-400">/</span>
                  <span
                    className="max-w-[100px] truncate text-sm font-mono text-slate-500"
                    title={detail.case.poNumber || "—"}
                  >
                    {detail.case.poNumber || "—"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-center border-b border-slate-200/70 p-6 lg:border-b-0 lg:border-r">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> Processed On
                </div>
                <div className="text-sm font-medium text-slate-900">
                  {formatDateTime(detail.case.createdAt)}
                </div>
              </div>

              <div className="flex flex-col justify-center bg-white/40 p-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Reconciliation Risk
                  </div>
                  <TriangleAlert className={`h-4 w-4 ${riskTone?.icon}`} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold tracking-tight text-slate-900">
                    {detail.case.riskScore}
                  </span>
                  <Badge variant="outline" className={riskTone?.badge}>
                    {riskTone?.label}
                  </Badge>
                </div>
              </div>
            </div>

            <Tabs defaultValue="documents" className="mt-10 w-full">
              <div className="flex justify-center sm:justify-start">
                <TabsList className="mb-8 inline-flex h-12 items-center justify-center rounded-xl border border-slate-200/60 bg-slate-100/80 p-1 text-slate-500">
                  <TabsTrigger
                    value="documents"
                    className="rounded-lg px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                  >
                    Extracted Documents{" "}
                    <Badge variant="secondary" className="ml-2 bg-slate-200/70 text-slate-700">
                      {metrics.documents}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="mismatches"
                    className="rounded-lg px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                  >
                    Mismatches{" "}
                    <Badge variant="secondary" className="ml-2 bg-indigo-100 text-indigo-700">
                      {metrics.mismatches}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="documents" className="focus:outline-none">
                {metrics.documents === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 py-20">
                    <FileText className="mb-4 h-10 w-10 text-slate-300" />
                    <h3 className="text-lg font-medium text-slate-900">No Documents Extracted</h3>
                    <p className="text-sm text-slate-500">There are no OCR records saved for this case.</p>
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <Card className="border-slate-200 bg-white/90 shadow-sm">
                      <div className="border-b border-slate-200/70 px-5 py-4">
                        <div className="text-sm font-semibold text-slate-900">Documents</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Select a saved document to preview and inspect.
                        </div>
                      </div>
                      <ScrollArea className="h-[700px]">
                        <div className="space-y-2 p-3">
                          {detail.documents.map((document) => (
                            <button
                              key={document.id}
                              onClick={() => setActiveDocumentId(document.id)}
                              className={`flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 ${
                                activeDocument?.id === document.id
                                  ? "border-slate-900 bg-gradient-to-br from-slate-100 to-indigo-50/60 shadow-sm"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="line-clamp-2 text-sm font-medium leading-tight text-slate-900">
                                {document.title}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-slate-50 text-[10px] text-slate-700"
                                >
                                  {document.documentType}
                                </Badge>
                                <span>{document.pageCount} page{document.pageCount === 1 ? "" : "s"}</span>
                              </div>
                              <div className="mt-2 truncate text-[11px] uppercase tracking-wide text-slate-400">
                                {document.sourceHint || document.sourceFileName || "Unknown source"}
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </Card>

                    {activeDocument && (
                      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                        <Card className="overflow-hidden border-slate-200 bg-white/90 shadow-sm">
                          <div className="flex h-[700px] min-w-0 flex-col overflow-hidden">
                            <div className="flex-shrink-0 space-y-2 border-b border-slate-200/70 bg-gradient-to-r from-white to-slate-50 px-5 py-4">
                              <div className="line-clamp-2 text-lg font-semibold leading-tight text-slate-900">
                                {activeDocument.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <Badge
                                  variant="secondary"
                                  className="rounded-full bg-slate-200/70 text-[10px] text-slate-700"
                                >
                                  {activeDocument.documentType}
                                </Badge>
                                <span>
                                  {activeDocument.sourceHint || activeDocument.sourceFileName || "Unknown source"}
                                </span>
                              </div>
                            </div>

                            <div className="min-h-0 flex-1 bg-gradient-to-br from-slate-100 to-indigo-50/40">
                              {activeDocumentFile?.signedUrl ? (
                                <iframe
                                  src={`${activeDocumentFile.signedUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitV&zoom=Fit`}
                                  className="h-full w-full border-0"
                                  title={`${activeDocument.title} preview`}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center p-8">
                                  <div className="w-full max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white/95 p-6 text-center shadow-sm">
                                    <FileText className="mx-auto mb-4 h-10 w-10 text-slate-300" />
                                    <div className="text-sm font-medium text-slate-900">
                                      Preview unavailable
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500">
                                      No signed file URL was found for this saved document.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {activeDocumentFile?.signedUrl && (
                              <div className="border-t border-slate-200/70 px-5 py-3">
                                <Button
                                  asChild
                                  variant="outline"
                                  className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                >
                                  <a href={activeDocumentFile.signedUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open Secure Link
                                  </a>
                                </Button>
                              </div>
                            )}
                          </div>
                        </Card>

                        <Card className="overflow-hidden border-slate-200 bg-white/90 shadow-sm">
                          <Tabs defaultValue="fields" className="flex h-[700px] flex-col">
                            <div className="border-b border-slate-200/70 px-5 py-4">
                              <div className="text-base font-semibold text-slate-900">Document details</div>
                              <TabsList className="mt-4 grid w-full grid-cols-2 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1">
                                <TabsTrigger
                                  value="fields"
                                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                >
                                  Extracted fields
                                </TabsTrigger>
                                <TabsTrigger
                                  value="ocr"
                                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                >
                                  OCR markdown
                                </TabsTrigger>
                              </TabsList>
                            </div>

                            <div className="min-h-0 flex-1 px-5 py-4">
                              <TabsContent value="fields" className="m-0 h-full">
                                <ScrollArea className="h-full">
                                  {activeDocumentEntries.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-500">
                                      No extracted fields stored for this document.
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {activeDocumentEntries.map(([key, value]) => {
                                        const currentValue =
                                          typeof value === "string" ? value : displayValue(value);
                                        const canonical = fieldCanonicalValues[key];
                                        const ok =
                                          !canonical ||
                                          normalizeText(currentValue) === normalizeText(canonical);

                                        return (
                                          <div
                                            key={key}
                                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                  {FIELD_LABEL_LOOKUP[key] || key}
                                                </div>
                                                <div className="mt-2 break-words text-sm font-medium text-slate-900">
                                                  {currentValue}
                                                </div>
                                              </div>
                                              <Badge
                                                variant="outline"
                                                className={
                                                  ok
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                                }
                                              >
                                                {ok ? "Match" : "Mismatch"}
                                              </Badge>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </ScrollArea>
                              </TabsContent>

                              <TabsContent value="ocr" className="m-0 h-full">
                                <ScrollArea className="h-full rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                                  {activeDocument.markdown ? (
                                    <div className="prose prose-sm max-w-none prose-slate">
                                      <ReactMarkdown>{activeDocument.markdown}</ReactMarkdown>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-slate-500">No OCR markdown stored.</div>
                                  )}
                                </ScrollArea>
                              </TabsContent>
                            </div>
                          </Tabs>
                        </Card>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="mismatches" className="focus:outline-none">
                {metrics.mismatches === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 py-20 shadow-sm">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                      <CheckCircle2 className="h-8 w-8 text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">100% Data Integrity</h3>
                    <p className="text-sm text-slate-500">
                      No reconciliation mismatches were found in this case.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                      <Card className="border-slate-200 bg-white/90 shadow-sm">
                        <div className="border-b border-slate-200/70 px-5 py-4">
                          <div className="text-base font-semibold text-slate-900">Mismatches & Checks</div>
                        </div>
                        <ScrollArea className="h-[560px]">
                          <div className="divide-y">
                            {detail.mismatches.map((mismatch) => (
                              <button
                                key={mismatch.id}
                                onClick={() => setActiveMismatchId(mismatch.id)}
                                className={`w-full px-5 py-4 text-left transition hover:bg-slate-50 ${
                                  activeMismatch?.id === mismatch.id ? "bg-gradient-to-r from-slate-100 to-indigo-50/70" : ""
                                }`}
                              >
                                <div className="font-medium text-slate-900">
                                  {FIELD_LABEL_LOOKUP[mismatch.fieldName] || mismatch.fieldName}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {mismatch.values.length} observed value
                                  {mismatch.values.length === 1 ? "" : "s"}
                                </div>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </Card>
                    </div>

                    <div className="lg:col-span-2">
                      <Card className="h-full border-slate-200 bg-white/90 shadow-sm">
                        <div className="border-b border-slate-200/70 px-6 py-5">
                          <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                              <TriangleAlert className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                Selected mismatch
                              </div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">
                                {activeMismatch
                                  ? FIELD_LABEL_LOOKUP[activeMismatch.fieldName] || activeMismatch.fieldName
                                  : "Choose a mismatch"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-6">
                          {activeMismatch ? (
                            <div className="space-y-6">
                              <div>
                                <div className="text-xs text-slate-500">Observed Values</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(activeMismatch.values ?? []).map((value, index) => {
                                    const documentTitle =
                                      (value.docId ? documentLookup.get(value.docId)?.title : null) ??
                                      value.docId ??
                                      `Document ${index + 1}`;

                                    return (
                                      <div
                                        key={`${activeMismatch.id}-${index}`}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                                      >
                                        <span className="font-medium">{documentTitle}</span>
                                        {": "}
                                        <span className="font-mono">
                                          {value.value === null || value.value === undefined
                                            ? "—"
                                            : String(value.value)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {activeMismatch.analysis && (
                                <div>
                                  <div className="text-xs text-slate-500">Analysis</div>
                                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                    <div className="prose prose-sm max-w-none">
                                      <ReactMarkdown>{activeMismatch.analysis}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {activeMismatch.fixPlan && (
                                <div>
                                  <div className="text-xs text-slate-500">Recommended Fix</div>
                                  <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm text-slate-800">
                                    <div className="prose prose-sm max-w-none prose-slate">
                                      <ReactMarkdown>{activeMismatch.fixPlan}</ReactMarkdown>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex min-h-[420px] items-center justify-center">
                              <p className="text-slate-600">Select a mismatch to view details.</p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppShell>
  );
}
