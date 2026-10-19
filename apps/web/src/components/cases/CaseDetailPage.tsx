"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Folder,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Check,
  FileSearch,
  Play,
  GripVertical,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import {
  CaseDetailRedesign,
  type RedesignedDocumentCard,
} from "@/components/cases/CaseDetailRedesign";
import { CaseConfirmDialog } from "@/components/cases/CaseConfirmDialog";
import { PdfEvidencePreview } from "@/components/cases/PdfEvidencePreview";
import {releaseProtectedPreview} from '@/lib/protected-preview';
import { TallyInReviewPanel } from "@/components/cases/TallyInReviewPanel";
import { ExtractedFieldsPanel, type ExtractedFieldItem } from "@/components/cases/ExtractedFieldsPanel";
import styles from "@/components/cases/CaseDetailPage.module.css";
import { AnalysisOptionsDialog } from "@/components/workspace/AnalysisOptionsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getComparableFieldValue,
  getComparisonModeLabel,
  isPrimaryComparisonField,
  readComparisonOptions,
} from "@/lib/comparison";
import {
  ACTIVE_FIELD_DEFINITIONS,
  getFieldDefinitionsByKeys,
  getFieldDefinitionsForDocType,
  shouldConsiderFieldKey,
} from "@/lib/document-schema";
import { isLineItemMismatchField } from "@/lib/line-items";
import {
  appendCaseFiles,
  enqueueCaseAnalysis,
  type AnalysisProgressDetail,
  fetchCaseAnalysisStatus,
  fetchCaseDetail,
  fetchCaseDetailPreferCache,
  fetchCaseFileSignedUrlPreferCache,
  restoreCase,
  updateCaseDecision,
  type CaseDecision,
  type SavedCaseDetail,
} from "@/lib/case-persistence";
import { describeAnalysisStep, formatEta } from "@/lib/analysis-progress";
import { readUploadGroupMeta } from "@/lib/upload-groups";
import type {
  CaseAnalysisMode,
  CommercialLineItem,
  ComparisonOptions,
  DocType,
  FieldKey,
  PipelineStageProgress,
  QueuedUpload,
} from "@/types/pipeline";

type LoadState = "loading" | "ready" | "error";
type ActiveTab = "preview" | "data";
type DataViewMode = "fields" | "lineItems" | "terms";
type PreviewFocus = {
  id: string;
  label: string;
  query: string;
  pageNumber?: number;
  occurrence?: number;
};
type DocumentFieldComparison = { key: string; label: string } | null;
const DEFAULT_DATA_PANE_WIDTH = 576;
const DEFAULT_PREVIEW_ZOOM = 1;
const PURCHASE_ORDER_DOCUMENT_TYPES = new Set(["Purchase Order", "Amended Purchase Order"]);
const TERMS_CHECKLIST_DEFINITIONS = [
  { key: "paymentTerms", label: "Payment", keywords: ["payment", "advance", "proforma"] },
  { key: "deliveryTerms", label: "Delivery", keywords: ["delivery", "dispatch", "delivered", "schedule"] },
  { key: "freightTerms", label: "Freight", keywords: ["freight", "transport", "godown"] },
  { key: "packingForwardingTerms", label: "Packing / Forwarding", keywords: ["packing", "forwarding", "p&f"] },
  { key: "priceBasis", label: "Price Basis", keywords: ["price", "late", "fee", "basis"] },
  { key: "taxTerms", label: "Tax / GST", keywords: ["tax", "gst", "eway", "e-way"] },
  { key: "inspectionTerms", label: "Inspection / Quality", keywords: ["inspection", "test", "certificate", "quality"] },
  { key: "warrantyTerms", label: "Warranty", keywords: ["warranty", "guarantee"] },
  { key: "termsAndConditions", label: "Other Terms", keywords: ["terms", "conditions", "clause"] },
] as const;
const TERMS_FIELD_KEYS = TERMS_CHECKLIST_DEFINITIONS.map((item) => item.key);
const TERMS_FIELD_KEY_SET = new Set<string>(TERMS_FIELD_KEYS);

const FIELD_LABEL_LOOKUP = ACTIVE_FIELD_DEFINITIONS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {} as Record<string, string>
);
const TERMS_COMPLIANCE_FIELD = "termsAndConditions";

type TermsComplianceChecklistItem = {
  sourceDocId: string;
  sourceClause: string;
  obligation: string;
  category: string;
  status: "fulfilled" | "not_fulfilled" | "unknown" | "not_applicable";
  evidenceDocIds: string[];
  evidence: string;
  reason: string;
  severity: "high" | "medium" | "low" | "none";
};

type CaseDetailDocument = SavedCaseDetail["documents"][number];

type SellerChainRoleSelectionMeta = {
  primaryDocumentIds: string[];
  contextDocumentIds: string[];
  note: string;
};

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

function readSellerChainRoleSelectionMeta(processingMeta: unknown): SellerChainRoleSelectionMeta | null {
  if (!processingMeta || typeof processingMeta !== "object" || Array.isArray(processingMeta)) {
    return null;
  }

  const rawGroups = (processingMeta as Record<string, unknown>).verificationGroups;
  if (!Array.isArray(rawGroups)) return null;

  for (const group of rawGroups) {
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    const roleSelection = (group as Record<string, unknown>).roleSelection;
    if (!roleSelection || typeof roleSelection !== "object" || Array.isArray(roleSelection)) continue;

    const record = roleSelection as Record<string, unknown>;
    if (record.strategy !== "seller_chain") continue;

    const primaryDocumentIds = readStringArray(record.primaryDocumentIds);
    const contextDocumentIds = readStringArray(record.contextDocumentIds);
    if (!primaryDocumentIds.length || !contextDocumentIds.length) continue;

    return {
      primaryDocumentIds,
      contextDocumentIds,
      note:
        String(record.note ?? "").trim() ||
        "Seller-chain role selection applied: Kalika-facing invoice was reconciled; upstream seller invoices were kept as context.",
    };
  }

  return null;
}

function readTermsComplianceChecklist(processingMeta: unknown): TermsComplianceChecklistItem[] {
  if (!processingMeta || typeof processingMeta !== "object" || Array.isArray(processingMeta)) {
    return [];
  }

  const raw = (processingMeta as Record<string, unknown>).termsComplianceChecklist;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const sourceDocId = String(record.sourceDocId ?? "").trim();
    const sourceClause = String(record.sourceClause ?? "").trim();
    const obligation = String(record.obligation ?? "").trim();
    const status = String(record.status ?? "").trim() as TermsComplianceChecklistItem["status"];
    if (!sourceDocId || !sourceClause || !obligation) return [];
    if (!["fulfilled", "not_fulfilled", "unknown", "not_applicable"].includes(status)) return [];

    return [
      {
        sourceDocId,
        sourceClause,
        obligation,
        category: String(record.category ?? "Terms compliance").trim() || "Terms compliance",
        status,
        evidenceDocIds: Array.isArray(record.evidenceDocIds)
          ? record.evidenceDocIds.map((value) => String(value ?? "").trim()).filter(Boolean)
          : [],
        evidence: String(record.evidence ?? "").trim(),
        reason: String(record.reason ?? "").trim(),
        severity: String(record.severity ?? "none").trim() as TermsComplianceChecklistItem["severity"],
      },
    ];
  });
}

function getDocumentFieldLabel(documentType: string | undefined, key: string) {
  if (documentType === "E-Way Bill" && key === "subtotal") {
    return "Total Taxable Amount";
  }

  return FIELD_LABEL_LOOKUP[key] || key;
}

function getTermValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isNonRequiredDocumentField(documentType: string, key: string) {
  return PURCHASE_ORDER_DOCUMENT_TYPES.has(documentType) && key === "hasVendorStamp";
}

