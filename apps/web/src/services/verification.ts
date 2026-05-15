import type { CaseDoc, CommercialLineItem, FieldKey, Mismatch, MismatchValue } from "@/types/pipeline";
import { getFieldKeysForDocType, shouldConsiderFieldKey } from "@/lib/document-schema";
import {
  areComparableValuesEqual,
  DEFAULT_COMPARISON_OPTIONS,
  getComparableFieldValue,
  PRIMARY_COMPARISON_FIELDS,
} from "@/lib/comparison";
import type { ComparisonOptions } from "@/types/pipeline";

const PRESENCE_CHECK_FIELDS = new Set<FieldKey>();
const PURCHASE_DOC_TYPES = new Set(["Purchase Order", "Amended Purchase Order"]);
const INVOICE_DOC_TYPES = new Set(["Invoice", "Tax Invoice"]);
const PARTY_NAME_FIELDS = new Set<FieldKey>(["vendorName", "buyerName", "transporterName", "ownerName", "driverName", "holderName"]);
const PURCHASE_ORDER_TOTAL_FIELDS = new Set<FieldKey>(["subtotal", "taxAmount", "totalAmount"]);

function shouldExpectField(doc: CaseDoc, field: FieldKey) {
  if (PURCHASE_DOC_TYPES.has(doc.type) && PURCHASE_ORDER_TOTAL_FIELDS.has(field)) {
    return false;
  }

  return (
    shouldConsiderFieldKey(field, doc.type) &&
    getFieldKeysForDocType(doc.type).includes(field)
  );
}

function shouldCompareItemQuantityValues(
  values: Array<{ doc: CaseDoc; value: string | number | null | undefined }>
) {
  const populated = values.filter((entry) => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== "");
  if (populated.length < 2) return false;

  const units = populated.map((entry) => normalizeUnit(entry.doc.fields.unit));
  if (units.some((unit) => !unit)) return false;

  const [firstUnit, ...restUnits] = units;
  return restUnits.every((unit) => areUnitsCompatible(firstUnit, unit));
}

function normalizePartyName(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const tokens = String(value)
    .toLowerCase()
    .replace(/\((i)\)/g, " india ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === "pvt") return "private";
      if (token === "ltd") return "limited";
      if (["kaliko", "xarixa", "xarika"].includes(token)) return "kalika";
      if (token === "sted" || token === "steei") return "steel";
      if (token === "steels") return "steel";
      if (token === "alloys") return "alloy";
      return token;
    })
    .filter(
      (token) =>
        !["private", "limited", "pvt", "ltd", "company", "co", "india", "ind", "i"].includes(token)
    );

  return tokens.join("");
}

function areFieldValuesEqual(
  field: FieldKey,
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  comparisonOptions: ComparisonOptions
) {
  if (areComparableValuesEqual(left, right, comparisonOptions, field)) {
    return true;
  }

  if (PARTY_NAME_FIELDS.has(field)) {
    const normalizedLeft = normalizePartyName(left);
    const normalizedRight = normalizePartyName(right);
    return Boolean(
      normalizedLeft &&
      normalizedRight &&
      normalizedLeft.length >= 8 &&
      normalizedRight.length >= 8 &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.includes(normalizedRight) ||
        normalizedRight.includes(normalizedLeft))
    );
  }

  return false;
}

