import type { CaseDoc, CommercialLineItem, DocType, FieldKey } from "@/types/pipeline";

export const LINE_ITEMS_FIELD_KEY = "__lineItems";

const COMMERCIAL_DOC_TYPES = new Set<DocType>([
  "Purchase Order",
  "Amended Purchase Order",
  "Invoice",
  "Tax Invoice",
  "Delivery Note",
  "Delivery Challan",
  "E-Way Bill",
  "Lorry Receipt",
  "Weighment Slip",
  "Material Test Certificate",
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

type TextLineItemKey = Exclude<keyof CommercialLineItem, "sourcePage">;
type TaxRateKey = "cgstRate" | "sgstRate" | "igstRate" | "taxRate";
type TaxRateHint = Partial<Record<TaxRateKey, string>>;

const TEXT_LINE_ITEM_KEYS = LINE_ITEM_KEYS.filter(
  (key): key is TextLineItemKey => key !== "sourcePage"
);
const LINE_ITEM_SIGNATURE_KEYS: TextLineItemKey[] = [
  "lineNumber",
  "itemCode",
  "description",
  "hsnSac",
  "quantity",
  "unit",
  "rate",
  "netRate",
  "taxableAmount",
  "lineTotal",
  "referencePoLineNumber",
];
const LOOSE_LINE_ITEM_SIGNATURE_KEYS = LINE_ITEM_SIGNATURE_KEYS.filter(
  (key) => key !== "lineNumber" && key !== "referencePoLineNumber"
);
const TAX_RATE_KEYS: TaxRateKey[] = ["cgstRate", "sgstRate", "igstRate", "taxRate"];
const DUPLICATE_COPY_PAGE_SIMILARITY_THRESHOLD = 0.88;
const DUPLICATE_COPY_MIN_COMMON_TOKENS = 35;
const INVOICE_COPY_DOC_TYPES = new Set<string>(["Invoice", "Tax Invoice"]);
const INVOICE_DOC_TYPES = new Set<string>(["Invoice", "Tax Invoice"]);
const CHARGE_LINE_PATTERN =
  /\b(?:packing|p\s*&\s*f|p\s+and\s+f|freight|cartage|loading|unloading|handling|forwarding|insurance|transport(?:ation)?|courier|postage|delivery|other\s+charges?|round\s*off)\b/i;
const EXPLICIT_TAX_LABEL_PATTERN = /\b(?:cgst|sgst|igst|gst|tax)\b/i;
const MONEY_AMOUNT_PATTERN = /(?:^|[^\dA-Z])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+\.\d{2})(?![\dA-Z])/gi;

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

function cleanItemCode(value?: string) {
  if (!value) return undefined;
  const cleaned = cleanWhitespace(value)
    .replace(/^[&|,;:/\\-]+/, "")
    .replace(/[&|,;:/\\-]+$/, "")
    .trim();
  return cleaned || undefined;
}

function compactIdentifier(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

function deriveItemCodeFromRawDescription(item: CommercialLineItem, description?: string) {
  if (item.itemCode || !description) return undefined;

  const rawDescription = descriptionFromRawText(item.rawText, item.lineNumber, item.hsnSac);
  if (!rawDescription) return undefined;

  const normalizedDescription = cleanWhitespace(description);
  const normalizedRawDescription = cleanWhitespace(rawDescription);
  if (!normalizedRawDescription.toLowerCase().startsWith(normalizedDescription.toLowerCase())) {
    return undefined;
  }

  const suffix = cleanWhitespace(normalizedRawDescription.slice(normalizedDescription.length));
  if (!suffix || !/[a-z0-9]/i.test(suffix)) return undefined;
  return suffix;
}

function cleanLineItem(item: CommercialLineItem) {
  const next = { ...item };
  const itemCode = cleanItemCode(next.itemCode);
  if (itemCode) {
    next.itemCode = itemCode;
  } else {
    delete next.itemCode;
  }

  const hsnSac = extractHsnSac(next.hsnSac, next.rawText);
  if (hsnSac) {
    next.hsnSac = hsnSac;
  }

  if (next.itemCode && next.hsnSac && compactIdentifier(next.itemCode) === compactIdentifier(next.hsnSac)) {
    delete next.itemCode;
  }

  const description = cleanLineItemDescription(next);
  if (description) {
    next.description = description;
  } else {
    delete next.description;
  }

  const derivedItemCode = deriveItemCodeFromRawDescription(next, next.description);
  if (derivedItemCode) {
    next.itemCode = derivedItemCode;
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

function hasLineItemTextValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function parseLineItemNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!hasLineItemTextValue(value)) return null;

  const raw = String(value).replace(/,/g, "").trim();
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDocumentAmount(
  documentFields: Partial<Record<FieldKey, string>> | undefined,
  key: FieldKey
) {
  return parseLineItemNumber(documentFields?.[key]);
}

function formatLineItemNumber(value: number) {
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4).replace(/\.?0+$/, "");
}

function normalizeRateValue(value: unknown) {
  const parsed = parseLineItemNumber(value);
  if (parsed === null || parsed < 0 || parsed > 50) return undefined;
  return formatLineItemNumber(parsed);
}

function normalizeSignatureValue(key: TextLineItemKey, value: unknown) {
  if (!hasLineItemTextValue(value)) return "";
  if (
    key === "quantity" ||
    key === "rate" ||
    key === "netRate" ||
    key === "taxableAmount" ||
    key === "lineTotal"
  ) {
    const parsed = parseLineItemNumber(value);
    return parsed === null ? "" : formatLineItemNumber(parsed);
  }

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeProductSignature(item: CommercialLineItem) {
  return [item.description, item.itemCode]
    .filter(hasLineItemTextValue)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildLineItemSignature(
  item: CommercialLineItem,
  keys: TextLineItemKey[] = LINE_ITEM_SIGNATURE_KEYS
) {
  const productSignature = normalizeProductSignature(item);
  const parts = keys.flatMap((key) => {
    if (key === "description" || key === "itemCode") return [];
    const normalized = normalizeSignatureValue(key, item[key]);
    return normalized ? [`${key}:${normalized}`] : [];
  });

  if (productSignature) {
    parts.unshift(`product:${productSignature}`);
  }

  const hasIdentity = Boolean(item.itemCode || item.description || item.hsnSac);
  const hasCommercialValue = Boolean(
    item.quantity || item.rate || item.netRate || item.taxableAmount || item.lineTotal
  );
  if (!hasIdentity || !hasCommercialValue || parts.length < 2) return null;

  return parts.join("|");
}

function normalizeDuplicateCopyPageTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(
        /\b(?:original|duplicate|triplicate|quadruplicate|copy|customer|buyer|seller|supplier|recipient|transporter|office|extra|for)\b/g,
        " "
      )
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1)
  );
}

function tokenSetSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return { score: 0, common: 0 };

  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }

  const union = left.size + right.size - common;
  return {
    score: union > 0 ? common / union : 0,
    common,
  };
}