function getTermsIssueText(mismatch: SavedCaseDetail["mismatches"][number]) {
  return [
    mismatch.analysis ?? "",
    mismatch.fixPlan ?? "",
    ...mismatch.values.map((entry) => String(entry.value ?? "")),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsIssueMatchesDocument(
  mismatch: SavedCaseDetail["mismatches"][number],
  document: SavedCaseDetail["documents"][number] | null
) {
  if (!document || mismatch.fieldName !== TERMS_COMPLIANCE_FIELD) return false;
  const documentIds = new Set(
    [document.id, document.clientDocumentId, document.sourceHint, document.title]
      .filter((value): value is string => Boolean(value))
  );
  return mismatch.values.some((entry) => entry.docId && documentIds.has(entry.docId));
}

function termsIssueMatchesDefinition(
  mismatch: SavedCaseDetail["mismatches"][number],
  definition: (typeof TERMS_CHECKLIST_DEFINITIONS)[number],
  value: string
) {
  const issueText = getTermsIssueText(mismatch).toLowerCase();
  if (definition.key === "termsAndConditions") return false;
  if (definition.keywords.some((keyword) => issueText.includes(keyword))) return true;

  const usefulWords = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .slice(0, 8);
  if (usefulWords.length < 2) return false;

  return usefulWords.filter((word) => issueText.includes(word)).length >= 2;
}

function getTermsIssueStatus(mismatch: SavedCaseDetail["mismatches"][number]) {
  const text = getTermsIssueText(mismatch).toLowerCase();
  if (text.includes("not fulfilled")) {
    return {
      label: "Not fulfilled",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      icon: ShieldAlert,
    };
  }

  return {
    label: "Needs review",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: TriangleAlert,
  };
}

function getClearTermsStatus() {
  return {
    label: "No issue flagged",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  };
}

function getChecklistStatus(status: TermsComplianceChecklistItem["status"]) {
  if (status === "not_fulfilled") {
    return {
      label: "Not fulfilled",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      icon: ShieldAlert,
    };
  }

  if (status === "unknown") {
    return {
      label: "Needs review",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      icon: TriangleAlert,
    };
  }

  if (status === "not_applicable") {
    return {
      label: "Not applicable",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      icon: Check,
    };
  }

  return {
    label: "Fulfilled",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  };
}

const LINE_ITEM_COLUMNS: Array<{
  key: keyof CommercialLineItem;
  label: string;
  className?: string;
}> = [
  { key: "lineNumber", label: "#", className: "w-12" },
  { key: "itemCode", label: "Item Code", className: "min-w-32" },
  { key: "description", label: "Description", className: "min-w-60" },
  { key: "hsnSac", label: "HSN/SAC", className: "min-w-24" },
  { key: "quantity", label: "Qty", className: "min-w-20 text-right" },
  { key: "unit", label: "Unit", className: "min-w-16" },
  { key: "rate", label: "Rate", className: "min-w-24 text-right" },
  { key: "taxableAmount", label: "Taxable", className: "min-w-28 text-right" },
  { key: "taxRate", label: "GST %", className: "min-w-20 text-right" },
  { key: "cgstRate", label: "CGST %", className: "min-w-20 text-right" },
  { key: "sgstRate", label: "SGST %", className: "min-w-20 text-right" },
  { key: "igstRate", label: "IGST %", className: "min-w-20 text-right" },
  { key: "taxAmount", label: "Tax", className: "min-w-24 text-right" },
  { key: "lineTotal", label: "Total", className: "min-w-28 text-right" },
];

const DRAFT_STAGE_SEQUENCE: PipelineStageProgress["stage"][] = [
  "upload_received",
  "classifying",
  "ocr",
  "extracting",
  "validating",
  "complete",
];

function buildDraftStages(): PipelineStageProgress[] {
  return DRAFT_STAGE_SEQUENCE.map((stage, index) => ({
    stage,
    status: index === 0 ? "active" : "pending",
    startedAt: index === 0 ? Date.now() : undefined,
  }));
}

function buildDraftUploads(files: File[]): QueuedUpload[] {
  return files.map((file, index) => ({
    id: `${file.name}-${Date.now()}-${index}`,
    name: file.name,
    file,
    files: [file],
    source: "file",
    stages: buildDraftStages(),
  }));
}

function getOrderedDocumentEntries(
  documentType: string,
  extractedFields: Record<string, unknown>
) {
  const visibleEntries = Object.entries(extractedFields).filter(
    ([key, value]) =>
      !isNonRequiredDocumentField(documentType, key) &&
      !(documentType === "E-Way Bill" && key === "subtotal" && extractedFields.totalTaxableAmount) &&
      value !== null &&
      value !== undefined &&
      value !== ""
  );
  const relevantDefinitions = getFieldDefinitionsForDocType(documentType);
  const relevantKeys = relevantDefinitions.map(({ key }) => key);
  const relevantKeySet = new Set(relevantKeys);
  const remainingKeys = visibleEntries
    .map(([key]) => key)
    .filter((key) => !relevantKeySet.has(key as (typeof relevantKeys)[number]));

  return getFieldDefinitionsByKeys([...relevantKeys, ...remainingKeys]).flatMap(({ key }) => {
    const value = extractedFields[key];
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      (documentType === "E-Way Bill" && key === "subtotal" && extractedFields.totalTaxableAmount)
    ) {
      return [];
    }
    return [[key, value] as [string, unknown]];
  });
}

function getCompactDocumentType(documentType: string) {
  if (/purchase order/i.test(documentType)) return "PO";
  if (/tax invoice|invoice/i.test(documentType)) return "Invoice";
  if (/e-?way/i.test(documentType)) return "E-Way";
  return documentType.replace(/\s+document$/i, "");
}

function getPacketDocumentLabels(documents: SavedCaseDetail["documents"]) {
  const labels = documents.map((document) => getCompactDocumentType(document.documentType || "Document"));
  return Array.from(new Set(labels));
}

function getMissingPacketDocumentLabels(documents: SavedCaseDetail["documents"]) {
  const documentTypes = documents.map((document) => document.documentType.toLowerCase());
  const hasPo = documentTypes.some((type) => type.includes("purchase order"));
  const hasInvoice = documentTypes.some((type) => type.includes("invoice"));
  const hasEWay = documentTypes.some((type) => type.includes("e-way") || type.includes("eway"));

  return [
    !hasPo ? "PO" : "",
    !hasInvoice ? "Invoice" : "",
    !hasEWay ? "E-Way" : "",
  ].filter(Boolean);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeInvoiceCopyValue(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getStringField(document: CaseDetailDocument, key: string) {
  const value = document.extractedFields[key];
  return value === null || value === undefined ? "" : String(value).trim();
}

function isInvoiceDocument(document: CaseDetailDocument) {
  return /^(?:tax\s+)?invoice$/i.test(document.documentType.trim());
}

function getInvoiceDisplayIdentity(document: CaseDetailDocument) {
  return normalizeInvoiceCopyValue(
    getStringField(document, "invoiceNumber") ||
      getStringField(document, "referenceInvoiceNumber")
  );
}

function parseInvoiceAmount(value: unknown) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getInvoiceAmount(document: CaseDetailDocument) {
  return (
    parseInvoiceAmount(getStringField(document, "totalAmount")) ??
    parseInvoiceAmount(getStringField(document, "totalTaxableAmount")) ??
    parseInvoiceAmount(getStringField(document, "subtotal"))
  );
}

function invoiceAmountsMatch(left: CaseDetailDocument, right: CaseDetailDocument) {
  const leftAmount = getInvoiceAmount(left);
  const rightAmount = getInvoiceAmount(right);
  if (leftAmount === null || rightAmount === null) return false;
  return Math.abs(leftAmount - rightAmount) <= Math.max(1, Math.abs(rightAmount) * 0.001);
}

function normalizedInvoiceField(document: CaseDetailDocument, field: string) {
  return normalizeInvoiceCopyValue(getStringField(document, field));
}

function invoicePartyNameMatches(left: string, right: string) {
  return Boolean(
    left &&
      right &&
      left.length >= 5 &&
      right.length >= 5 &&
      (left === right || left.includes(right) || right.includes(left))
  );
}

function invoicePartySideMatches(
  left: CaseDetailDocument,
  right: CaseDetailDocument,
  gstinField: string,
  nameField: string
) {
  const leftGstin = normalizedInvoiceField(left, gstinField);
  const rightGstin = normalizedInvoiceField(right, gstinField);
  if (leftGstin && rightGstin) return leftGstin === rightGstin;

  const leftName = normalizedInvoiceField(left, nameField);
  const rightName = normalizedInvoiceField(right, nameField);
  if (leftName && rightName) return invoicePartyNameMatches(leftName, rightName);

  return null;
}

function hasInvoicePartySideEvidence(document: CaseDetailDocument, gstinField: string, nameField: string) {
  return Boolean(normalizedInvoiceField(document, gstinField) || normalizedInvoiceField(document, nameField));
}

function invoicePartiesCompatible(left: CaseDetailDocument, right: CaseDetailDocument) {
  const supplierMatch = invoicePartySideMatches(left, right, "supplierGstin", "vendorName");
  if (supplierMatch === false) return false;

  const buyerMatch = invoicePartySideMatches(left, right, "buyerGstin", "buyerName");
  if (buyerMatch === false) return false;

  const hasSupplierEvidence =
    hasInvoicePartySideEvidence(left, "supplierGstin", "vendorName") ||
    hasInvoicePartySideEvidence(right, "supplierGstin", "vendorName");
  if (hasSupplierEvidence) return supplierMatch === true;

  return buyerMatch === true;
}

function areDuplicateInvoiceDisplayCopies(left: CaseDetailDocument, right: CaseDetailDocument) {
  if (!isInvoiceDocument(left) || !isInvoiceDocument(right)) return false;
  const leftInvoice = getInvoiceDisplayIdentity(left);
  const rightInvoice = getInvoiceDisplayIdentity(right);
  if (!leftInvoice || !rightInvoice || leftInvoice !== rightInvoice) return false;

  return invoiceAmountsMatch(left, right) && invoicePartiesCompatible(left, right);
}

function inferSellerChainRoleSelection(
  documents: SavedCaseDetail["documents"]
): SellerChainRoleSelectionMeta | null {
  const invoices = documents.filter(isInvoiceDocument);
  const purchaseOrders = documents.filter((document) =>
    PURCHASE_ORDER_DOCUMENT_TYPES.has(document.documentType)
  );
  if (invoices.length < 2 || !purchaseOrders.length) return null;

  const identitiesMatch = (leftName: string, leftGstin: string, rightName: string, rightGstin: string) => {
    const normalizedLeftGstin = normalizeInvoiceCopyValue(leftGstin);
    const normalizedRightGstin = normalizeInvoiceCopyValue(rightGstin);
    if (normalizedLeftGstin && normalizedRightGstin) return normalizedLeftGstin === normalizedRightGstin;
    return invoicePartyNameMatches(normalizeInvoiceCopyValue(leftName), normalizeInvoiceCopyValue(rightName));
  };
  const poBuyers = purchaseOrders.map((document) => ({
    name: getStringField(document, "buyerName"),
    gstin: getStringField(document, "buyerGstin"),
  }));
  const poVendors = purchaseOrders.map((document) => ({
    name: getStringField(document, "vendorName"),
    gstin: getStringField(document, "supplierGstin"),
  }));
  const matchesAny = (name: string, gstin: string, parties: Array<{ name: string; gstin: string }>) =>
    parties.some((party) => identitiesMatch(name, gstin, party.name, party.gstin));

  const primaryInvoices = invoices.filter((document) =>
    matchesAny(
      getStringField(document, "buyerName"),
      getStringField(document, "buyerGstin"),
      poBuyers
    )
  );
  if (!primaryInvoices.length) return null;

  const primarySuppliers = [
    ...poVendors,
    ...primaryInvoices.map((document) => ({
      name: getStringField(document, "vendorName"),
      gstin: getStringField(document, "supplierGstin"),
    })),
  ];
  const upstreamInvoices = invoices.filter((document) => {
    if (primaryInvoices.some((primary) => primary.id === document.id)) return false;
    const buyerName = getStringField(document, "buyerName");
    const buyerGstin = getStringField(document, "buyerGstin");
    return !matchesAny(buyerName, buyerGstin, poBuyers) && matchesAny(buyerName, buyerGstin, primarySuppliers);
  });
  if (!upstreamInvoices.length) return null;

  const upstreamReferences = new Set(
    upstreamInvoices
      .map((document) => normalizeInvoiceCopyValue(getStringField(document, "invoiceNumber")))
      .filter(Boolean)
  );
  const contextDocumentIds = documents
    .filter((document) => {
      if (upstreamInvoices.some((invoice) => invoice.id === document.id)) return true;
      const reference = normalizeInvoiceCopyValue(
        getStringField(document, "referenceInvoiceNumber") || getStringField(document, "invoiceNumber")
      );
      return Boolean(reference && upstreamReferences.has(reference));
    })
    .map((document) => document.id);

  return {
    primaryDocumentIds: primaryInvoices.map((document) => document.id),
    contextDocumentIds,
    note: "Seller chain identified from the purchase-order buyer and supplier relationships.",
  };
}

function invoiceDisplayText(document: CaseDetailDocument) {
  return [document.title, document.sourceHint, document.sourceFileName, document.markdown]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getInvoiceCopyPreferenceRank(document: CaseDetailDocument) {
  const text = invoiceDisplayText(document);
  if (/\b(?:original|main)\s+copy\b|\b(?:original|main)\b/.test(text)) return 0;
  if (/\b(?:duplicate|extra|copy)\b/.test(text)) return 2;
  return 1;
}

function getInvoiceDisplayCompletenessScore(document: CaseDetailDocument) {
  const fieldScore = Object.values(document.extractedFields).filter((value) => {
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  }).length;
  const lineScore = (document.lineItems?.length ?? 0) * 5;
  const textScore = Math.min(8, Math.floor((document.markdown?.trim().length ?? 0) / 500));
  return fieldScore + lineScore + textScore;
}

function shouldPreferInvoiceDisplayCopy(candidate: CaseDetailDocument, current: CaseDetailDocument) {
  const candidateRank = getInvoiceCopyPreferenceRank(candidate);
  const currentRank = getInvoiceCopyPreferenceRank(current);
  if (candidateRank !== currentRank) return candidateRank < currentRank;

  const candidateScore = getInvoiceDisplayCompletenessScore(candidate);
  const currentScore = getInvoiceDisplayCompletenessScore(current);
  return candidateScore > currentScore;
}

function getDisplayDocuments(documents: CaseDetailDocument[]) {
  const displayDocuments: CaseDetailDocument[] = [];

  for (const document of documents) {
    if (!isInvoiceDocument(document)) {
      displayDocuments.push(document);
      continue;
    }

    const existingIndex = displayDocuments.findIndex((candidate) =>
      areDuplicateInvoiceDisplayCopies(candidate, document)
    );
    if (existingIndex === -1) {
      displayDocuments.push(document);
      continue;
    }

    if (shouldPreferInvoiceDisplayCopy(document, displayDocuments[existingIndex])) {
      displayDocuments[existingIndex] = document;
    }
  }

  return hideAbsorbedBlankPages(displayDocuments);
}

function hasExtractedContent(document: CaseDetailDocument) {
  const hasFields = Object.values(document.extractedFields || {}).some(
    (value) => value !== null && value !== undefined && String(value).trim() !== ""
  );
  return hasFields || (document.lineItems?.length ?? 0) > 0;
}

// A blank back side is split out as an empty "Unknown" document, but the page before it
// already spans it (for example "pages 3-4"). Showing both gives one page two owners.
function hideAbsorbedBlankPages(documents: CaseDetailDocument[]) {
  return documents.filter((document) => {
    if (String(document.documentType || "").toLowerCase() !== "unknown") return true;
    if (hasExtractedContent(document)) return true;

    const key = getDocumentSourceKey(document);
    if (!key) return true;
    const range = getDocumentPageRange(document);

    return !documents.some((other) => {
      if (other === document || getDocumentSourceKey(other) !== key) return false;
      const otherRange = getDocumentPageRange(other);
      return (
        otherRange.end > otherRange.start &&
        range.start >= otherRange.start &&
        range.end <= otherRange.end
      );
    });
  });
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
function getDocumentIndexDetails(document: SavedCaseDetail["documents"][number]) {
  const type = document.documentType || "Document";
  const pageRange = getDocumentPageRange(document);
  const fileName =
    document.sourceFileName ||
    document.sourceHint?.replace(/^pages?\s+\d+\s*[-:]\s*/i, "").trim() ||
    document.title ||
    "Source file";

  return {
    type,
    fileName,
    pageLabel:
      pageRange.end > pageRange.start
        ? `pp. ${pageRange.start}–${pageRange.end}`
        : `p. ${pageRange.start}`,
  };
}

function parseDisplayNumber(value: unknown) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDisplayNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

function formatPercentDisplay(value: unknown) {
  const parsed = parseDisplayNumber(value);
  if (parsed === null) return "";
  return `${formatDisplayNumber(parsed)}%`;
}

function getLineItemValue(item: CommercialLineItem, key: keyof CommercialLineItem) {
  if (key === "rate") {
    return item.netRate || item.rate || "";
  }
  if (key === "taxAmount") {
    if (item.taxAmount) return item.taxAmount;
    if (item.igstAmount) return item.igstAmount;
    const cgstAmount = parseDisplayNumber(item.cgstAmount);
    const sgstAmount = parseDisplayNumber(item.sgstAmount);
    if (cgstAmount !== null && sgstAmount !== null) {
      return formatDisplayNumber(cgstAmount + sgstAmount);
    }
    return item.cgstAmount || item.sgstAmount || "";
  }
  if (key === "taxRate" || key === "cgstRate" || key === "sgstRate" || key === "igstRate") {
    return formatPercentDisplay(item[key]);
  }
  return item[key] ?? "";
}

function getVisibleLineItemColumns(lineItems: CommercialLineItem[]) {
  return LINE_ITEM_COLUMNS.filter(
    (column) =>
      column.key === "lineNumber" ||
      column.key === "description" ||
      lineItems.some((item) => String(getLineItemValue(item, column.key)).trim().length > 0)
  );
}

function getSourceFileLabel(mimeType?: string | null, sourceName?: string | null) {
  if (mimeType?.startsWith("image/")) return "Image";
  if (mimeType === "application/pdf") return "PDF";
  if (sourceName && /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(sourceName)) return "Image";
  if (sourceName && /\.pdf$/i.test(sourceName)) return "PDF";
  return "File";
}

function isImageSourceFile(mimeType?: string | null, sourceName?: string | null) {
  if (mimeType?.startsWith("image/")) return true;
  if (sourceName && /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(sourceName)) return true;
  return false;
}

// The pipeline labels each document split out of a PDF as "<file name> (pages 3-4)".
const PAGE_RANGE_SUFFIX = /\s*\(pages?\s+(\d+)(?:\s*[-–]\s*(\d+))?\)\s*$/i;

function getDocumentPageRange(document?: SavedCaseDetail["documents"][number] | null) {
  const pageCount = Math.max(1, document?.pageCount || 1);

  // Prefer the exact suffix so a file that merely has "page 2" in its name is not misread.
  for (const text of [document?.sourceHint, document?.sourceFileName, document?.title]) {
    const match = text?.match(PAGE_RANGE_SUFFIX);
    if (!match) continue;
    const start = Math.round(Number(match[1]));
    if (!Number.isFinite(start) || start < 1) continue;
    const end = Math.round(Number(match[2] ?? match[1]));
    return { start, end: Number.isFinite(end) && end >= start ? end : start, explicit: true };
  }

  const sourceText = [document?.sourceHint, document?.sourceFileName, document?.title]
    .filter(Boolean)
    .join(" ");
  const loose = sourceText.match(/\bpages?\s+(\d+)/i);
  const start = loose ? Math.round(Number(loose[1])) : 1;
  const safeStart = Number.isFinite(start) && start > 0 ? start : 1;
  return { start: safeStart, end: safeStart + pageCount - 1, explicit: false };
}

function getDocumentSourcePage(document?: SavedCaseDetail["documents"][number] | null) {
  return getDocumentPageRange(document).start;
}

// Documents split from the same uploaded file share this key.
function getDocumentSourceKey(document: SavedCaseDetail["documents"][number]) {
  return normalizeText(document.sourceFileName || document.sourceHint || "").replace(
    PAGE_RANGE_SUFFIX,
    ""
  );
}

function getCaseStatusLabel(status: string) {
  if (status === "draft") return "Draft";
  if (status === "accepted") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "completed") return "Pending decision";
  return "Pending";
}

function getCaseStatusClassName(status: string) {
  if (status === "draft") return "bg-slate-100 text-slate-700 border-slate-200";
  if (status === "accepted") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "processing") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function getFriendlyAnalysisStage(stage: string | null, status: "idle" | "processing" | "error") {
  if (status === "error") {
    return "Analysis failed";
  }

  const normalized = (stage ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Analyzing documents...";
  }
  if (normalized.includes("retry")) {
    return "Retrying analysis...";
  }
  if (normalized.includes("queue")) {
    return "Preparing analysis...";
  }
  if (/\b(file|pdf|document)\s+\d+\s+of\s+\d+\b/.test(normalized)) {
    return stage;
  }
  if (normalized.includes("split") || normalized.includes("organizing")) {
    return "Organizing PDF documents...";
  }
  if (normalized.includes("extract")) {
    return "Extracting fields...";
  }
  if (normalized.includes("compar")) {
    return "Comparing documents...";
  }
  if (normalized.includes("validat")) {
    return "Validating results...";
  }
  if (normalized.includes("final") || normalized.includes("complete")) {
    return "Finalizing results...";
  }
  return stage;
}

function CaseDetailSkeleton() {
  const useRedesignedSkeleton = true;
  if (useRedesignedSkeleton) {
    return (
      <div className={styles.redesignPage} aria-label="Loading case details" aria-busy="true">
        {/* compactHeader — mirrors CaseDetailRedesign compactHeader */}
        <header className={styles.compactHeader}>
          <div className={styles.compactHeaderLeft}>
            <Skeleton className="h-8 w-8 rounded-lg bg-[#eee7dd] shrink-0" />
            <div className={styles.compactInfo}>
              <div className={styles.compactTitleRow}>
                <Skeleton className="h-5 w-48 bg-[#eee7dd] rounded" />
                <Skeleton className="h-5 w-20 rounded-full bg-[#eee7dd]" />
              </div>
              <div className={styles.compactMetaRow}>
                <Skeleton className="h-3 w-28 bg-[#eee7dd]" />
                <span className="hidden sm:block h-3 w-px bg-[#e8e2db]" />
                <Skeleton className="h-3 w-32 bg-[#eee7dd]" />
                <Skeleton className="hidden sm:block h-3 w-24 bg-[#eee7dd]" />
              </div>
            </div>
          </div>
          <div className={styles.compactHeaderRight}>
            <nav className={styles.compactTabs} aria-hidden="true">
              <Skeleton className="h-4 w-16 bg-[#eee7dd] rounded" />
              <Skeleton className="h-4 w-20 bg-[#eee7dd] rounded" />
              <Skeleton className="h-4 w-14 bg-[#eee7dd] rounded" />
            </nav>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-lg bg-[#eee7dd]" />
              <Skeleton className="h-8 w-20 rounded-lg bg-[#eee7dd]" />
              <Skeleton className="h-8 w-20 rounded-lg bg-[#eee7dd]" />
            </div>
          </div>
        </header>

        {/* topDocumentStrip — 10-up grid, responsive scroll under 1280 */}
        <section className={styles.topDocumentStrip} aria-hidden="true">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className={`${styles.topDocCard} ${index === 0 ? styles.topDocCardActive : ""} opacity-60`}>
              <div className={styles.topDocCardHeader}>
                <Skeleton className="h-[18px] w-[18px] rounded-[4px] bg-[#eee7dd]" />
                <Skeleton className="h-1.5 w-1.5 rounded-full bg-[#eee7dd]" />
              </div>
              <Skeleton className="h-3 w-20 bg-[#eee7dd] rounded" />
              <Skeleton className="mt-1.5 h-2.5 w-16 bg-[#eee7dd] rounded" />
            </div>
          ))}
        </section>

        {/* splitWorkspace — left preview + right data, exact grid as real */}
        <section className={styles.splitWorkspace} aria-hidden="true">
          <div className={styles.splitPreviewPane}>
            <div className={styles.splitPreviewHeader}>
              <div className={styles.splitDocTitleBlock}>
                <Skeleton className="h-4 w-20 bg-[#eee7dd] rounded" />
                <Skeleton className="h-3 w-28 bg-[#eee7dd] rounded" />
                <Skeleton className="h-3 w-12 bg-[#eee7dd] rounded" />
              </div>
              <div className={styles.splitPreviewControls}>
                <Skeleton className="h-6 w-28 rounded-full bg-[#eee7dd]" />
                <Skeleton className="h-7 w-20 rounded-md bg-[#eee7dd]" />
                <Skeleton className="h-7 w-20 rounded-md bg-[#eee7dd]" />
              </div>
            </div>
            <div className={styles.splitPreviewStage}>
              <div className="w-[min(760px,68vw)] max-w-[68vw] rounded-[6px] border border-[#ded8d0] bg-white p-6 shadow-[0_10px_25px_-10px_rgba(43,26,16,0.2)]">
                <Skeleton className="h-5 w-2/3 bg-[#eee7dd]" />
                <Skeleton className="mt-2 h-3 w-1/2 bg-[#eee7dd]" />
                <Skeleton className="mt-6 h-px w-full bg-[#e8e2db]" />
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 w-full bg-[#eee7dd]" />
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Skeleton className="h-16 rounded-md bg-[#f3eee7]" />
                  <Skeleton className="h-16 rounded-md bg-[#f3eee7]" />
                </div>
              </div>
            </div>
          </div>
          <div className={styles.splitDataPane}>
            <div className={styles.splitDataHeader}>
              <Skeleton className="h-4 w-32 bg-[#eee7dd] rounded" />
              <Skeleton className="mt-1 h-3 w-20 bg-[#eee7dd] rounded" />
              <div className="mt-3 flex gap-4">
                <Skeleton className="h-3 w-16 bg-[#eee7dd] rounded" />
                <Skeleton className="h-3 w-20 bg-[#eee7dd] rounded" />
                <Skeleton className="h-3 w-16 bg-[#eee7dd] rounded" />
              </div>
            </div>
            <div className={styles.splitDataScroll}>
              {Array.from({ length: 3 }).map((_, sec) => (
                <div key={sec} className={styles.splitSection}>
                  <Skeleton className="mb-2 h-2.5 w-20 bg-[#eee7dd] rounded" />
                  <div className={styles.splitFieldList}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={styles.splitFieldItem}>
                        <Skeleton className="h-2.5 w-16 bg-[#eee7dd]" />
                        <Skeleton className="mt-1.5 h-3.5 w-24 bg-[#eee7dd]" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page} aria-label="Loading case details" aria-busy="true">
      <header className={styles.header}>
        <Skeleton className="h-7 w-7 shrink-0 rounded-md bg-slate-100" />
        <div className={styles.breadcrumb}>
          <Skeleton className="h-3.5 w-44 bg-slate-100" />
          <span className={styles.breadcrumbSeparator}>/</span>
          <Skeleton className="h-3.5 w-36 bg-slate-100" />
        </div>
        <div className={styles.headerSpacer} />
        <Skeleton className="hidden h-3.5 w-48 bg-slate-100 lg:block" />
        <Skeleton className="h-6 w-20 rounded-full bg-rose-50" />
      </header>

      <div className={`${styles.reviewBar} ${styles.reviewBarRed}`}>
        <span className={styles.severityDot} />
        <div className={styles.reviewCopy}>
          <Skeleton className="h-3.5 w-48 bg-slate-100" />
          <Skeleton className="mt-1.5 h-2.5 w-80 max-w-[52vw] bg-slate-100" />
        </div>
        <Skeleton className="h-3 w-12 bg-slate-100" />
        <Skeleton className="h-7 w-36 rounded-md bg-slate-200" />
      </div>

      <section className={styles.packetStrip} aria-label="Loading documents in packet">
        <div className={styles.packetStripLabel}>
          Documents in packet <span>· 5</span>
        </div>
        <div className={styles.packetCards}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className={`${styles.packetCard} ${styles.skeletonPacketCard} ${index === 0 ? styles.packetCardActive : ""}`}
            >
              <span className={styles.packetCardTopline}>
                <Skeleton className="h-4 w-12 rounded bg-slate-100" />
                <Skeleton className="ml-auto h-1.5 w-1.5 rounded-full bg-slate-200" />
              </span>
              <Skeleton className="mt-2 h-3.5 w-28 bg-slate-100" />
              <Skeleton className="mt-2 h-2.5 w-20 bg-slate-100" />
            </div>
          ))}
        </div>
      </section>

      <div className={styles.mobileControls} aria-hidden="true">
        <Skeleton className="h-8 flex-1 rounded-md bg-slate-100" />
        <Skeleton className="h-8 flex-1 rounded-md bg-slate-100" />
      </div>
      <div className={styles.mobileDocuments} aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 min-w-32 rounded-md bg-slate-100" />
        ))}
      </div>

      <div
        className={`${styles.workspace} ${styles.desktopWorkspace}`}
        style={{ "--data-pane-width": `${DEFAULT_DATA_PANE_WIDTH}px` } as CSSProperties}
      >
        <main className={styles.viewerPane}>
          <div className={styles.viewerToolbar}>
            <Skeleton className="h-3.5 w-24 bg-slate-100" />
            <Skeleton className="h-3 w-20 bg-slate-100" />
            <span className={styles.toolbarDivider} />
            <Skeleton className="h-5 w-20 bg-slate-100" />
            <div className={styles.zoomControls}>
              <Skeleton className="h-5 w-28 bg-slate-100" />
            </div>
          </div>
          <div className={styles.viewerCanvas}>
            <div className={styles.skeletonPreviewStage}>
              <div className={styles.skeletonPdfPage}>
                <div className={styles.skeletonPdfHeader}>
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-56 bg-slate-100" />
                    <Skeleton className="h-2.5 w-48 bg-slate-100" />
                    <Skeleton className="h-2.5 w-36 bg-slate-100" />
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <Skeleton className="h-5 w-40 bg-slate-100" />
                    <Skeleton className="h-2.5 w-32 bg-slate-100" />
                    <Skeleton className="h-2.5 w-24 bg-slate-100" />
                  </div>
                </div>
                <div className={styles.skeletonPdfRule} />
                <div className={styles.skeletonPdfPanel}>
                  <div className="space-y-2">
                    <Skeleton className="h-2.5 w-14 bg-slate-200" />
                    <Skeleton className="h-3.5 w-40 bg-slate-200" />
                    <Skeleton className="h-2.5 w-48 bg-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-2.5 w-14 bg-slate-200" />
                    <Skeleton className="h-3.5 w-40 bg-slate-200" />
                    <Skeleton className="h-2.5 w-44 bg-slate-200" />
                  </div>
                </div>
                <div className={styles.skeletonPdfTable}>
                  <div className={styles.skeletonPdfTableHead} />
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className={styles.skeletonPdfTableRow}>
                      <Skeleton className="h-2.5 w-36 bg-slate-100" />
                      <Skeleton className="h-2.5 w-16 bg-slate-100" />
                      <Skeleton className="h-2.5 w-10 bg-slate-100" />
                      <Skeleton className="h-2.5 w-20 bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        <div className={styles.paneResizeHandle} aria-hidden="true">
          <GripVertical />
        </div>

        <aside className={styles.dataPane} aria-label="Loading extracted document data">
          <div className={styles.dataTabs}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={`${styles.dataTab} ${index === 0 ? styles.dataTabActive : ""}`}>
                <Skeleton className={`h-3 bg-slate-100 ${index === 1 ? "w-16" : "w-12"}`} />
                <Skeleton className="h-2.5 w-3 bg-slate-100" />
              </div>
            ))}
          </div>
          <div className={styles.dataBody}>
            <div className={styles.dataHint}>
              <Skeleton className="h-3.5 w-3.5 rounded-full bg-slate-100" />
              <Skeleton className="h-2.5 w-56 max-w-[80%] bg-slate-100" />
            </div>
            <div className={styles.dataGroupLabel}>
              <Skeleton className="h-2.5 w-28 bg-slate-100" />
            </div>
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className={styles.fieldRow}>
                <Skeleton className={`h-2.5 bg-slate-100 ${index % 3 === 0 ? "w-24" : "w-32"}`} />
                <Skeleton className={`mt-2 h-3 bg-slate-100 ${index % 2 === 0 ? "w-44" : "w-52"}`} />
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className={`${styles.workspace} ${styles.legacyMobileWorkspace}`} aria-hidden="true">
        <main className={styles.viewerPane}>
          <div className={styles.viewerToolbar}>
            <Skeleton className="h-3.5 w-24 bg-slate-100" />
            <Skeleton className="h-3 w-20 bg-slate-100" />
            <div className={styles.zoomControls}>
              <Skeleton className="h-5 w-20 bg-slate-100" />
            </div>
          </div>
          <div className={styles.viewerCanvas}>
            <div className={styles.skeletonPreviewStage}>
              <div className={styles.skeletonPdfPage} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function RecycledCaseBanner({
  caseId,
  deletedAt,
  onRestored,
}: {
  caseId: string;
  deletedAt: string;
  onRestored: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const deletedLabel = new Date(deletedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      role="status"
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#f2c7c4] bg-[#fbf0ef] px-4 py-2.5 text-xs text-[#8c1d18] sm:px-6"
    >
      <p className="font-medium">
        This case is in the recycle bin (deleted {deletedLabel}). It is read-only and cannot be
        analyzed, reviewed or posted to Tally until you restore it.
        {restoreError ? <span className="ml-2 font-semibold">{restoreError}</span> : null}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={restoring}
        className="h-8 rounded-lg border-[#e3b5b1] bg-white text-xs font-semibold text-[#8c1d18] hover:bg-[#fbf0ef]"
        onClick={async () => {
          setRestoring(true);
          setRestoreError(null);
          try {
            await restoreCase(caseId);
            onRestored();
          } catch (failure) {
            setRestoreError(failure instanceof Error ? failure.message : "Could not restore this case.");
          } finally {
            setRestoring(false);
          }
        }}
      >
        {restoring ? "Restoring..." : "Restore case"}
      </Button>
    </div>
  );
}

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<SavedCaseDetail | null>(null);
  const markRestored = () =>
    setDetail((current) =>
      current ? { ...current, case: { ...current.case, deletedAt: null } } : current
    );
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "processing" | "error">("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState<string | null>(null);
  const [analysisLive, setAnalysisLive] = useState<{
    jobStatus: string | null;
    etaSeconds: number | null;
    queuePosition: number | null;
    detail: AnalysisProgressDetail | null;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOptionsOpen, setAnalysisOptionsOpen] = useState(false);
  const [pendingAnalysisMode, setPendingAnalysisMode] = useState<CaseAnalysisMode>("standard");
  const [draftFileStatus, setDraftFileStatus] = useState<"idle" | "saving" | "error">("idle");
  const [draftFileError, setDraftFileError] = useState<string | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "updating" | "error">("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<CaseDecision | null>(null);
  const [isTallyReviewOpen, setIsTallyReviewOpen] = useState(false);

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");
  const [activeDataView, setActiveDataView] = useState<DataViewMode>("fields");
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(DEFAULT_PREVIEW_ZOOM);
  const [, setPreviewFocus] = useState<PreviewFocus | null>(null);
  const [previewPdfPage, setPreviewPdfPage] = useState<number | null>(null);
  const [previewPdfPageCount, setPreviewPdfPageCount] = useState(1);
  const [pdfFitMode, setPdfFitMode] = useState<"width" | "page">("width");
  // Clockwise degrees the reviewer added to a sideways scan, kept per file page for this visit.
  const [pdfRotations, setPdfRotations] = useState<Record<string, number>>({});
  const lastPreviewDocumentIdRef = useRef<string | null>(null);
  const pagedToDocumentIdRef = useRef<string | null>(null);
  const [documentFieldComparison, setDocumentFieldComparison] =
    useState<DocumentFieldComparison>(null);
  const [signedFileUrls, setSignedFileUrls] = useState<Record<string, string | null>>({});
  const protectedPreviews = useRef(new Set<string>());
  useEffect(() => {
    const reset = () => {
      for (const url of protectedPreviews.current) releaseProtectedPreview(url);
      protectedPreviews.current.clear();
      setSignedFileUrls({});
    };
    window.addEventListener('kalika-access-invalidated', reset);
    reset();
    return () => {
      window.removeEventListener('kalika-access-invalidated', reset);
      for (const url of protectedPreviews.current) releaseProtectedPreview(url);
      protectedPreviews.current.clear();
    };
  }, [caseId]);
  const [loadingPreviewFileId, setLoadingPreviewFileId] = useState<string | null>(null);
  const [previewUrlError, setPreviewUrlError] = useState<string | null>(null);
  const draftFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    fetchCaseDetailPreferCache(caseId)
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
    setSignedFileUrls({});
    setLoadingPreviewFileId(null);
    setPreviewUrlError(null);
    setDocumentFieldComparison(null);
  }, [caseId]);

  useEffect(() => {
    if (!documentFieldComparison) return;

    const clearComparisonWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-document-comparison-trigger]")?.getAttribute("data-document-comparison-trigger") ===
          documentFieldComparison.key
      ) {
        return;
      }

      setDocumentFieldComparison(null);
    };

    document.addEventListener("pointerdown", clearComparisonWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", clearComparisonWhenClickingOutside);
  }, [documentFieldComparison]);

  const displayDocuments = useMemo(
    () => (detail ? getDisplayDocuments(detail.documents) : []),
    [detail]
  );

  useEffect(() => {
    if (!detail) return;
    setActiveDocumentId((current) => {
      if (current && displayDocuments.some((document) => document.id === current)) {
        return current;
      }
      return displayDocuments[0]?.id ?? detail.documents[0]?.id ?? null;
    });
  }, [detail, displayDocuments]);

  useEffect(() => {
    if (!detail || detail.case.status !== "processing") {
      return;
    }

    let active = true;
    let timeoutId: number | undefined;
    let pollCount = 0;
    let shownProgress = 0;

    const scheduleNext = () => {
      if (!active) return;
      // 3s at first, easing to 10s for long-running analyses.
      const delay = Math.min(10000, 3000 + Math.floor(pollCount / 10) * 1000);
      timeoutId = window.setTimeout(() => void pollStatus(), delay);
    };

    const pollStatus = async () => {
      // Do not poll from a background tab; resume when it becomes visible again.
      if (document.hidden) {
        scheduleNext();
        return;
      }
      pollCount += 1;

      try {
        const nextStatus = await fetchCaseAnalysisStatus(detail.case.id);
        if (!active) return;

        if (nextStatus.caseStatus !== "processing") {
          // Finished, failed, or released by the server (for example after the case
          // came back from the recycle bin): reload the case and stop polling.
          const refreshed = await fetchCaseDetail(detail.case.id);
          if (!active) return;
          setDetail(refreshed);
          if (nextStatus.caseStatus === "failed") {
            setAnalysisStatus("error");
            setAnalysisError(nextStatus.job?.error ?? "Case analysis failed.");
            setAnalysisStage(nextStatus.job?.stage ?? "Failed");
          } else {
            setAnalysisStatus("idle");
            setAnalysisProgress(nextStatus.caseStatus === "draft" ? 0 : 100);
            setAnalysisStage(null);
            setAnalysisError(null);
          }
          return;
        }

        setAnalysisStatus("processing");
        // Parallel steps and retries can report a lower number than before; never step back.
        shownProgress = Math.max(shownProgress, nextStatus.job?.progress ?? 0);
        setAnalysisProgress(shownProgress);
        setAnalysisStage(nextStatus.job?.stage ?? null);
        setAnalysisLive({
          jobStatus: nextStatus.job?.status ?? null,
          etaSeconds: nextStatus.job?.etaSeconds ?? null,
          queuePosition: nextStatus.job?.queuePosition ?? null,
          detail: nextStatus.job?.progressDetail ?? null,
        });
        setAnalysisError(nextStatus.job?.status === "failed" ? nextStatus.job.error ?? null : null);
        scheduleNext();
      } catch (statusError) {
        if (!active) return;
        setAnalysisStatus("error");
        setAnalysisError(
          statusError instanceof Error ? statusError.message : "Failed to load analysis progress."
        );
        scheduleNext();
      }
    };

    void pollStatus();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [detail, detail?.case.id, detail?.case.status]);

  const fileLookup = useMemo(() => {
    const map = new Map<string, SavedCaseDetail["files"][number]>();
    detail?.files.forEach((file) => {
      map.set(normalizeText(file.originalName), file);
    });
    return map;
  }, [detail]);

  const uploadGroups = useMemo(
    () =>
      readUploadGroupMeta(
        detail?.case.processingMeta && typeof detail.case.processingMeta === "object"
          ? (detail.case.processingMeta as Record<string, unknown>).uploadGroups
          : undefined
      ),
    [detail]
  );

  const activeDocument = useMemo(() => {
    if (!detail || !activeDocumentId) return null;
    return (
      detail.documents.find((document) => document.id === activeDocumentId) ??
      displayDocuments[0] ??
      null
    );
  }, [detail, activeDocumentId, displayDocuments]);

  const visibleMismatches = useMemo(
    () =>
      detail?.mismatches.filter(
        (mismatch) =>
          mismatch.fieldName === TERMS_COMPLIANCE_FIELD ||
          isLineItemMismatchField(mismatch.fieldName) ||
          (shouldConsiderFieldKey(mismatch.fieldName) && isPrimaryComparisonField(mismatch.fieldName))
      ) ?? [],
    [detail]
  );
  const pendingMismatchCount = visibleMismatches.filter(
    (mismatch) => mismatch.resolutionStatus === "pending"
  ).length;
  const rejectedMismatchCount = visibleMismatches.filter(
    (mismatch) => mismatch.resolutionStatus === "rejected"
  ).length;
  const mismatchReviewHref = `/cases/${caseId}/mismatches`;

  useEffect(() => {
    if (status !== "ready" || visibleMismatches.length === 0) return;
    router.prefetch(mismatchReviewHref);
  }, [mismatchReviewHref, router, status, visibleMismatches.length]);

  const reviewSummary = useMemo(() => {
    if (!detail) {
      return null;
    }

    const documentLabel = `${detail.documents.length} document${detail.documents.length === 1 ? "" : "s"}`;
    const documentLabels = getPacketDocumentLabels(detail.documents);
    const missingDocumentLabels = getMissingPacketDocumentLabels(detail.documents);
    const docsFact =
      documentLabels.length > 0
        ? `${detail.documents.length} ${detail.documents.length === 1 ? "document" : "documents"}`
        : "No extracted docs";
    const facts = [
      { label: "Docs", value: docsFact },
      { label: "Receiver", value: detail.case.receiverName || "-" },
    ];

    if (detail.case.status === "processing") {
      return {
        tone: "amber" as const,
        title: "Processing",
        description: `Checking ${documentLabel}.`,
        actionHint: "Wait for extraction and reconciliation to finish.",
        buttonLabel: null,
        action: null,
        badgeLabel: "Running",
        showConfidence: false,
        showBadge: true,
        facts,
      };
    }

    if (detail.case.status === "failed") {
      return {
        tone: "rose" as const,
        title: "Failed",
        description: "Could not complete analysis.",
        actionHint: "Retry analysis after checking the uploaded files.",
        buttonLabel: "Retry Analysis",
        action: "retry" as const,
        badgeLabel: "Failed",
        showConfidence: false,
        showBadge: true,
        facts,
      };
    }

    if (detail.case.status === "accepted") {
      return {
        tone: "emerald" as const,
        title: "Approved",
        description:
          visibleMismatches.length === 0
            ? `${documentLabel} verified. No pending action.`
            : `${visibleMismatches.length} reviewed issue${visibleMismatches.length === 1 ? "" : "s"} accepted.`,
        actionHint: "This case is cleared.",
        buttonLabel:
          visibleMismatches.length > 0
            ? `View ${visibleMismatches.length} Reviewed Issue${visibleMismatches.length === 1 ? "" : "s"}`
            : null,
        action: visibleMismatches.length > 0 ? "review" as const : null,
        badgeLabel: "Accepted",
        showConfidence: false,
        showBadge: false,
        facts,
      };
    }

    if (detail.case.status === "rejected") {
      return {
        tone: "rose" as const,
        title: "Blocked",
        description:
          rejectedMismatchCount > 0
            ? `${rejectedMismatchCount} rejected issue${rejectedMismatchCount === 1 ? "" : "s"} blocked this case.`
            : `Rejected after review across ${documentLabel}.`,
        actionHint: "Open the review trail before taking further action.",
        buttonLabel:
          visibleMismatches.length > 0
            ? `View ${visibleMismatches.length} Reviewed Issue${visibleMismatches.length === 1 ? "" : "s"}`
            : null,
        action: visibleMismatches.length > 0 ? "review" as const : null,
        badgeLabel: "Rejected",
        showConfidence: false,
        showBadge: false,
        facts,
      };
    }

    if (missingDocumentLabels.length > 0 && visibleMismatches.length === 0) {
      return {
        tone: "amber" as const,
        title: "Missing Documents",
        description: `Missing ${missingDocumentLabels.join(", ")} from this packet.`,
        actionHint: "Upload the missing document before approving.",
        buttonLabel: null,
        action: null,
        badgeLabel: "Incomplete",
        showConfidence: false,
        showBadge: true,
        facts: [{ label: "Missing", value: missingDocumentLabels.join(", ") }, ...facts],
      };
    }

    if (visibleMismatches.length === 0) {
      return {
        tone: "emerald" as const,
        title: "Ready to Approve",
        description: `${documentLabel} matched. No issues found.`,
        actionHint: "Approve this case and move on.",
        buttonLabel: "Approve Case",
        action: "approve" as const,
        badgeLabel: "Clear",
        showConfidence: false,
        showBadge: false,
        facts,
      };
    }

    if (pendingMismatchCount < visibleMismatches.length) {
      return {
        tone: "amber" as const,
        title: "Review In Progress",
        description: `${pendingMismatchCount} of ${visibleMismatches.length} issue${visibleMismatches.length === 1 ? "" : "s"} still need review.`,
        actionHint: "Finish the remaining decisions.",
        buttonLabel: `Review ${pendingMismatchCount} Pending Issue${pendingMismatchCount === 1 ? "" : "s"}`,
        action: "review" as const,
        badgeLabel: "Pending",
        showConfidence: false,
        showBadge: true,
        facts,
      };
    }

    return {
      tone: "rose" as const,
      title: "Needs Review",
      description: `${visibleMismatches.length} issue${visibleMismatches.length === 1 ? "" : "s"} found across ${documentLabel}.`,
      actionHint: "Review the mismatches before accepting.",
      buttonLabel: `Review ${visibleMismatches.length} Issue${visibleMismatches.length === 1 ? "" : "s"}`,
      action: "review" as const,
      badgeLabel: "Needs review",
      showConfidence: false,
      showBadge: false,
      facts,
    };
  }, [detail, pendingMismatchCount, rejectedMismatchCount, visibleMismatches.length]);

  const activeDocumentEntries = useMemo(() => {
    if (!activeDocument) return [];
    return getOrderedDocumentEntries(activeDocument.documentType, activeDocument.extractedFields);
  }, [activeDocument]);
  const activeTermsIssues = useMemo(() => {
    if (!detail) return [];
    return detail.mismatches.filter((mismatch) =>
      termsIssueMatchesDocument(mismatch, activeDocument)
    );
  }, [activeDocument, detail]);
  const caseTermsChecklist = useMemo(
    () => readTermsComplianceChecklist(detail?.case.processingMeta),
    [detail?.case.processingMeta]
  );
  const activeTermsChecklistRows = useMemo(() => {
    if (!activeDocument || !PURCHASE_ORDER_DOCUMENT_TYPES.has(activeDocument.documentType)) {
      return [];
    }

    const documentIds = new Set(
      [activeDocument.id, activeDocument.clientDocumentId, activeDocument.sourceHint, activeDocument.title]
        .filter((value): value is string => Boolean(value))
    );
    const assessedRows = caseTermsChecklist.filter((item) => documentIds.has(item.sourceDocId));
    if (assessedRows.length > 0) {
      return assessedRows.map((item, index) => ({
        key: `assessed-${item.sourceDocId}-${index}`,
        label: item.category || "Terms",
        value: item.sourceClause,
        detail: item.obligation,
        evidence: item.evidence || item.reason,
        issue: activeTermsIssues.find((mismatch) => getTermsIssueText(mismatch).includes(item.obligation)),
        status: getChecklistStatus(item.status),
      }));
    }

    return TERMS_CHECKLIST_DEFINITIONS.flatMap((definition) => {
      const value = getTermValue(activeDocument.extractedFields[definition.key]);
      if (!value) return [];

      const issue = activeTermsIssues.find((mismatch) =>
        termsIssueMatchesDefinition(mismatch, definition, value)
      );

      return [
        {
          key: definition.key,
          label: definition.label,
          value,
          detail: "",
          evidence: "",
          issue,
          status: issue ? getTermsIssueStatus(issue) : getClearTermsStatus(),
        },
      ];
    });
  }, [activeDocument, activeTermsIssues, caseTermsChecklist]);
  const unmatchedTermsIssues = useMemo(
    () =>
      activeTermsIssues.filter(
        (issue) => !activeTermsChecklistRows.some((row) => row.issue?.id === issue.id)
      ),
    [activeTermsChecklistRows, activeTermsIssues]
  );
  const activeDocumentFieldEntries = useMemo(() => {
    if (activeTermsChecklistRows.length === 0) {
      return activeDocumentEntries;
    }

    return activeDocumentEntries.filter(([key]) => !TERMS_FIELD_KEY_SET.has(key));
  }, [activeDocumentEntries, activeTermsChecklistRows.length]);
  const activeDocumentLineItems = useMemo(
    () => activeDocument?.lineItems ?? [],
    [activeDocument]
  );
  const activeDocumentLineItemColumns = useMemo(
    () => getVisibleLineItemColumns(activeDocumentLineItems),
    [activeDocumentLineItems]
  );

  useEffect(() => {
    setActiveDataView("fields");
  }, [activeDocumentId]);

  const activeDocumentFiles = useMemo(() => {
    if (!detail || !activeDocument) return [];

    const candidates = [activeDocument.sourceFileName, activeDocument.sourceHint]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeText(value));

    const matchedUploadGroup = uploadGroups.find((group) => {
      const normalizedGroupName = normalizeText(group.name);
      const normalizedPrimaryFileName = normalizeText(group.primaryFileName || "");
      const normalizedFileNames = group.fileNames.map((fileName) => normalizeText(fileName));

      return candidates.some(
        (candidate) =>
          candidate === normalizedGroupName ||
          candidate === normalizedPrimaryFileName ||
          normalizedFileNames.includes(candidate)
      );
    });

    if (matchedUploadGroup) {
      const groupFiles = matchedUploadGroup.fileNames
        .map((fileName) => fileLookup.get(normalizeText(fileName)))
        .filter((file): file is SavedCaseDetail["files"][number] => Boolean(file));

      if (groupFiles.length) {
        return groupFiles;
      }
    }

    for (const candidate of candidates) {
      const exactMatch = fileLookup.get(candidate);
      if (exactMatch) return [exactMatch];
    }

    const partialMatch = detail.files.find((file) =>
      candidates.some((candidate) => normalizeText(file.originalName).includes(candidate))
    );

    if (partialMatch) return [partialMatch];
    return detail.files.length === 1 ? [detail.files[0]] : [];
  }, [activeDocument, detail, fileLookup, uploadGroups]);

  const activePreviewFile =
    activeDocumentFiles[previewPageIndex] ?? activeDocumentFiles[0] ?? null;
  const activeFileUrl = activePreviewFile
    ? signedFileUrls[activePreviewFile.id] ?? activePreviewFile.signedUrl ?? null
    : null;
  const isPreviewUrlLoading =
    Boolean(activePreviewFile) && loadingPreviewFileId === activePreviewFile?.id;
  const previewPageCount = activeDocumentFiles.length || activeDocument?.pageCount || 1;
  const activeSourceLabel = getSourceFileLabel(
    activePreviewFile?.mimeType,
    activePreviewFile?.originalName || activeDocument?.sourceFileName
  );
  const activeSourceIsImage = isImageSourceFile(
    activePreviewFile?.mimeType,
    activePreviewFile?.originalName || activeDocument?.sourceFileName || activeDocument?.sourceHint
  );
  const activeDocumentSourcePage = getDocumentSourcePage(activeDocument);
  const activeDocumentRange = getDocumentPageRange(activeDocument);
  // Every document split from the same uploaded file, in page order.
  const sourceSiblingDocuments = useMemo(() => {
    if (!activeDocument) return [];
    const activeKey = getDocumentSourceKey(activeDocument);
    if (!activeKey) return [activeDocument];
    return displayDocuments
      .filter((document) => getDocumentSourceKey(document) === activeKey)
      .sort((left, right) => getDocumentSourcePage(left) - getDocumentSourcePage(right));
  }, [activeDocument, displayDocuments]);
  const inferredPdfPageCount = useMemo(() => {
    const documents = sourceSiblingDocuments.length
      ? sourceSiblingDocuments
      : activeDocument
        ? [activeDocument]
        : [];
    return documents.reduce(
      (highestPage, document) => Math.max(highestPage, getDocumentPageRange(document).end),
      1
    );
  }, [activeDocument, sourceSiblingDocuments]);
  const activePdfPage = Math.min(
    Math.max(1, previewPdfPage ?? activeDocumentSourcePage),
    Math.max(1, previewPdfPageCount, inferredPdfPageCount)
  );
  const canGoToPreviousPreviewPage = activeSourceIsImage
    ? previewPageIndex > 0
    : activePdfPage > 1;
  const canGoToNextPreviewPage =
    activeSourceIsImage
      ? activeDocumentFiles.length > 0 && previewPageIndex < activeDocumentFiles.length - 1
      : activePdfPage < previewPdfPageCount;
  const pdfRotationKey = `${activePreviewFile?.id ?? ""}:${activePdfPage}`;
  const activePdfRotation = pdfRotations[pdfRotationKey] ?? 0;
  const canZoomOut = Boolean(activeFileUrl) && previewZoom > 0.75;
  const canZoomIn = Boolean(activeFileUrl) && previewZoom < 3;

  useEffect(() => {
    // The viewer reports the real page count once the file loads; never drop below it here.
    setPreviewPdfPageCount((current) => Math.max(current, inferredPdfPageCount));

    // Only a change of document resets the viewer. A refetch that leaves the same
    // document active must not throw the reader back to its first page.
    if (lastPreviewDocumentIdRef.current === activeDocumentId) return;
    lastPreviewDocumentIdRef.current = activeDocumentId;

    // Paging across a document boundary changed the selection; keep that page.
    if (pagedToDocumentIdRef.current === activeDocumentId) {
      pagedToDocumentIdRef.current = null;
      return;
    }

    setPreviewPageIndex(0);
    setPreviewZoom(DEFAULT_PREVIEW_ZOOM);
    setPreviewFocus(null);
    setPreviewPdfPage(activeDocumentSourcePage);
  }, [activeDocumentId, activeDocumentSourcePage, inferredPdfPageCount]);

  useEffect(() => {
    setPreviewPageIndex((current) => Math.min(current, Math.max(activeDocumentFiles.length - 1, 0)));
  }, [activeDocumentFiles.length]);

  useEffect(() => {
    setPreviewZoom(DEFAULT_PREVIEW_ZOOM);
  }, [previewPageIndex]);

  useEffect(() => {
    if (!detail || !activePreviewFile) {
      return;
    }

    if (
      activePreviewFile.signedUrl ||
      Object.prototype.hasOwnProperty.call(signedFileUrls, activePreviewFile.id)
    ) {
      return;
    }

    let active = true;
    setLoadingPreviewFileId(activePreviewFile.id);
    setPreviewUrlError(null);

    fetchCaseFileSignedUrlPreferCache(detail.case.id, activePreviewFile.id)
      .then((payload) => {
        if (!active) { releaseProtectedPreview(payload.signedUrl); return; }
        if (payload.signedUrl.startsWith('blob:')) protectedPreviews.current.add(payload.signedUrl);
        setSignedFileUrls((current) => ({
          ...current,
          [payload.fileId]: payload.signedUrl,
        }));
      })
      .catch((loadError) => {
        if (!active) return;
        setPreviewUrlError(
          loadError instanceof Error ? loadError.message : "Failed to load source preview."
        );
        setSignedFileUrls((current) => ({
          ...current,
          [activePreviewFile.id]: null,
        }));
      })
      .finally(() => {
        if (!active) return;
        setLoadingPreviewFileId((current) =>
          current === activePreviewFile.id ? null : current
        );
      });

    return () => {
      active = false;
    };
  }, [activePreviewFile, detail, signedFileUrls]);

  const comparisonOptions = useMemo(
    () =>
      readComparisonOptions(
        detail?.case.processingMeta && typeof detail.case.processingMeta === "object"
          ? (detail.case.processingMeta as Record<string, unknown>).comparisonOptions
          : undefined
      ),
    [detail]
  );

  async function handleAnalyzeDraftCase(
    comparisonOptions: ComparisonOptions,
    analysisMode: CaseAnalysisMode = "standard"
  ) {
    if (!detail || detail.files.length === 0 || draftFileStatus === "saving") return;

    try {
      setAnalysisStatus("processing");
      setAnalysisError(null);
      setAnalysisProgress(0);
      setAnalysisStage(analysisMode === "smart_split" ? "Queued for multi-PDF document analysis" : "Queued for analysis");
      const started = await enqueueCaseAnalysis(detail.case.id, {
        analysisMode,
        comparisonOptions,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              case: {
                ...current.case,
                ...started.case,
              },
            }
          : current
      );
    } catch (analysisFailure) {
      setAnalysisError(
        analysisFailure instanceof Error ? analysisFailure.message : "Failed to analyze this case."
      );
      setAnalysisStatus("error");
    }
  }

  async function handleDraftFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!detail || selectedFiles.length === 0) {
      return;
    }

    try {
      setDraftFileStatus("saving");
      setDraftFileError(null);
      await appendCaseFiles(detail.case.id, buildDraftUploads(selectedFiles));
      const refreshed = await fetchCaseDetail(detail.case.id);
      setDetail(refreshed);
      setDraftFileStatus("idle");
    } catch (appendError) {
      setDraftFileStatus("error");
      setDraftFileError(
        appendError instanceof Error ? appendError.message : "Failed to add files to case."
      );
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
      setPendingDecision(null);
    } catch (decisionFailure) {
      setDecisionError(
        decisionFailure instanceof Error
          ? decisionFailure.message
          : `Failed to ${decision === "accepted" ? "accept" : "reject"} case.`
      );
      setDecisionStatus("error");
    }
  }

  // Move the PDF to a page and keep the selected document in step with it.
  function goToPdfPage(page: number) {
    const target = Math.min(
      Math.max(1, previewPdfPageCount, inferredPdfPageCount),
      Math.max(1, Math.round(page))
    );
    setPreviewFocus(null);
    setPreviewPdfPage(target);

    // Keep the current document while the page is still inside its own range.
    if (target >= activeDocumentRange.start && target <= activeDocumentRange.end) return;

    const owner = sourceSiblingDocuments.find((document) => {
      const range = getDocumentPageRange(document);
      return target >= range.start && target <= range.end;
    });
    if (owner && owner.id !== activeDocumentId) {
      pagedToDocumentIdRef.current = owner.id;
      setActiveDocumentId(owner.id);
    }
  }

  function handleDocumentSelection(documentId: string) {
    const selectedDocument = displayDocuments.find((document) => document.id === documentId);
    setActiveDocumentId(documentId);
    setPreviewPdfPage(getDocumentSourcePage(selectedDocument));
    setActiveTab("preview");
  }

  const isFinalDecision = detail?.case.status === "accepted" || detail?.case.status === "rejected";

  if (status === "loading") {
    return (
      <AppShell defaultSidebarCollapsed>
        <CaseDetailSkeleton />
      </AppShell>
    );
  }

  if (status === "error") {
    return (
      <AppShell defaultSidebarCollapsed>
        <div className="flex flex-1 items-center justify-center bg-slate-50/50 p-6 min-h-[calc(100vh-4rem)] tracking-normal">
          <div className="w-full max-w-md flex flex-col items-center text-center bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 mb-4">
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-xl font-medium text-slate-900">Unable to load case</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{error}</p>
            <Button asChild variant="outline" className="mt-8 rounded-xl w-full">
              <Link href="/cases">Return to Cases</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // =========================================
  // DRAFT STATE (Awaiting Analysis)
  // =========================================
  if (
    status === "ready" &&
    detail &&
    (detail.case.status === "draft" ||
      detail.case.status === "processing" ||
      (detail.case.status === "failed" && detail.documents.length === 0))
  ) {
    const isAnalyzing = detail.case.status === "processing" || analysisStatus === "processing";
    const canRetry = detail.case.status === "failed";
    const stageLabel =
      analysisStatus === "processing" && analysisLive
        ? describeAnalysisStep({
            status: analysisLive.jobStatus,
            stage: analysisStage,
            detail: analysisLive.detail,
            queuePosition: analysisLive.queuePosition,
          })
        : getFriendlyAnalysisStage(analysisStage, analysisStatus);
    const etaLabel = analysisLive?.jobStatus === "running" ? formatEta(analysisLive.etaSeconds) : null;
    const readyCount = detail.files.length;
    const isRecycled = Boolean(detail.case.deletedAt);

    return (
      <AppShell defaultSidebarCollapsed>
        {detail.case.deletedAt ? (
          <RecycledCaseBanner caseId={caseId} deletedAt={detail.case.deletedAt} onRestored={markRestored} />
        ) : null}
        <div className="flex flex-1 flex-col bg-[#f7f7f5] animate-in fade-in duration-500 min-h-[calc(100vh-4rem)] tracking-normal">
          <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-4 w-full">
              <Link href="/cases" className="text-slate-400 hover:text-slate-800 transition-colors shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-base sm:text-lg font-medium text-slate-900 truncate pr-2">
                {detail.case.displayName}
              </h1>
              <Badge variant="outline" className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0 ${getCaseStatusClassName(detail.case.status)}`}>
                {getCaseStatusLabel(detail.case.status)}
              </Badge>
            </div>
          </header>

          <main className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0 -z-10">
              <div className="absolute left-[12%] top-[14%] h-72 w-72 rounded-full bg-[#e5ddd0]/40 blur-3xl" />
              <div className="absolute right-[12%] bottom-[14%] h-80 w-80 rounded-full bg-[#d4c9b8]/30 blur-3xl" />
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-8 px-6 py-12 text-center sm:py-16">
              <div className={`grid h-16 w-16 place-items-center rounded-[1.25rem] shadow-sm border ${canRetry ? "bg-red-50 text-red-700 border-red-200" : "bg-[#eaf0ff] text-[#4f46e5] border-[#d9dcff]"}`}>
                {canRetry ? <TriangleAlert className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
              </div>

              <div className="max-w-2xl space-y-4">
                <div className="text-xs font-medium uppercase tracking-[0.3em] text-[#8a7f72]">
                  {canRetry ? "Analysis failed" : "Case created"}
                </div>
                <h2 className="text-4xl font-medium tracking-tight text-[#1a1a1a] sm:text-5xl">
                  {canRetry ? "Analysis failed" : "Ready to analyze"}
                </h2>
                <p className="mx-auto text-base font-medium leading-relaxed text-[#5a5046]">
                  {canRetry
                    ? "The previous analysis run failed. Review the error below, then retry this case analysis."
                    : `This case has ${readyCount} document${readyCount === 1 ? "" : "s"} ready. Add any missing documents, then analyze to extract fields and check mismatches.`}
                </p>

                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-[#e5ddd0] bg-white px-4 py-2 text-sm font-medium text-[#5a5046] shadow-sm">
                  <Folder className="h-4 w-4 text-[#8a7f72]" />
                  {detail.case.displayName}
                </div>

                {draftFileStatus === "saving" && (
                  <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-[#c9ead2] bg-[#eaf7ee] px-4 py-2 text-sm font-medium text-[#15803d] shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding documents to case...
                  </div>
                )}

                {isAnalyzing && (
                  <div className="mx-auto mt-4 w-full max-w-md space-y-3 text-left">
                    <div className="flex items-center justify-between text-sm font-medium text-[#5a5046]">
                      <span>{stageLabel}</span>
                      <span>{analysisProgress}%</span>
                    </div>
                    {etaLabel ? <div className="text-xs font-normal text-[#8a7f72]">{etaLabel}</div> : null}
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#ece8e0]">
                      <div
                        className="h-full rounded-full bg-[#1a1a1a] transition-all duration-300 ease-out"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {((analysisStatus === "error" && analysisError) || draftFileError) && (
                  <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">
                    {draftFileError || analysisError}
                  </div>
                )}
              </div>

              <div className="w-full max-w-3xl rounded-[2rem] border border-[#e5ddd0] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-left text-base font-medium text-[#1a1a1a]">Documents in this case</h3>
                  <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#8a7f72]">
                    {readyCount} document{readyCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {detail.files.map((file, index) => (
                    <div
                      key={file.id}
                      className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e5ddd0] bg-[#faf8f4] text-[#8a7f72] shadow-sm"
                      title={file.originalName}
                    >
                      <FileText className="h-6 w-6" />
                      <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a7f72]">
                Mode: {getComparisonModeLabel(comparisonOptions)}
              </div>

              {!isAnalyzing && (
                <div className="mt-2 flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
                  <input
                    ref={draftFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={handleDraftFileInputChange}
                  />

                  <Button
                    variant="outline"
                    disabled={draftFileStatus === "saving" || isRecycled}
                    className="rounded-2xl px-6 py-6 text-base font-medium border-[#e5ddd0] text-[#5a5046] bg-white hover:bg-[#faf8f4] hover:text-[#1a1a1a] shadow-sm transition-transform hover:scale-[1.02]"
                    onClick={() => draftFileInputRef.current?.click()}
                  >
                    <Plus className="mr-2 h-5 w-5 text-[#8a7f72]" />
                    Add documents
                  </Button>

                  <Button
                    type="button"
                    disabled={detail.files.length === 0 || draftFileStatus === "saving" || isRecycled}
                    className="flex-1 rounded-2xl bg-[#1a1a1a] px-8 py-6 text-base font-medium text-white shadow-lg shadow-[#1a1a1a]/15 hover:bg-[#2d2d2d] transition-transform hover:scale-[1.02]"
                    onClick={() => {
                      setPendingAnalysisMode("standard");
                      setAnalysisOptionsOpen(true);
                    }}
                  >
                    <Play className="mr-2 h-5 w-5 fill-white" />
                    {canRetry ? "Retry analysis" : "Analyze case"}
                  </Button>

                  <Button
                    type="button"
                    disabled={detail.files.length === 0 || draftFileStatus === "saving" || isRecycled}
                    variant="outline"
                    className="rounded-2xl border-emerald-200 bg-emerald-50 px-6 py-6 text-base font-medium text-emerald-800 shadow-sm transition-transform hover:scale-[1.02] hover:bg-emerald-100 hover:text-emerald-900"
                    onClick={() => {
                      setPendingAnalysisMode("smart_split");
                      setAnalysisOptionsOpen(true);
                    }}
                  >
                    <Sparkles className="mr-2 h-5 w-5" />
                    Analyze multi-doc PDFs
                  </Button>
                </div>
              )}
            </div>
          </main>

          <AnalysisOptionsDialog
            open={analysisOptionsOpen}
            onOpenChange={setAnalysisOptionsOpen}
            onSelect={(nextOptions) => {
              setAnalysisOptionsOpen(false);
              void handleAnalyzeDraftCase(nextOptions, pendingAnalysisMode);
            }}
          />
        </div>
      </AppShell>
    );
  }

  // =========================================
  // ANALYZED STATE (Split Screen View)
  // =========================================
  // Only an analysed, not-yet-decided case can be decided, and never while it sits in the bin.
  const showActions = Boolean(
    detail && detail.case.status === "completed" && !detail.case.deletedAt && !isFinalDecision
  );
  const sellerChainRoleMeta =
    readSellerChainRoleSelectionMeta(detail?.case.processingMeta) ??
    (detail ? inferSellerChainRoleSelection(displayDocuments) : null);
  const headerInvoiceAmount = formatMoney(
    displayDocuments
      .map((document) => getInvoiceAmount(document))
      .find((value): value is number => value !== null)
  );
  const currentDocumentIndex = activeDocument ? getDocumentIndexDetails(activeDocument) : null;
  const redesignedDetail = detail;
  if (Boolean(redesignedDetail)) {
    const detail = redesignedDetail as SavedCaseDetail;
    const redesignedDocuments: RedesignedDocumentCard[] = displayDocuments.map((document) => {
      const index = getDocumentIndexDetails(document);
      const identifiers = [document.id, document.clientDocumentId, document.sourceHint, document.title]
        .filter((value): value is string => Boolean(value));
      const extractedFieldCount = Object.values(document.extractedFields || {}).filter(
        (val) => val !== null && val !== undefined && String(val).trim() !== ""
      ).length;
      const comparisonValue = documentFieldComparison
        ? getComparableFieldValue(
            { type: document.documentType as DocType, fields: document.extractedFields },
            documentFieldComparison.key as FieldKey
          )
        : undefined;
      const normalizedComparisonValue = String(comparisonValue ?? "").trim().toLowerCase();
      const hasComparisonValue = Boolean(
        normalizedComparisonValue &&
        !["-", "not detected", "n/a", "na", "null", "undefined"].includes(normalizedComparisonValue)
      );
      const participatesInComparisonMismatch = documentFieldComparison
        ? visibleMismatches.some(
            (mismatch) =>
              mismatch.fieldName === documentFieldComparison.key &&
              mismatch.values.some((entry) => Boolean(entry.docId && identifiers.includes(entry.docId)))
          )
        : false;
      return {
        id: document.id,
        type: index.type,
        fileName: index.fileName,
        pageLabel: index.pageLabel,
        pageCount: Math.max(1, document.pageCount || 1),
        fieldCount: extractedFieldCount,
        hasIssue: visibleMismatches.some((mismatch) =>
          mismatch.values.some((entry) => Boolean(entry.docId && identifiers.includes(entry.docId)))
        ),
        comparisonState: documentFieldComparison
          ? !hasComparisonValue
            ? "absent"
            : participatesInComparisonMismatch
              ? "mismatch"
              : "matched"
          : undefined,
        comparisonValue: documentFieldComparison
          ? hasComparisonValue
            ? displayValue(comparisonValue)
            : "—"
          : undefined,
        chainRole: sellerChainRoleMeta
          ? sellerChainRoleMeta.contextDocumentIds.includes(document.id)
            ? "supporting"
            : "approval"
          : undefined,
      };
    });
    const extractedDate = displayDocuments
      .map((document) =>
        ["invoiceDate", "poDate", "documentDate", "date"]
          .map((key) => document.extractedFields[key])
          .find((value) => typeof value === "string" && value.trim())
      )
      .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    const createdDate = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(detail.case.createdAt));
    const uploadedLabel = `Uploaded ${new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(detail.case.createdAt))}`;

    const previewNode = activeFileUrl ? (
      activeSourceIsImage ? (
        <div className={styles.redesignPreviewScroller}>
          <div
            className={styles.redesignPreviewImageScale}
            style={{ transform: `scale(${previewZoom})` }}
          >
            <Image
              src={activeFileUrl}
              alt={`Document preview page ${previewPageIndex + 1}`}
              width={1200}
              height={1600}
              unoptimized
              sizes="(min-width: 1100px) 64vw, 94vw"
              className={styles.redesignPreviewImage}
              draggable={false}
            />
          </div>
        </div>
      ) : (
        <div className={styles.redesignPdfPreview}>
          <PdfEvidencePreview
            url={activeFileUrl}
            pageNumber={activePdfPage}
            zoom={previewZoom}
            fitMode={pdfFitMode}
            rotation={activePdfRotation}
            searchPageStart={activeDocumentSourcePage}
            searchPageEnd={
              activeDocumentSourcePage + Math.max(1, activeDocument?.pageCount || 1) - 1
            }
            onHighlightPageChange={setPreviewPdfPage}
            onPageCountChange={setPreviewPdfPageCount}
          />
        </div>
      )
    ) : (
      <div className={styles.redesignPreviewEmpty}>
        {isPreviewUrlLoading ? <Loader2 className={styles.redesignSpinner} /> : <FileSearch />}
        <strong>{isPreviewUrlLoading ? "Loading source preview…" : "Preview unavailable"}</strong>
        <span>{previewUrlError || "The source file could not be opened for this document."}</span>
      </div>
    );

    const stampCheckKeys = [
      "hasAuthorizedSignature",
      "hasVendorStamp",
      "hasStoreStamp",
      "hasStoreSignature",
      "hasGateStamp",
    ];

    const extractedFieldItems: ExtractedFieldItem[] = (activeDocumentFieldEntries || []).map(
      ([key, value]) => {
        const currentValue = typeof value === "string" ? value : displayValue(value);
        const fieldLabel = getDocumentFieldLabel(activeDocument?.documentType, key);
        const hasMismatch = visibleMismatches.some((m) => m.fieldName === key);
        return {
          key,
          label: fieldLabel,
          value: currentValue || "Not detected",
          hasMismatch,
        };
      }
    );

    if (activeDocument?.extractedFields) {
      const existingKeySet = new Set(extractedFieldItems.map((f) => f.key));
      for (const stampKey of stampCheckKeys) {
        if (!existingKeySet.has(stampKey)) {
          const rawVal = activeDocument.extractedFields[stampKey];
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
            const isYes = rawVal === true || String(rawVal).toLowerCase() === "yes";
            extractedFieldItems.push({
              key: stampKey,
              label: getDocumentFieldLabel(activeDocument.documentType, stampKey),
              value: isYes ? "Yes" : "No",
              hasMismatch: visibleMismatches.some((m) => m.fieldName === stampKey),
            });
          }
        }
      }
    }

    const lineItemsDocumentTotal = formatMoney(activeDocument ? getInvoiceAmount(activeDocument) : null);
    const lineItemsContent = (
      <div className={styles.redesignDataContent}>
        {lineItemsDocumentTotal ? (
          <div className={styles.redesignLineSummary}>
            <span>Document total</span>
            <strong>{lineItemsDocumentTotal}</strong>
          </div>
        ) : null}
        {activeDocumentLineItems.length > 0 ? (
          <div className={styles.redesignLineTableWrap}>
            <table className={styles.redesignLineTable}>
              <thead><tr>{activeDocumentLineItemColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {activeDocumentLineItems.map((item, itemIndex) => {
                  return (
                    <tr
                      key={`${item.lineNumber ?? itemIndex}-${item.description ?? item.rawText ?? ""}`}
                    >
                      {activeDocumentLineItemColumns.map((column) => {
                        const cellValue = column.key === "lineNumber"
                          ? getLineItemValue(item, column.key) || String(itemIndex + 1)
                          : getLineItemValue(item, column.key);
                        return <td key={column.key}>{cellValue ? String(cellValue) : "—"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className={styles.redesignDataEmpty}>No line-item table was extracted for this document.</div>}
      </div>
    );

    const termsContent = (
      <div className={styles.redesignDataContent}>
        <div className={styles.redesignDataGroupLabel}>Purchase-order terms</div>
        <div className={styles.redesignTermsList}>
          {activeTermsChecklistRows.map((row) => (
            <article
              key={row.key}
            >
              <span><strong>{row.label}</strong><small>{row.value}</small></span>
              <em className={row.issue ? styles.redesignTermIssue : styles.redesignTermClear}>
                {row.issue ? "Needs review" : "Fulfilled"}
              </em>
            </article>
          ))}
          {unmatchedTermsIssues.map((issue) => (
            <article
              key={issue.id}
            >
              <span><strong>Review item</strong><small>{issue.analysis || issue.fixPlan || getTermsIssueText(issue)}</small></span>
              <em className={styles.redesignTermIssue}>Needs review</em>
            </article>
          ))}
          {activeTermsChecklistRows.length === 0 && unmatchedTermsIssues.length === 0 ? (
            <div className={styles.redesignDataEmpty}>No purchase-order terms were extracted for this document.</div>
          ) : null}
        </div>
      </div>
    );

    const dataNode = (
      <ExtractedFieldsPanel
        fields={extractedFieldItems}
        lineItemCount={activeDocumentLineItems.length}
        activeComparisonFieldKey={documentFieldComparison?.key || null}
        onCompareField={(field) =>
          setDocumentFieldComparison((current) =>
            current?.key === field.key ? null : field
          )
        }
        activeDataView={activeDataView}
        onDataViewChange={setActiveDataView}
        termsCount={activeTermsChecklistRows.length + unmatchedTermsIssues.length}
        hasFailureState={visibleMismatches.some((m) =>
          m.values.some(
            (entry) =>
              entry.docId &&
              [activeDocument?.id, activeDocument?.clientDocumentId].includes(entry.docId)
          )
        )}
        lineItemsContent={lineItemsContent}
        termsContent={termsContent}
      />
    );

    const complianceContent = (
      <div className={styles.redesignComplianceList}>
        {activeTermsChecklistRows.length > 0 ? activeTermsChecklistRows.map((row) => (
          <article key={row.key}>
            <div><strong>{row.label}</strong><span className={row.issue ? styles.redesignComplianceIssue : styles.redesignComplianceClear}>
              {row.issue ? <TriangleAlert /> : <CheckCircle2 />} {row.issue ? "Needs review" : "Fulfilled"}
            </span></div>
            <p>{row.value}</p>
            {row.evidence ? <small>{row.evidence}</small> : null}
          </article>
        )) : <div className={styles.redesignDataEmpty}>Select a purchase order to review its compliance clauses.</div>}
      </div>
    );

    const analyzedAtRaw =
      detail.case.processingMeta && typeof detail.case.processingMeta === "object"
        ? (detail.case.processingMeta as Record<string, unknown>).analyzedAt
        : null;
    const analyzedAtDate =
      typeof analyzedAtRaw === "string" && !Number.isNaN(Date.parse(analyzedAtRaw))
        ? new Date(analyzedAtRaw)
        : null;
    const analyzedLabel = analyzedAtDate
      ? new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(analyzedAtDate)
      : createdDate;
    const activityContent = (
      <div className={styles.redesignActivityList}>
        <article><i /><time>{uploadedLabel}</time><p><strong>Case created</strong> with {detail.files.length} uploaded file{detail.files.length === 1 ? "" : "s"}.</p></article>
        <article><i /><time>{analyzedLabel}</time><p><strong>Packet analyzed</strong> into {displayDocuments.length} classified document{displayDocuments.length === 1 ? "" : "s"}.</p></article>
        <article><i /><time>Current</time><p><strong>Status: {getCaseStatusLabel(detail.case.status)}</strong>{visibleMismatches.length ? ` · ${visibleMismatches.length} mismatch${visibleMismatches.length === 1 ? "" : "es"} on record.` : " · no mismatches found."}</p></article>
      </div>
    );

    return (
      <AppShell defaultSidebarCollapsed>
        {detail.case.deletedAt ? (
          <RecycledCaseBanner caseId={caseId} deletedAt={detail.case.deletedAt} onRestored={markRestored} />
        ) : null}
        <CaseDetailRedesign
          caseId={caseId}
          caseSlug={detail.case.slug}
          caseName={detail.case.displayName}
          parentName={detail.case.receiverName || detail.case.buyerName || "Procurement packet"}
          poNumber={detail.case.poNumber}
          invoiceNumber={detail.case.invoiceNumber}
          dateLabel={extractedDate || createdDate}
          amountLabel={headerInvoiceAmount}
          uploadedLabel={uploadedLabel}
          statusLabel={getCaseStatusLabel(detail.case.status)}
          status={detail.case.status}
          showActions={Boolean(showActions)}
          decisionUpdating={decisionStatus === "updating"}
          decisionError={decisionStatus === "error" && !pendingDecision ? decisionError : null}
          onDecision={(decision) => {
            setDecisionError(null);
            setDecisionStatus("idle");
            setPendingDecision(decision);
          }}
          onRetryAnalysis={() => {
            setPendingAnalysisMode("standard");
            setAnalysisOptionsOpen(true);
          }}
          retryDisabled={analysisStatus === "processing" || Boolean(detail.case.deletedAt)}
          documents={redesignedDocuments}
          comparisonFieldLabel={documentFieldComparison?.label}
          activeDocumentId={activeDocumentId}
          onSelectDocument={handleDocumentSelection}
          mismatchCount={visibleMismatches.length}
          canReviewTally={displayDocuments.some(isInvoiceDocument)}
          pendingMismatchCount={pendingMismatchCount}
          reviewTitle={reviewSummary?.title || "Packet review"}
          reviewDescription={reviewSummary?.description || "Review the packet before deciding."}
          complianceCount={activeTermsChecklistRows.length + unmatchedTermsIssues.length}
          complianceContent={complianceContent}
          activityContent={activityContent}
          viewerMode={activeTab}
          onViewerModeChange={setActiveTab}
          sourceReference={currentDocumentIndex?.fileName || activeSourceLabel}
          previewNode={previewNode}
          dataNode={dataNode}
          canPreviousPage={canGoToPreviousPreviewPage}
          canNextPage={canGoToNextPreviewPage}
          showPageControls={activeSourceIsImage ? previewPageCount > 1 : previewPdfPageCount > 1}
          pageLabel={
            activeSourceIsImage
              ? `${Math.min(previewPageIndex + 1, previewPageCount)} / ${previewPageCount}`
              : sourceSiblingDocuments.length > 1
                ? `${Math.min(
                    Math.max(1, activePdfPage - activeDocumentRange.start + 1),
                    activeDocumentRange.end - activeDocumentRange.start + 1
                  )} / ${activeDocumentRange.end - activeDocumentRange.start + 1}`
                : `${activePdfPage} / ${previewPdfPageCount}`
          }
          onPreviousPage={() => {
            setPreviewFocus(null);
            if (activeSourceIsImage) setPreviewPageIndex((current) => Math.max(0, current - 1));
            else goToPdfPage(activePdfPage - 1);
          }}
          onNextPage={() => {
            setPreviewFocus(null);
            if (activeSourceIsImage) setPreviewPageIndex((current) => Math.min(Math.max(activeDocumentFiles.length - 1, 0), current + 1));
            else goToPdfPage(activePdfPage + 1);
          }}
          zoom={previewZoom}
          canZoomOut={canZoomOut}
          canZoomIn={canZoomIn}
          onZoomOut={() => setPreviewZoom((current) => Math.max(0.75, Number((current - 0.25).toFixed(2))))}
          onZoomIn={() => setPreviewZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
          onResetZoom={() => setPreviewZoom(DEFAULT_PREVIEW_ZOOM)}
          fitMode={activeSourceIsImage ? undefined : pdfFitMode}
          onToggleFit={
            activeSourceIsImage
              ? undefined
              : () => setPdfFitMode((current) => (current === "width" ? "page" : "width"))
          }
          onRotate={
            activeSourceIsImage
              ? undefined
              : (delta) =>
                  setPdfRotations((current) => ({
                    ...current,
                    [pdfRotationKey]: (((current[pdfRotationKey] ?? 0) + delta) % 360 + 360) % 360,
                  }))
          }
        />

        <AnalysisOptionsDialog
          open={analysisOptionsOpen}
          onOpenChange={setAnalysisOptionsOpen}
          onSelect={(nextOptions) => {
            setAnalysisOptionsOpen(false);
            void handleAnalyzeDraftCase(nextOptions, pendingAnalysisMode);
          }}
        />

        <CaseConfirmDialog
          open={pendingDecision !== null}
          onOpenChange={(open) => {
            if (!open && decisionStatus !== "updating") {
              setPendingDecision(null);
              setDecisionError(null);
              setDecisionStatus("idle");
            }
          }}
          variant={pendingDecision === "rejected" ? "danger" : "default"}
          title={pendingDecision === "rejected" ? "Reject this case?" : "Approve this case?"}
          description={
            pendingDecision === "rejected"
              ? pendingMismatchCount > 0
                ? `${pendingMismatchCount} unreviewed ${pendingMismatchCount === 1 ? "issue" : "issues"} will be marked rejected.`
                : "The case will be marked rejected."
              : pendingMismatchCount > 0
                ? `${pendingMismatchCount} unreviewed ${pendingMismatchCount === 1 ? "issue" : "issues"} will be accepted along with it. Issues you already reviewed keep their decision.`
                : "All issues are reviewed. The case will be marked approved."
          }
          confirmLabel={pendingDecision === "rejected" ? "Reject case" : "Approve case"}
          footnote="This is a final decision and cannot be changed afterwards."
          error={decisionStatus === "error" ? decisionError : null}
          loading={decisionStatus === "updating"}
          onConfirm={() => {
            if (pendingDecision) void handleCaseDecision(pendingDecision);
          }}
        />

        <Dialog open={isTallyReviewOpen} onOpenChange={setIsTallyReviewOpen}>
          <DialogContent className={styles.tallyReviewDialog}>
            <DialogHeader className={styles.tallyReviewDialogHeader}>
              <DialogTitle className={styles.tallyReviewDialogTitle}>Approved case · Tally review</DialogTitle>
              <DialogDescription className={styles.tallyReviewDialogDescription}>
                Review the prepared Purchase voucher and posting status without leaving the case workspace.
              </DialogDescription>
            </DialogHeader>
            <div className={styles.tallyReviewDialogBody}>
              {isTallyReviewOpen ? (
                <TallyInReviewPanel
                  caseId={caseId}
                  onViewOriginal={(documentId) => {
                    setActiveDocumentId(documentId);
                    setActiveTab("preview");
                    setIsTallyReviewOpen(false);
                  }}
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    );
  }

  // Unreachable once the case has loaded: every ready state returns above.
  return null;
}
