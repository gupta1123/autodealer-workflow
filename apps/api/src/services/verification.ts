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
const SAME_TYPE_ONLY_DESCRIPTIVE_FIELDS = new Set<FieldKey>([
  "driverName",
  "evidenceDescription",
  "fuelType",
  "holderName",
  "mapLocation",
  "ownerName",
  "panNumber",
  "permitType",
  "vehicleClass",
]);
const EXPECTATION_FIELD_ALIASES: Partial<Record<FieldKey, FieldKey[]>> = {
  poNumber: ["poNumber", "referencePoNumber"],
  invoiceNumber: ["invoiceNumber", "referenceInvoiceNumber"],
  totalAmount: ["totalAmount"],
  vehicleNumber: ["vehicleNumber", "registrationNumber"],
  dispatchFrom: ["dispatchFrom", "routeFrom"],
  shipTo: ["shipTo", "routeTo"],
};
const LINE_ITEM_REFERENCE_PRIORITY: Partial<Record<CaseDoc["type"], number>> = {
  "Purchase Order": 0,
  "Amended Purchase Order": 0,
  Invoice: 1,
  "Tax Invoice": 1,
  "Delivery Challan": 2,
  "Delivery Note": 2,
  "E-Way Bill": 3,
  "Lorry Receipt": 4,
  "Weighment Slip": 5,
  "Material Test Certificate": 6,
};
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

  const configuredFields = getFieldKeysForDocType(doc.type);
  const candidateFields = EXPECTATION_FIELD_ALIASES[field] ?? [field];

  return candidateFields.some(
    (candidateField) =>
      shouldConsiderFieldKey(candidateField, doc.type) &&
      configuredFields.includes(candidateField)
  );
}

function shouldCompareItemQuantityValues(
  values: Array<{ doc: CaseDoc; value: string | number | null | undefined }>
) {
  const populated = values.filter((entry) => normalizeComparableValue(entry.value, DEFAULT_COMPARISON_OPTIONS, "itemQuantity"));
  if (populated.length < 2) return false;

  const units = populated.map((entry) => normalizeUnit(entry.doc.fields.unit));
  if (units.some((unit) => !unit)) return false;

  const [firstUnit, ...restUnits] = units;
  return restUnits.every((unit) => areUnitsCompatible(firstUnit, unit));
}

function isComparableFieldValue(
  field: FieldKey,
  value: string | number | null | undefined,
  comparisonOptions: ComparisonOptions
) {
  return Boolean(normalizeComparableValue(value, comparisonOptions, field));
}

function hasConsistentPartyGstin(
  field: FieldKey,
  entries: Array<{ doc: CaseDoc; value: string | number | null | undefined }>,
  comparisonOptions: ComparisonOptions
) {
  const gstinField: FieldKey | null =
    field === "vendorName" ? "supplierGstin" : field === "buyerName" ? "buyerGstin" : null;
  if (!gstinField) return false;

  const gstins = entries
    .map((entry) => normalizeGroupValue(entry.doc.fields[gstinField], comparisonOptions, gstinField))
    .filter((value): value is string => Boolean(value));
  if (gstins.length < 2) return false;

  const [first, ...rest] = gstins;
  return rest.every((value) => value === first);
}