function findDuplicateCopyPageNumbers(visibleTextPages: string[]) {
  const duplicates = new Set<number>();
  const pageTokens = visibleTextPages.map(normalizeDuplicateCopyPageTokens);

  for (let index = 0; index < pageTokens.length; index += 1) {
    const current = pageTokens[index];
    if (current.size < DUPLICATE_COPY_MIN_COMMON_TOKENS) continue;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = pageTokens[previousIndex];
      if (previous.size < DUPLICATE_COPY_MIN_COMMON_TOKENS) continue;

      const similarity = tokenSetSimilarity(current, previous);
      if (
        similarity.common >= DUPLICATE_COPY_MIN_COMMON_TOKENS &&
        similarity.score >= DUPLICATE_COPY_PAGE_SIMILARITY_THRESHOLD
      ) {
        duplicates.add(index + 1);
        break;
      }
    }
  }

  return duplicates;
}

function mergeLineItems(primary: CommercialLineItem, fallback: CommercialLineItem) {
  const next = { ...primary };

  for (const key of TEXT_LINE_ITEM_KEYS) {
    if (!hasLineItemTextValue(next[key]) && hasLineItemTextValue(fallback[key])) {
      next[key] = fallback[key];
    }
  }

  if (!next.rawText && fallback.rawText) {
    next.rawText = fallback.rawText;
  }

  return next;
}

