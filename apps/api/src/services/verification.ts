import type { CaseDoc, CommercialLineItem, FieldKey, Mismatch, MismatchValue } from "@/types/pipeline";
import { getFieldKeysForDocType, shouldConsiderFieldKey } from "@/lib/document-schema";
import {
  areComparableValuesEqual,
  DEFAULT_COMPARISON_OPTIONS,
  getComparableFieldValue,
  normalizeComparableValue,
  PRIMARY_COMPARISON_FIELDS,
} from "@/lib/comparison";
import type { ComparisonOptions } from "@/types/pipeline";

const PRESENCE_CHECK_FIELDS = new Set<FieldKey>();
const PURCHASE_DOC_TYPES = new Set(["Purchase Order", "Amended Purchase Order"]);
const INVOICE_DOC_TYPES = new Set(["Invoice", "Tax Invoice"]);
const PARTY_NAME_FIELDS = new Set<FieldKey>(["vendorName", "buyerName", "transporterName", "ownerName", "driverName", "holderName"]);
const PURCHASE_ORDER_TOTAL_FIELDS = new Set<FieldKey>(["subtotal", "taxAmount", "totalAmount"]);
const GROUP_REFERENCE_FIELDS: FieldKey[] = [
  "poNumber",
  "invoiceNumber",
  "eWayBillNumber",
  "lorryReceiptNumber",
  "weighmentNumber",
  "fastagReference",
  "transactionReference",
  "vehicleNumber",
];

export interface VerificationGroup {
  groupId: string;
  label: string;
  reason: "shared_reference" | "source_file" | "single_document";
  documentIds: string[];
  sourceFileNames: string[];
  referenceKeys: string[];
}

export interface GroupedVerificationResult {
  groups: VerificationGroup[];
  mismatches: Omit<Mismatch, "analysis" | "fixPlan">[];
}

