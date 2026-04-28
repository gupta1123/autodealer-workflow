import type { CaseDoc, CommercialLineItem, DocType, FieldKey } from "@/types/pipeline";

export const LINE_ITEMS_FIELD_KEY = "__lineItems";

const COMMERCIAL_DOC_TYPES = new Set<DocType>([
  "Purchase Order",
  "Amended Purchase Order",
  "Invoice",
  "Tax Invoice",
]);

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
  return text || undefined;
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

    const hasMeaningfulValue = [
      item.itemCode,
      item.description,
      item.hsnSac,
      item.quantity,
      item.rate,
      item.taxableAmount,
      item.lineTotal,
      item.rawText,
    ].some(Boolean);

    return hasMeaningfulValue ? [item] : [];
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