function dedupeDuplicateCopyLineItems(
  lineItems: CommercialLineItem[],
  duplicatePageNumbers: Set<number>
) {
  if (lineItems.length < 2) return lineItems;

  const result: CommercialLineItem[] = [];
  const strictIndexBySignature = new Map<string, number>();
  const looseIndexBySignature = new Map<string, number>();

  for (const item of lineItems) {
    const strictSignature = buildLineItemSignature(item);
    const looseSignature = buildLineItemSignature(item, LOOSE_LINE_ITEM_SIGNATURE_KEYS);
    const sourcePage = item.sourcePage;
    const isFromDuplicateCopy = Boolean(sourcePage && duplicatePageNumbers.has(sourcePage));
    const looseMatchIndex = looseSignature ? looseIndexBySignature.get(looseSignature) : undefined;
    const strictMatchIndex = strictSignature ? strictIndexBySignature.get(strictSignature) : undefined;
    const strictMatch = strictMatchIndex === undefined ? undefined : result[strictMatchIndex];
    const canUseStrictMatch = Boolean(
      strictMatch &&
        (hasLineItemTextValue(item.lineNumber) ||
          (sourcePage && strictMatch.sourcePage && sourcePage !== strictMatch.sourcePage))
    );
    const duplicateMatchIndex =
      isFromDuplicateCopy && looseMatchIndex !== undefined
        ? looseMatchIndex
        : canUseStrictMatch
          ? strictMatchIndex
          : undefined;

    if (duplicateMatchIndex !== undefined) {
      result[duplicateMatchIndex] = mergeLineItems(result[duplicateMatchIndex], item);
      continue;
    }

    const nextIndex = result.push(item) - 1;
    if (strictSignature) strictIndexBySignature.set(strictSignature, nextIndex);
    if (looseSignature && !looseIndexBySignature.has(looseSignature)) {
      looseIndexBySignature.set(looseSignature, nextIndex);
    }
  }

  return result;
}

function isValidTaxRate(key: TaxRateKey, rate: number) {
  const maxRate = key === "taxRate" ? 28 : 50;
  return Number.isFinite(rate) && rate >= 0 && rate <= maxRate;
}

function setTaxRate(
  item: CommercialLineItem,
  key: TaxRateKey,
  rate: number | null | undefined,
  options?: { correctInconsistent?: boolean }
) {
  if (rate === null || rate === undefined || !isValidTaxRate(key, rate)) {
    return false;
  }

  const existing = parseLineItemNumber(item[key]);
  if (
    hasLineItemTextValue(item[key]) &&
    (!options?.correctInconsistent || existing === null || Math.abs(existing - rate) <= 0.25)
  ) {
    return false;
  }

  item[key] = formatLineItemNumber(rate);
  return true;
}

function getExistingRate(item: CommercialLineItem, key: TaxRateKey) {
  return normalizeRateValue(item[key]);
}

