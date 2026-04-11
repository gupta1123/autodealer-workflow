"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FIELD_DEFINITIONS } from "@/lib/document-schema";
import { fetchCaseDetail, type SavedCaseDetail } from "@/lib/case-persistence";

type LoadState = "loading" | "ready" | "error";

const FIELD_LABEL_LOOKUP = FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<string, string>
);

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

export function CaseMismatchPage({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
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
        setError(loadError instanceof Error ? loadError.message : "Failed to load case mismatches.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (!detail) return;
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

  const activeMismatch = useMemo(() => {
    if (!detail || !activeMismatchId) return null;
    return detail.mismatches.find((mismatch) => mismatch.id === activeMismatchId) ?? null;
  }, [detail, activeMismatchId]);

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-[#f8fafc] animate-in fade-in duration-500">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href={`/cases/${caseId}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600">
              <TriangleAlert className="h-4 w-4" />
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                {detail?.case.displayName || "Loading mismatches..."}
              </h1>
              <Badge
                variant="outline"
                className="rounded-full border-amber-200 bg-amber-50 px-2.5 font-medium text-amber-700 shadow-sm"
              >
                Mismatch Review
              </Badge>
              {detail && (
                <Badge
                  variant="outline"
                  className="rounded-full border-rose-200 bg-rose-50 px-2.5 font-medium text-rose-700 shadow-sm"
                >
                  {detail.mismatches.length} issues
                </Badge>
              )}
            </div>
          </div>
        </header>

        {status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center py-24 text-slate-500">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">Loading mismatch review...</p>
          </div>
        )}

        {status === "error" && (
          <div className="p-8">
            <div className="mx-auto flex max-w-2xl items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
              <div>
                <h3 className="text-lg font-bold">Unable to load mismatches</h3>
                <p className="mt-1 text-sm font-medium opacity-90">{error}</p>
              </div>
            </div>
          </div>
        )}

        {status === "ready" && detail && (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-full max-w-sm shrink-0 border-r border-slate-200 bg-white">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-600" />
                      <h2 className="text-sm font-bold text-slate-800">Case Summary</h2>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Buyer
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {detail.case.buyerName || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Uploaded
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatDateTime(detail.case.createdAt)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Documents
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {detail.documents.length}
                          </div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
                            Mismatches
                          </div>
                          <div className="mt-1 text-lg font-bold text-rose-700">
                            {detail.mismatches.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <h3 className="text-base font-bold text-slate-900">Mismatches & Checks</h3>
                    </div>
                    {detail.mismatches.length === 0 ? (
                      <div className="p-6 text-sm font-medium text-slate-500">
                        No mismatches detected. This case is fully reconciled.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {detail.mismatches.map((mismatch) => {
                          const isActive = activeMismatchId === mismatch.id;
                          return (
                            <button
                              key={mismatch.id}
                              onClick={() => setActiveMismatchId(mismatch.id)}
                              className={`w-full px-5 py-4 text-left transition-colors ${
                                isActive ? "bg-slate-100" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {FIELD_LABEL_LOOKUP[mismatch.fieldName] || mismatch.fieldName}
                                  </div>
                                  <div className="mt-1 text-xs font-medium text-slate-500">
                                    {(mismatch.values ?? []).length} observed values
                                  </div>
                                </div>
                                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
              <div className="h-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                {detail.mismatches.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
                    <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-400" />
                    <h2 className="text-2xl font-bold text-slate-900">All Clear!</h2>
                    <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                      No data conflicts were found across the documents in this case.
                    </p>
                  </div>
                ) : activeMismatch ? (
                  <ScrollArea className="h-full">
                    <div className="space-y-6 p-6 sm:p-8">
                      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Field
                          </div>
                          <h2 className="mt-2 text-2xl font-bold text-slate-900">
                            {FIELD_LABEL_LOOKUP[activeMismatch.fieldName] || activeMismatch.fieldName}
                          </h2>
                        </div>
                        <Badge
                          variant="outline"
                          className="w-fit border-rose-200 bg-rose-50 text-rose-700"
                        >
                          Conflict detected
                        </Badge>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {(activeMismatch.values ?? []).map((value, index) => {
                          const title =
                            (value.docId ? documentLookup.get(value.docId)?.title : null) ??
                            `Document ${index + 1}`;

                          return (
                            <div
                              key={`${activeMismatch.id}-${value.docId ?? index}`}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                <FileText className="h-3.5 w-3.5" />
                                <span title={title}>{title}</span>
                              </div>
                              <div className="mt-3 text-sm font-semibold text-slate-900 break-words">
                                {displayValue(value.value)}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {fieldCanonicalValues[activeMismatch.fieldName] && (
                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                            Canonical Value
                          </div>
                          <div className="mt-2 text-sm font-semibold text-indigo-950 break-words">
                            {fieldCanonicalValues[activeMismatch.fieldName]}
                          </div>
                        </div>
                      )}

                      {activeMismatch.analysis && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Analysis
                          </div>
                          <div className="prose prose-sm prose-slate mt-3 max-w-none font-medium">
                            <ReactMarkdown>{activeMismatch.analysis}</ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {activeMismatch.fixPlan && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                            Recommended Fix
                          </div>
                          <div className="prose prose-sm prose-emerald mt-3 max-w-none font-medium text-emerald-950">
                            <ReactMarkdown>{activeMismatch.fixPlan}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-20 text-center text-sm font-medium text-slate-500">
                    Select a mismatch to inspect its conflicting values.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
