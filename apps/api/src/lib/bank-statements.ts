import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { callOpenRouter, getQualityExtractionModel, getQualityExtractionReasoning } from "@/lib/processing/openrouter";

export const BANK_STATEMENT_BUCKET = "bank-statement-files";
const execFileAsync = promisify(execFile);
const BANK_STATEMENT_AI_MAX_PAGES = Number(process.env.BANK_STATEMENT_AI_MAX_PAGES ?? 8);
const BANK_STATEMENT_PDF_RENDER_DPI = Number(process.env.BANK_STATEMENT_PDF_RENDER_DPI ?? 170);
const BANK_STATEMENT_PROVIDER_IMAGE_TARGET_BYTES = Number(
  process.env.BANK_STATEMENT_PROVIDER_IMAGE_TARGET_BYTES ?? 8 * 1024 * 1024
);
const BANK_STATEMENT_PROVIDER_IMAGE_HARD_LIMIT_BYTES = Number(
  process.env.BANK_STATEMENT_PROVIDER_IMAGE_HARD_LIMIT_BYTES ?? 20 * 1024 * 1024
);
const BANK_STATEMENT_PROVIDER_IMAGE_MAX_DIMENSION = Number(
  process.env.BANK_STATEMENT_PROVIDER_IMAGE_MAX_DIMENSION ?? 3200
);

export type BankAccountInput = {
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  ifscCode?: string | null;
};

export type ParsedBankTransaction = {
  transactionDate: string;
  valueDate?: string | null;
  description: string;
  referenceNumber?: string | null;
  debitAmount?: number | null;
  creditAmount?: number | null;
  balanceAmount?: number | null;
  transactionType?: string;
  category?: string;
  counterpartyName?: string | null;
  suggestedLedgerName?: string | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  confirmedLedgerName?: string | null;
  additionalCharges?: Array<Record<string, unknown>>;
  confidence?: number | null;
  rawPayload?: Record<string, unknown>;
};

export type ParsedBankStatement = {
  account: {
    bankName: string | null;
    accountNumber: string | null;
    accountHolderName: string | null;
    ifscCode: string | null;
  };
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  transactions: ParsedBankTransaction[];
};

export type BankStatementExtractionResult = ParsedBankStatement & {
  extractionSource: "csv_text_v1" | "openrouter_bank_statement_v1" | "manual_review_required_v1";
  extractionError?: string | null;
};