function fillComputedTaxRates(item: CommercialLineItem) {
  const next = { ...item };
  const taxableAmount = parseLineItemNumber(next.taxableAmount);
  if (taxableAmount === null || taxableAmount <= 0) {
    const cgstRate = parseLineItemNumber(getExistingRate(next, "cgstRate"));
    const sgstRate = parseLineItemNumber(getExistingRate(next, "sgstRate"));
    const igstRate = parseLineItemNumber(getExistingRate(next, "igstRate"));
    if (!next.taxRate && (igstRate !== null || cgstRate !== null || sgstRate !== null)) {
      next.taxRate = formatLineItemNumber(igstRate ?? (cgstRate ?? 0) + (sgstRate ?? 0));
    }
    return next;
  }

  const cgstAmount = parseLineItemNumber(next.cgstAmount);
  const sgstAmount = parseLineItemNumber(next.sgstAmount);
  const igstAmount = parseLineItemNumber(next.igstAmount);
  const taxAmount = parseLineItemNumber(next.taxAmount);
  const lineTotal = parseLineItemNumber(next.lineTotal);

  setTaxRate(next, "cgstRate", cgstAmount === null ? null : (cgstAmount / taxableAmount) * 100, {
    correctInconsistent: true,
  });
  setTaxRate(next, "sgstRate", sgstAmount === null ? null : (sgstAmount / taxableAmount) * 100, {
    correctInconsistent: true,
  });
  setTaxRate(next, "igstRate", igstAmount === null ? null : (igstAmount / taxableAmount) * 100, {
    correctInconsistent: true,
  });

  const cgstRate = parseLineItemNumber(getExistingRate(next, "cgstRate"));
  const sgstRate = parseLineItemNumber(getExistingRate(next, "sgstRate"));
  const igstRate = parseLineItemNumber(getExistingRate(next, "igstRate"));
  const computedTotalRate =
    igstRate !== null
      ? igstRate
      : cgstRate !== null || sgstRate !== null
        ? (cgstRate ?? 0) + (sgstRate ?? 0)
        : taxAmount !== null
          ? (taxAmount / taxableAmount) * 100
          : lineTotal !== null && lineTotal > taxableAmount
            ? ((lineTotal - taxableAmount) / taxableAmount) * 100
            : null;

  setTaxRate(next, "taxRate", computedTotalRate, { correctInconsistent: true });

  return next;
}

function mergeTaxRateHint(hints: Map<string, TaxRateHint>, hsn: string, hint: TaxRateHint) {
  if (Object.keys(hint).length) {
    hints.set(hsn, { ...(hints.get(hsn) ?? {}), ...hint });
  }
}

function extractLinePercentages(line: string) {
  return [...line.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50);
}

function extractTargetHsnCodes(line: string, targetHsns: Set<string>) {
  return [...line.matchAll(/\b\d{4,8}\b/g)]
    .map((match) => match[0])
    .filter((code) => targetHsns.has(code));
}

function buildTaxableAmountsByHsn(lineItems: CommercialLineItem[]) {
  const amountsByHsn = new Map<string, number[]>();
  for (const item of lineItems) {
    const hsn = extractHsnSac(item.hsnSac, item.rawText);
    if (!hsn) continue;

    const amount = parseLineItemNumber(item.taxableAmount) ?? parseLineItemNumber(item.lineTotal);
    if (amount === null || amount <= 0) continue;

    const amounts = amountsByHsn.get(hsn) ?? [];
    amounts.push(amount);
    amountsByHsn.set(hsn, amounts);
  }
  return amountsByHsn;
}

function taxSummaryAmountMatchesHsn(amount: number, hsn: string, taxableAmountsByHsn: Map<string, number[]>) {
  const amounts = taxableAmountsByHsn.get(hsn);
  if (!amounts?.length) return true;

  const tolerance = Math.max(0.5, amount * 0.002);
  if (amounts.some((expected) => amountsNearlyEqual(amount, expected, tolerance))) {
    return true;
  }

  const aggregateAmount = amounts.reduce((sum, value) => sum + value, 0);
  return amounts.length > 1 && amountsNearlyEqual(amount, aggregateAmount, Math.max(0.5, aggregateAmount * 0.002));
}

type TaxSummaryRateRow = {
  amount: number;
  percentages: number[];
  lineIndex: number;
};