function buildMismatch(
  field: FieldKey,
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): Omit<Mismatch, "analysis" | "fixPlan"> | null {
  const comparableEntries = docs
    .filter((doc) => shouldExpectField(doc, field))
    .map((doc) => ({
      doc,
      docId: doc.id,
      value: getComparableFieldValue(doc, field),
    }));

  if (field === "itemQuantity" && !shouldCompareItemQuantityValues(comparableEntries)) {
    return null;
  }

  const values = comparableEntries.map(({ doc: _doc, ...entry }) => entry);
  const populated = values.filter((entry) => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== "");
  const missing = values.filter((entry) => entry.value === undefined || entry.value === null || String(entry.value).trim() === "");
  const firstValue = populated[0]?.value;
  const hasConflictingValues =
    populated.length >= 2 &&
    populated.some((entry) => !areFieldValuesEqual(field, firstValue, entry.value, comparisonOptions));
  const hasRequiredFieldGap =
    PRESENCE_CHECK_FIELDS.has(field) && populated.length >= 1 && missing.length >= 1;

  if (!hasConflictingValues && !hasRequiredFieldGap) return null;

  return {
    id: `mismatch-${field}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field,
    values: (hasRequiredFieldGap ? values : populated) as MismatchValue[],
  };
}

function compactText(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const GENERIC_LINE_TOKENS = new Set([
  "and",
  "amt",
  "amount",
  "code",
  "description",
  "goods",
  "gst",
  "guide",
  "hsn",
  "igst",
  "item",
  "nos",
  "qty",
  "rate",
  "roller",
  "sac",
  "sgst",
  "spare",
  "spares",
  "tax",
  "total",
  "unit",
]);

function normalizeLineToken(token: string) {
  if (token === "daneli" || token === "danieil") return "danieli";
  return token;
}

function stripLeadingLineNumber(value: string) {
  return value.replace(/^\s*\d+\s+/, "");
}

function lineSearchText(item: CommercialLineItem) {
  return compactText(
    [
      item.itemCode,
      item.description,
      item.rawText ? stripLeadingLineNumber(item.rawText) : undefined,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function lineTokens(item: CommercialLineItem) {
  return [
    item.itemCode,
    item.description,
    item.rawText ? stripLeadingLineNumber(item.rawText) : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(normalizeLineToken)
    .filter((token) => token.length > 2 && !GENERIC_LINE_TOKENS.has(token));
}

function tokenOverlapScore(left: CommercialLineItem, right: CommercialLineItem) {
  const leftTokens = new Set(lineTokens(left));
  const rightTokens = new Set(lineTokens(right));
  let overlap = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  });

  if (overlap >= 4) return 4;
  if (overlap >= 3) return 3;
  if (overlap >= 2) return 2;
  return 0;
}

function meaningfulTokenOverlap(left: CommercialLineItem, right: CommercialLineItem) {
  const leftTokens = new Set(lineTokens(left));
  const rightTokens = new Set(lineTokens(right));
  let overlap = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });

  return overlap;
}

function hasUsableItemCode(value?: string) {
  const compact = compactText(value);
  return compact.length >= 4 ? compact : "";
}

function parseNumber(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  const compact = String(value).replace(/[₹$€£,\s]/g, "");
  const match = compact.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(value?: string) {
  const compact = compactText(value);
  if (["kg", "kgs", "kilogram", "kilograms"].includes(compact)) return "kg";
  if (["mt", "mton", "metricton", "metrictons", "m.t"].includes(compact)) return "mt";
  if (["nos", "no", "number", "numbers", "pcs", "piece", "pieces"].includes(compact)) return "nos";
  if (["set", "sets"].includes(compact)) return "set";
  if (["ltr", "liter", "litre", "liters", "litres"].includes(compact)) return "ltr";
  return compact;
}

function unitFactorToBase(unit?: string) {
  const normalized = normalizeUnit(unit);
  if (normalized === "kg") return 1;
  if (normalized === "mt") return 1000;
  return null;
}

function areUnitsCompatible(left?: string, right?: string) {
  const leftUnit = normalizeUnit(left);
  const rightUnit = normalizeUnit(right);
  return Boolean(leftUnit && rightUnit && (leftUnit === rightUnit || (unitFactorToBase(leftUnit) && unitFactorToBase(rightUnit))));
}

function convertQuantityToBase(quantity?: string | number | null, unit?: string) {
  const parsed = parseNumber(quantity);
  if (parsed === null) return null;
  const factor = unitFactorToBase(unit);
  return factor ? parsed * factor : parsed;
}

function convertRateToBase(rate?: string | number | null, unit?: string) {
  const parsed = parseNumber(rate);
  if (parsed === null) return null;
  const factor = unitFactorToBase(unit);
  return factor ? parsed / factor : parsed;
}

function lineIdentity(item: CommercialLineItem) {
  const itemCode = compactText(item.itemCode);
  const hsnSac = compactText(item.hsnSac);
  const description = compactText(item.description || item.rawText).slice(0, 48);
  return [itemCode, hsnSac, description].filter(Boolean).join("|");
}

function lineLabel(item: CommercialLineItem, index: number) {
  return item.lineNumber || item.itemCode || item.description || item.rawText || `line ${index + 1}`;
}

function findBestPoLine(invoiceLine: CommercialLineItem, poLines: CommercialLineItem[]) {
  let best: { line: CommercialLineItem; score: number; hasStrongAnchor: boolean } | null = null;
  const invoiceIdentity = lineIdentity(invoiceLine);
  const invoiceDescription = compactText(invoiceLine.description || invoiceLine.rawText);
  const invoiceSearch = lineSearchText(invoiceLine);
  const invoiceItemCode = hasUsableItemCode(invoiceLine.itemCode);
  const invoiceHsn = compactText(invoiceLine.hsnSac);
  const invoiceUnit = normalizeUnit(invoiceLine.unit);
  const invoiceRate = parseNumber(invoiceLine.rate ?? invoiceLine.netRate);
  const invoiceBaseRate = convertRateToBase(invoiceLine.rate ?? invoiceLine.netRate, invoiceLine.unit);
  const invoiceBaseQuantity = convertQuantityToBase(invoiceLine.quantity, invoiceLine.unit);
  const invoiceLineTotal = parseNumber(invoiceLine.lineTotal ?? invoiceLine.taxableAmount);

  for (const poLine of poLines) {
    let score = 0;
    const poIdentity = lineIdentity(poLine);
    const poDescription = compactText(poLine.description || poLine.rawText);
    const poSearch = lineSearchText(poLine);
    const poItemCode = hasUsableItemCode(poLine.itemCode);
    const poHsn = compactText(poLine.hsnSac);
    const poUnit = normalizeUnit(poLine.unit);
    const poRate = parseNumber(poLine.rate ?? poLine.netRate);
    const poBaseRate = convertRateToBase(poLine.rate ?? poLine.netRate, poLine.unit);
    const poBaseQuantity = convertQuantityToBase(poLine.quantity, poLine.unit);
    const poLineTotal = parseNumber(poLine.lineTotal ?? poLine.taxableAmount);
    const tokenOverlap = meaningfulTokenOverlap(invoiceLine, poLine);
    let hasStrongAnchor = false;

    if (invoiceIdentity && poIdentity && invoiceIdentity === poIdentity) {
      score += 6;
      hasStrongAnchor = true;
    }
    if (invoiceItemCode && poItemCode && invoiceItemCode === poItemCode) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (invoiceItemCode && poSearch.includes(invoiceItemCode)) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (poItemCode && invoiceSearch.includes(poItemCode)) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (invoiceHsn && poHsn && invoiceHsn === poHsn) score += 3;
    if (invoiceUnit && poUnit && areUnitsCompatible(invoiceUnit, poUnit)) score += 1;
    if (invoiceRate !== null && poRate !== null && Math.abs(invoiceRate - poRate) <= Math.max(1, poRate * 0.01)) {
      score += 2;
      if (invoiceHsn && poHsn && invoiceHsn === poHsn) hasStrongAnchor = true;
    }
    if (invoiceBaseRate !== null && poBaseRate !== null && nearlyEqual(invoiceBaseRate, poBaseRate)) {
      score += 2;
      if (invoiceHsn && poHsn && invoiceHsn === poHsn) hasStrongAnchor = true;
    }
    if (invoiceBaseQuantity !== null && poBaseQuantity !== null && nearlyEqual(invoiceBaseQuantity, poBaseQuantity)) {
      score += 2;
    }
    if (invoiceLineTotal !== null && poLineTotal !== null && nearlyEqual(invoiceLineTotal, poLineTotal)) {
      score += 2;
      hasStrongAnchor = true;
    }
    score += tokenOverlapScore(invoiceLine, poLine);
    if (tokenOverlap >= 2) hasStrongAnchor = true;
    if (invoiceDescription && poDescription) {
      if (invoiceDescription.includes(poDescription.slice(0, 24)) || poDescription.includes(invoiceDescription.slice(0, 24))) {
        score += 3;
        hasStrongAnchor = true;
      }
    }

    if (!best || score > best.score) {
      best = { line: poLine, score, hasStrongAnchor };
    }
  }

  return best && best.score >= 5 && best.hasStrongAnchor ? best.line : null;
}

function nearlyEqual(left: number | null, right: number | null, tolerance = 0.01) {
  if (left === null || right === null) return true;
  return Math.abs(left - right) <= Math.max(tolerance, Math.abs(right) * 0.01);
}

function buildLineMismatch(
  field: string,
  poDoc: CaseDoc,
  invoiceDoc: CaseDoc,
  poLine: CommercialLineItem | null,
  invoiceLine: CommercialLineItem,
  index: number,
  detail: string,
  poDetail = detail,
  invoiceDetail = detail
): Omit<Mismatch, "analysis" | "fixPlan"> {
  return {
    id: `line-mismatch-${field}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field,
    values: [
      {
        docId: poDoc.id,
        value: poLine ? `${lineLabel(poLine, index)}: ${poDetail}` : "No matching PO line",
      },
      {
        docId: invoiceDoc.id,
        value: `${lineLabel(invoiceLine, index)}: ${invoiceDetail}`,
      },
    ],
  };
}

