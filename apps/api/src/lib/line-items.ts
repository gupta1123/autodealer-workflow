import type { CaseDoc, CommercialLineItem, DocType, FieldKey } from "@/types/pipeline";

export const LINE_ITEMS_FIELD_KEY = "__lineItems";

const COMMERCIAL_DOC_TYPES = new Set<DocType>([
  "Purchase Order",
  "Amended Purchase Order",
  "Invoice",
  "Tax Invoice",
]);

const HSN_SAC_CODE_PATTERN = /\b\d{4,8}\b/;
const RAW_HSN_SAC_FALLBACK_PATTERN = /\b\d{8}\b/;
const COMMERCIAL_COLUMN_NOISE_PATTERN =
  /\b(?:hsn|sac|gst|cgst|sgst|igst|i\/cgst|qty|quantity|unit|rate|amount|total|taxable|disc|discount|net)\b/i;
const TRAILING_TABLE_VALUE_PATTERN =
  /\b\d{4,8}\b[\s\S]*$|\b(?:sgst|cgst|igst|i\/cgst|gst)\b[\s\S]*$/i;

const LINE_ITEM_KEYS: Array<keyof CommercialLineItem> = [
  "lineNumber",
  "itemCode",
  "description",
  "hsnSac",
  "quantity",
  "unit",
  "rate",
  "discountPercent",
  "netRate",
  "taxableAmount",
  "cgstRate",
  "cgstAmount",
  "sgstRate",
  "sgstAmount",
  "igstRate",
  "igstAmount",
  "taxRate",
  "taxAmount",
  "lineTotal",
  "referencePoLineNumber",
  "rawText",
  "sourcePage",
];

export function isCommercialDocType(docType: string): docType is DocType {
  return COMMERCIAL_DOC_TYPES.has(docType as DocType);
}

export function isLineItemMismatchField(fieldName: string) {
  return fieldName.startsWith("lineItems.");
}

