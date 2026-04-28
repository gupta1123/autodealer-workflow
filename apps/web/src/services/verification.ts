import type { CaseDoc, CommercialLineItem, FieldKey, Mismatch, MismatchValue } from "@/types/pipeline";
import { getFieldKeysForDocType, shouldConsiderFieldKey } from "@/lib/document-schema";
import {
  areComparableValuesEqual,
  DEFAULT_COMPARISON_OPTIONS,
  getComparableFieldValue,
  PRIMARY_COMPARISON_FIELDS,
} from "@/lib/comparison";
import type { ComparisonOptions } from "@/types/pipeline";

const PRESENCE_CHECK_FIELDS = new Set<FieldKey>(["eWayBillNumber"]);
const PURCHASE_DOC_TYPES = new Set(["Purchase Order"]);
const INVOICE_DOC_TYPES = new Set(["Tax Invoice"]);
const PARTY_NAME_FIELDS = new Set<FieldKey>(["vendorName", "buyerName", "transporterName", "ownerName", "driverName", "holderName"]);

function shouldExpectField(doc: CaseDoc, field: FieldKey) {
  return (
    shouldConsiderFieldKey(field, doc.type) &&
    getFieldKeysForDocType(doc.type).includes(field)
  );
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
  if (areComparableValuesEqual(left, right, comparisonOptions)) {
    return true;
  }

  if (PARTY_NAME_FIELDS.has(field)) {
    const normalizedLeft = normalizePartyName(left);
    const normalizedRight = normalizePartyName(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft.length >= 8 && normalizedLeft === normalizedRight);
  }

  return false;
}

function buildMismatch(
  field: FieldKey,
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): Omit<Mismatch, "analysis" | "fixPlan"> | null {
  const values = docs
    .filter((doc) => shouldExpectField(doc, field))
    .map((doc) => ({
      docId: doc.id,
      value: getComparableFieldValue(doc, field),
    }));
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

function lineSearchText(item: CommercialLineItem) {
  return compactText([item.itemCode, item.description, item.rawText].filter(Boolean).join(" "));
}

function lineTokens(item: CommercialLineItem) {
  return [item.itemCode, item.description, item.rawText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
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
  let best: { line: CommercialLineItem; score: number } | null = null;
  const invoiceIdentity = lineIdentity(invoiceLine);
  const invoiceDescription = compactText(invoiceLine.description || invoiceLine.rawText);
  const invoiceSearch = lineSearchText(invoiceLine);
  const invoiceItemCode = compactText(invoiceLine.itemCode);
  const invoiceHsn = compactText(invoiceLine.hsnSac);
  const invoiceUnit = normalizeUnit(invoiceLine.unit);
  const invoiceRate = parseNumber(invoiceLine.netRate ?? invoiceLine.rate);

  for (const poLine of poLines) {
    let score = 0;
    const poIdentity = lineIdentity(poLine);
    const poDescription = compactText(poLine.description || poLine.rawText);
    const poSearch = lineSearchText(poLine);
    const poItemCode = compactText(poLine.itemCode);
    const poHsn = compactText(poLine.hsnSac);
    const poUnit = normalizeUnit(poLine.unit);
    const poRate = parseNumber(poLine.netRate ?? poLine.rate);

    if (invoiceIdentity && poIdentity && invoiceIdentity === poIdentity) score += 6;
    if (invoiceItemCode && poItemCode && invoiceItemCode === poItemCode) score += 5;
    if (invoiceItemCode && poSearch.includes(invoiceItemCode)) score += 5;
    if (poItemCode && invoiceSearch.includes(poItemCode)) score += 5;
    if (invoiceHsn && poHsn && invoiceHsn === poHsn) score += 3;
    if (invoiceUnit && poUnit && invoiceUnit === poUnit) score += 1;
    if (invoiceRate !== null && poRate !== null && Math.abs(invoiceRate - poRate) <= Math.max(1, poRate * 0.01)) score += 2;
    score += tokenOverlapScore(invoiceLine, poLine);
    if (invoiceDescription && poDescription) {
      if (invoiceDescription.includes(poDescription.slice(0, 24)) || poDescription.includes(invoiceDescription.slice(0, 24))) {
        score += 3;
      }
    }

    if (!best || score > best.score) {
      best = { line: poLine, score };
    }
  }

  return best && best.score >= 4 ? best.line : null;
}

function findBestInvoiceLine(poLine: CommercialLineItem, invoiceLines: CommercialLineItem[]) {
  return findBestPoLine(poLine, invoiceLines);
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

function buildPoLineMissingFromInvoiceMismatch(
  poDoc: CaseDoc,
  invoiceDoc: CaseDoc,
  poLine: CommercialLineItem,
  index: number
): Omit<Mismatch, "analysis" | "fixPlan"> {
  return {
    id: `line-mismatch-lineItems.uninvoicedPoLine-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field: "lineItems.uninvoicedPoLine",
    values: [
      {
        docId: poDoc.id,
        value: `${lineLabel(poLine, index)}: PO line has no matching invoice line`,
      },
      {
        docId: invoiceDoc.id,
        value: "No matching invoice line",
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
    const matchedPoLines = new Set<CommercialLineItem>();
    for (const [index, invoiceLine] of (invoiceDoc.lineItems ?? []).entries()) {
      const poLine = findBestPoLine(invoiceLine, poLines);
      if (!poLine) {
        mismatches.push(buildLineMismatch("lineItems.unmatchedInvoiceLine", matchingPo, invoiceDoc, null, invoiceLine, index, "Invoice line has no confident PO line match"));
        continue;
      }
      matchedPoLines.add(poLine);

      const invoiceQty = parseNumber(invoiceLine.quantity);
      const poQty = parseNumber(poLine.quantity);
      if (invoiceQty !== null && poQty !== null && invoiceQty > poQty * 1.01) {
        mismatches.push(buildLineMismatch("lineItems.quantityExceeded", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice quantity ${invoiceLine.quantity} exceeds PO quantity ${poLine.quantity}`, `PO quantity ${poLine.quantity}`, `Invoice quantity ${invoiceLine.quantity}`));
      }

      const invoiceRate = parseNumber(invoiceLine.netRate ?? invoiceLine.rate);
      const poRate = parseNumber(poLine.netRate ?? poLine.rate);
      if (!nearlyEqual(invoiceRate, poRate)) {
        mismatches.push(buildLineMismatch("lineItems.rateMismatch", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice rate ${invoiceLine.netRate ?? invoiceLine.rate} differs from PO rate ${poLine.netRate ?? poLine.rate}`, `PO rate ${poLine.netRate ?? poLine.rate}`, `Invoice rate ${invoiceLine.netRate ?? invoiceLine.rate}`));
      }

      const invoiceUnit = normalizeUnit(invoiceLine.unit);
      const poUnit = normalizeUnit(poLine.unit);
      if (invoiceUnit && poUnit && invoiceUnit !== poUnit) {
        mismatches.push(buildLineMismatch("lineItems.unitMismatch", matchingPo, invoiceDoc, poLine, invoiceLine, index, `invoice unit ${invoiceLine.unit} differs from PO unit ${poLine.unit}`, `PO unit ${poLine.unit}`, `Invoice unit ${invoiceLine.unit}`));
      }
    }

    for (const [index, poLine] of poLines.entries()) {
      if (matchedPoLines.has(poLine)) continue;
      const invoiceLine = findBestInvoiceLine(poLine, invoiceDoc.lineItems ?? []);
      if (!invoiceLine) {
        mismatches.push(buildPoLineMissingFromInvoiceMismatch(matchingPo, invoiceDoc, poLine, index));
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
