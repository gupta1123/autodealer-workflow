import { CORE_PACKET_GROUPS } from "@/lib/document-schema";
import type { CaseDoc, FieldKey, Mismatch } from "@/types/pipeline";

export type CaseSummary = {
  slug: string;
  displayName: string;
  buyerName: string;
  poNumber: string;
  invoiceNumber: string;
  paymentGap: number;
  riskScore: number;
  missingDocTypes: string[];
  documentTypes: string[];
};

function normalizeValue(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function firstFieldValue(documents: CaseDoc[], field: FieldKey) {
  for (const document of documents) {
    const value = normalizeValue(document.fields[field]);
    if (value) return value;
  }
  return "";
}

function currencyishToNumber(value?: string) {
  if (!value) return undefined;
  const number = Number(value.replace(/[₹,\s]/g, ""));
  return Number.isNaN(number) ? undefined : number;
}

function slugify(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || fallback;
}

export function summarizeCase(documents: CaseDoc[], mismatches: Mismatch[]): CaseSummary {
  const buyerName =
    firstFieldValue(documents, "buyerName") ||
    firstFieldValue(documents, "vendorName") ||
    "pending-buyer";
  const poNumber = firstFieldValue(documents, "poNumber") || firstFieldValue(documents, "referencePoNumber");
  const invoiceNumber =
    firstFieldValue(documents, "invoiceNumber") || firstFieldValue(documents, "referenceInvoiceNumber");
  const totalAmount = currencyishToNumber(firstFieldValue(documents, "totalAmount"));
  const paidAmount = currencyishToNumber(firstFieldValue(documents, "paidAmount"));
  const paymentGap = totalAmount && paidAmount ? Math.abs(totalAmount - paidAmount) : 0;

  const presentTypes = new Set(documents.map((document) => document.type));
  const missingDocTypes = CORE_PACKET_GROUPS
    .filter((group) => !group.types.some((type) => presentTypes.has(type)))
    .map((group) => group.label);

  const riskScore = Math.min(
    100,
    mismatches.length * 10 + missingDocTypes.length * 12 + (paymentGap > 0 ? 10 : 0)
  );

  const buyerSlug = slugify(
    buyerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join("-"),
    "pending-buyer"
  );
  const referenceSlug = slugify(poNumber || invoiceNumber || "pending-doc", "pending-doc");

  return {
    slug: `${buyerSlug}-${referenceSlug}`,
    displayName: `${buyerSlug}-${referenceSlug}`,
    buyerName,
    poNumber,
    invoiceNumber,
    paymentGap,
    riskScore,
    missingDocTypes,
    documentTypes: Array.from(presentTypes),
  };
}
