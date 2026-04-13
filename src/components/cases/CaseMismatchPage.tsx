"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getComparableFieldValue,
  getComparisonDisplayLabel,
  pickCanonicalComparableValue,
  readComparisonOptions,
} from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  shouldConsiderFieldKey,
} from "@/lib/document-schema";
import { fetchCaseDetail, type SavedCaseDetail } from "@/lib/case-persistence";
import type { DocType, FieldKey } from "@/types/pipeline";

type LoadState = "loading" | "ready" | "error";
type MismatchRecord = SavedCaseDetail["mismatches"][number];

const FIELD_LABEL_LOOKUP = ACTIVE_FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<string, string>
);

const FIELD_GUIDANCE: Array<{
  fields: string[];
  why: string;
  steps: string[];
}> = [
  {
    fields: ["poNumber", "referencePoNumber"],
    why: "These documents may be linked to different purchase orders.",
    steps: [
      "Confirm the approved PO number.",
      "Correct the document that has the wrong PO reference.",
      "Run analysis again after updating the file.",
    ],
  },
  {
    fields: ["invoiceNumber", "referenceInvoiceNumber", "receiptNumber"],
    why: "The invoice or receipt reference may point to the wrong bill.",
    steps: [
      "Confirm the correct invoice number from the supplier invoice.",
      "Correct the receipt or support document using the wrong invoice reference.",
      "Run analysis again before accepting the case.",
    ],
  },
  {
    fields: ["totalAmount", "subtotal", "taxAmount", "paidAmount", "statementAmount", "currency"],
    why: "The amount, tax, payment, or currency does not match across documents.",
    steps: [
      "Confirm the final bill amount and currency.",
      "Check whether tax or payment proof is using a different value.",
      "Correct the wrong document before approval.",
    ],
  },
  {
    fields: ["vehicleNumber", "registrationNumber", "lorryReceiptNumber", "fastagReference"],
    why: "The vehicle or transport proof may not belong to the same shipment.",
    steps: [
      "Confirm the vehicle actually used for this delivery.",
      "Check the invoice, e-way bill, LR, FASTag, and RC records.",
      "Replace or correct the document with the wrong transport detail.",
    ],
  },
  {
    fields: ["grossWeight", "tareWeight", "netWeight", "itemQuantity", "unit"],
    why: "The quantity or weighment proof does not match the billing document.",
    steps: [
      "Compare the invoice quantity with the delivery and weighment documents.",
      "Confirm which value should be used for billing.",
      "Correct the wrong file and re-run analysis.",
    ],
  },
  {
    fields: ["vendorName", "supplierGstin", "buyerName", "buyerGstin", "ownerName", "driverName", "panNumber"],
    why: "One document may have the wrong party, GSTIN, or identity detail.",
    steps: [
      "Confirm the correct sender, receiver, GSTIN, or identity detail.",
      "Check the source document where the value came from.",
      "Correct the document that has the wrong party information.",
    ],
  },
];

function getFieldLabel(fieldName: string) {
  return getComparisonDisplayLabel(fieldName, FIELD_LABEL_LOOKUP[fieldName]);
}

function getGuidance(fieldName: string) {
  return (
    FIELD_GUIDANCE.find((item) => item.fields.includes(fieldName)) ?? {
      why: "The same field has different values in different documents.",
      steps: [
        "Open the source documents shown above.",
        "Confirm which value is correct.",
        "Correct or replace the document with the wrong value.",
      ],
    }
  );
}