function verifyCommercialLineItems(docs: CaseDoc[]): Omit<Mismatch, "analysis" | "fixPlan">[] {
  const poDocs = docs.filter((doc) => PURCHASE_DOC_TYPES.has(doc.type) && doc.lineItems?.length);
  const invoiceDocs = docs.filter((doc) => INVOICE_DOC_TYPES.has(doc.type) && doc.lineItems?.length);
  const mismatches: Omit<Mismatch, "analysis" | "fixPlan">[] = [];

  if (!poDocs.length || !invoiceDocs.length) {
    return mismatches;
  }

  for (const invoiceDoc of invoiceDocs) {
    const matchingPo =
      poDocs.find((poDoc) =>
        areComparableValuesEqual(invoiceDoc.fields.referencePoNumber, poDoc.fields.poNumber)
      ) ?? poDocs[0];

    const poLines = matchingPo.lineItems ?? [];
    for (const [index, invoiceLine] of (invoiceDoc.lineItems ?? []).entries()) {
      const poLine = findBestPoLine(invoiceLine, poLines);
      if (!poLine) {
        mismatches.push(buildLineMismatch("lineItems.unmatchedInvoiceLine", matchingPo, invoiceDoc, null, invoiceLine, index, "Invoice line has no confident PO line match"));
        continue;
      }

      const invoiceQty = parseNumber(invoiceLine.quantity);
      const poQty = parseNumber(poLine.quantity);
      const invoiceBaseQty = convertQuantityToBase(invoiceLine.quantity, invoiceLine.unit) ?? invoiceQty;
      const poBaseQty = convertQuantityToBase(poLine.quantity, poLine.unit) ?? poQty;
      if (invoiceBaseQty !== null && poBaseQty !== null && invoiceBaseQty > poBaseQty * 1.01) {
        mismatches.push(buildLineMismatch("lineItems.quantityExceeded", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice quantity ${invoiceLine.quantity} exceeds PO quantity ${poLine.quantity}`, `PO quantity ${poLine.quantity}`, `Invoice quantity ${invoiceLine.quantity}`));
      }

      const invoiceRateValue = invoiceLine.rate ?? invoiceLine.netRate;
      const poRateValue = poLine.rate ?? poLine.netRate;
      const invoiceRate = convertRateToBase(invoiceRateValue, invoiceLine.unit) ?? parseNumber(invoiceRateValue);
      const poRate = convertRateToBase(poRateValue, poLine.unit) ?? parseNumber(poRateValue);
      if (!nearlyEqual(invoiceRate, poRate)) {
        mismatches.push(buildLineMismatch("lineItems.rateMismatch", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice rate ${invoiceRateValue} differs from PO rate ${poRateValue}`, `PO rate ${poRateValue}`, `Invoice rate ${invoiceRateValue}`));
      }

      const invoiceUnit = normalizeUnit(invoiceLine.unit);
      const poUnit = normalizeUnit(poLine.unit);
      if (invoiceUnit && poUnit && !areUnitsCompatible(invoiceUnit, poUnit)) {
        mismatches.push(buildLineMismatch("lineItems.unitMismatch", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice unit ${invoiceLine.unit} differs from PO unit ${poLine.unit}`, `PO unit ${poLine.unit}`, `Invoice unit ${invoiceLine.unit}`));
      }
    }
  }

  return mismatches;
}

export function verifyCaseDocuments(
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): Omit<Mismatch, "analysis" | "fixPlan">[] {
  const mismatches: Omit<Mismatch, "analysis" | "fixPlan">[] = [];

  for (const field of PRIMARY_COMPARISON_FIELDS) {
    const docTypesWithField = [...new Set(docs.map(d => d.type))];
    const shouldCheck = docTypesWithField.some(dt => shouldConsiderFieldKey(field, dt));
    if (!shouldCheck) continue;
    
    const mismatch = buildMismatch(field, docs, comparisonOptions);
    if (mismatch) mismatches.push(mismatch);
  }

  return [...mismatches, ...verifyCommercialLineItems(docs)];
}