export type BankAccountRow = {
  id: string;
  bank_name: string | null;
  account_number_normalized: string;
  account_number_masked: string;
  account_holder_name: string | null;
  ifsc_code: string | null;
  tally_ledger_name: string | null;
  last_imported_transaction_at: string | null;
  last_tally_posted_transaction_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeAccountNumber(value?: string | null) {
  return String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function maskAccountNumber(value?: string | null) {
  const normalized = normalizeAccountNumber(value);
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function normalizeName(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIfscCode(value?: string | null) {
  const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return normalized.slice(0, 16);
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}

export function normalizeNarrationPattern(value?: string | null) {
  return normalizeName(value)
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b[a-z]{2,}\d+[a-z0-9]*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCounterpartyName(description?: string | null) {
  const raw = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const patterns = [
    /\b(?:neft|rtgs|imps)\s+(?:receipt\s+)?from\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\b(?:neft|rtgs|imps)\s+(?:payment\s+)?to\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\b(?:neft|rtgs|imps)\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\bupi\s+(?:payment\s+)?to\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
    /\bupi\s+(?:receipt\s+)?from\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
    /\bupi\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
    /\bby\s+transfer\s+from\s+(.+?)(?:\s+(?:ref|reference|on)\b|$)/i,
    /\bto\s+transfer\s+to\s+(.+?)(?:\s+(?:ref|reference|on)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = match?.[1]
      ?.replace(/[^a-zA-Z0-9 .&'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (candidate && normalizeName(candidate).length >= 3) return titleCaseName(candidate);
  }

  return null;
}

export function parseAmount(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[(),₹$€£\s]/g, "").replace(/^-/, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

export function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const indian = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (indian) {
    const [, day, month, yearRaw] = indian;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function textCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectTransactionType(description: string) {
  const text = description.toLowerCase();
  if (/\bupi\b/.test(text)) return "upi";
  if (/\bneft\b/.test(text)) return "neft";
  if (/\brtgs\b/.test(text)) return "rtgs";
  if (/\bimps\b/.test(text)) return "imps";
  if (/\bcheque|chq\b/.test(text)) return "cheque";
  if (/\bcash\b/.test(text)) return "cash";
  if (/\bcharge|charges|fee|gst\b/.test(text)) return "bank_charge";
  if (/\binterest\b/.test(text)) return "interest";
  return "unknown";
}

function detectCategory(description: string, debitAmount: number | null, creditAmount: number | null) {
  const text = description.toLowerCase();
  if (/\bcharge|charges|fee|gst\b/.test(text)) return "bank_charges";
  if (/\btax|tds|gst\b/.test(text)) return "tax";
  if (/\bsalary|wages\b/.test(text)) return "salary";
  if (/\bloan|emi\b/.test(text)) return "loan_or_emi";
  if (/\bself|own account|internal transfer|transfer to own\b/.test(text)) return "internal_transfer";
  if ((creditAmount ?? 0) > 0) return "receipt";
  if ((debitAmount ?? 0) > 0) return "payment";
  return "unknown";
}

function detectDebitCreditMarker(row: Record<string, string>) {
  const marker = readColumn(row, [
    "dr cr",
    "dr/cr",
    "debit credit",
    "debit/credit",
    "transaction type",
    "type",
  ]).toLowerCase();
  if (/\bdr\b|debit|withdrawal|paid\s*out/.test(marker)) return "debit";
  if (/\bcr\b|credit|deposit|paid\s*in/.test(marker)) return "credit";
  return "";
}

function splitSignedAmount(row: Record<string, string>) {
  const amount = parseAmount(readColumn(row, ["amount", "transaction amount", "txn amount"]));
  if (amount === null) return { debitAmount: null, creditAmount: null };

  const marker = detectDebitCreditMarker(row);
  if (marker === "debit") return { debitAmount: Math.abs(amount), creditAmount: null };
  if (marker === "credit") return { debitAmount: null, creditAmount: Math.abs(amount) };
  if (amount < 0) return { debitAmount: Math.abs(amount), creditAmount: null };
  return { debitAmount: null, creditAmount: amount };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const jsonString = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

function readColumn(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = Object.entries(row).find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) return match[1];
  }
  return "";
}

function parseCsvTransactions(text: string): ParsedBankTransaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const normalized = splitCsvLine(line).map(normalizeHeader);
    return (
      normalized.some((value) => ["date", "transactiondate", "txndate", "postingdate", "valuedate"].includes(value)) &&
      normalized.some((value) => ["description", "narration", "particulars", "remarks"].includes(value))
    );
  });

  if (headerIndex < 0) return [];

  const headers = splitCsvLine(lines[headerIndex]);
  return lines.slice(headerIndex + 1).flatMap((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const transactionDate = parseDate(
      readColumn(row, ["transactionDate", "date", "txn date", "posting date"])
    );
    const description = textCell(
      readColumn(row, ["description", "narration", "particulars", "remarks", "transaction remarks"])
    );
    if (!transactionDate || !description) return [];

    const splitAmount = splitSignedAmount(row);
    const debitAmount =
      parseAmount(readColumn(row, ["debit", "withdrawal", "withdrawals", "paid out", "dr"])) ??
      splitAmount.debitAmount;
    const creditAmount =
      parseAmount(readColumn(row, ["credit", "deposit", "deposits", "paid in", "cr"])) ??
      splitAmount.creditAmount;
    const balanceAmount = parseAmount(readColumn(row, ["balance", "closing balance", "running balance"]));
    const transactionType = detectTransactionType(description);
    const category = detectCategory(description, debitAmount, creditAmount);
    const counterpartyName = extractCounterpartyName(description);

    return [
      {
        transactionDate,
        valueDate: parseDate(readColumn(row, ["valueDate", "value date"])) ?? transactionDate,
        description,
        referenceNumber: textCell(readColumn(row, ["reference", "ref", "utr", "cheque no", "instrument no"])) || null,
        debitAmount,
        creditAmount,
        balanceAmount,
        transactionType,
        category,
        counterpartyName,
        additionalCharges: transactionType === "bank_charge" ? [{ type: "bank_charge", amount: debitAmount }] : [],
        confidence: 0.72,
        rawPayload: { rowNumber: headerIndex + index + 2, row },
      },
    ];
  });
}

function extractFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function parseBankStatementText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const accountNumber = extractFirst(compact, [
    /account\s*(?:no|number)\s*[:\-]?\s*([A-Z0-9X* -]{6,32})/i,
    /a\/c\s*(?:no|number)?\s*[:\-]?\s*([A-Z0-9X* -]{6,32})/i,
  ]);
  const accountHolderName = extractFirst(compact, [
    /account\s*(?:holder|name)\s*[:\-]?\s*([A-Z][A-Z0-9 .&'-]{2,80})/i,
    /customer\s*name\s*[:\-]?\s*([A-Z][A-Z0-9 .&'-]{2,80})/i,
  ]);
  const bankName = extractFirst(compact, [
    /\b([A-Z][A-Z &]{2,40}\s+BANK)\b/i,
    /bank\s*name\s*[:\-]?\s*([A-Z][A-Z0-9 .&'-]{2,80})/i,
  ]);
  const ifscCode = extractFirst(compact, [
    /\bifsc\s*(?:code)?\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})\b/i,
    /\b([A-Z]{4}0[A-Z0-9]{6})\b/i,
  ]);
  const period = compact.match(/(?:statement\s*)?period\s*[:\-]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);

  return {
    account: {
      bankName: bankName || null,
      accountNumber: accountNumber || null,
      accountHolderName: accountHolderName || null,
      ifscCode: normalizeIfscCode(ifscCode) || null,
    },
    statementPeriodStart: parseDate(period?.[1]) ?? null,
    statementPeriodEnd: parseDate(period?.[2]) ?? null,
    transactions: parseCsvTransactions(text),
  };
}

function emptyParsedBankStatement(): ParsedBankStatement {
  return {
    account: { bankName: null, accountNumber: null, accountHolderName: null, ifscCode: null },
    statementPeriodStart: null,
    statementPeriodEnd: null,
    transactions: [],
  };
}

function normalizeImageMimeType(mimeType: string) {
  const lower = mimeType.toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (lower.startsWith("image/")) return lower;
  return "image/jpeg";
}

function isProviderSafeImageMimeType(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(normalizeImageMimeType(mimeType));
}

function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function renderedPageNumber(fileName: string) {
  const match = fileName.match(/-(\d+)\.png$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function imageBytesToProviderDataUrl(data: Uint8Array, mimeType: string, label: string) {
  const normalizedMimeType = normalizeImageMimeType(mimeType);
  const input = Buffer.from(data);
  if (input.byteLength <= BANK_STATEMENT_PROVIDER_IMAGE_TARGET_BYTES && isProviderSafeImageMimeType(normalizedMimeType)) {
    return bufferToDataUrl(input, normalizedMimeType);
  }

  let smallest: Buffer | null = null;
  let lastError: unknown = null;
  for (const dimension of [BANK_STATEMENT_PROVIDER_IMAGE_MAX_DIMENSION, 2800, 2400, 2000, 1600, 1200]) {
    for (const quality of [86, 80, 74, 68, 62, 56]) {
      try {
        const output = await sharp(input, { failOn: "none" })
          .rotate()
          .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality, progressive: true, force: true })
          .toBuffer();
        if (!smallest || output.byteLength < smallest.byteLength) smallest = output;
        if (output.byteLength <= BANK_STATEMENT_PROVIDER_IMAGE_TARGET_BYTES) {
          return bufferToDataUrl(output, "image/jpeg");
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (smallest && smallest.byteLength <= BANK_STATEMENT_PROVIDER_IMAGE_HARD_LIMIT_BYTES) {
    return bufferToDataUrl(smallest, "image/jpeg");
  }
  if (input.byteLength <= BANK_STATEMENT_PROVIDER_IMAGE_HARD_LIMIT_BYTES && isProviderSafeImageMimeType(normalizedMimeType)) {
    return bufferToDataUrl(input, normalizedMimeType);
  }

  const reason = lastError instanceof Error ? lastError.message : "image remained above provider limit";
  throw new Error(`Unable to prepare "${label}" for bank statement extraction: ${reason}`);
}

async function renderBankStatementPdfToImages(data: Uint8Array, sourceName: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-statement-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    fs.writeFileSync(inputPath, Buffer.from(data));
    await execFileAsync("pdftoppm", [
      "-r",
      String(BANK_STATEMENT_PDF_RENDER_DPI),
      "-png",
      "-f",
      "1",
      "-l",
      String(BANK_STATEMENT_AI_MAX_PAGES),
      inputPath,
      outputPrefix,
    ]);

    const pageFileNames = fs
      .readdirSync(tmpDir)
      .filter((fileName) => fileName.startsWith("page-") && fileName.endsWith(".png"))
      .sort((left, right) => renderedPageNumber(left) - renderedPageNumber(right));

    const images: string[] = [];
    for (const fileName of pageFileNames) {
      const bytes = fs.readFileSync(path.join(tmpDir, fileName));
      images.push(await imageBytesToProviderDataUrl(bytes, "image/png", `${sourceName} ${fileName}`));
    }
    return images;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function normalizeAiTransaction(value: unknown, rowNumber: number): ParsedBankTransaction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const transactionDate = parseDate(row.transactionDate ?? row.date ?? row.txnDate ?? row.postingDate);
  const description = textCell(row.description ?? row.narration ?? row.particulars ?? row.remarks);
  if (!transactionDate || !description) return null;

  const debitAmount = parseAmount(row.debitAmount ?? row.debit ?? row.withdrawal ?? row.paidOut);
  const creditAmount = parseAmount(row.creditAmount ?? row.credit ?? row.deposit ?? row.paidIn);
  const balanceAmount = parseAmount(row.balanceAmount ?? row.balance ?? row.runningBalance ?? row.closingBalance);
  const transactionType = textCell(row.transactionType) || detectTransactionType(description);
  const category = textCell(row.category) || detectCategory(description, debitAmount, creditAmount);
  const counterpartyName = textCell(row.counterpartyName) || extractCounterpartyName(description);

  return {
    transactionDate,
    valueDate: parseDate(row.valueDate) ?? transactionDate,
    description,
    referenceNumber: textCell(row.referenceNumber ?? row.reference ?? row.utr ?? row.chequeNumber) || null,
    debitAmount,
    creditAmount,
    balanceAmount,
    transactionType,
    category,
    counterpartyName,
    additionalCharges: transactionType === "bank_charge" ? [{ type: "bank_charge", amount: debitAmount }] : [],
    confidence:
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : 0.78,
    rawPayload: { rowNumber, source: "openrouter_bank_statement_v1", row },
  };
}

function normalizeAiBankStatement(value: unknown): ParsedBankStatement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyParsedBankStatement();
  const parsed = value as Record<string, unknown>;
  const account = parsed.account && typeof parsed.account === "object" && !Array.isArray(parsed.account)
    ? (parsed.account as Record<string, unknown>)
    : parsed;
  const transactions = Array.isArray(parsed.transactions)
    ? parsed.transactions.flatMap((row, index) => {
        const transaction = normalizeAiTransaction(row, index + 1);
        return transaction ? [transaction] : [];
      })
    : [];

  return {
    account: {
      bankName: textCell(account.bankName ?? parsed.bankName) || null,
      accountNumber: textCell(account.accountNumber ?? parsed.accountNumber) || null,
      accountHolderName: textCell(account.accountHolderName ?? account.accountName ?? parsed.accountHolderName) || null,
      ifscCode: normalizeIfscCode(textCell(account.ifscCode ?? parsed.ifscCode)) || null,
    },
    statementPeriodStart: parseDate(parsed.statementPeriodStart) ?? parseDate(parsed.periodStart),
    statementPeriodEnd: parseDate(parsed.statementPeriodEnd) ?? parseDate(parsed.periodEnd),
    transactions,
  };
}

async function extractBankStatementFromImages(params: {
  fileName: string;
  images: string[];
  textHint?: string;
}): Promise<ParsedBankStatement> {
  if (params.images.length === 0) return emptyParsedBankStatement();

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content:
          "Extract bank statement account details and transaction rows. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
          "account must include bankName, accountNumber, accountHolderName, and ifscCode when visible. Dates must be ISO YYYY-MM-DD. " +
          "Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, and confidence. " +
          "Use numbers for amounts, with debit and credit as positive values in their own columns. Do not invent rows. Preserve narration text exactly enough for audit matching. " +
          "If a page contains only summary information and no ledger rows, extract account/period only and leave transactions empty.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Extract bank statement data from ${params.fileName}. ` +
              (params.textHint ? `Embedded text hint:\n${params.textHint.slice(0, 12000)}` : ""),
          },
          ...params.images.map((image) => ({ type: "image_url" as const, image_url: { url: image } })),
        ],
      },
    ],
    {
      expectJson: true,
      jsonMode: true,
      model: getQualityExtractionModel(),
      reasoning: getQualityExtractionReasoning(),
    }
  );

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

export async function extractBankStatementFile(params: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): Promise<BankStatementExtractionResult> {
  const mimeType = params.mimeType ?? "";
  const canReadAsText =
    mimeType.includes("csv") ||
    mimeType.startsWith("text/") ||
    /\.(csv|txt)$/i.test(params.fileName || "");

  if (canReadAsText) {
    const parsed = parseBankStatementText(new TextDecoder("utf-8", { fatal: false }).decode(params.bytes));
    return { ...parsed, extractionSource: "csv_text_v1", extractionError: null };
  }

  try {
    const images = mimeType.includes("pdf") || /\.pdf$/i.test(params.fileName)
      ? await renderBankStatementPdfToImages(params.bytes, params.fileName)
      : mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(params.fileName)
        ? [await imageBytesToProviderDataUrl(params.bytes, mimeType || "image/jpeg", params.fileName)]
        : [];
    const parsed = await extractBankStatementFromImages({ fileName: params.fileName, images });
    return { ...parsed, extractionSource: "openrouter_bank_statement_v1", extractionError: null };
  } catch (error) {
    return {
      ...emptyParsedBankStatement(),
      extractionSource: "manual_review_required_v1",
      extractionError: error instanceof Error ? error.message : String(error ?? "Bank statement extraction failed"),
    };
  }
}

export function buildTransactionFingerprint(accountId: string, transaction: ParsedBankTransaction) {
  const parts = [
    accountId,
    transaction.transactionDate,
    transaction.valueDate ?? "",
    transaction.referenceNumber ?? "",
    transaction.description.toLowerCase().replace(/\s+/g, " ").trim(),
    transaction.debitAmount ?? "",
    transaction.creditAmount ?? "",
    transaction.balanceAmount ?? "",
  ];

  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function serializeAccount(row: BankAccountRow) {
  return {
    id: row.id,
    bankName: row.bank_name,
    accountNumberMasked: row.account_number_masked,
    accountHolderName: row.account_holder_name,
    ifscCode: row.ifsc_code,
    tallyLedgerName: row.tally_ledger_name,
    lastImportedTransactionAt: row.last_imported_transaction_at,
    lastTallyPostedTransactionAt: row.last_tally_posted_transaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findBankAccountCandidates(
  supabase: SupabaseClient,
  ownerUserId: string,
  account: BankAccountInput
) {
  const normalizedAccountNumber = normalizeAccountNumber(account.accountNumber);
  if (normalizedAccountNumber) {
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("account_number_normalized", normalizedAccountNumber)
      .limit(5);
    if (error) throw error;
    if ((data ?? []).length > 0) return data as BankAccountRow[];
  }

  const normalizedHolder = normalizeName(account.accountHolderName);
  if (!normalizedHolder) return [];

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .ilike("account_holder_name", `%${normalizedHolder.split(" ").join("%")}%`)
    .limit(10);

  if (error) throw error;
  return (data ?? []) as BankAccountRow[];
}

export function resolveImportStatus(candidateCount: number) {
  if (candidateCount > 1) return "needs_account_selection";
  return "ready_to_confirm";
}

export function buildStoragePath(ownerUserId: string, fileName: string) {
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "bank-statement";
  return `${ownerUserId}/bank-statements/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${cleanName}`;
}