function getValueCount(mismatch: MismatchRecord) {
  return (mismatch.values ?? []).filter(
    (entry) => entry.value !== null && entry.value !== undefined && String(entry.value).trim().length > 0
  ).length;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Missing";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getDocumentName(
  documentLookup: Map<string, SavedCaseDetail["documents"][number]>,
  docId: string | undefined,
  fallback: string
) {
  if (!docId) return fallback;
  const document = documentLookup.get(docId);
  return document?.title || document?.sourceFileName || document?.sourceHint || fallback;
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
        setError(loadError instanceof Error ? loadError.message : "Failed to load mismatch review.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [caseId]);

  const visibleMismatches = useMemo(
    () => detail?.mismatches.filter((mismatch) => shouldConsiderFieldKey(mismatch.fieldName)) ?? [],
    [detail]
  );

  useEffect(() => {
    setActiveMismatchId((current) => {
      if (current && visibleMismatches.some((mismatch) => mismatch.id === current)) {
        return current;
      }

      return visibleMismatches[0]?.id ?? null;
    });
  }, [visibleMismatches]);

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

  const activeMismatch = useMemo(() => {
    if (!activeMismatchId) return visibleMismatches[0] ?? null;
    return visibleMismatches.find((mismatch) => mismatch.id === activeMismatchId) ?? null;
  }, [activeMismatchId, visibleMismatches]);

  const activeFieldLabel = activeMismatch ? getFieldLabel(activeMismatch.fieldName) : "";
  const activeGuidance = activeMismatch ? getGuidance(activeMismatch.fieldName) : null;

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-[#f7f7f5] animate-in fade-in duration-500">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#e5ddd0] bg-white px-4 py-3 sm:px-6 gap-4 sm:gap-6 shrink-0">
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4 w-full sm:w-auto">
            <Link
              href={`/cases/${caseId}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600">
              <TriangleAlert className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {detail?.case.displayName || "Loading review..."}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-0.5">
                <Badge
                  variant="outline"
                  className="rounded-full border-amber-200 bg-amber-50 px-2.5 font-medium text-amber-700 shadow-sm shrink-0"
                >
                  Needs review
                </Badge>
                {detail && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-rose-200 bg-rose-50 px-2.5 font-medium text-rose-700 shadow-sm shrink-0"
                  >
                    {visibleMismatches.length} issue{visibleMismatches.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </header>

        {status === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center py-24 text-slate-500">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">Loading review...</p>
          </div>
        )}

        {status === "error" && (
          <div className="p-4 sm:p-8">
            <div className="mx-auto flex max-w-2xl items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
              <div>
                <h3 className="text-lg font-bold">Unable to load review</h3>
                <p className="mt-1 text-sm font-medium opacity-90">{error}</p>
              </div>
            </div>
          </div>
        )}

        {status === "ready" && detail && (
          <div className="flex flex-1 flex-col overflow-visible xl:flex-row xl:overflow-hidden">
            <div className="w-full shrink-0 border-b border-slate-200 bg-white xl:max-w-[340px] xl:border-b-0 xl:border-r">
              <ScrollArea className="h-auto xl:h-full">
                <div className="p-4 sm:p-6 xl:space-y-6">
                  <div className="hidden xl:block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-600" />
                      <h2 className="text-sm font-bold text-slate-800">Case</h2>
                    </div>
                    <div className="grid gap-3">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Receiver
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 truncate" title={detail.case.receiverName || "—"}>
                          {detail.case.receiverName || "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Docs
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {detail.documents.length}
                          </div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
                            Issues
                          </div>
                          <div className="mt-1 text-lg font-bold text-rose-700">
                            {visibleMismatches.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:mb-0">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <h3 className="text-base font-bold text-slate-900">Issues to check</h3>
                      {visibleMismatches.length > 0 && (
                        <span className="hidden xl:inline-block rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-600">
                          Pick one
                        </span>
                      )}
                    </div>

                    {visibleMismatches.length === 0 ? (
                      <div className="p-6 text-sm font-medium text-slate-500">
                        No issues found. Values match across this case.
                      </div>
                    ) : (
                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1 sm:p-3 xl:block xl:h-[calc(100vh-24rem)] xl:overflow-y-auto xl:divide-y xl:divide-slate-100 xl:p-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none][scrollbar-width:none]">
                        {visibleMismatches.map((mismatch) => {
                          const isActive = activeMismatchId === mismatch.id;
                          const fieldLabel = getFieldLabel(mismatch.fieldName);
                          return (
                            <button
                              key={mismatch.id}
                              onClick={() => setActiveMismatchId(mismatch.id)}
                              className={`min-w-[240px] max-w-[280px] shrink-0 rounded-xl border px-4 py-3 text-left transition-all xl:min-w-0 xl:w-full xl:rounded-none xl:border-0 xl:px-5 xl:py-4 ${isActive
                                ? "border-amber-200 bg-amber-50 xl:bg-slate-100 xl:border-transparent"
                                : "border-slate-200 bg-white hover:bg-slate-50 xl:border-transparent"
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-slate-900 truncate" title={fieldLabel}>
                                    {fieldLabel}
                                  </div>
                                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    {getValueCount(mismatch)} value{getValueCount(mismatch) === 1 ? "" : "s"} found
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

            <div className="flex flex-1 flex-col overflow-visible bg-[#f7f7f5] p-3 sm:p-6 lg:p-8 xl:overflow-hidden">
              <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm xl:h-full xl:min-h-0">
                {visibleMismatches.length === 0 ? (
                  <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-20 text-center xl:h-full xl:min-h-0">
                    <CheckCircle2 className="mb-4 h-14 w-14 text-emerald-400 sm:h-16 sm:w-16" />
                    <h2 className="text-2xl font-bold text-slate-900">All clear</h2>
                    <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                      No value conflicts were found in this case.
                    </p>
                  </div>
                ) : activeMismatch && activeGuidance ? (
                  <ScrollArea className="h-full flex-1">
                    <div className="space-y-6 p-5 sm:space-y-8 sm:p-8">
                      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
                            Issue
                          </div>
                          <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl tracking-tight break-words">
                            {activeFieldLabel}
                          </h2>
                          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                            The documents show different values here. Confirm the correct value before accepting the case.
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="w-fit shrink-0 border-rose-200 bg-rose-50 text-rose-700 font-bold px-3 py-1 shadow-sm"
                        >
                          Check this
                        </Badge>
                      </div>

                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">
                          Different values found
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {(activeMismatch.values ?? []).map((value, index) => {
                            const title = getDocumentName(documentLookup, value.docId, `Document ${index + 1}`);

                            return (
                              <div
                                key={`${activeMismatch.id}-${value.docId ?? index}`}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm"
                              >
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate" title={title}>{title}</span>
                                </div>
                                <div className="text-base font-bold text-slate-900 break-words">
                                  {displayValue(value.value)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {fieldCanonicalValues[activeMismatch.fieldName] && (
                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2">
                            Most common value
                          </div>
                          <p className="mb-3 text-sm font-medium leading-6 text-indigo-900">
                            Use this only as a starting point. Still check the source document before approving.
                          </p>
                          <div className="text-base font-bold text-indigo-950 break-words font-mono bg-white inline-block px-3 py-1 rounded-md border border-indigo-100">
                            {fieldCanonicalValues[activeMismatch.fieldName]}
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-6 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                          Why this matters
                        </div>
                        <p className="text-sm font-medium leading-7 text-slate-600">
                          {activeGuidance.why}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] p-6 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#059669] mb-3 flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" /> What to do next
                        </div>
                        <ol className="space-y-3">
                          {activeGuidance.steps.map((step, index) => (
                            <li key={step} className="flex gap-3 text-sm font-medium leading-6 text-[#065f46]">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#059669] text-xs font-bold text-white">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex h-full min-h-[520px] items-center justify-center px-6 py-20 text-center text-sm font-medium text-slate-500 lg:min-h-0">
                    Select an issue from the list to see the values.
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
