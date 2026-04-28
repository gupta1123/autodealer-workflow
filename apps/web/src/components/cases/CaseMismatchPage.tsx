"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getComparisonDisplayLabel,
  isPrimaryComparisonField,
} from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  shouldConsiderFieldKey,
} from "@/lib/document-schema";
import { isLineItemMismatchField } from "@/lib/line-items";
import {
  fetchCaseDetail,
  updateCaseMismatchDecisions,
  updateCaseMismatchDecision,
  type MismatchDecision,
  type SavedCaseDetail,
} from "@/lib/case-persistence";
import {
  DEFAULT_COMPARISON_FIELD_GROUPS,
  fetchComparisonGroups,
  type ComparisonFieldGroup,
} from "@/lib/comparison-groups";

type LoadState = "loading" | "ready" | "error";
type MismatchRecord = SavedCaseDetail["mismatches"][number];

const FIELD_LABEL_LOOKUP = ACTIVE_FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<string, string>
);

const LINE_ITEM_FIELD_LABELS: Record<string, string> = {
  "lineItems.unmatchedInvoiceLine": "Invoice line item",
  "lineItems.uninvoicedPoLine": "PO line item",
  "lineItems.quantityExceeded": "Line item quantity",
  "lineItems.rateMismatch": "Line item rate",
  "lineItems.unitMismatch": "Line item unit",
};

function getGroupForField(field: string, groups: ComparisonFieldGroup[]) {
  return groups.find((group) => group.enabled && group.fields.includes(field)) ?? null;
}

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
      fields: ["vehicleNumber", "registrationNumber", "lorryReceiptNumber", "fastagReference", "eWayBillNumber"],
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
      fields: [
        "vendorName",
        "supplierGstin",
        "buyerName",
        "buyerGstin",
        "ownerName",
        "driverName",
        "holderName",
        "fatherName",
        "panNumber",
      ],
      why: "One document may have the wrong party, GSTIN, or identity detail.",
      steps: [
        "Confirm the correct sender, receiver, GSTIN, or identity detail.",
        "Check the source document where the value came from.",
        "Correct the document that has the wrong party information.",
      ],
    },
  ];