function shouldCompareDescriptiveField(
  field: FieldKey,
  entries: Array<{ doc: CaseDoc; value: string | number | null | undefined }>,
  comparisonOptions: ComparisonOptions
) {
  if (!SAME_TYPE_ONLY_DESCRIPTIVE_FIELDS.has(field)) return true;

  const populatedDocTypes = new Set(
    entries
      .filter((entry) => isComparableFieldValue(field, entry.value, comparisonOptions))
      .map((entry) => entry.doc.type)
  );

  return populatedDocTypes.size > 1;
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

function isUsefulVehicleReference(value: string | null) {
  if (!value) return false;
  return value.length >= 7 && value.length <= 12 && /[a-z]/i.test(value) && /\d/.test(value);
}

function getVehicleReference(doc: CaseDoc, comparisonOptions: ComparisonOptions) {
  return normalizeGroupValue(getComparableFieldValue(doc, "vehicleNumber"), comparisonOptions, "vehicleNumber");
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

  const vehicleNumber = getVehicleReference(doc, comparisonOptions);
  if (isUsefulVehicleReference(vehicleNumber)) keys.push(`vehicle:${vehicleNumber}`);

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

  if (
    (field === "vendorName" || field === "buyerName") &&
    hasConsistentPartyGstin(field, comparableEntries, comparisonOptions)
  ) {
    return null;
  }

  if (!shouldCompareDescriptiveField(field, comparableEntries, comparisonOptions)) {
    return null;
  }

  const values = comparableEntries.map((entry) => ({
    docId: entry.docId,
    value: entry.value,
  }));
  const populated = values.filter((entry) => isComparableFieldValue(field, entry.value, comparisonOptions));
  const missing = values.filter((entry) => !isComparableFieldValue(field, entry.value, comparisonOptions));
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

function itemCodeTokens(value: string | undefined, options: { allowNumericOnly: boolean }) {
  const rawTokens = (value ?? "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(normalizeLineToken)
    .filter((token) => token.length >= 4 && /\d/.test(token) && (options.allowNumericOnly || /[a-z]/.test(token)));

  return rawTokens.flatMap((token) => {
    const leadingNumber = token.match(/^\d{4,}/)?.[0];
    const alphaNumericRoot = token.match(/^([a-z]+\d{3,})[a-z]+$/)?.[1];
    return [
      token,
      leadingNumber && leadingNumber !== token ? leadingNumber : null,
      alphaNumericRoot && alphaNumericRoot !== token ? alphaNumericRoot : null,
    ].filter((entry): entry is string => Boolean(entry));
  });
}

function uniqueItemCodeTokens(item: CommercialLineItem) {
  const hsnSac = compactText(item.hsnSac);
  return [
    ...new Set([
      ...itemCodeTokens(item.itemCode, { allowNumericOnly: true }),
      ...itemCodeTokens(item.description, { allowNumericOnly: false }),
      ...itemCodeTokens(stripLeadingLineNumber(item.rawText ?? ""), { allowNumericOnly: false }),
    ]),
  ].filter((token) => token !== hsnSac);
}

function countTokenOverlap(left: Iterable<string>, right: Iterable<string>) {
  const rightSet = new Set(right);
  let overlap = 0;
  for (const token of left) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap;
}

function distinctiveTextTokens(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(normalizeLineToken)
    .filter((token) => token.length > 2 && !GENERIC_LINE_TOKENS.has(token));
}

function hasDistinctiveDescriptionOverlap(left?: string, right?: string) {
  return countTokenOverlap(distinctiveTextTokens(left), distinctiveTextTokens(right)) >= 1;
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

function findBestReferenceLine(comparedLine: CommercialLineItem, referenceLines: CommercialLineItem[]) {
  let best: { line: CommercialLineItem; score: number; hasStrongAnchor: boolean } | null = null;
  const comparedIdentity = lineIdentity(comparedLine);
  const comparedDescription = compactText(comparedLine.description || comparedLine.rawText);
  const comparedSearch = lineSearchText(comparedLine);
  const comparedItemCode = hasUsableItemCode(comparedLine.itemCode);
  const comparedItemCodeTokens = uniqueItemCodeTokens(comparedLine);
  const comparedHsn = compactText(comparedLine.hsnSac);
  const comparedUnit = normalizeUnit(comparedLine.unit);
  const comparedRate = parseNumber(comparedLine.rate ?? comparedLine.netRate);
  const comparedBaseRate = convertRateToBase(comparedLine.rate ?? comparedLine.netRate, comparedLine.unit);
  const comparedBaseQuantity = convertQuantityToBase(comparedLine.quantity, comparedLine.unit);
  const comparedLineTotal = parseNumber(comparedLine.lineTotal ?? comparedLine.taxableAmount);

  for (const referenceLine of referenceLines) {
    let score = 0;
    const referenceIdentity = lineIdentity(referenceLine);
    const referenceDescription = compactText(referenceLine.description || referenceLine.rawText);
    const referenceSearch = lineSearchText(referenceLine);
    const referenceItemCode = hasUsableItemCode(referenceLine.itemCode);
    const referenceItemCodeTokens = uniqueItemCodeTokens(referenceLine);
    const referenceHsn = compactText(referenceLine.hsnSac);
    const referenceUnit = normalizeUnit(referenceLine.unit);
    const referenceRate = parseNumber(referenceLine.rate ?? referenceLine.netRate);
    const referenceBaseRate = convertRateToBase(referenceLine.rate ?? referenceLine.netRate, referenceLine.unit);
    const referenceBaseQuantity = convertQuantityToBase(referenceLine.quantity, referenceLine.unit);
    const referenceLineTotal = parseNumber(referenceLine.lineTotal ?? referenceLine.taxableAmount);
    const tokenOverlap = meaningfulTokenOverlap(comparedLine, referenceLine);
    const itemCodeOverlap = countTokenOverlap(comparedItemCodeTokens, referenceItemCodeTokens);
    const bothHaveSpecificItemCodes = comparedItemCodeTokens.length > 0 && referenceItemCodeTokens.length > 0;
    const hasDescriptionAnchor = hasDistinctiveDescriptionOverlap(comparedLine.description, referenceLine.description);
    let hasStrongAnchor = false;

    if (bothHaveSpecificItemCodes && itemCodeOverlap === 0) {
      continue;
    }

    if (comparedIdentity && referenceIdentity && comparedIdentity === referenceIdentity) {
      score += 6;
      hasStrongAnchor = true;
    }
    if (itemCodeOverlap > 0) {
      score += 6 + Math.min(itemCodeOverlap, 2);
      hasStrongAnchor = true;
    }
    if (comparedItemCode && referenceItemCode && comparedItemCode === referenceItemCode) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (comparedItemCode && referenceSearch.includes(comparedItemCode)) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (referenceItemCode && comparedSearch.includes(referenceItemCode)) {
      score += 5;
      hasStrongAnchor = true;
    }
    if (comparedHsn && referenceHsn && comparedHsn === referenceHsn) score += 3;
    if (comparedUnit && referenceUnit && areUnitsCompatible(comparedUnit, referenceUnit)) score += 1;
    if (comparedRate !== null && referenceRate !== null && Math.abs(comparedRate - referenceRate) <= Math.max(1, referenceRate * 0.01)) {
      score += 2;
      if (comparedHsn && referenceHsn && comparedHsn === referenceHsn && (!bothHaveSpecificItemCodes || itemCodeOverlap > 0 || hasDescriptionAnchor)) {
        hasStrongAnchor = true;
      }
    }
    if (comparedBaseRate !== null && referenceBaseRate !== null && nearlyEqual(comparedBaseRate, referenceBaseRate)) {
      score += 2;
      if (comparedHsn && referenceHsn && comparedHsn === referenceHsn && (!bothHaveSpecificItemCodes || itemCodeOverlap > 0 || hasDescriptionAnchor)) {
        hasStrongAnchor = true;
      }
    }
    if (comparedBaseQuantity !== null && referenceBaseQuantity !== null && nearlyEqual(comparedBaseQuantity, referenceBaseQuantity)) {
      score += 2;
    }
    if (comparedLineTotal !== null && referenceLineTotal !== null && nearlyEqual(comparedLineTotal, referenceLineTotal)) {
      score += 2;
      if (!bothHaveSpecificItemCodes || itemCodeOverlap > 0 || hasDescriptionAnchor) {
        hasStrongAnchor = true;
      }
    }
    score += tokenOverlapScore(comparedLine, referenceLine);
    if (tokenOverlap >= 2 && (!bothHaveSpecificItemCodes || itemCodeOverlap > 0)) hasStrongAnchor = true;
    if (comparedDescription && referenceDescription && hasDescriptionAnchor) {
      score += 3;
      hasStrongAnchor = true;
    }

    if (!best || score > best.score) {
      best = { line: referenceLine, score, hasStrongAnchor };
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
  referenceDoc: CaseDoc,
  comparedDoc: CaseDoc,
  referenceLine: CommercialLineItem | null,
  comparedLine: CommercialLineItem,
  index: number,
  detail: string,
  referenceDetail = detail,
  comparedDetail = detail
): Omit<Mismatch, "analysis" | "fixPlan"> {
  return {
    id: `line-mismatch-${field}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field,
    values: [
      {
        docId: referenceDoc.id,
        value: referenceLine ? `${lineLabel(referenceLine, index)}: ${referenceDetail}` : `No matching ${referenceDoc.type} line`,
      },
      {
        docId: comparedDoc.id,
        value: `${lineLabel(comparedLine, index)}: ${comparedDetail}`,
      },
    ],
  };
}

function getLineItemDocPriority(doc: CaseDoc) {
  return LINE_ITEM_REFERENCE_PRIORITY[doc.type] ?? 99;
}

function hasSharedLineItemReference(left: CaseDoc, right: CaseDoc) {
  return Boolean(
    areComparableValuesEqual(left.fields.eWayBillNumber, right.fields.eWayBillNumber) ||
      areComparableValuesEqual(left.fields.referencePoNumber, right.fields.poNumber) ||
      areComparableValuesEqual(left.fields.poNumber, right.fields.referencePoNumber) ||
      areComparableValuesEqual(left.fields.referenceInvoiceNumber, right.fields.invoiceNumber) ||
      areComparableValuesEqual(left.fields.invoiceNumber, right.fields.referenceInvoiceNumber)
  );
}

function getBestCandidateDoc(
  comparedDoc: CaseDoc,
  candidateDocs: CaseDoc[],
  predicate: (doc: CaseDoc) => boolean
) {
  const candidates = candidateDocs.filter(predicate);
  if (!candidates.length) return null;

  return [...candidates].sort((left, right) => {
    const leftShared = hasSharedLineItemReference(comparedDoc, left) ? 0 : 1;
    const rightShared = hasSharedLineItemReference(comparedDoc, right) ? 0 : 1;
    if (leftShared !== rightShared) return leftShared - rightShared;

    const priorityDelta = getLineItemDocPriority(left) - getLineItemDocPriority(right);
    if (priorityDelta !== 0) return priorityDelta;

    return (right.lineItems?.length ?? 0) - (left.lineItems?.length ?? 0);
  })[0];
}

function getLineItemReferenceDoc(comparedDoc: CaseDoc, docsWithLineItems: CaseDoc[]) {
  const candidateDocs = docsWithLineItems.filter((doc) => doc.id !== comparedDoc.id);
  if (!candidateDocs.length) return null;

  if (INVOICE_DOC_TYPES.has(comparedDoc.type)) {
    return (
      getBestCandidateDoc(comparedDoc, candidateDocs, (doc) => PURCHASE_DOC_TYPES.has(doc.type)) ??
      getBestCandidateDoc(comparedDoc, candidateDocs, (doc) => !INVOICE_DOC_TYPES.has(doc.type))
    );
  }

  if (!PURCHASE_DOC_TYPES.has(comparedDoc.type)) {
    const invoiceDoc = getBestCandidateDoc(comparedDoc, candidateDocs, (doc) => INVOICE_DOC_TYPES.has(doc.type));
    if (invoiceDoc) return invoiceDoc;
  }

  const purchaseDoc = getBestCandidateDoc(comparedDoc, candidateDocs, (doc) => PURCHASE_DOC_TYPES.has(doc.type));
  if (purchaseDoc && !PURCHASE_DOC_TYPES.has(comparedDoc.type)) return purchaseDoc;

  return getBestCandidateDoc(comparedDoc, candidateDocs, () => true);
}

function formatLineDocRole(doc: CaseDoc) {
  if (PURCHASE_DOC_TYPES.has(doc.type)) return "PO";
  if (INVOICE_DOC_TYPES.has(doc.type)) return "invoice";
  return doc.type;
}

function compactLineField(value?: string) {
  return compactText(value);
}

function getComparableLineAmountValue(line: CommercialLineItem) {
  return line.taxableAmount ?? line.lineTotal;
}

function verifyCommercialLineItems(docs: CaseDoc[]): Omit<Mismatch, "analysis" | "fixPlan">[] {
  const docsWithLineItems = docs.filter((doc) => doc.lineItems?.length);
  const mismatches: Omit<Mismatch, "analysis" | "fixPlan">[] = [];

  if (docsWithLineItems.length < 2) {
    return mismatches;
  }

  const baselineDoc = [...docsWithLineItems].sort((left, right) => {
    const priorityDelta = getLineItemDocPriority(left) - getLineItemDocPriority(right);
    if (priorityDelta !== 0) return priorityDelta;
    return (right.lineItems?.length ?? 0) - (left.lineItems?.length ?? 0);
  })[0];

  for (const comparedDoc of docsWithLineItems) {
    if (comparedDoc.id === baselineDoc.id) continue;

    const referenceDoc = getLineItemReferenceDoc(comparedDoc, docsWithLineItems);
    if (!referenceDoc) continue;

    const referenceLines = referenceDoc.lineItems ?? [];
    const referenceRole = formatLineDocRole(referenceDoc);
    const comparedRole = formatLineDocRole(comparedDoc);

    for (const [index, comparedLine] of (comparedDoc.lineItems ?? []).entries()) {
      const referenceLine = findBestReferenceLine(comparedLine, referenceLines);
      if (!referenceLine) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.unmatchedDocumentLine",
            referenceDoc,
            comparedDoc,
            null,
            comparedLine,
            index,
            `${comparedRole} line has no confident ${referenceRole} line match`
          )
        );
        continue;
      }

      const comparedQty = parseNumber(comparedLine.quantity);
      const referenceQty = parseNumber(referenceLine.quantity);
      const comparedBaseQty = convertQuantityToBase(comparedLine.quantity, comparedLine.unit) ?? comparedQty;
      const referenceBaseQty = convertQuantityToBase(referenceLine.quantity, referenceLine.unit) ?? referenceQty;
      if (
        comparedBaseQty !== null &&
        referenceBaseQty !== null &&
        PURCHASE_DOC_TYPES.has(referenceDoc.type) &&
        !PURCHASE_DOC_TYPES.has(comparedDoc.type) &&
        comparedBaseQty > referenceBaseQty * 1.01
      ) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.quantityExceeded",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} quantity ${comparedLine.quantity} exceeds ${referenceRole} quantity ${referenceLine.quantity}`,
            `${referenceRole} quantity ${referenceLine.quantity}`,
            `${comparedRole} quantity ${comparedLine.quantity}`
          )
        );
      } else if (
        comparedBaseQty !== null &&
        referenceBaseQty !== null &&
        !PURCHASE_DOC_TYPES.has(referenceDoc.type) &&
        !nearlyEqual(comparedBaseQty, referenceBaseQty)
      ) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.quantityMismatch",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} quantity ${comparedLine.quantity} differs from ${referenceRole} quantity ${referenceLine.quantity}`,
            `${referenceRole} quantity ${referenceLine.quantity}`,
            `${comparedRole} quantity ${comparedLine.quantity}`
          )
        );
      }

      const comparedRateValue = comparedLine.rate ?? comparedLine.netRate;
      const referenceRateValue = referenceLine.rate ?? referenceLine.netRate;
      const comparedRate = convertRateToBase(comparedRateValue, comparedLine.unit) ?? parseNumber(comparedRateValue);
      const referenceRate = convertRateToBase(referenceRateValue, referenceLine.unit) ?? parseNumber(referenceRateValue);
      if (!nearlyEqual(comparedRate, referenceRate)) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.rateMismatch",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} rate ${comparedRateValue} differs from ${referenceRole} rate ${referenceRateValue}`,
            `${referenceRole} rate ${referenceRateValue}`,
            `${comparedRole} rate ${comparedRateValue}`
          )
        );
      }

      const comparedUnit = normalizeUnit(comparedLine.unit);
      const referenceUnit = normalizeUnit(referenceLine.unit);
      if (comparedUnit && referenceUnit && !areUnitsCompatible(comparedUnit, referenceUnit)) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.unitMismatch",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} unit ${comparedLine.unit} differs from ${referenceRole} unit ${referenceLine.unit}`,
            `${referenceRole} unit ${referenceLine.unit}`,
            `${comparedRole} unit ${comparedLine.unit}`
          )
        );
      }

      const comparedHsnSac = compactLineField(comparedLine.hsnSac);
      const referenceHsnSac = compactLineField(referenceLine.hsnSac);
      if (comparedHsnSac && referenceHsnSac && comparedHsnSac !== referenceHsnSac) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.hsnSacMismatch",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} HSN/SAC ${comparedLine.hsnSac} differs from ${referenceRole} HSN/SAC ${referenceLine.hsnSac}`,
            `${referenceRole} HSN/SAC ${referenceLine.hsnSac}`,
            `${comparedRole} HSN/SAC ${comparedLine.hsnSac}`
          )
        );
      }

      const comparedLineAmountValue = getComparableLineAmountValue(comparedLine);
      const referenceLineAmountValue = getComparableLineAmountValue(referenceLine);
      const comparedLineAmount = parseNumber(comparedLineAmountValue);
      const referenceLineAmount = parseNumber(referenceLineAmountValue);
      const shouldCompareLineAmount =
        !PURCHASE_DOC_TYPES.has(referenceDoc.type) ||
        comparedBaseQty === null ||
        referenceBaseQty === null ||
        nearlyEqual(comparedBaseQty, referenceBaseQty);
      if (shouldCompareLineAmount && !nearlyEqual(comparedLineAmount, referenceLineAmount)) {
        mismatches.push(
          buildLineMismatch(
            "lineItems.amountMismatch",
            referenceDoc,
            comparedDoc,
            referenceLine,
            comparedLine,
            index,
            `${comparedRole} line amount ${comparedLineAmountValue} differs from ${referenceRole} line amount ${referenceLineAmountValue}`,
            `${referenceRole} line amount ${referenceLineAmountValue}`,
            `${comparedRole} line amount ${comparedLineAmountValue}`
          )
        );
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