function collectTaxSummaryRateRows(lines: string[], startIndex: number, count: number): TaxSummaryRateRow[] {
  const rows: TaxSummaryRateRow[] = [];
  const endIndex = Math.min(lines.length, startIndex + 60);

  for (let index = startIndex; index < endIndex; index += 1) {
    const percentages = extractLinePercentages(lines[index]);
    if (!percentages.length) continue;

    const amount = extractMoneyAmounts(lines[index])[0];
    if (amount === undefined) continue;

    rows.push({ amount, percentages, lineIndex: index });
    if (rows.length >= count) break;
  }

  return rows.length >= count ? rows.slice(0, count) : [];
}

function collectHsnColumnRuns(lines: string[], targetHsns: Set<string>) {
  const runs: Array<{ codes: string[]; endIndex: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const codes = extractTargetHsnCodes(lines[index], targetHsns);
    if (!codes.length) continue;

    const runCodes: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const lineCodes = extractTargetHsnCodes(lines[cursor], targetHsns);
      if (!lineCodes.length) break;
      runCodes.push(...lineCodes);
      cursor += 1;
    }

    if (runCodes.length >= 2) {
      runs.push({ codes: runCodes, endIndex: cursor });
    }
    index = Math.max(index, cursor - 1);
  }

  return runs;
}

function buildColumnarTaxHint(
  firstRate: number,
  secondRate: number | undefined,
  taxMode: "igst" | "split" | "unknown"
): TaxRateHint {
  const hint: TaxRateHint = {};

  if (taxMode === "igst") {
    if (isValidTaxRate("igstRate", firstRate)) {
      hint.igstRate = formatLineItemNumber(firstRate);
      hint.taxRate = formatLineItemNumber(firstRate);
    }
    return hint;
  }

  if (taxMode === "split") {
    if (secondRate === undefined) return hint;

    const totalRate = firstRate + secondRate;
    if (
      isValidTaxRate("cgstRate", firstRate) &&
      isValidTaxRate("sgstRate", secondRate) &&
      isValidTaxRate("taxRate", totalRate)
    ) {
      hint.cgstRate = formatLineItemNumber(firstRate);
      hint.sgstRate = formatLineItemNumber(secondRate);
      hint.taxRate = formatLineItemNumber(totalRate);
    }
    return hint;
  }

  if (secondRate !== undefined) {
    const totalRate = firstRate + secondRate;
    if (isValidTaxRate("taxRate", totalRate)) {
      hint.cgstRate = formatLineItemNumber(firstRate);
      hint.sgstRate = formatLineItemNumber(secondRate);
      hint.taxRate = formatLineItemNumber(totalRate);
    }
    return hint;
  }

  if (isValidTaxRate("taxRate", firstRate)) {
    hint.taxRate = formatLineItemNumber(firstRate);
  }
  return hint;
}

function extractColumnarTaxSummaryHints(
  lines: string[],
  lineItems: CommercialLineItem[],
  taxMode: "igst" | "split" | "unknown"
) {
  const targetHsns = new Set(
    lineItems.flatMap((item) => {
      const hsn = extractHsnSac(item.hsnSac, item.rawText);
      return hsn ? [hsn] : [];
    })
  );
  const hints = new Map<string, TaxRateHint>();
  if (!targetHsns.size) return hints;

  const taxableAmountsByHsn = buildTaxableAmountsByHsn(lineItems);
  for (const run of collectHsnColumnRuns(lines, targetHsns)) {
    const codes = run.codes;
    const firstRows = collectTaxSummaryRateRows(lines, run.endIndex, codes.length);
    if (!firstRows.length) continue;

    const validatedRows = firstRows.filter((row, index) =>
      taxSummaryAmountMatchesHsn(row.amount, codes[index], taxableAmountsByHsn)
    );
    if (validatedRows.length < codes.length) continue;

    const secondRows = collectTaxSummaryRateRows(lines, firstRows[firstRows.length - 1].lineIndex + 1, codes.length);
    for (let index = 0; index < codes.length; index += 1) {
      const firstRate = firstRows[index].percentages[0];
      if (firstRate === undefined) continue;

      const secondRate =
        firstRows[index].percentages.length >= 2
          ? firstRows[index].percentages[1]
          : secondRows[index]?.percentages[0];
      mergeTaxRateHint(hints, codes[index], buildColumnarTaxHint(firstRate, secondRate, taxMode));
    }
  }

  return hints;
}