function toLineItemText(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (/^(?:[-_.]+|n\/a|na|null|undefined)$/i.test(text)) return undefined;
  return text || undefined;
}

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingLineNumber(value: string, lineNumber?: string) {
  const line = lineNumber?.trim();
  if (line) {
    const escapedLine = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withoutKnownLine = value.replace(new RegExp(`^\\s*${escapedLine}\\s+`), "");
    if (withoutKnownLine !== value) return withoutKnownLine;
  }

  return value.replace(/^\s*\d{1,3}\s+/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractHsnSac(value?: string, rawText?: string) {
  const direct = value?.match(HSN_SAC_CODE_PATTERN)?.[0];
  if (direct) return direct;
  return rawText?.match(RAW_HSN_SAC_FALLBACK_PATTERN)?.[0];
}

function descriptionFromRawText(rawText?: string, lineNumber?: string, hsnSac?: string) {
  if (!rawText) return undefined;
  const rowText = stripLeadingLineNumber(cleanWhitespace(rawText), lineNumber);
  const hsnMatch = hsnSac
    ? rowText.match(new RegExp(`\\b${escapeRegExp(hsnSac)}\\b`))
    : rowText.match(RAW_HSN_SAC_FALLBACK_PATTERN);
  const candidate = hsnMatch ? rowText.slice(0, hsnMatch.index).trim() : rowText;
  return candidate || undefined;
}

function cleanLineItemDescription(item: CommercialLineItem) {
  const description = cleanWhitespace(item.description ?? "");
  const rawDescription = descriptionFromRawText(item.rawText, item.lineNumber, item.hsnSac);
  const candidate = description || rawDescription;

  if (!candidate) return undefined;

  const stripped = cleanWhitespace(
    stripLeadingLineNumber(candidate, item.lineNumber).replace(TRAILING_TABLE_VALUE_PATTERN, "")
  );
  const descriptionLooksPolluted =
    COMMERCIAL_COLUMN_NOISE_PATTERN.test(description) ||
    (description.match(HSN_SAC_CODE_PATTERN)?.length ?? 0) > 0;

  if (descriptionLooksPolluted && rawDescription) {
    return cleanWhitespace(rawDescription.replace(TRAILING_TABLE_VALUE_PATTERN, "")) || stripped || undefined;
  }

  return stripped || undefined;
}

function cleanLineItem(item: CommercialLineItem) {
  const next = { ...item };
  const hsnSac = extractHsnSac(next.hsnSac, next.rawText);
  if (hsnSac) {
    next.hsnSac = hsnSac;
  }

  const description = cleanLineItemDescription(next);
  if (description) {
    next.description = description;
  } else {
    delete next.description;
  }

  return next;
}

function isMeaningfulDescription(value?: string) {
  if (!value) return false;
  const text = cleanWhitespace(value);
  if (/^(?:[-_.]+|n\/a|na|null|undefined)$/i.test(text)) return false;
  if (HSN_SAC_CODE_PATTERN.test(text) && text.replace(/\d{4,8}/g, "").trim().length === 0) return false;
  return /[a-z]/i.test(text);
}

function isTaxSummaryOnlyLineItem(item: CommercialLineItem) {
  const hasTaxSummaryAmount = Boolean(
    item.taxableAmount ||
      item.taxAmount ||
      item.cgstAmount ||
      item.sgstAmount ||
      item.igstAmount ||
      item.lineTotal
  );
  const hasItemQuantityOrPrice = Boolean(item.quantity || item.unit || item.rate);
  return Boolean(item.hsnSac && hasTaxSummaryAmount && !hasItemQuantityOrPrice && !isMeaningfulDescription(item.description) && !item.itemCode);
}

function isHsnOnlyLineItem(item: CommercialLineItem) {
  const hasBusinessValue = Boolean(
    item.itemCode ||
      isMeaningfulDescription(item.description) ||
      item.quantity ||
      item.rate ||
      item.taxableAmount ||
      item.taxAmount ||
      item.cgstAmount ||
      item.sgstAmount ||
      item.igstAmount ||
      item.lineTotal
  );

  return Boolean(item.hsnSac && !hasBusinessValue);
}

export function sanitizeLineItems(value: unknown): CommercialLineItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const source = entry as Record<string, unknown>;
    const item: CommercialLineItem = {};

    for (const key of LINE_ITEM_KEYS) {
      const value = source[key];
      if (key === "sourcePage") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          item.sourcePage = parsed;
        }
        continue;
      }
      const text = toLineItemText(value);
      if (text) {
        item[key] = text as never;
      }
    }

    const cleanedItem = cleanLineItem(item);

    if (isTaxSummaryOnlyLineItem(cleanedItem) || isHsnOnlyLineItem(cleanedItem)) {
      return [];
    }

    const hasMeaningfulValue = [
      cleanedItem.itemCode,
      cleanedItem.description,
      cleanedItem.hsnSac,
      cleanedItem.quantity,
      cleanedItem.rate,
      cleanedItem.taxableAmount,
      cleanedItem.lineTotal,
      cleanedItem.rawText,
    ].some(Boolean);

    return hasMeaningfulValue ? [cleanedItem] : [];
  });
}

export function readStoredLineItems(extractedFields: unknown) {
  if (!extractedFields || typeof extractedFields !== "object" || Array.isArray(extractedFields)) {
    return [];
  }

  return sanitizeLineItems((extractedFields as Record<string, unknown>)[LINE_ITEMS_FIELD_KEY]);
}

export function serializeFieldsWithLineItems(document: Pick<CaseDoc, "fields" | "lineItems">) {
  const fields: Record<string, unknown> = { ...(document.fields ?? {}) };
  const lineItems = sanitizeLineItems(document.lineItems);

  if (lineItems.length > 0) {
    fields[LINE_ITEMS_FIELD_KEY] = lineItems;
  }

  return fields;
}

export function stripStoredLineItems(fields: Record<string, unknown>) {
  const rest = { ...fields };
  delete rest[LINE_ITEMS_FIELD_KEY];
  return rest as Partial<Record<FieldKey, string>>;
}