function getFieldLabel(fieldName: string) {
  if (LINE_ITEM_FIELD_LABELS[fieldName]) {
    return LINE_ITEM_FIELD_LABELS[fieldName];
  }
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

function getMismatchResolutionLabel(status: MismatchRecord["resolutionStatus"]) {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function getMismatchResolutionClassName(status: MismatchRecord["resolutionStatus"]) {
  if (status === "accepted") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400 italic font-normal">Missing</span>;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getIssueDescription(fieldName: string) {
  switch (fieldName) {
    case "lineItems.unitMismatch":
      return "The item was matched, but the PO and invoice use different units. Confirm whether these units mean the same thing before approving.";
    case "lineItems.rateMismatch":
      return "The item was matched, but the invoice rate is different from the effective PO rate.";
    case "lineItems.uninvoicedPoLine":
      return "This PO line was ordered but was not found on the invoice.";
    case "lineItems.unmatchedInvoiceLine":
      return "This invoice line could not be matched to a PO line.";
    case "lineItems.quantityExceeded":
      return "The invoice quantity is greater than the matching PO quantity.";
    case "taxAmount":
      return "The invoice tax amount and PO tax amount do not match.";
    case "totalAmount":
      return "The invoice total and PO total do not match.";
    default:
      return "Review the values below and decide whether this issue needs correction.";
  }
}

function formatMismatchValue(fieldName: string, value: unknown, documentTitle: string) {
  if (typeof value !== "string") {
    return displayValue(value);
  }

  const unitMatch = value.match(/^([^:]+): invoice unit (.+) differs from PO unit (.+)$/i);
  if (fieldName === "lineItems.unitMismatch" && unitMatch) {
    const [, line, invoiceUnit, poUnit] = unitMatch;
    const isPo = /purchase order|po\b/i.test(documentTitle);
    return `${line}: ${isPo ? `PO unit ${poUnit}` : `Invoice unit ${invoiceUnit}`}`;
  }

  const rateMatch = value.match(/^([^:]+): invoice rate (.+) differs from PO rate (.+)$/i);
  if (fieldName === "lineItems.rateMismatch" && rateMatch) {
    const [, line, invoiceRate, poRate] = rateMatch;
    const isPo = /purchase order|po\b/i.test(documentTitle);
    return `${line}: ${isPo ? `PO rate ${poRate}` : `Invoice rate ${invoiceRate}`}`;
  }

  const quantityMatch = value.match(/^([^:]+): invoice quantity (.+) exceeds PO quantity (.+)$/i);
  if (fieldName === "lineItems.quantityExceeded" && quantityMatch) {
    const [, line, invoiceQuantity, poQuantity] = quantityMatch;
    const isPo = /purchase order|po\b/i.test(documentTitle);
    return `${line}: ${isPo ? `PO quantity ${poQuantity}` : `Invoice quantity ${invoiceQuantity}`}`;
  }

  return displayValue(value);
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

type GroupedMismatch = {
  groupKey: string;
  groupLabel: string;
  fields: Array<{
    fieldName: string;
    fieldLabel: string;
    values: Array<{ docId: string | undefined; value: unknown }>;
    mismatch: MismatchRecord | null;
  }>;
};

function buildGroupedMismatch(
  activeMismatch: MismatchRecord,
  visibleMismatches: MismatchRecord[],
  documentLookup: Map<string, SavedCaseDetail["documents"][number]>,
  comparisonGroups: ComparisonFieldGroup[]
): GroupedMismatch | null {
  const group = getGroupForField(activeMismatch.fieldName, comparisonGroups);
  if (!group) return null;

  const groupMismatchByField = new Map(
    visibleMismatches
      .filter((mismatch) => group.fields.includes(mismatch.fieldName))
      .map((mismatch) => [mismatch.fieldName, mismatch])
  );

  const result: GroupedMismatch = {
    groupKey: group.groupKey,
    groupLabel: group.label,
    fields: group.fields.map((fieldName) => ({
      fieldName,
      fieldLabel: getFieldLabel(fieldName),
      values: [],
      mismatch: groupMismatchByField.get(fieldName) ?? null,
    })),
  };

  const docIds = new Set<string>();
  groupMismatchByField.forEach((mismatch) => {
    (mismatch.values ?? []).forEach((v) => {
      if (v.docId) docIds.add(v.docId);
    });
  });

  result.fields.forEach((field) => {
    field.values = Array.from(docIds).map((docId) => {
      const doc = documentLookup.get(docId);
      const extractedFields = doc?.extractedFields as Record<string, unknown> | undefined;
      return { docId, value: extractedFields?.[field.fieldName] };
    });
  });

  return result;
}

function GroupedMismatchTable({
  activeMismatchId,
  decisionStatus,
  documentLookup,
  grouped,
  isCaseFinal,
  onDecision,
  onToggleSelected,
  selectedMismatchIds,
}: {
  activeMismatchId: string | null;
  decisionStatus: "idle" | "updating" | "error";
  documentLookup: Map<string, SavedCaseDetail["documents"][number]>;
  grouped: GroupedMismatch;
  isCaseFinal: boolean;
  onDecision: (mismatch: MismatchRecord, decision: MismatchDecision) => void;
  onToggleSelected: (mismatchId: string) => void;
  selectedMismatchIds: Set<string>;
}) {
  const docIds = grouped.fields[0]?.values.map((v) => v.docId) ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">{grouped.groupLabel}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Field</th>
              {docIds.map((docId) => {
                const doc = documentLookup.get(docId ?? "");
                return (
                  <th key={docId} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {doc?.title || doc?.sourceFileName || `Doc ${docId}`}
                  </th>
                );
              })}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grouped.fields.map((field) => {
              const mismatch = field.mismatch;
              const isActive = mismatch?.id === activeMismatchId;
              const isPending = mismatch?.resolutionStatus === "pending";
              const isSelected = mismatch ? selectedMismatchIds.has(mismatch.id) : false;

              return (
                <tr key={field.fieldName} className={isActive ? "bg-amber-50" : "hover:bg-slate-50/50"}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {isPending && !isCaseFinal ? (
                        <input
                          checked={isSelected}
                          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                          onChange={() => onToggleSelected(mismatch.id)}
                          type="checkbox"
                        />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      {field.fieldLabel}
                    </div>
                  </td>
                  {field.values.map((val, idx) => (
                    <td key={idx} className="px-4 py-2.5 text-slate-900">
                      {val.value === null || val.value === undefined || val.value === "" ? (
                        <span className="text-slate-400 italic">Missing</span>
                      ) : (
                        String(val.value)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    {mismatch ? (
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getMismatchResolutionClassName(mismatch.resolutionStatus)}`}
                      >
                        {getMismatchResolutionLabel(mismatch.resolutionStatus)}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                      >
                        Match
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isPending && !isCaseFinal ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          className="h-8 border-rose-200 px-2 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          disabled={decisionStatus === "updating"}
                          onClick={() => onDecision(mismatch, "rejected")}
                          size="sm"
                          variant="outline"
                        >
                          Reject
                        </Button>
                        <Button
                          className="h-8 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                          disabled={decisionStatus === "updating"}
                          onClick={() => onDecision(mismatch, "accepted")}
                          size="sm"
                        >
                          Accept
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-right text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MismatchReviewSkeleton() {
  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r">
        <div className="hidden border-b border-slate-100 p-5 lg:block">
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded bg-slate-100" />
            <Skeleton className="h-4 w-28 bg-slate-100" />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 bg-slate-100" />
              <Skeleton className="h-4 w-40 bg-slate-100" />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20 bg-slate-100" />
                <Skeleton className="h-4 w-8 bg-slate-100" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16 bg-amber-100" />
                <Skeleton className="h-4 w-8 bg-amber-100" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50 lg:bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 lg:px-5 lg:py-4">
            <Skeleton className="h-4 w-32 bg-slate-100" />
          </div>
          <div className="flex gap-2 overflow-x-auto p-3 lg:block lg:space-y-0 lg:overflow-y-hidden lg:p-0">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 lg:w-full lg:rounded-none lg:border-0 lg:border-l-[3px] lg:border-transparent lg:px-5 lg:py-3"
              >
                <Skeleton className="h-4 w-28 bg-slate-100" />
                <Skeleton className="mt-2 hidden h-3 w-20 bg-slate-100 lg:block" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52 bg-slate-200/70" />
            <Skeleton className="h-4 w-80 max-w-full bg-slate-200/70" />
          </div>
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded bg-slate-100" />
              <Skeleton className="h-4 w-32 bg-slate-100" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <Skeleton className="mb-3 h-3 w-32 bg-slate-100" />
                  <Skeleton className="h-4 w-44 bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            <Skeleton className="mb-4 h-4 w-36 bg-slate-200/70" />
            <div className="space-y-3">
              <Skeleton className="h-3.5 w-full bg-slate-200/70" />
              <Skeleton className="h-3.5 w-5/6 bg-slate-200/70" />
              <Skeleton className="h-3.5 w-4/6 bg-slate-200/70" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function CaseMismatchPage({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeMismatchId, setActiveMismatchId] = useState<string | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "updating" | "error">("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [comparisonGroups, setComparisonGroups] = useState<ComparisonFieldGroup[]>(
    DEFAULT_COMPARISON_FIELD_GROUPS
  );
  const [selectedMismatchIds, setSelectedMismatchIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchCaseDetail(caseId),
      fetchComparisonGroups().catch(() => DEFAULT_COMPARISON_FIELD_GROUPS),
    ])
      .then(([payload, groups]) => {
        if (!active) return;
        setDetail(payload);
        setComparisonGroups(groups);
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
    () =>
      detail?.mismatches.filter(
        (mismatch) =>
          isLineItemMismatchField(mismatch.fieldName) ||
          (shouldConsiderFieldKey(mismatch.fieldName) && isPrimaryComparisonField(mismatch.fieldName))
      ) ?? [],
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

  const activeMismatch = useMemo(() => {
    if (!activeMismatchId) return visibleMismatches[0] ?? null;
    return visibleMismatches.find((mismatch) => mismatch.id === activeMismatchId) ?? null;
  }, [activeMismatchId, visibleMismatches]);

  const groupedMismatch = useMemo(() => {
    if (!activeMismatch || !documentLookup) return null;
    return buildGroupedMismatch(activeMismatch, visibleMismatches, documentLookup, comparisonGroups);
  }, [activeMismatch, comparisonGroups, documentLookup, visibleMismatches]);

  const activeFieldLabel = activeMismatch ? getFieldLabel(activeMismatch.fieldName) : "";
  const activeGuidance = activeMismatch ? getGuidance(activeMismatch.fieldName) : null;
  const isCaseFinal = detail?.case.status === "accepted" || detail?.case.status === "rejected";
  const isActiveMismatchPending = activeMismatch?.resolutionStatus === "pending";
  const pendingMismatchCount = visibleMismatches.filter(
    (mismatch) => mismatch.resolutionStatus === "pending"
  ).length;
  const acceptedMismatchCount = visibleMismatches.filter(
    (mismatch) => mismatch.resolutionStatus === "accepted"
  ).length;
  const rejectedMismatchCount = visibleMismatches.filter(
    (mismatch) => mismatch.resolutionStatus === "rejected"
  ).length;
  const pendingVisibleMismatchIds = useMemo(
    () =>
      visibleMismatches
        .filter((mismatch) => mismatch.resolutionStatus === "pending")
        .map((mismatch) => mismatch.id),
    [visibleMismatches]
  );
  const selectedPendingMismatchIds = pendingVisibleMismatchIds.filter((id) =>
    selectedMismatchIds.has(id)
  );

  useEffect(() => {
    setSelectedMismatchIds((current) => {
      const allowed = new Set(pendingVisibleMismatchIds);
      const next = new Set(Array.from(current).filter((id) => allowed.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pendingVisibleMismatchIds]);

  function handleToggleSelectedMismatch(mismatchId: string) {
    setSelectedMismatchIds((current) => {
      const next = new Set(current);
      if (next.has(mismatchId)) {
        next.delete(mismatchId);
      } else {
        next.add(mismatchId);
      }
      return next;
    });
  }

  function handleSelectAllPending() {
    setSelectedMismatchIds(new Set(pendingVisibleMismatchIds));
  }

  function handleClearSelected() {
    setSelectedMismatchIds(new Set());
  }

  async function handleMismatchDecisionFor(mismatch: MismatchRecord, decision: MismatchDecision) {
    if (!detail) return;

    try {
      setDecisionStatus("updating");
      setDecisionError(null);
      await updateCaseMismatchDecision(caseId, mismatch.id, decision);
      const refreshed = await fetchCaseDetail(caseId);
      setDetail(refreshed);
      setSelectedMismatchIds((current) => {
        const next = new Set(current);
        next.delete(mismatch.id);
        return next;
      });
      setDecisionStatus("idle");
    } catch (decisionFailure) {
      setDecisionError(
        decisionFailure instanceof Error
          ? decisionFailure.message
          : `Failed to ${decision === "accepted" ? "accept" : "reject"} issue.`
      );
      setDecisionStatus("error");
    }
  }

  async function handleMismatchDecision(decision: MismatchDecision) {
    if (!activeMismatch) return;
    await handleMismatchDecisionFor(activeMismatch, decision);
  }

  async function handleBulkMismatchDecision(decision: MismatchDecision) {
    if (!detail || selectedPendingMismatchIds.length === 0) return;

    try {
      setDecisionStatus("updating");
      setDecisionError(null);
      await updateCaseMismatchDecisions(caseId, selectedPendingMismatchIds, decision);
      const refreshed = await fetchCaseDetail(caseId);
      setDetail(refreshed);
      setSelectedMismatchIds(new Set());
      setDecisionStatus("idle");
    } catch (decisionFailure) {
      setDecisionError(
        decisionFailure instanceof Error
          ? decisionFailure.message
          : `Failed to ${decision === "accepted" ? "accept" : "reject"} selected issues.`
      );
      setDecisionStatus("error");
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-slate-50 animate-in fade-in duration-500">

        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 shadow-sm">
          <div className="flex min-w-0 items-center gap-3 w-full">
            <Link
              href={`/cases/${caseId}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              {status === "loading" ? (
                <Skeleton className="h-5 w-52 max-w-[55vw] bg-slate-100" />
              ) : (
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                  {detail?.case.displayName}
                </h1>
              )}
              {detail && (
                <div className="hidden items-center gap-2 sm:flex shrink-0">
                  <Badge
                    variant="secondary"
                    className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-transparent rounded-md px-2 py-0.5"
                  >
                    {visibleMismatches.length} Issue{visibleMismatches.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`rounded-md px-2 py-0.5 ${detail.case.status === "accepted"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : detail.case.status === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                  >
                    {detail.case.status === "accepted"
                      ? "Case accepted"
                      : detail.case.status === "rejected"
                        ? "Case rejected"
                        : "Pending decision"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Loading State */}
        {status === "loading" && (
          <MismatchReviewSkeleton />
        )}

        {/* Error State */}
        {status === "error" && (
          <div className="p-4 sm:p-8 flex-1">
            <div className="mx-auto flex max-w-2xl items-start gap-4 rounded-xl border border-red-200 bg-white p-6 shadow-sm">
              <ShieldAlert className="h-6 w-6 shrink-0 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Unable to load review</h3>
                <p className="mt-1 text-sm text-slate-500">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Layout */}
        {status === "ready" && detail && (
          <div className="flex flex-1 flex-col lg:flex-row min-h-0 overflow-hidden">

            {/* Sidebar / Mobile Tabs */}
            <aside className="flex flex-col shrink-0 border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r z-0">

              {/* Desktop Only: Case Meta Summary */}
              <div className="hidden lg:block p-5 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-800">Case Summary</h2>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Receiver</p>
                    <p className="text-sm font-medium text-slate-900 truncate" title={detail.case.receiverName || "—"}>
                      {detail.case.receiverName || "—"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Documents</p>
                      <p className="text-sm font-medium text-slate-900">{detail.documents.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600">Pending</p>
                      <p className="text-sm font-medium text-amber-700">{pendingMismatchCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mismatches List / Tabs */}
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50 lg:bg-white">
                <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-slate-100 flex items-center justify-between bg-white">
                  <h3 className="text-sm font-semibold text-slate-900">Issues to resolve</h3>
                </div>

                {visibleMismatches.length === 0 ? (
                  <div className="p-5 text-sm text-slate-500">
                    No conflicting values found.
                  </div>
                ) : (
                  <div className="flex gap-2 p-3 overflow-x-auto lg:p-0 lg:flex-col lg:overflow-y-auto lg:block hide-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none][scrollbar-width:none]">
                    {visibleMismatches.map((mismatch) => {
                      const isActive = activeMismatchId === mismatch.id;
                      const fieldLabel = getFieldLabel(mismatch.fieldName);

                      return (
                        <button
                          key={mismatch.id}
                          onClick={() => setActiveMismatchId(mismatch.id)}
                          className={`group relative flex items-center shrink-0 lg:w-full text-left transition-all ${isActive
                              ? "bg-amber-100 text-amber-900 lg:bg-amber-50/50 lg:text-slate-900 lg:border-l-[3px] lg:border-amber-500"
                              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 lg:bg-transparent lg:border-0 lg:border-l-[3px] lg:border-transparent lg:hover:bg-slate-50"
                            } rounded-full lg:rounded-none px-4 py-2 lg:px-5 lg:py-3`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                              {fieldLabel}
                            </p>
                            <div className="mt-0.5 hidden items-center gap-2 lg:flex">
                              <p className="text-xs text-slate-500 group-hover:text-slate-600">
                                {getValueCount(mismatch)} value{getValueCount(mismatch) === 1 ? "" : "s"} found
                              </p>
                              <span
                                className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getMismatchResolutionClassName(mismatch.resolutionStatus)}`}
                              >
                                {getMismatchResolutionLabel(mismatch.resolutionStatus)}
                              </span>
                            </div>
                          </div>
                          {isActive && (
                            <ChevronRight className="hidden lg:block h-4 w-4 text-amber-500 shrink-0 ml-3" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            {/* Main Detail Content */}
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
                  {visibleMismatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 p-12 text-center shadow-sm mt-8">
                      <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">All clear</h2>
                      <p className="mt-2 text-slate-500">
                        No value conflicts were found across the documents in this case.
                      </p>
                    </div>
                  ) : activeMismatch && activeGuidance ? (
                    <div className="space-y-6">

                    {/* Header for Active Issue */}
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                          {activeFieldLabel}
                        </h2>
                        <Badge
                          variant="outline"
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getMismatchResolutionClassName(activeMismatch.resolutionStatus)}`}
                        >
                          {getMismatchResolutionLabel(activeMismatch.resolutionStatus)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {getIssueDescription(activeMismatch.fieldName)}
                      </p>
                    </div>

                    {/* Conflicting Values Grid or Grouped Table */}
                    {groupedMismatch ? (
                      <GroupedMismatchTable
                        activeMismatchId={activeMismatch.id}
                        decisionStatus={decisionStatus}
                        documentLookup={documentLookup}
                        grouped={groupedMismatch}
                        isCaseFinal={isCaseFinal}
                        onDecision={(mismatch, decision) => {
                          void handleMismatchDecisionFor(mismatch, decision);
                        }}
                        onToggleSelected={handleToggleSelectedMismatch}
                        selectedMismatchIds={selectedMismatchIds}
                      />
                    ) : (
                      <div>
                        <h3 className="mb-3 text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          Extracted Values
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(activeMismatch.values ?? []).map((value, index) => {
                            const title = getDocumentName(documentLookup, value.docId, `Document ${index + 1}`);

                            return (
                              <div
                                key={`${activeMismatch.id}-${value.docId ?? index}`}
                                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md"
                              >
                                <div className="text-xs font-medium text-slate-500 mb-2 truncate" title={title}>
                                  {title}
                                </div>
                                <div className="text-sm font-semibold text-slate-900 break-words">
                                  {formatMismatchValue(activeMismatch.fieldName, value.value, title)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    </div>
                  ) : (
                    <div className="flex h-[400px] items-center justify-center text-center text-sm text-slate-500">
                      Select an issue from the list to review conflicting values.
                    </div>
                  )}
                </div>
              </div>

              {visibleMismatches.length > 0 && activeMismatch && (
                <footer className="z-20 shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 lg:px-8">
                  <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
	                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
	                        <span>
	                          Pending <span className="font-semibold text-slate-800">{pendingMismatchCount}</span>
                        </span>
                        <span>
                          Accepted <span className="font-semibold text-emerald-700">{acceptedMismatchCount}</span>
                        </span>
	                        <span>
	                          Rejected <span className="font-semibold text-rose-700">{rejectedMismatchCount}</span>
	                        </span>
	                        <span>
	                          Selected <span className="font-semibold text-slate-800">{selectedPendingMismatchIds.length}</span>
	                        </span>
	                      </div>
                      {decisionStatus === "error" && decisionError && (
                        <div className="mt-1 text-xs font-medium text-rose-700">{decisionError}</div>
                      )}
                      {detail.case.status === "accepted" && (
                        <div className="mt-1 text-xs font-medium text-emerald-700">
                          All issues are accepted. This case has been accepted automatically.
                        </div>
                      )}
                      {!isActiveMismatchPending && (
                        <div
                          className={`mt-1 text-xs font-medium ${activeMismatch.resolutionStatus === "accepted" ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {activeMismatch.resolutionStatus === "accepted"
                            ? "This issue is accepted."
                            : "This issue is rejected."}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {selectedPendingMismatchIds.length > 0 && !isCaseFinal ? (
                        <>
                          <Button
                            className="border-slate-200 text-slate-600 hover:bg-slate-50"
                            disabled={decisionStatus === "updating"}
                            onClick={handleClearSelected}
                            variant="outline"
                          >
                            Clear
                          </Button>
                          <Button
                            variant="outline"
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            disabled={decisionStatus === "updating"}
                            onClick={() => {
                              void handleBulkMismatchDecision("rejected");
                            }}
                          >
                            {decisionStatus === "updating" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <X className="mr-2 h-4 w-4" />
                            )}
                            Reject Selected
                          </Button>
                          <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={decisionStatus === "updating"}
                            onClick={() => {
                              void handleBulkMismatchDecision("accepted");
                            }}
                          >
                            {decisionStatus === "updating" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-2 h-4 w-4" />
                            )}
                            Accept Selected
                          </Button>
                        </>
                      ) : isActiveMismatchPending && !isCaseFinal ? (
	                        <>
                          <Button
                            className="border-slate-200 text-slate-600 hover:bg-slate-50"
                            disabled={decisionStatus === "updating" || pendingVisibleMismatchIds.length === 0}
                            onClick={handleSelectAllPending}
                            variant="outline"
                          >
                            Select all
                          </Button>
	                          <Button
                            variant="outline"
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            disabled={decisionStatus === "updating"}
                            onClick={() => handleMismatchDecision("rejected")}
                          >
                            {decisionStatus === "updating" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <X className="mr-2 h-4 w-4" />
                            )}
                            Reject Issue
                          </Button>
                          <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={decisionStatus === "updating"}
                            onClick={() => handleMismatchDecision("accepted")}
                          >
                            {decisionStatus === "updating" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-2 h-4 w-4" />
                            )}
                            Accept Issue
                          </Button>
                        </>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getMismatchResolutionClassName(activeMismatch.resolutionStatus)}`}
                        >
                          {getMismatchResolutionLabel(activeMismatch.resolutionStatus)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </footer>
              )}
            </main>
          </div>
        )}
      </div>
    </AppShell>
  );
}