function extractTaxRateHintsFromVisibleText(visibleText: string, lineItems: CommercialLineItem[]) {
  const hints = new Map<string, TaxRateHint>();
  const lines = visibleText
    .split(/\r?\n/)
    .map(cleanWhitespace)
    .filter(Boolean);
  const taxMode = getDocumentTaxMode(visibleText);

  for (const line of lines) {
    const hsn = line.match(/\b\d{4,8}\b/)?.[0];
    if (!hsn || !/\b(?:hsn|sac|gst|cgst|sgst|igst|tax)\b|%/i.test(line)) continue;

    const hint: Partial<Record<TaxRateKey, string>> = {};
    const cgst = extractLabelledTaxRate(line, "cgst");
    const sgst = extractLabelledTaxRate(line, "sgst");
    const igst = extractLabelledTaxRate(line, "igst");
    const gst = line.match(/\b(?:gst|tax)\s*(?:rate)?\b[^\d%]{0,20}(\d{1,2}(?:\.\d+)?)\s*%/i)?.[1];

    if (cgst) hint.cgstRate = formatLineItemNumber(Number(cgst));
    if (sgst) hint.sgstRate = formatLineItemNumber(Number(sgst));
    if (igst) hint.igstRate = formatLineItemNumber(Number(igst));
    if (gst) hint.taxRate = formatLineItemNumber(Number(gst));

    if (!Object.keys(hint).length && !(CHARGE_LINE_PATTERN.test(line) && !EXPLICIT_TAX_LABEL_PATTERN.test(line))) {
      const percentages = extractLinePercentages(line);
      if (percentages.length === 1) {
        hint.taxRate = formatLineItemNumber(percentages[0]);
      } else if (percentages.length >= 2) {
        hint.cgstRate = formatLineItemNumber(percentages[0]);
        hint.sgstRate = formatLineItemNumber(percentages[1]);
        hint.taxRate = formatLineItemNumber(percentages[0] + percentages[1]);
      }
    }

    mergeTaxRateHint(hints, hsn, hint);
  }

  for (const [hsn, hint] of extractColumnarTaxSummaryHints(lines, lineItems, taxMode)) {
    mergeTaxRateHint(hints, hsn, hint);
  }

  return hints;
}

function extractMoneyAmounts(value?: string) {
  if (!value) return [];

  return [...value.matchAll(MONEY_AMOUNT_PATTERN)]
    .map((match) => parseLineItemNumber(match[1]))
    .filter((amount): amount is number => amount !== null && amount >= 0);
}

function getLineItemContext(item: CommercialLineItem) {
  return [item.description, item.rawText].filter(Boolean).join(" ");
}

function hasExplicitTaxLabel(value: string) {
  return EXPLICIT_TAX_LABEL_PATTERN.test(value);
}

function isChargeLine(item: CommercialLineItem) {
  return CHARGE_LINE_PATTERN.test(getLineItemContext(item));
}