function shouldExpectField(doc: CaseDoc, field: FieldKey) {
  if (PURCHASE_DOC_TYPES.has(doc.type) && PURCHASE_ORDER_TOTAL_FIELDS.has(field)) {
    return false;
  }

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

function normalizeGroupValue(
  value: string | number | null | undefined,
  comparisonOptions: ComparisonOptions,
  field?: FieldKey
) {
  return normalizeComparableValue(value, comparisonOptions, field) || null;
}

function normalizeSourceName(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

function normalizeAmountValue(value: string | number | null | undefined) {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.round(parsed * 100).toString();
}

function getVendorIdentity(doc: CaseDoc, comparisonOptions: ComparisonOptions) {
  return (
    normalizeGroupValue(doc.fields.supplierGstin, comparisonOptions, "supplierGstin") ||
    normalizeGroupValue(doc.fields.vendorName, comparisonOptions, "vendorName") ||
    normalizeGroupValue(doc.fields.transporterName, comparisonOptions, "transporterName") ||
    null
  );
}

function isUsefulInvoiceReference(value: string | null) {
  if (!value) return false;
  return value.length >= 4 || /[a-z]/i.test(value);
}

function getPacketReferenceKeys(doc: CaseDoc, comparisonOptions: ComparisonOptions) {
  const keys: string[] = [];
  const vendorIdentity = getVendorIdentity(doc, comparisonOptions);

  const poNumber = normalizeGroupValue(getComparableFieldValue(doc, "poNumber"), comparisonOptions, "poNumber");
  if (poNumber) keys.push(`po:${poNumber}`);

  const invoiceNumber = normalizeGroupValue(
    getComparableFieldValue(doc, "invoiceNumber"),
    comparisonOptions,
    "invoiceNumber"
  );
  if (isUsefulInvoiceReference(invoiceNumber)) {
    keys.push(`invoice:${invoiceNumber}`);
    if (vendorIdentity) keys.push(`invoice-party:${invoiceNumber}:${vendorIdentity}`);
  }

  const eWayBillNumber = normalizeGroupValue(doc.fields.eWayBillNumber, comparisonOptions, "eWayBillNumber");
  if (eWayBillNumber) keys.push(`eway:${eWayBillNumber}`);

  const lorryReceiptNumber = normalizeGroupValue(
    doc.fields.lorryReceiptNumber,
    comparisonOptions,
    "lorryReceiptNumber"
  );
  if (lorryReceiptNumber) keys.push(`lr:${lorryReceiptNumber}`);

  const weighmentNumber = normalizeGroupValue(doc.fields.weighmentNumber, comparisonOptions, "weighmentNumber");
  if (weighmentNumber && vendorIdentity) keys.push(`weighment-party:${weighmentNumber}:${vendorIdentity}`);

  const fastagReference = normalizeGroupValue(doc.fields.fastagReference, comparisonOptions, "fastagReference");
  if (fastagReference) keys.push(`fastag:${fastagReference}`);

  const transactionReference = normalizeGroupValue(
    doc.fields.transactionReference,
    comparisonOptions,
    "transactionReference"
  );
  if (transactionReference) keys.push(`transaction:${transactionReference}`);

  return [...new Set(keys)];
}

function shareReferenceKey(left: CaseDoc, right: CaseDoc, comparisonOptions: ComparisonOptions) {
  const leftKeys = new Set(getPacketReferenceKeys(left, comparisonOptions));
  return getPacketReferenceKeys(right, comparisonOptions).some((key) => leftKeys.has(key));
}

function shareCommercialIdentity(left: CaseDoc, right: CaseDoc, comparisonOptions: ComparisonOptions) {
  const leftAmount = normalizeAmountValue(getComparableFieldValue(left, "totalAmount"));
  const rightAmount = normalizeAmountValue(getComparableFieldValue(right, "totalAmount"));
  if (!leftAmount || !rightAmount || leftAmount !== rightAmount) {
    return false;
  }

  const leftVendor = getVendorIdentity(left, comparisonOptions);
  const rightVendor = getVendorIdentity(right, comparisonOptions);
  if (leftVendor && rightVendor && leftVendor === rightVendor) {
    return true;
  }

  const leftBuyerGstin = normalizeGroupValue(left.fields.buyerGstin, comparisonOptions, "buyerGstin");
  const rightBuyerGstin = normalizeGroupValue(right.fields.buyerGstin, comparisonOptions, "buyerGstin");
  const leftSupplierGstin = normalizeGroupValue(left.fields.supplierGstin, comparisonOptions, "supplierGstin");
  const rightSupplierGstin = normalizeGroupValue(right.fields.supplierGstin, comparisonOptions, "supplierGstin");

  return Boolean(
    leftSupplierGstin &&
      rightSupplierGstin &&
      leftSupplierGstin === rightSupplierGstin &&
      leftBuyerGstin &&
      rightBuyerGstin &&
      leftBuyerGstin === rightBuyerGstin
  );
}

function shouldGroupBySourceFile(
  left: CaseDoc,
  right: CaseDoc,
  sourceDocs: CaseDoc[],
  comparisonOptions: ComparisonOptions
) {
  if (shareReferenceKey(left, right, comparisonOptions) || shareCommercialIdentity(left, right, comparisonOptions)) {
    return true;
  }

  const invoiceCount = sourceDocs.filter((doc) => INVOICE_DOC_TYPES.has(doc.type)).length;
  if (invoiceCount <= 1) {
    return true;
  }

  const purchaseCount = sourceDocs.filter((doc) => PURCHASE_DOC_TYPES.has(doc.type)).length;
  return invoiceCount === 0 && purchaseCount <= 1;
}

function packetReferenceLabel(doc: CaseDoc, comparisonOptions: ComparisonOptions) {
  for (const field of GROUP_REFERENCE_FIELDS) {
    const value = getComparableFieldValue(doc, field);
    if (normalizeGroupValue(value, comparisonOptions, field)) {
      return `${field}:${value}`;
    }
  }

  return doc.sourceFileName || doc.sourceHint || doc.title || doc.id;
}

function makeVerificationGroup(
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions,
  groupIndex: number
): VerificationGroup {
  const sourceFileNames = [...new Set(docs.map((doc) => doc.sourceFileName).filter((value): value is string => Boolean(value)))];
  const referenceKeys = [...new Set(docs.flatMap((doc) => getPacketReferenceKeys(doc, comparisonOptions)))];
  const labelReference =
    docs
      .map((doc) => packetReferenceLabel(doc, comparisonOptions))
      .find((value) => value && !value.startsWith("sourceFileName:")) ?? sourceFileNames[0] ?? `Packet ${groupIndex + 1}`;
  const singleSource = sourceFileNames.length === 1;

  return {
    groupId: `packet-group-${groupIndex + 1}`,
    label: labelReference,
    reason: docs.length <= 1 ? "single_document" : singleSource ? "source_file" : "shared_reference",
    documentIds: docs.map((doc) => doc.id),
    sourceFileNames,
    referenceKeys,
  };
}

export function groupDocumentsForVerification(
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
) {
  const parent = docs.map((_, index) => index);

  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]);
    }
    return parent[index];
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
    }
  };

  const byReference = new Map<string, number[]>();
  docs.forEach((doc, index) => {
    getPacketReferenceKeys(doc, comparisonOptions).forEach((key) => {
      byReference.set(key, [...(byReference.get(key) ?? []), index]);
    });
  });

  byReference.forEach((indices) => {
    const [first, ...rest] = indices;
    rest.forEach((index) => union(first, index));
  });

  const bySource = new Map<string, number[]>();
  docs.forEach((doc, index) => {
    const source = normalizeSourceName(doc.sourceFileName);
    if (!source) return;
    bySource.set(source, [...(bySource.get(source) ?? []), index]);
  });

  bySource.forEach((indices) => {
    const sourceDocs = indices.map((index) => docs[index]);
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        const leftIndex = indices[left];
        const rightIndex = indices[right];
        if (shouldGroupBySourceFile(docs[leftIndex], docs[rightIndex], sourceDocs, comparisonOptions)) {
          union(leftIndex, rightIndex);
        }
      }
    }
  });

  for (let left = 0; left < docs.length; left += 1) {
    for (let right = left + 1; right < docs.length; right += 1) {
      if (find(left) === find(right)) continue;
      if (shareCommercialIdentity(docs[left], docs[right], comparisonOptions)) {
        union(left, right);
      }
    }
  }

  const grouped = new Map<number, CaseDoc[]>();
  docs.forEach((doc, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), doc]);
  });

  return [...grouped.values()].map((groupDocs, index) => ({
    group: makeVerificationGroup(groupDocs, comparisonOptions, index),
    docs: groupDocs,
  }));
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
  let best: { line: CommercialLineItem; score: number } | null = null;
  const invoiceIdentity = lineIdentity(invoiceLine);
  const invoiceDescription = compactText(invoiceLine.description || invoiceLine.rawText);
  const invoiceSearch = lineSearchText(invoiceLine);
  const invoiceItemCode = compactText(invoiceLine.itemCode);
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
    const poItemCode = compactText(poLine.itemCode);
    const poHsn = compactText(poLine.hsnSac);
    const poUnit = normalizeUnit(poLine.unit);
    const poRate = parseNumber(poLine.rate ?? poLine.netRate);
    const poBaseRate = convertRateToBase(poLine.rate ?? poLine.netRate, poLine.unit);
    const poBaseQuantity = convertQuantityToBase(poLine.quantity, poLine.unit);
    const poLineTotal = parseNumber(poLine.lineTotal ?? poLine.taxableAmount);

    if (invoiceIdentity && poIdentity && invoiceIdentity === poIdentity) score += 6;
    if (invoiceItemCode && poItemCode && invoiceItemCode === poItemCode) score += 5;
    if (invoiceItemCode && poSearch.includes(invoiceItemCode)) score += 5;
    if (poItemCode && invoiceSearch.includes(poItemCode)) score += 5;
    if (invoiceHsn && poHsn && invoiceHsn === poHsn) score += 3;
    if (invoiceUnit && poUnit && areUnitsCompatible(invoiceUnit, poUnit)) score += 1;
    if (invoiceRate !== null && poRate !== null && Math.abs(invoiceRate - poRate) <= Math.max(1, poRate * 0.01)) score += 2;
    if (invoiceBaseRate !== null && poBaseRate !== null && nearlyEqual(invoiceBaseRate, poBaseRate)) score += 2;
    if (invoiceBaseQuantity !== null && poBaseQuantity !== null && nearlyEqual(invoiceBaseQuantity, poBaseQuantity)) score += 2;
    if (invoiceLineTotal !== null && poLineTotal !== null && nearlyEqual(invoiceLineTotal, poLineTotal)) score += 2;
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
        mismatches.push(
          buildLineMismatch(
            "lineItems.unmatchedInvoiceLine",
            matchingPo,
            invoiceDoc,
            null,
            invoiceLine,
            index,
            "Invoice line has no confident PO line match"
          )
        );
        continue;
      }
      matchedPoLines.add(poLine);

      const invoiceQty = parseNumber(invoiceLine.quantity);
      const poQty = parseNumber(poLine.quantity);
      const invoiceBaseQty = convertQuantityToBase(invoiceLine.quantity, invoiceLine.unit) ?? invoiceQty;
      const poBaseQty = convertQuantityToBase(poLine.quantity, poLine.unit) ?? poQty;
      if (invoiceBaseQty !== null && poBaseQty !== null && invoiceBaseQty > poBaseQty * 1.01) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.quantityExceeded",
            matchingPo,
            invoiceDoc,
            poLine,
            invoiceLine,
            index,
            `invoice quantity ${invoiceLine.quantity} exceeds PO quantity ${poLine.quantity}`,
            `PO quantity ${poLine.quantity}`,
            `Invoice quantity ${invoiceLine.quantity}`
          )
        );
      }

      const invoiceRateValue = invoiceLine.rate ?? invoiceLine.netRate;
      const poRateValue = poLine.rate ?? poLine.netRate;
      const invoiceRate = convertRateToBase(invoiceRateValue, invoiceLine.unit) ?? parseNumber(invoiceRateValue);
      const poRate = convertRateToBase(poRateValue, poLine.unit) ?? parseNumber(poRateValue);
      if (!nearlyEqual(invoiceRate, poRate)) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.rateMismatch",
            matchingPo,
            invoiceDoc,
            poLine,
            invoiceLine,
            index,
            `invoice rate ${invoiceRateValue} differs from PO rate ${poRateValue}`,
            `PO rate ${poRateValue}`,
            `Invoice rate ${invoiceRateValue}`
          )
        );
      }

      const invoiceUnit = normalizeUnit(invoiceLine.unit);
      const poUnit = normalizeUnit(poLine.unit);
      if (invoiceUnit && poUnit && !areUnitsCompatible(invoiceUnit, poUnit)) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.unitMismatch",
            matchingPo,
            invoiceDoc,
            poLine,
            invoiceLine,
            index,
            `invoice unit ${invoiceLine.unit} differs from PO unit ${poLine.unit}`,
            `PO unit ${poLine.unit}`,
            `Invoice unit ${invoiceLine.unit}`
          )
        );
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

export function verifyGroupedCaseDocuments(
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): GroupedVerificationResult {
  const groups = groupDocumentsForVerification(docs, comparisonOptions);
  const mismatches = groups.flatMap(({ docs: groupDocs, group }) => {
    if (groupDocs.length < 2) return [];
    return verifyCaseDocuments(groupDocs, comparisonOptions).map((mismatch) => ({
      ...mismatch,
      id: `${group.groupId}-${mismatch.id}`,
    }));
  });

  return {
    groups: groups.map(({ group }) => group),
    mismatches,
  };
}
