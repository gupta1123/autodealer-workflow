"use client";

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
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  FIELD_DEFINITIONS,
  getFieldDefinitionsByKeys,
  getFieldDefinitionsForDocType,
} from "@/lib/document-schema";
import { fetchCaseDetail, type SavedCaseDetail } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";
type ActiveTab = "preview" | "data" | "ocr";

const DETAIL_TABS: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "data", label: "Extracted Data", icon: Database },
  { id: "ocr", label: "OCR Text", icon: FileText },
];

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

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-[#f8fafc] animate-in fade-in duration-500">

        {/* =========================================
            TOP HEADER
            ========================================= */}
        <header className="flex items-center border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/cases" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100/50">
              <FileText className="h-4 w-4" />
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                {detail?.case.displayName || "Loading Case..."}
              </h1>

              {detail && (
                <>
                  <Badge variant="outline" className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 px-2.5 font-medium shadow-sm">
                    v1 • Current
                  </Badge>
                  {detail.case.riskScore > 0 ? (
                    <Badge variant="outline" className="rounded-full bg-blue-50 text-blue-700 border-blue-200 px-2.5 font-medium flex items-center gap-1 shadow-sm">
                      <Sparkles className="h-3 w-3" /> AI AUDITED
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 px-2.5 font-medium flex items-center gap-1 shadow-sm">
                      <CheckCircle2 className="h-3 w-3" /> RECONCILED
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {/* =========================================
            STATE MANAGEMENT (LOADING / ERROR)
            ========================================= */}
        {status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center py-24 text-slate-500">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm font-medium">Retrieving case workspace...</p>
          </div>
        )}

        {status === "error" && (
          <div className="p-8">
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
          <div className="flex flex-1 overflow-hidden">

            {/* LEFT PANEL (Metadata & Context) */}
            <div className="w-full max-w-md flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto hidden xl:block">
              <div className="p-6 space-y-6">

                {/* Location Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <h3 className="font-bold text-slate-800 text-sm">Location</h3>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 text-sm text-slate-600 font-medium">
                    <Folder className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-600 cursor-pointer hover:underline">Root</span>
                    <span className="text-slate-300">/</span>
                    <span>Cases</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900">{detail.case.slug}</span>
                  </div>
                </div>

                {/* Details Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-5">
                    <Info className="h-4 w-4 text-slate-400" />
                    <h3 className="font-bold text-slate-800 text-sm">Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Buyer</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight">
                        {detail.case.buyerName || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Uploaded</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight">
                        {formatDateTime(detail.case.createdAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Invoice Ref</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight">
                        {detail.case.invoiceNumber || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">PO Number</div>
                      <div className="text-sm font-semibold text-slate-900 leading-tight">
                        {detail.case.poNumber || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Selector Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <h3 className="font-bold text-slate-800 text-sm">Packet Documents</h3>
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold">{detail.documents.length}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {detail.documents.map((d) => {
                      const isActive = activeDocumentId === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setActiveDocumentId(d.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${isActive ? "bg-emerald-50 border border-emerald-100" : "hover:bg-slate-50 border border-transparent"
                            }`}
                        >
                          <div className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-lg ${isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-bold truncate ${isActive ? 'text-emerald-900' : 'text-slate-700'}`}>
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

                {/* AI Summary / Risk Card */}
                <div className={`rounded-2xl border p-6 shadow-sm ${detail.mismatches.length === 0 ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className={`h-4 w-4 ${detail.mismatches.length === 0 ? 'text-[#166534]' : 'text-amber-700'}`} />
                    <h3 className={`font-bold text-sm ${detail.mismatches.length === 0 ? 'text-[#166534]' : 'text-amber-900'}`}>AI Summary</h3>
                  </div>

                  {detail.mismatches.length === 0 ? (
                    <div className="text-sm text-[#166534] font-medium leading-relaxed">
                      This case has been successfully reconciled. All extracted data points match perfectly across the provided documents with 100% integrity. No further action is required.
                    </div>
                  ) : (
                    <div className="text-sm text-amber-900 font-medium leading-relaxed">
                      This packet requires attention. We detected conflicting values across the provided documents.
                      <p className="mt-3 font-bold">Key Discrepancies:</p>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4 marker:text-amber-500">
                        {detail.mismatches.map((m) => (
                          <li key={m.id}>{FIELD_LABEL_LOOKUP[m.fieldName] || m.fieldName}</li>
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
            <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden relative">
              <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-sm h-full flex flex-col overflow-hidden">

                {/* Viewer Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 p-4 sm:px-6 gap-4">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-slate-400" />
                    <h2 className="text-base font-bold text-slate-800">Document Viewer</h2>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider ml-2">PDF</Badge>
                  </div>

                  {/* Segmented Control Tabs */}
                  <div className="bg-slate-100 p-1 rounded-xl flex items-center shadow-inner overflow-x-auto max-w-full">
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                          }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                    <Link
                      href={`/cases/${caseId}/mismatches`}
                      className="ml-1 flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold whitespace-nowrap text-slate-500 transition-all hover:bg-slate-200/50 hover:text-slate-700"
                    >
                      <TriangleAlert className="w-4 h-4" />
                      Mismatches
                      {detail.mismatches.length > 0 && (
                        <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-[9px] text-rose-600">
                          {detail.mismatches.length}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>

                {/* File Sub-header (only for doc tabs) */}
                {activeDocument && (
                  <div className="flex items-center gap-3 px-6 py-3 bg-slate-50/50 border-b border-slate-100">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700 truncate">{activeDocument.sourceFileName || activeDocument.title}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Processed {formatDateTime(activeDocument.createdAt)}
                    </span>
                  </div>
                )}

                {/* Content Area */}
                <Tabs value={activeTab} className="flex-1 bg-[#f4f5f7] relative overflow-hidden flex flex-col p-4 sm:p-6">

                  {/* TAB: PREVIEW */}
                  <TabsContent value="preview" className="m-0 h-full w-full">
                    <div className="bg-[#2d2d2d] rounded-xl h-full w-full flex flex-col shadow-lg overflow-hidden border border-slate-300">
                      {/* Dark Toolbar mimicking reference image */}
                      <div className="h-12 bg-[#1e1e1e] flex items-center px-4 justify-between shrink-0">
                        <div className="bg-[#3d3d3d] text-white text-xs font-semibold px-3 py-1.5 rounded-md">
                          1 / {activeDocument?.pageCount || 1}
                        </div>
                        <div className="flex items-center gap-4 text-slate-300">
                          <button className="hover:text-white transition-colors text-lg font-light">−</button>
                          <button className="hover:text-white transition-colors text-lg font-light">+</button>
                          <div className="w-px h-4 bg-slate-600 mx-2"></div>
                          <button className="hover:text-white transition-colors text-xs font-semibold tracking-wider">FIT WIDTH</button>
                        </div>
                      </div>
                      <div className="flex-1 bg-[#525659] relative">
                        {activeFileUrl ? (
                          <iframe
                            src={`${activeFileUrl}#toolbar=0&navpanes=0`}
                            className="absolute inset-0 w-full h-full border-0 bg-white"
                            title="PDF Preview"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full flex-col text-slate-400 gap-3">
                            <FileText className="w-10 h-10 opacity-50" />
                            <p className="text-sm font-medium">Source preview not available for this document.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB: EXTRACTED DATA */}
                  <TabsContent value="data" className="m-0 h-full w-full">
                    <div className="bg-white rounded-xl h-full w-full shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                      <ScrollArea className="flex-1 p-6">
                        <div className="max-w-3xl mx-auto space-y-6">
                          <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Extracted Data Fields</h2>
                          {activeDocumentEntries.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 font-medium">No fields extracted.</div>
                          ) : (
                            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                              {activeDocumentEntries.map(([key, value]) => {
                                const currentValue = typeof value === "string" ? value : displayValue(value);
                                const canonical = fieldCanonicalValues[key];
                                const ok = !canonical || normalizeText(currentValue) === normalizeText(canonical);

                                return (
                                  <div key={key} className="flex flex-col border-b border-slate-100 pb-3 last:border-0 group">
                                    <div className="flex justify-between items-center mb-1.5">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        {FIELD_LABEL_LOOKUP[key] || key}
                                      </span>
                                      {!ok && (
                                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-[9px] uppercase px-1.5 py-0">
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
                  <TabsContent value="ocr" className="m-0 h-full w-full">
                    <div className="bg-slate-900 rounded-xl h-full w-full shadow-lg border border-slate-800 overflow-hidden flex flex-col text-slate-300">
                      <ScrollArea className="flex-1 p-6">
                        <div className="max-w-4xl mx-auto font-mono text-sm leading-relaxed opacity-90">
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
        )}
      </div>
    </AppShell>
  );
}