function normalizeChargeLineAmounts(item: CommercialLineItem) {
  if (!isChargeLine(item)) return item;

  const context = getLineItemContext(item);
  const amounts = extractMoneyAmounts(item.rawText ?? context);
  const amount = amounts.at(-1);
  if (amount === undefined) return item;

  const next = { ...item };
  const formattedAmount = formatLineItemNumber(amount);
  next.taxableAmount = formattedAmount;
  next.lineTotal = formattedAmount;

  if (!hasExplicitTaxLabel(context)) {
    const taxAmount = parseLineItemNumber(next.taxAmount);
    if (taxAmount !== null && Math.abs(taxAmount - amount) <= Math.max(1, amount * 0.01)) {
      delete next.taxAmount;
    }

    const percentages = [...context.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
    const chargePercentages = new Set(percentages.map((value) => formatLineItemNumber(value)));
    for (const key of TAX_RATE_KEYS) {
      const rate = normalizeRateValue(next[key]);
      if (rate && chargePercentages.has(rate)) {
        delete next[key];
      }
    }
  }

  return next;
}

function fillMissingTaxableAmountFromLineTotal(item: CommercialLineItem) {
  if (hasLineItemTextValue(item.taxableAmount)) return item;

  const lineTotal = parseLineItemNumber(item.lineTotal);
  if (lineTotal === null || lineTotal <= 0) return item;

  const hasLineTaxAmount = Boolean(item.taxAmount || item.cgstAmount || item.sgstAmount || item.igstAmount);
  if (hasLineTaxAmount) return item;

  return { ...item, taxableAmount: formatLineItemNumber(lineTotal) };
}

function getLineCommercialAmount(item: CommercialLineItem) {
  return parseLineItemNumber(item.taxableAmount) ?? parseLineItemNumber(item.lineTotal);
}

function amountsNearlyEqual(left: number, right: number, tolerance = 0.5) {
  return Math.abs(left - right) <= tolerance;
}

function reconcileInvoiceChargeResiduals(
  lineItems: CommercialLineItem[],
  documentFields: Partial<Record<FieldKey, string>> | undefined
) {
  const subtotal = getDocumentAmount(documentFields, "subtotal");
  if (subtotal === null || subtotal <= 0) return lineItems;

  const chargeIndexes = lineItems.flatMap((item, index) => (isChargeLine(item) ? [index] : []));
  if (chargeIndexes.length !== 1) return lineItems;

  const chargeIndex = chargeIndexes[0];
  const nonChargeSum = lineItems.reduce((sum, item, index) => {
    if (index === chargeIndex) return sum;
    return sum + (getLineCommercialAmount(item) ?? 0);
  }, 0);
  const residual = subtotal - nonChargeSum;
  if (residual <= 0.5 || residual > subtotal) return lineItems;

  const current = getLineCommercialAmount(lineItems[chargeIndex]);
  if (
    current !== null &&
    current <= residual * 1.5 &&
    !amountsNearlyEqual(current, nonChargeSum) &&
    !amountsNearlyEqual(current, subtotal)
  ) {
    return lineItems;
  }

  return lineItems.map((item, index) => {
    if (index !== chargeIndex) return item;
    const formattedResidual = formatLineItemNumber(residual);
    const next = { ...item, taxableAmount: formattedResidual, lineTotal: formattedResidual };
    const taxAmount = parseLineItemNumber(next.taxAmount);
    if (taxAmount !== null && amountsNearlyEqual(taxAmount, residual)) {
      delete next.taxAmount;
    }
    return next;
  });
}

function inferDocumentTaxRate(documentFields: Partial<Record<FieldKey, string>> | undefined) {
  const subtotal = getDocumentAmount(documentFields, "subtotal");
  let taxAmount = getDocumentAmount(documentFields, "taxAmount");
  const totalAmount = getDocumentAmount(documentFields, "totalAmount");

  let taxableBase = subtotal;
  if ((taxAmount === null || taxAmount <= 0) && subtotal !== null && totalAmount !== null && totalAmount > subtotal) {
    taxAmount = totalAmount - subtotal;
  }
  if ((taxableBase === null || taxableBase <= 0) && taxAmount !== null && totalAmount !== null && totalAmount > taxAmount) {
    taxableBase = totalAmount - taxAmount;
  }
  if (taxableBase === null || taxableBase <= 0 || taxAmount === null || taxAmount <= 0) {
    return null;
  }

  const rate = (taxAmount / taxableBase) * 100;
  return isValidTaxRate("taxRate", rate) ? rate : null;
}

function getDocumentTaxMode(visibleText: string) {
  const hasIgst = /\bigst\b/i.test(visibleText);
  const hasCgst = /\bcgst\b/i.test(visibleText);
  const hasSgst = /\bsgst\b/i.test(visibleText);

  if (hasIgst && !hasCgst && !hasSgst) return "igst";
  if (hasCgst && hasSgst) return "split";
  return "unknown";
}

function fillDocumentTaxRates(
  item: CommercialLineItem,
  documentTaxRate: number | null,
  taxMode: "igst" | "split" | "unknown"
) {
  if (documentTaxRate === null) return item;

  const next = { ...item };
  const taxableAmount = parseLineItemNumber(next.taxableAmount);
  if (taxableAmount === null || taxableAmount <= 0) return next;

  if (!hasLineItemTextValue(next.taxRate)) {
    setTaxRate(next, "taxRate", documentTaxRate);
  }

  if (taxMode === "igst" && !hasLineItemTextValue(next.igstRate)) {
    setTaxRate(next, "igstRate", documentTaxRate);
  } else if (taxMode === "split") {
    if (!hasLineItemTextValue(next.cgstRate)) {
      setTaxRate(next, "cgstRate", documentTaxRate / 2);
    }
    if (!hasLineItemTextValue(next.sgstRate)) {
      setTaxRate(next, "sgstRate", documentTaxRate / 2);
    }
  }

  return next;
}

function fillVisibleTextTaxRates(lineItems: CommercialLineItem[], visibleText: string) {
  if (!visibleText.trim()) return lineItems;

  const hints = extractTaxRateHintsFromVisibleText(visibleText, lineItems);
  if (!hints.size) return lineItems;

  return lineItems.map((item) => {
    const hsn = extractHsnSac(item.hsnSac, item.rawText);
    const hint = hsn ? hints.get(hsn) : undefined;
    if (!hint) return item;

    const next = { ...item };
    for (const key of TAX_RATE_KEYS) {
      const rate = normalizeRateValue(hint[key]);
      if (rate && !hasLineItemTextValue(next[key])) {
        next[key] = rate;
      }
    }
    return next;
  });
}

function extractLabelledTaxRate(line: string, label: "cgst" | "sgst" | "igst") {
  const percentMatch = line.match(new RegExp(`\\b${label}\\b[^\\d%]{0,20}(\\d{1,2}(?:\\.\\d+)?)\\s*%`, "i"))?.[1];
  if (percentMatch) return percentMatch;

  return line.match(new RegExp(`\\b${label}\\s*rate\\b[^\\d%]{0,20}(\\d{1,2}(?:\\.\\d+)?)\\s*%?`, "i"))?.[1];
}

export function normalizeExtractedCommercialLineItems(params: {
  docType: string;
  lineItems: CommercialLineItem[];
  visibleTextPages?: string[];
  documentFields?: Partial<Record<FieldKey, string>>;
}) {
  if (!isCommercialDocType(params.docType) || params.lineItems.length === 0) {
    return params.lineItems;
  }

  const visibleTextPages = params.visibleTextPages ?? [];
  const duplicatePageNumbers = INVOICE_COPY_DOC_TYPES.has(params.docType)
    ? findDuplicateCopyPageNumbers(visibleTextPages)
    : new Set<number>();
  const deduped = dedupeDuplicateCopyLineItems(params.lineItems, duplicatePageNumbers);
  const visibleText = visibleTextPages.join("\n");
  const withInvoiceAmounts = INVOICE_DOC_TYPES.has(params.docType)
    ? reconcileInvoiceChargeResiduals(
        deduped.map(normalizeChargeLineAmounts).map(fillMissingTaxableAmountFromLineTotal),
        params.documentFields
      )
    : deduped;
  const withVisibleTextRates = fillVisibleTextTaxRates(withInvoiceAmounts, visibleText);
  const documentTaxRate = INVOICE_DOC_TYPES.has(params.docType)
    ? inferDocumentTaxRate(params.documentFields)
    : null;
  const taxMode = getDocumentTaxMode(visibleText);

  return withVisibleTextRates
    .map((item) => fillDocumentTaxRates(item, documentTaxRate, taxMode))
    .map(fillComputedTaxRates);
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
