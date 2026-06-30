import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const WORKER_NAME = process.env.WORKER_NAME || `worker-${process.pid}`;
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const RAW_APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);
const APP_BASE_URL = RAW_APP_BASE_URL?.replace(/\/+$/, "");
const HEROKU_ROUTER_TIMEOUT_GRACE_MS = Number(process.env.HEROKU_ROUTER_TIMEOUT_GRACE_MS ?? 29_000);
const WORKER_STALE_RUNNING_JOB_MS = Number(process.env.WORKER_STALE_RUNNING_JOB_MS ?? 20 * 60_000);
const WORKER_STALE_RUNNING_JOB_INTERVAL = `${Math.max(1, Math.round(WORKER_STALE_RUNNING_JOB_MS / 60_000))} minutes`;
const WORKER_IN_FLIGHT_WAIT_MS = Number(process.env.WORKER_IN_FLIGHT_WAIT_MS ?? 2 * 60_000);
const WORKER_IN_FLIGHT_POLL_MS = Number(process.env.WORKER_IN_FLIGHT_POLL_MS ?? 5_000);
const BANK_STATEMENT_TALLY_SYNC_ON_ANALYZE = process.env.BANK_STATEMENT_TALLY_SYNC_ON_ANALYZE !== "false";
const BANK_STATEMENT_TALLY_SYNC_WAIT_MS = Number(process.env.BANK_STATEMENT_TALLY_SYNC_WAIT_MS ?? 45_000);
const BANK_STATEMENT_TALLY_SYNC_POLL_MS = Number(process.env.BANK_STATEMENT_TALLY_SYNC_POLL_MS ?? 1_500);
const BANK_STATEMENT_AI_MAX_PAGES = Number(process.env.BANK_STATEMENT_AI_MAX_PAGES ?? 8);
const BANK_STATEMENT_SINGLE_SHOT_MAX_PAGES = Number(
  process.env.BANK_STATEMENT_SINGLE_SHOT_MAX_PAGES ?? BANK_STATEMENT_AI_MAX_PAGES
);
const BANK_STATEMENT_MAX_TOTAL_PAGES = Number(process.env.BANK_STATEMENT_MAX_TOTAL_PAGES ?? 1000);
const BANK_STATEMENT_BATCH_PAGE_SIZE = Math.max(1, Number(process.env.BANK_STATEMENT_BATCH_PAGE_SIZE ?? 2));
const BANK_STATEMENT_BATCH_CONCURRENCY = Math.max(1, Number(process.env.BANK_STATEMENT_BATCH_CONCURRENCY ?? 3));
const BANK_STATEMENT_BATCH_RETRY_LIMIT = Math.max(0, Number(process.env.BANK_STATEMENT_BATCH_RETRY_LIMIT ?? 2));
const BANK_STATEMENT_PDF_TEXT_CONCURRENCY = Math.max(
  1,
  Number(process.env.BANK_STATEMENT_PDF_TEXT_CONCURRENCY ?? 6)
);
const BANK_STATEMENT_SINGLE_PAGE_RECOVERY_LIMIT = Math.max(
  0,
  Number(process.env.BANK_STATEMENT_SINGLE_PAGE_RECOVERY_LIMIT ?? 50)
);
const BANK_STATEMENT_TEXT_PROMPT_MAX_CHARS = Number(process.env.BANK_STATEMENT_TEXT_PROMPT_MAX_CHARS ?? 80_000);
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
const BANK_STATEMENT_BUCKET = "bank-statement-files";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_QUALITY_MODEL ||
  process.env.GEMINI_THINKING_MODEL ||
  "google/gemini-2.5-flash";
const OPENROUTER_LEDGER_MATCH_MODEL =
  process.env.OPENROUTER_LEDGER_MATCH_MODEL ||
  OPENROUTER_MODEL;
const OPENROUTER_MAX_RETRIES = Number(process.env.OPENROUTER_MAX_RETRIES ?? 2);
const OPENROUTER_RETRY_BASE_MS = Number(process.env.OPENROUTER_RETRY_BASE_MS ?? 1200);
const OPENROUTER_MAX_OUTPUT_TOKENS = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 8192);
const OPENROUTER_QUALITY_REASONING_TOKENS = Number(process.env.OPENROUTER_QUALITY_REASONING_TOKENS ?? 2000);
const execFileAsync = promisify(execFile);
const WORKER_IDLE_LOG_INTERVAL_MS = Number(process.env.WORKER_IDLE_LOG_INTERVAL_MS ?? 30_000);

function resolvePdfJsWorkerSrc() {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.resolve(process.cwd(), "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ];

  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existingPath) {
    throw new Error("Unable to locate pdfjs-dist worker file in node_modules.");
  }

  return pathToFileURL(existingPath).href;
}

const PDFJS_WORKER_SRC = resolvePdfJsWorkerSrc();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase environment variables are missing for the worker.");
}

if (!WORKER_SECRET) {
  throw new Error("WORKER_SECRET is required for the worker.");
}

if (!APP_BASE_URL) {
  throw new Error("APP_BASE_URL is required for the worker.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class JobMayStillBeRunningError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobMayStillBeRunningError";
  }
}

function isTerminalJobStatus(status) {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

function formatError(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "Unknown error");
}

function diagnosticError(error) {
  return formatError(error).slice(0, 500);
}

async function runWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeImageMimeType(mimeType) {
  const lower = String(mimeType || "").toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (lower.startsWith("image/")) return lower;
  return "image/jpeg";
}

function isProviderSafeImageMimeType(mimeType) {
  return ["image/jpeg", "image/png", "image/webp"].includes(normalizeImageMimeType(mimeType));
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function renderedPageNumber(fileName) {
  const match = fileName.match(/-(\d+)\.png$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function textLineKey(y) {
  return String(Math.round(Number(y || 0) / 2) * 2);
}

function reconstructPdfTextLines(items) {
  const lines = new Map();
  for (const item of items) {
    const text = String(item?.str ?? "").trim();
    const transform = Array.isArray(item?.transform) ? item.transform : [];
    if (!text || transform.length < 6) continue;
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);
    const key = textLineKey(y);
    const entries = lines.get(key) ?? [];
    entries.push({ x, text });
    lines.set(key, entries);
  }

  return [...lines.entries()]
    .sort((left, right) => Number(right[0]) - Number(left[0]))
    .map(([, entries]) =>
      entries
        .sort((left, right) => left.x - right.x)
        .map((entry) => entry.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

async function extractBankStatementPdfTextPages(data, options = {}) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if ("GlobalWorkerOptions" in pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }

  const pdf = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true,
    verbosity: pdfjsLib.VerbosityLevel?.ERRORS,
  }).promise;
  const maxPages = Number.isFinite(options.maxPages) ? options.maxPages : BANK_STATEMENT_MAX_TOTAL_PAGES;
  const pageCount = Math.min(pdf.numPages, Math.max(1, maxPages));
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = await runWithConcurrency(pageNumbers, BANK_STATEMENT_PDF_TEXT_CONCURRENCY, async (pageNumber) => {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    return {
      pageNumber,
      text: reconstructPdfTextLines(textContent.items),
    };
  });

  return {
    pageCount: pdf.numPages,
    pages,
    truncated: pdf.numPages > pageCount,
  };
}

function hasUsableBankStatementText(pages) {
  const combined = pages
    .map((page) => (typeof page === "string" ? page : page?.text || ""))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  if (combined.length < 300) return false;
  return /\b(?:date|value date|description|narration|particulars)\b/i.test(combined) &&
    /\b(?:balance|deposit|withdrawal|debit|credit)\b/i.test(combined);
}

function formatBankStatementTextForAi(pages) {
  return pages
    .map((page, index) => {
      const pageNumber = typeof page === "object" && page ? page.pageNumber : index + 1;
      const text = typeof page === "string" ? page : page?.text;
      return `Page ${pageNumber}\n${text || "[No text extracted]"}`;
    })
    .join("\n\n---\n\n")
    .slice(0, BANK_STATEMENT_TEXT_PROMPT_MAX_CHARS);
}

function parseDate(value) {
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

function parseAmount(value) {
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

function textCell(value) {
  return String(value ?? "").trim();
}

function firstTextCell(...values) {
  for (const value of values) {
    const text = textCell(value);
    if (text) return text;
  }
  return "";
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseName(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");
}

const COUNTERPARTY_PREFIXES = new Set([
  "neft",
  "rtgs",
  "imps",
  "upi",
  "ach",
  "ecs",
  "nach",
  "cr",
  "dr",
  "credit",
  "debit",
  "from",
  "to",
  "by",
  "hdfc",
  "icici",
  "sbi",
  "axis",
  "kotak",
  "idfc",
  "indusind",
  "canara",
  "federal",
  "yes",
]);

function cleanCounterpartyCandidate(value) {
  let cleaned = String(value ?? "")
    .replace(/\b(?:utr|ref|reference|invoice|bill|chq|cheque|txn|transaction)\b[\s:#/-]*[a-z0-9-]+.*$/i, "")
    .replace(/[^a-zA-Z0-9 .&'/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (let index = 0; index < 5; index += 1) {
    const match = cleaned.match(/^([a-z0-9]+)(?:\s+|[-:/._]+)(.+)$/i);
    if (!match) break;
    const prefix = match[1].toLowerCase();
    if (!COUNTERPARTY_PREFIXES.has(prefix) && !/^\d{4,}$/.test(prefix)) break;
    cleaned = match[2].trim();
  }

  return cleaned
    .split(/\s*[/|]\s*/)[0]
    .replace(/[-:/._\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCounterpartyName(description) {
  const raw = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const patterns = [
    /\b(?:neft|rtgs|imps)\s+(?:receipt\s+)?from\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\b(?:neft|rtgs|imps)\s+(?:payment\s+)?to\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\b(?:neft|rtgs|imps)\s+(.+?)(?:\s+(?:utr|ref|reference|a\/c|ac|account|ifsc|on)\b|$)/i,
    /\bupi\s+(?:payment\s+)?to\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
    /\bupi\s+(?:receipt\s+)?from\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
    /\bupi\s+(.+?)(?:\s+(?:upi|ref|reference|txn|transaction|on)\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = cleanCounterpartyCandidate(match?.[1]);
    if (candidate && normalizeName(candidate).length >= 3) return titleCaseName(candidate);
  }
  return null;
}

function ledgerNameTokens(value) {
  return normalizeName(value)
    .replace(/\bmaha\s+raja\b/g, "maharaja")
    .replace(/\bmaha\s+raj\b/g, "maharaj")
    .replace(/\braja\s+guru\b/g, "rajaguru")
    .replace(/\braaj\s+guru\b/g, "rajaguru")
    .split(/\s+/)
    .map((token) => {
      if (!token) return "";
      if (["pvt", "private", "ltd", "limited", "llp", "inc"].includes(token)) return "";
      if (token === "shri" || token === "sri") return "shree";
      if (["ind", "industry", "industries", "industires", "indutries", "indstries"].includes(token)) return "industry";
      if (["supply", "supplies", "supplier", "suppliers"].includes(token)) return "supply";
      if (["enterprise", "enterprises", "enterprizes", "enterprize"].includes(token)) return "enterprise";
      if (["engr", "engrs", "engg", "engineer", "engineers", "engineering"].includes(token)) return "engineer";
      if (["mech", "mechanical"].includes(token)) return "mech";
      if (token === "co" || token === "company") return "company";
      if (token === "bharath" || token === "bharta" || token === "bhartha") return "bharat";
      if (token === "raajguru") return "rajaguru";
      return token;
    })
    .filter(Boolean);
}

function compactLedgerName(value) {
  return ledgerNameTokens(value).join("");
}

const GENERIC_PARTY_SUFFIX_TOKENS = new Set([
  "company",
  "enterprise",
  "firm",
  "group",
  "trader",
  "traders",
  "trading",
]);

function compactCoreLedgerName(value) {
  return ledgerNameTokens(value)
    .filter((token) => token.length > 1 && !GENERIC_PARTY_SUFFIX_TOKENS.has(token))
    .join("");
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function ledgerNameSimilarity(left, right) {
  const leftCompact = compactLedgerName(left);
  const rightCompact = compactLedgerName(right);
  if (!leftCompact || !rightCompact) return 0;
  if (leftCompact === rightCompact) return 1;
  const maxLength = Math.max(leftCompact.length, rightCompact.length);
  if (maxLength < 5) return 0;
  const editScore = 1 - levenshteinDistance(leftCompact, rightCompact) / maxLength;
  const substringScore =
    leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)
      ? 0.82 + (Math.min(leftCompact.length, rightCompact.length) / maxLength) * 0.1
      : 0;
  const leftCore = compactCoreLedgerName(left);
  const rightCore = compactCoreLedgerName(right);
  const coreMaxLength = Math.max(leftCore.length, rightCore.length);
  const coreScore =
    coreMaxLength >= 5 && leftCore && rightCore
      ? leftCore === rightCore
        ? 0.96
        : leftCore.includes(rightCore) || rightCore.includes(leftCore)
          ? 0.88 + (Math.min(leftCore.length, rightCore.length) / coreMaxLength) * 0.08
          : 1 - levenshteinDistance(leftCore, rightCore) / coreMaxLength
      : 0;
  const leftTokens = new Set(ledgerNameTokens(left));
  const rightTokens = new Set(ledgerNameTokens(right));
  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const total = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = total > 0 ? shared / total : 0;
  return Math.max(editScore, substringScore, coreScore, tokenScore);
}

function findUniqueCloseLedger(ledgers, candidateName) {
  if (!candidateName || compactLedgerName(candidateName).length < 5) return null;
  const matches = ledgers
    .map((ledger) => ({ ledger, score: ledgerNameSimilarity(candidateName, ledger.tally_name) }))
    .filter((match) => match.score >= 0.84)
    .sort((left, right) => right.score - left.score || left.ledger.tally_name.localeCompare(right.ledger.tally_name));
  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[0].score - matches[1].score < 0.04) return null;
  return matches[0];
}

function findDeterministicLedgerMatch(ledgers, transaction) {
  const candidateName = transaction.counterparty_name || extractCounterpartyName(transaction.description);
  if (!candidateName) return null;

  const exact = ledgers.find((ledger) => normalizeName(ledger.tally_name) === normalizeName(candidateName));
  if (exact) {
    return {
      ledgerName: exact.tally_name,
      confidence: 1,
      reason: "Matched exact synced Tally ledger name.",
      source: "deterministic_match",
      matchType: "direct_match",
      candidateLedgerNames: [],
    };
  }

  const close = findUniqueCloseLedger(ledgers, candidateName);
  if (!close || close.score < 0.9) return null;
  return {
    ledgerName: close.ledger.tally_name,
    confidence: close.score,
    reason: "Matched unique synced Tally ledger by normalized party name.",
    source: "deterministic_match",
    matchType: "direct_match",
    candidateLedgerNames: [],
  };
}

function detectTransactionType(description) {
  const text = String(description || "").toLowerCase();
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

function detectCategory(description, debitAmount, creditAmount) {
  const text = String(description || "").toLowerCase();
  if (/\bcharge|charges|fee|gst\b/.test(text)) return "bank_charges";
  if (/\btax|tds|gst\b/.test(text)) return "tax";
  if (/\bsalary|wages\b/.test(text)) return "salary";
  if (/\bloan|emi\b/.test(text)) return "loan_or_emi";
  if (/\bself|own account|internal transfer|transfer to own\b/.test(text)) return "internal_transfer";
  if ((creditAmount ?? 0) > 0) return "receipt";
  if ((debitAmount ?? 0) > 0) return "payment";
  return "unknown";
}

function safeJsonParse(raw, fallback) {
  try {
    const trimmed = String(raw || "").trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const jsonString = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

function normalizeIfscCode(value) {
  const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return normalized.slice(0, 16);
}

function normalizeAccountNumber(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function maskAccountNumber(value) {
  const normalized = normalizeAccountNumber(value);
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

async function imageBytesToProviderDataUrl(data, mimeType, label) {
  const normalizedMimeType = normalizeImageMimeType(mimeType);
  const input = Buffer.from(data);
  if (input.byteLength <= BANK_STATEMENT_PROVIDER_IMAGE_TARGET_BYTES && isProviderSafeImageMimeType(normalizedMimeType)) {
    return bufferToDataUrl(input, normalizedMimeType);
  }

  let smallest = null;
  let lastError = null;
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

async function renderBankStatementPdfToImages(data, sourceName, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-statement-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");
  const startPage = Math.max(1, Number(options.startPage ?? 1));
  const endPage = Math.max(startPage, Number(options.endPage ?? BANK_STATEMENT_AI_MAX_PAGES));

  try {
    fs.writeFileSync(inputPath, Buffer.from(data));
    await execFileAsync("pdftoppm", [
      "-r",
      String(BANK_STATEMENT_PDF_RENDER_DPI),
      "-png",
      "-f",
      String(startPage),
      "-l",
      String(endPage),
      inputPath,
      outputPrefix,
    ]);

    const pageFileNames = fs
      .readdirSync(tmpDir)
      .filter((fileName) => fileName.startsWith("page-") && fileName.endsWith(".png"))
      .sort((left, right) => renderedPageNumber(left) - renderedPageNumber(right));

    const images = [];
    for (const fileName of pageFileNames) {
      const bytes = fs.readFileSync(path.join(tmpDir, fileName));
      images.push(await imageBytesToProviderDataUrl(bytes, "image/png", `${sourceName} ${fileName}`));
    }
    return images;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function normalizeAiTransaction(value, rowNumber) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value;
  const transactionDate = parseDate(row.transactionDate ?? row.date ?? row.txnDate ?? row.postingDate);
  const description = firstTextCell(
    row.fullNarration,
    row["full narration"],
    row.bankNarration,
    row["bank narration"],
    row.transactionNarration,
    row["transaction narration"],
    row.description,
    row.narration,
    row.particulars,
    row.remarks,
    row.details,
    row.transactionDetails,
    row["transaction details"],
    row.transactionDescription,
    row["transaction description"],
    row.rawLine,
    row["raw line"]
  );
  if (!transactionDate || !description) return null;

  const debitAmount = parseAmount(row.debitAmount ?? row.debit ?? row.withdrawal ?? row.paidOut);
  const creditAmount = parseAmount(row.creditAmount ?? row.credit ?? row.deposit ?? row.paidIn);
  const balanceAmount = parseAmount(row.balanceAmount ?? row.balance ?? row.runningBalance ?? row.closingBalance);
  const transactionType = textCell(row.transactionType) || detectTransactionType(description);
  const category = textCell(row.category) || detectCategory(description, debitAmount, creditAmount);
  const cleanedCounterpartyName = cleanCounterpartyCandidate(row.counterpartyName);
  const counterpartyName =
    (cleanedCounterpartyName && normalizeName(cleanedCounterpartyName).length >= 3
      ? titleCaseName(cleanedCounterpartyName)
      : null) || extractCounterpartyName(description);

  return {
    row_index: rowNumber,
    transaction_date: transactionDate,
    value_date: parseDate(row.valueDate) ?? transactionDate,
    description,
    reference_number: textCell(row.referenceNumber ?? row.reference ?? row.utr ?? row.chequeNumber) || null,
    debit_amount: debitAmount,
    credit_amount: creditAmount,
    balance_amount: balanceAmount,
    transaction_type: transactionType,
    category,
    counterparty_name: counterpartyName,
    suggested_ledger_name: textCell(row.suggestedLedgerName) || null,
    suggestion_confidence:
      typeof row.suggestionConfidence === "number" && Number.isFinite(row.suggestionConfidence)
        ? Math.max(0, Math.min(1, row.suggestionConfidence))
        : null,
    suggestion_reason: textCell(row.suggestionReason) || null,
    confirmed_ledger_name: textCell(row.confirmedLedgerName) || null,
    additional_charges: transactionType === "bank_charge" ? [{ type: "bank_charge", amount: debitAmount }] : [],
    confidence:
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : 0.78,
    raw_payload: { rowNumber, source: "openrouter_bank_statement_v1", row },
  };
}

function normalizeAiBankStatement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      account: { bankName: null, accountNumber: null, accountHolderName: null, ifscCode: null },
      statementPeriodStart: null,
      statementPeriodEnd: null,
      transactions: [],
    };
  }
  const parsed = value;
  const account = parsed.account && typeof parsed.account === "object" && !Array.isArray(parsed.account)
    ? parsed.account
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

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isHardQuotaError(message) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("limit: 0") ||
    lower.includes("quota exceeded") ||
    lower.includes("billing") ||
    lower.includes("insufficient credits")
  );
}

async function callOpenRouterForBankStatement(messages, options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  let attempt = 0;
  let lastError = "OpenRouter request failed";
  while (attempt <= OPENROUTER_MAX_RETRIES) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3001",
          "X-Title": "Autodealer Workflow Bank Statement Worker",
        },
        body: JSON.stringify({
          model: options.model || OPENROUTER_MODEL,
          messages,
          temperature: 0,
          reasoning:
            Number.isFinite(OPENROUTER_QUALITY_REASONING_TOKENS) && OPENROUTER_QUALITY_REASONING_TOKENS > 0
              ? { max_tokens: OPENROUTER_QUALITY_REASONING_TOKENS, exclude: true }
              : undefined,
          response_format: { type: "json_object" },
          max_tokens:
            Number.isFinite(options.maxTokens) && options.maxTokens > 0
              ? Math.floor(options.maxTokens)
              : Number.isFinite(OPENROUTER_MAX_OUTPUT_TOKENS) && OPENROUTER_MAX_OUTPUT_TOKENS > 0
                ? Math.floor(OPENROUTER_MAX_OUTPUT_TOKENS)
              : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        const errorText =
          payload?.error?.message ||
          payload?.message ||
          (response.ok ? "OpenRouter returned an error payload" : `OpenRouter request failed (${response.status})`);
        lastError = errorText;
        if (!isRetryableStatus(response.status) || isHardQuotaError(errorText) || attempt === OPENROUTER_MAX_RETRIES) {
          throw new Error(errorText);
        }
        await sleep(OPENROUTER_RETRY_BASE_MS * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }

      const message = payload?.choices?.[0]?.message?.content;
      return Array.isArray(message) ? message.map((part) => part?.text || "").join("\n") : String(message || "");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "Unknown error");
      if (attempt === OPENROUTER_MAX_RETRIES) {
        throw new Error(lastError);
      }
      await sleep(OPENROUTER_RETRY_BASE_MS * Math.pow(2, attempt));
      attempt += 1;
    }
  }

  throw new Error(lastError);
}

function compactPromptJson(value) {
  return JSON.stringify(value, null, 2);
}

const LEDGER_MATCHING_SYSTEM_PROMPT = `
You match Indian bank statement transactions to synced Tally ledgers.
Your task is to recommend the correct existing Tally ledger for each bank transaction.
This is ledger assignment only. Do not attempt invoice matching, voucher matching, invoice settlement, split allocation, or full bank reconciliation.
Return only valid JSON. Do not return markdown, explanations outside JSON, or code fences.

Allowed ledgers:
- Choose only from the provided tallyLedgers list.
- Copy every selected ledger name exactly as provided.
- Never invent, modify, shorten, merge, or create a ledger.
- Never create a new party, expense, tax, bank, transfer, or suspense ledger.
- If no existing ledger is clearly correct, use suspense.
- Every transaction must produce exactly one result using its original index.

Output format:
Return this exact structure:
{"matches":[{"index":0,"matchType":"direct_match","action":"use_existing_ledger","ledgerName":"Exact Ledger Name From tallyLedgers","candidateLedgerNames":[],"confidence":0.95,"reason":"Short reason"}]}

Allowed matchType values: direct_match, close_match, suspense.

Direct match:
- Use direct_match only when exactly one existing ledger is clearly the best match.
- action must be "use_existing_ledger".
- ledgerName must be one exact name from tallyLedgers.
- candidateLedgerNames must be [].
- confidence must be at least 0.90.

Close match:
- Use close_match when two or more existing ledgers are genuinely plausible and no single ledger can be selected safely.
- action must be "use_suspense".
- ledgerName must be null.
- candidateLedgerNames must contain the exact competing ledger names from tallyLedgers.
- candidateLedgerNames must contain at least two names.
- Do not select one ledger merely because it appears first or looks slightly more similar.

Suspense:
- Use suspense when there is no clear existing ledger, the narration is too generic, or matching would require guessing.
- action must be "use_suspense".
- ledgerName must be null.
- candidateLedgerNames must be [].
- confidence must be 0.0.

Core rule:
A shortened, OCR-damaged, misspelled, or incomplete party name can still be a direct match when it uniquely identifies one existing ledger.
Do not call something a close match only because the bank narration does not exactly equal the ledger name.
Use close_match only when there is a real collision.

Step 1: Remove bank-system noise.
Before comparing names, ignore bank payment-rail and system words that do not identify the actual party or category, including NEFT, RTGS, IMPS, UPI, UPIREF, NACH, ACH, ECS, CMS, CR, DR, TRANSFER, FUND TRANSFER, PAYMENT, RECEIPT, UTR, RRN, TXN, REF, BENEFICIARY, TO, FROM, BY, A/C, ACCT, ACCOUNT, IFSC, BANK, BRANCH, MOBILE NUMBER, MASKED ACCOUNT NUMBER, REFERENCE NUMBER, M/S, MS, M S, transaction IDs, UTR numbers, RRN numbers, account numbers, dates, and similar bank references.
Do not treat these words or numbers as party names.
Use transaction direction, amount, and date only as supporting context when they are provided. Do not use them alone to guess a ledger.

Step 2: Normalize names carefully.
Ignore case, extra spaces, missing spaces, punctuation, dots, commas, brackets, hyphens, slashes, common separators, and legal-form suffixes such as Pvt Ltd, Private Limited, Ltd, Limited, LLP, Co, Company, and Inc.
Treat these as possible normal variants only when the full party root remains clearly the same: Bharat/Bharath/Bharth; Rajaguru/Raajguru/Raja Guru; Maharaja/Maharaj/Maha Raja/Maha Raaja; Shree/Shri/Sri; Steel/Steels; Enterprise/Enterprises/Enterprizes; Engg/Engineer/Engineers/Engineering; Transport/Transports/Transporter; Logistics/Logistic; Roadline/Roadlines; Electrical/Electricals; Fabrication/Fabricators.
Do not use phonetic similarity alone as proof. It can support a direct match only when one ledger remains clearly unique after collision checking.

Step 3: Preserve meaningful business descriptors.
Do not remove meaningful descriptors merely because they are common business words. These may differentiate completely different parties and must be considered: Steel, Metals, Alloys, Traders, Transport, Logistics, Roadlines, Engineering, Fabrication, Electricals, Chemicals, Hardware, Fuel, Power, Construction, Enterprises, Industries, Agencies, Services, Works.
Prefer the ledger with the closest matching full root and descriptor.
A named party ledger is preferred over a generic expense-category ledger when both are available.

Never confuse different party roots.
Do not match based only on one shared word, partial string, or loose phonetic resemblance. The following are different unless the narration provides clear additional evidence: Maharaja and Rajaguru; Maharaja and Mahavir; Bharat and Bharati; Rajaguru and Raja Traders; Sai Steel and Shree Sai Transport; Ganesh Enterprises and Ganesh Steel; Krishna Engineering and Krishna Transport; Vaishnavi Traders and Vaishnavi Steel Traders.
Examples: "MAHA RAJA ENGG" -> "Maharaja Engg"; "RAJAGURU" with ["Rajaguru Enterprises", "Raja Traders"] -> "Rajaguru Enterprises"; "RAJA" with ["Rajaguru Enterprises", "Raja Traders"] -> close_match or suspense.

Transaction types to consider include customer receipts, supplier payments, raw-material purchases, transport/freight/loading/unloading/logistics, contractor/fabrication/repair/machinery/maintenance/electrical, fuel/toll/travel/hotel/food/staff welfare, salaries/wages/incentives/advances/reimbursements/employee payments, utilities/rent/security/office expenses, GST/TDS/PF/ESIC/professional tax/income tax/customs duty/statutory payments, bank charges/interest/cheque return/cash-management charges/loan interest/CC interest/OD interest, insurance/loan/EMI/fixed-deposit/finance transactions, cash deposits/withdrawals/payment-gateway settlements/card settlements/reversals/transfers between company accounts.
Do not assume that every transaction is a customer or vendor payment.

Category and expense-ledger matching:
Select an expense, statutory, payroll, or bank-related ledger only when the narration explicitly supports that category and exactly one existing ledger clearly fits. Do not infer an expense category from a merchant name alone.

Employee, salary, and reimbursement transactions:
Match an employee-name ledger only when one existing employee ledger clearly matches the person. Do not map a person's name to Salary Expenses, Travelling Expenses, Staff Welfare Expenses, or Wages Expenses merely because the transaction may be related to that category. If narration says SALARY and names one employee, select that employee ledger only if it exists and is uniquely identifiable. If narration contains only a person's name and there is no uniquely matching employee ledger, use suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration. Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.

Cases that must go to suspense:
Use suspense when there is no identifiable party or category; narration contains only a UTR, RRN, account number, bank code, or reference number; the transaction could belong to multiple expense categories; a merchant name does not clearly reveal the expense purpose; the transaction appears to be a self-transfer or reversal but no explicit matching ledger exists; the best possible match is below 0.90; selecting a ledger would require guessing; or the transaction may need split allocation or voucher-level reconciliation.

Final decision rules:
1. Use direct_match when exactly one ledger is clearly best.
2. A unique shortened party name is a direct match when no competing ledger shares that root.
3. A typo, OCR issue, joined word, missing space, or phonetic variation can still be a direct match when one ledger clearly fits.
4. Use close_match only when two or more existing ledgers are genuinely plausible.
5. Use suspense when no clear ledger exists or matching requires guessing.
6. Never select a ledger when confidence is below 0.90.
7. Never invent, alter, or create a ledger.
8. Never guess between similar ledgers.
`.trim();

async function loadLocalTallyLedgers(connectionId, ownerUserId) {
  try {
    const storePath = path.join(process.cwd(), ".local-data", "tally-store.json");
    const state = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return (state.masters ?? [])
      .filter((master) => master.connection_id === connectionId)
      .filter((master) => master.owner_user_id === ownerUserId)
      .filter((master) => master.master_type === "ledger")
      .filter((master) => master.is_active)
      .map((master) => ({
        tally_name: String(master.tally_name ?? ""),
        parent_name: master.parent_name ? String(master.parent_name) : null,
      }))
      .filter((master) => master.tally_name);
  } catch (error) {
    console.warn("[worker] Could not read local Tally masters:", error);
    return [];
  }
}

async function loadTallyLedgers(connectionId, ownerUserId) {
  if (!connectionId) {
    console.warn("[worker] Bank statement ledger matching skipped Tally ledger load: no connection id.");
    return [];
  }
  if (process.env.LOCAL_DB_MODE === "true") {
    return loadLocalTallyLedgers(connectionId, ownerUserId);
  }
  const { data, error } = await supabase
    .from("tally_masters")
    .select("tally_name,parent_name")
    .eq("owner_user_id", ownerUserId)
    .eq("connection_id", connectionId)
    .eq("master_type", "ledger")
    .eq("is_active", true)
    .limit(5000);
  if (error) throw error;
  return (data ?? []).filter((master) => master.tally_name);
}

function nowIso() {
  return new Date().toISOString();
}

function localTallyStorePath() {
  return path.join(process.cwd(), ".local-data", "tally-store.json");
}

function readLocalTallyState() {
  try {
    return JSON.parse(fs.readFileSync(localTallyStorePath(), "utf8"));
  } catch {
    return { connections: [], commands: [], events: [], masters: [], masterSyncRuns: [] };
  }
}

function writeLocalTallyState(state) {
  const storePath = localTallyStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function queueLocalMasterSyncForAnalysis(connectionId, ownerUserId) {
  const state = readLocalTallyState();
  const connection = (state.connections ?? []).find(
    (row) => row.id === connectionId && row.owner_user_id === ownerUserId
  );
  if (!connection) {
    return { status: "skipped", reason: "local_connection_not_found", commandId: null };
  }
  if (connection.last_tally_reachable !== true || connection.last_company_loaded !== true) {
    return { status: "skipped", reason: "local_tally_not_ready", commandId: null };
  }

  const pending = (state.commands ?? [])
    .filter((command) => command.connection_id === connectionId)
    .filter((command) => command.owner_user_id === ownerUserId)
    .filter((command) => command.command_type === "sync_masters")
    .filter((command) => command.status === "queued" || command.status === "claimed")
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))[0];
  if (pending) {
    return { status: "pending", reason: "sync_already_pending", commandId: pending.id };
  }

  const now = nowIso();
  const command = {
    id: randomUUID(),
    connection_id: connectionId,
    owner_user_id: ownerUserId,
    command_type: "sync_masters",
    status: "queued",
    priority: 25,
    payload: {
      companyName: connection.last_company_name ?? null,
      requestedMasterTypes: ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"],
      mode: "ledger_accuracy",
      reason: "analysis_ledger_matching",
    },
    result: null,
    error: null,
    attempts: 0,
    max_attempts: 3,
    available_at: now,
    claimed_at: null,
    completed_at: null,
    bridge_version: null,
    created_at: now,
    updated_at: now,
  };
  state.commands = [command, ...(state.commands ?? [])];
  writeLocalTallyState(state);
  return { status: "queued", reason: "analysis_ledger_matching", commandId: command.id };
}

async function waitForLocalMasterSync(commandId) {
  if (!commandId || BANK_STATEMENT_TALLY_SYNC_WAIT_MS <= 0) {
    return { status: "skipped", reason: "wait_disabled", commandId };
  }
  const deadline = Date.now() + BANK_STATEMENT_TALLY_SYNC_WAIT_MS;
  while (Date.now() <= deadline) {
    const state = readLocalTallyState();
    const command = (state.commands ?? []).find((row) => row.id === commandId);
    if (!command) return { status: "missing", reason: "command_not_found", commandId };
    if (command.status === "succeeded") {
      return { status: "succeeded", reason: "completed", commandId, completedAt: command.completed_at ?? null };
    }
    if (command.status === "failed" || command.status === "canceled") {
      return { status: command.status, reason: command.error || "sync_failed", commandId };
    }
    await sleep(BANK_STATEMENT_TALLY_SYNC_POLL_MS);
  }
  return { status: "timeout", reason: "sync_wait_timeout", commandId };
}

async function queueRemoteMasterSyncForAnalysis(connectionId, ownerUserId) {
  const { data: connection, error: connectionError } = await supabase
    .from("tally_connections")
    .select("id, owner_user_id, last_company_name, status, last_tally_reachable, last_company_loaded, last_heartbeat_at")
    .eq("id", connectionId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return { status: "skipped", reason: "connection_not_found", commandId: null };
  if (connection.last_tally_reachable !== true || connection.last_company_loaded !== true) {
    return { status: "skipped", reason: "tally_not_ready", commandId: null };
  }

  const { data: pendingCommand, error: pendingError } = await supabase
    .from("tally_bridge_commands")
    .select("id, status")
    .eq("connection_id", connectionId)
    .eq("owner_user_id", ownerUserId)
    .eq("command_type", "sync_masters")
    .in("status", ["queued", "claimed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (pendingCommand?.id) {
    return { status: "pending", reason: "sync_already_pending", commandId: pendingCommand.id };
  }

  const payload = {
    companyName: connection.last_company_name ?? null,
    requestedMasterTypes: ["ledger", "group", "voucher_type", "gst_ledger", "tax_ledger"],
    mode: "ledger_accuracy",
    reason: "analysis_ledger_matching",
  };
  const { data: command, error: commandError } = await supabase
    .from("tally_bridge_commands")
    .insert({
      connection_id: connectionId,
      owner_user_id: ownerUserId,
      command_type: "sync_masters",
      status: "queued",
      priority: 25,
      payload,
    })
    .select("id, status")
    .single();
  if (commandError) throw commandError;

  await supabase.from("tally_connection_events").insert({
    connection_id: connectionId,
    owner_user_id: ownerUserId,
    event_type: "command_queued",
    message: "Tally master sync queued before bank statement ledger matching.",
    payload,
  });

  return { status: "queued", reason: "analysis_ledger_matching", commandId: command.id };
}

async function waitForRemoteMasterSync(commandId) {
  if (!commandId || BANK_STATEMENT_TALLY_SYNC_WAIT_MS <= 0) {
    return { status: "skipped", reason: "wait_disabled", commandId };
  }
  const deadline = Date.now() + BANK_STATEMENT_TALLY_SYNC_WAIT_MS;
  while (Date.now() <= deadline) {
    const { data: command, error } = await supabase
      .from("tally_bridge_commands")
      .select("id, status, error, completed_at")
      .eq("id", commandId)
      .maybeSingle();
    if (error) throw error;
    if (!command) return { status: "missing", reason: "command_not_found", commandId };
    if (command.status === "succeeded") {
      return { status: "succeeded", reason: "completed", commandId, completedAt: command.completed_at ?? null };
    }
    if (command.status === "failed" || command.status === "canceled") {
      return { status: command.status, reason: command.error || "sync_failed", commandId };
    }
    await sleep(BANK_STATEMENT_TALLY_SYNC_POLL_MS);
  }
  return { status: "timeout", reason: "sync_wait_timeout", commandId };
}

async function ensureTallyMastersForAnalysis(connectionId, ownerUserId) {
  if (!BANK_STATEMENT_TALLY_SYNC_ON_ANALYZE) {
    return { status: "skipped", reason: "disabled", commandId: null };
  }
  if (!connectionId) {
    return { status: "skipped", reason: "no_connection", commandId: null };
  }

  try {
    const queued =
      process.env.LOCAL_DB_MODE === "true"
        ? await queueLocalMasterSyncForAnalysis(connectionId, ownerUserId)
        : await queueRemoteMasterSyncForAnalysis(connectionId, ownerUserId);
    if (!queued.commandId) return queued;

    const completed =
      process.env.LOCAL_DB_MODE === "true"
        ? await waitForLocalMasterSync(queued.commandId)
        : await waitForRemoteMasterSync(queued.commandId);
    return {
      ...completed,
      queuedStatus: queued.status,
      queuedReason: queued.reason,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: formatError(error),
      commandId: null,
    };
  }
}

async function aiMatchLedgers(transactions, ledgers) {
  if (!OPENROUTER_API_KEY) {
    console.warn("[worker] AI ledger matching skipped: OPENROUTER_API_KEY is not configured.");
    return new Map();
  }
  if (transactions.length === 0) {
    console.warn("[worker] AI ledger matching skipped: no transactions to match.");
    return new Map();
  }
  if (ledgers.length === 0) {
    console.warn("[worker] AI ledger matching skipped: no synced Tally ledgers available.");
    return new Map();
  }
  const raw = await callOpenRouterForBankStatement(
    [
      {
        role: "system",
        content: LEDGER_MATCHING_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: compactPromptJson({
          transactions: transactions.map(({ transaction, index }) => ({
            index,
            description: transaction.description,
            category: transaction.category,
            counterpartyName: transaction.counterparty_name || extractCounterpartyName(transaction.description),
          })),
          tallyLedgers: ledgers.map((ledger) => ({
            name: ledger.tally_name,
            group: ledger.parent_name,
          })),
        }),
      },
    ],
    {
      model: OPENROUTER_LEDGER_MATCH_MODEL,
      maxTokens: 4000,
    }
  );
  const parsed = safeJsonParse(raw, {});
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const byIndex = new Map();
  for (const match of matches) {
    if (!match || typeof match !== "object" || Array.isArray(match)) continue;
    const index = Number(match.index);
    if (!Number.isInteger(index)) continue;
    const action = String(match.action ?? "");
    const matchType = textCell(match.matchType);
    const ledgerName = textCell(match.ledgerName);
    const matched = ledgers.find((ledger) => normalizeName(ledger.tally_name) === normalizeName(ledgerName));
    const confidence = Math.max(0, Math.min(1, Number(match.confidence) || 0));
    const candidateLedgerNames = Array.isArray(match.candidateLedgerNames)
      ? match.candidateLedgerNames.map((name) => textCell(name)).filter(Boolean).slice(0, 5)
      : [];
    const reason = textCell(match.reason) || "AI did not find one clear existing Tally ledger.";
    const accepted = action === "use_existing_ledger" && matched && confidence >= 0.9;
    if (!accepted) {
      console.warn("[worker] AI ledger match rejected", {
        index,
        action,
        matchType,
        returnedLedgerName: ledgerName || null,
        ledgerFound: Boolean(matched),
        confidence,
        reason: reason.slice(0, 240),
      });
    }

    byIndex.set(index, {
      action,
      matchType,
      ledgerName: accepted ? matched.tally_name : null,
      confidence,
      reason,
      source: "ai_match",
      candidateLedgerNames,
    });
  }
  return byIndex;
}

async function matchTransactionLedgers(transactions, ledgers) {
  if (transactions.length === 0) return transactions;
  if (ledgers.length === 0) {
    const reason = "No synced Tally ledgers were available for AI matching. Sync Tally ledgers, then re-analyze.";
    console.warn(`[worker] ${reason}`);
    return transactions.map((transaction) => ({
      ...transaction,
      suggested_ledger_name: null,
      suggestion_confidence: 0,
      suggestion_reason: reason,
      raw_payload: {
        ...(transaction.raw_payload ?? {}),
        ledgerMatch: {
          source: "ai_match",
          action: "use_suspense",
          matchType: "suspense",
          ledgerName: null,
          confidence: 0,
          candidateLedgerNames: [],
          reason,
        },
      },
    }));
  }

  console.log(
    `[worker] Matching ${transactions.length} bank transaction row(s) against ${ledgers.length} synced Tally ledger(s) with ${OPENROUTER_LEDGER_MATCH_MODEL}.`
  );
  const aiInputs = transactions.map((transaction, index) => ({
    index,
    transaction: {
      ...transaction,
      counterparty_name: transaction.counterparty_name || extractCounterpartyName(transaction.description),
    },
  }));
  let aiMatches = new Map();
  let aiFailureReason = "";
  try {
    aiMatches = await aiMatchLedgers(aiInputs, ledgers);
    const acceptedCount = Array.from(aiMatches.values()).filter((match) => match?.ledgerName).length;
    const rejectedCount = aiMatches.size - acceptedCount;
    console.log(
      `[worker] AI ledger matcher returned ${aiMatches.size} result(s), accepted=${acceptedCount}, rejected=${rejectedCount}.`
    );
  } catch (error) {
    aiFailureReason = formatError(error);
    console.warn("[worker] AI ledger match failed:", aiFailureReason);
  }

  return aiInputs.map(({ index, transaction }) => {
    const aiMatch = aiMatches.get(index);
    if (aiMatch?.ledgerName) {
      return {
        ...transaction,
        suggested_ledger_name: aiMatch.ledgerName,
        suggestion_confidence: aiMatch.confidence,
        suggestion_reason: aiMatch.reason,
        raw_payload: {
          ...(transaction.raw_payload ?? {}),
          ledgerMatch: {
            source: aiMatch.source,
            action: aiMatch.action,
            matchType: aiMatch.matchType,
            ledgerName: aiMatch.ledgerName,
            confidence: aiMatch.confidence,
            candidateLedgerNames: aiMatch.candidateLedgerNames,
            reason: aiMatch.reason,
          },
        },
      };
    }

    const fallbackMatch = aiFailureReason ? findDeterministicLedgerMatch(ledgers, transaction) : null;
    if (fallbackMatch?.ledgerName) {
      console.log("[worker] Deterministic ledger fallback accepted after AI did not produce a usable match", {
        index,
        ledgerName: fallbackMatch.ledgerName,
        confidence: fallbackMatch.confidence,
      });
      return {
        ...transaction,
        suggested_ledger_name: fallbackMatch.ledgerName,
        suggestion_confidence: fallbackMatch.confidence,
        suggestion_reason: fallbackMatch.reason,
        raw_payload: {
          ...(transaction.raw_payload ?? {}),
          ledgerMatch: {
            source: fallbackMatch.source,
            action: "use_existing_ledger",
            matchType: fallbackMatch.matchType,
            ledgerName: fallbackMatch.ledgerName,
            confidence: fallbackMatch.confidence,
            candidateLedgerNames: fallbackMatch.candidateLedgerNames,
            reason: fallbackMatch.reason,
            fallbackAfterAi: true,
            aiFailureReason: aiFailureReason || aiMatch?.reason || null,
          },
        },
      };
    }

    const reason = aiFailureReason
      ? `AI ledger matching failed: ${aiFailureReason}`
      : "AI returned no ledger match result for this row.";
    return {
      ...transaction,
      suggested_ledger_name: null,
      suggestion_confidence: aiMatch?.confidence ?? 0,
      suggestion_reason: aiMatch?.reason || reason,
      raw_payload: {
        ...(transaction.raw_payload ?? {}),
        ledgerMatch: {
          source: "ai_match",
          action: aiMatch?.action || "use_suspense",
          matchType: aiMatch?.matchType || null,
          ledgerName: null,
          confidence: aiMatch?.confidence ?? 0,
          candidateLedgerNames: aiMatch?.candidateLedgerNames ?? [],
          reason: aiMatch?.reason || reason,
        },
      },
    };
  });
}

async function extractBankStatementFromImages(fileName, images) {
  if (images.length === 0) {
    return {
      account: { bankName: null, accountNumber: null, accountHolderName: null, ifscCode: null },
      statementPeriodStart: null,
      statementPeriodEnd: null,
      transactions: [],
    };
  }

  const raw = await callOpenRouterForBankStatement([
    {
      role: "system",
      content:
        "Extract bank statement account details and transaction rows. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
        "account must include bankName, accountNumber, accountHolderName, and ifscCode when visible. Dates must be ISO YYYY-MM-DD. " +
        "Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, suggestedLedgerName, suggestionConfidence, suggestionReason, and confidence. " +
        "description must be the complete bank narration/description exactly as printed for that transaction, including payment mode, party name, UTR/reference text, and continuation lines. Do not shorten description to only the party name, and do not include date/value-date/debit/credit/balance columns in description. " +
        "counterpartyName must be only the real party/vendor/customer name, separate from the full description. Remove payment modes, bank/channel prefixes, CR/DR markers, account numbers, UTR/ref/invoice/bill text, and bank names from counterpartyName. For example, description NEFT CR-HDFC-BHARAT LTD / INVOICE BL-801 should produce counterpartyName BHARAT LTD; UPI/9188201001/ORION TOOLING CENTRE should produce ORION TOOLING CENTRE. Use numbers for amounts, with debit and credit as positive values in their own columns. Do not invent rows. Preserve narration text exactly enough for audit matching. " +
        "If a page contains only summary information and no ledger rows, extract account/period only and leave transactions empty.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: `Extract bank statement data from ${fileName}.` },
        ...images.map((image) => ({ type: "image_url", image_url: { url: image } })),
      ],
    },
  ]);

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

async function extractBankStatementFromPdfFile(fileName, mimeType, bytes) {
  const fileData = Buffer.from(bytes).toString("base64");
  const raw = await callOpenRouterForBankStatement([
    {
      role: "user",
      content: [
        {
          type: "file",
          file: {
            filename: fileName,
            file_data: `data:${mimeType || "application/pdf"};base64,${fileData}`,
          },
        },
        {
          type: "text",
          text:
            "Extract bank statement account details and transaction rows from the attached PDF. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
            "account must include bankName, accountNumber, accountHolderName, and ifscCode when visible. Dates must be ISO YYYY-MM-DD. " +
            "Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, suggestedLedgerName, suggestionConfidence, suggestionReason, and confidence. " +
            "description must be the complete bank narration/description exactly as printed for that transaction, including payment mode, party name, UTR/reference text, and continuation lines. Do not shorten description to only the party name, and do not include date/value-date/debit/credit/balance columns in description. " +
            "counterpartyName must be only the real party/vendor/customer name, separate from the full description. Remove payment modes, bank/channel prefixes, CR/DR markers, account numbers, UTR/ref/invoice/bill text, and bank names from counterpartyName. For example, description NEFT CR-HDFC-BHARAT LTD / INVOICE BL-801 should produce counterpartyName BHARAT LTD; UPI/9188201001/ORION TOOLING CENTRE should produce ORION TOOLING CENTRE. Use numbers for amounts, with debit and credit as positive values in their own columns. Preserve multi-line narration text in the description. " +
            "Rows may continue on following lines without a date; attach those continuation lines to the previous dated transaction. " +
            "Do not treat BALANCE FORWARD, page footers, insurance notices, reward-points sections, summary totals, or opening/closing balance-only lines as transactions. " +
            "Do not invent rows or amounts. If the PDF contains only summary information and no ledger rows, extract account/period only and leave transactions empty.",
        },
      ],
    },
  ]);

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

async function extractBankStatementFromText(fileName, pages) {
  const raw = await callOpenRouterForBankStatement([
    {
      role: "system",
      content:
        "Extract bank statement account details and transaction rows from PDF text. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
        "account must include bankName, accountNumber, accountHolderName, and ifscCode when visible. Dates must be ISO YYYY-MM-DD. " +
        "Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, suggestedLedgerName, suggestionConfidence, suggestionReason, and confidence. " +
        "description must be the complete bank narration/description exactly as printed for that transaction, including payment mode, party name, UTR/reference text, and continuation lines. Do not shorten description to only the party name, and do not include date/value-date/debit/credit/balance columns in description. " +
        "counterpartyName must be only the real party/vendor/customer name, separate from the full description. Remove payment modes, bank/channel prefixes, CR/DR markers, account numbers, UTR/ref/invoice/bill text, and bank names from counterpartyName. For example, description NEFT CR-HDFC-BHARAT LTD / INVOICE BL-801 should produce counterpartyName BHARAT LTD; UPI/9188201001/ORION TOOLING CENTRE should produce ORION TOOLING CENTRE. Use numbers for amounts, with debit and credit as positive values in their own columns. Preserve multi-line narration text in the description. " +
        "Rows may continue on following lines without a date; attach those continuation lines to the previous dated transaction. " +
        "Do not treat BALANCE FORWARD, page footers, insurance notices, reward-points sections, summary totals, or opening/closing balance-only lines as transactions. " +
        "Do not invent rows or amounts. If the text is only summary information and no ledger rows are present, extract account/period only and leave transactions empty.",
    },
    {
      role: "user",
      content: `Extract bank statement data from ${fileName} using this text:\n\n${formatBankStatementTextForAi(pages)}`,
    },
  ]);

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

function mergeBankStatementResults(results) {
  const merged = normalizeAiBankStatement({});
  const seenTransactions = new Set();
  for (const result of results) {
    if (!result) continue;
    merged.account = {
      bankName: merged.account.bankName || result.account.bankName || null,
      accountNumber: merged.account.accountNumber || result.account.accountNumber || null,
      accountHolderName: merged.account.accountHolderName || result.account.accountHolderName || null,
      ifscCode: merged.account.ifscCode || result.account.ifscCode || null,
    };
    merged.statementPeriodStart = merged.statementPeriodStart || result.statementPeriodStart || null;
    merged.statementPeriodEnd = merged.statementPeriodEnd || result.statementPeriodEnd || null;
    for (const transaction of result.transactions) {
      const key = [
        transaction.transaction_date,
        normalizeName(transaction.description),
        normalizeName(transaction.reference_number),
        transaction.debit_amount ?? "",
        transaction.credit_amount ?? "",
        transaction.balance_amount ?? "",
      ].join("|");
      if (seenTransactions.has(key)) continue;
      seenTransactions.add(key);
      merged.transactions.push(transaction);
    }
  }
  return merged;
}

function likelyHasTransactionRows(page) {
  const text = String(typeof page === "string" ? page : page?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const hasAmount = /(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}|(?:\d{1,3}(?:,\d{2,3})+|\d+)\b/.test(text);
  const hasDate =
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(text) ||
    /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b/.test(text) ||
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(text);
  const hasStatementWords = /\b(?:neft|rtgs|imps|upi|deposit|withdrawal|debit|credit|balance|particulars|narration)\b/i.test(text);
  return hasAmount && (hasDate || hasStatementWords);
}

function pageRangeLabel(pages) {
  const first = pages[0]?.pageNumber ?? 1;
  const last = pages[pages.length - 1]?.pageNumber ?? first;
  return first === last ? `page ${first}` : `pages ${first}-${last}`;
}

function chunkPages(pages, size) {
  const chunks = [];
  for (let index = 0; index < pages.length; index += size) {
    chunks.push(pages.slice(index, index + size));
  }
  return chunks;
}

function lastItem(items) {
  return items[items.length - 1];
}

async function extractBankStatementFromTextBatch(fileName, pages) {
  const raw = await callOpenRouterForBankStatement([
    {
      role: "system",
      content:
        "Extract bank statement account details and transaction rows from a batch of PDF text pages. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
        "account must include bankName, accountNumber, accountHolderName, and ifscCode when visible. Dates must be ISO YYYY-MM-DD. " +
        "Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, suggestedLedgerName, suggestionConfidence, suggestionReason, and confidence. " +
        "description must be the complete bank narration/description exactly as printed for that transaction, including payment mode, party name, UTR/reference text, and continuation lines. Do not shorten description to only the party name, and do not include date/value-date/debit/credit/balance columns in description. " +
        "counterpartyName must be only the real party/vendor/customer name, separate from the full description. Remove payment modes, bank/channel prefixes, CR/DR markers, account numbers, UTR/ref/invoice/bill text, and bank names from counterpartyName. " +
        "Rows may continue on following lines without a date; attach those continuation lines to the previous dated transaction. " +
        "Ignore BALANCE FORWARD, OPENING BALANCE, CLOSING BALANCE, page footers, reward-points sections, summary totals, and bank notices unless they have a real debit or credit transaction amount. " +
        "Do not invent rows. If this batch contains only summary/header information and no ledger rows, return account/period if visible and an empty transactions array.",
    },
    {
      role: "user",
      content: `Extract ${pageRangeLabel(pages)} from ${fileName}:\n\n${formatBankStatementTextForAi(pages)}`,
    },
  ]);

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

async function extractBankStatementFromImageBatch(fileName, images, rangeLabel) {
  if (images.length === 0) return normalizeAiBankStatement({});
  const raw = await callOpenRouterForBankStatement([
    {
      role: "system",
      content:
        "Extract bank statement account details and transaction rows from these rendered statement pages. Return only JSON with keys account, statementPeriodStart, statementPeriodEnd, and transactions. " +
        "Dates must be ISO YYYY-MM-DD. Each transaction must include transactionDate, valueDate when visible, description, referenceNumber when visible, debitAmount, creditAmount, balanceAmount, transactionType, category, counterpartyName, suggestedLedgerName, suggestionConfidence, suggestionReason, and confidence. " +
        "description must be the complete bank narration/description exactly as printed for that transaction, including payment mode, party name, UTR/reference text, and continuation lines. counterpartyName must be only the party/vendor/customer name. " +
        "Ignore BALANCE FORWARD, OPENING BALANCE, CLOSING BALANCE, summary totals, page footers, and bank notices. Do not invent rows.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: `Extract ${rangeLabel} from ${fileName}.` },
        ...images.map((image) => ({ type: "image_url", image_url: { url: image } })),
      ],
    },
  ]);

  return normalizeAiBankStatement(safeJsonParse(raw, {}));
}

async function callWithBatchRetries(label, handler) {
  let lastError = null;
  for (let attempt = 0; attempt <= BANK_STATEMENT_BATCH_RETRY_LIMIT; attempt += 1) {
    try {
      return await handler(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < BANK_STATEMENT_BATCH_RETRY_LIMIT) {
        await sleep(OPENROUTER_RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }
  throw new Error(`${label} failed: ${diagnosticError(lastError)}`);
}

async function extractBankStatementTextBatches(fileName, pages, jobId) {
  const batches = chunkPages(pages, BANK_STATEMENT_BATCH_PAGE_SIZE);
  const diagnostics = [];
  const failedBatches = [];
  const results = await runWithConcurrency(batches, BANK_STATEMENT_BATCH_CONCURRENCY, async (batch, index) => {
    const label = pageRangeLabel(batch);
    const hasLikelyRows = batch.some(likelyHasTransactionRows);
    if (!hasLikelyRows && !hasUsableBankStatementText(batch)) {
      diagnostics[index] = {
        startPage: batch[0]?.pageNumber,
        endPage: lastItem(batch)?.pageNumber,
        status: "skipped",
        rowCount: 0,
      };
      return null;
    }

    try {
      const parsed = await callWithBatchRetries(label, () => extractBankStatementFromTextBatch(fileName, batch));
      diagnostics[index] = {
        startPage: batch[0]?.pageNumber,
        endPage: lastItem(batch)?.pageNumber,
        status: parsed.transactions.length > 0 ? "succeeded" : "empty",
        rowCount: parsed.transactions.length,
      };
      if (parsed.transactions.length === 0 && hasLikelyRows) {
        failedBatches.push({ pages: batch, reason: "empty" });
      }
      const completed = diagnostics.filter(Boolean).length;
      await updateBankJob(jobId, {
        progress: Math.min(70, 35 + Math.round((completed / Math.max(1, batches.length)) * 30)),
        stage: `Analyzing statement batches ${completed}/${batches.length}`,
      });
      return parsed;
    } catch (error) {
      diagnostics[index] = {
        startPage: batch[0]?.pageNumber,
        endPage: lastItem(batch)?.pageNumber,
        status: "failed",
        rowCount: 0,
        error: diagnosticError(error),
      };
      failedBatches.push({ pages: batch, reason: "failed" });
      return null;
    }
  });

  return {
    parsed: mergeBankStatementResults(results),
    diagnostics,
    failedBatches,
  };
}

async function extractBankStatementImageBatches(fileName, bytes, pageCount, jobId) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const ranges = chunkPages(pageNumbers.map((pageNumber) => ({ pageNumber })), BANK_STATEMENT_BATCH_PAGE_SIZE);
  const diagnostics = [];
  const failedBatches = [];
  const results = await runWithConcurrency(ranges, BANK_STATEMENT_BATCH_CONCURRENCY, async (range, index) => {
    const startPage = range[0].pageNumber;
    const endPage = lastItem(range).pageNumber;
    const label = startPage === endPage ? `page ${startPage}` : `pages ${startPage}-${endPage}`;
    try {
      const parsed = await callWithBatchRetries(label, async () => {
        const images = await renderBankStatementPdfToImages(bytes, fileName, { startPage, endPage });
        return extractBankStatementFromImageBatch(fileName, images, label);
      });
      diagnostics[index] = {
        startPage,
        endPage,
        status: parsed.transactions.length > 0 ? "succeeded" : "empty",
        rowCount: parsed.transactions.length,
      };
      if (parsed.transactions.length === 0) {
        failedBatches.push({ pages: range, reason: "empty" });
      }
      const completed = diagnostics.filter(Boolean).length;
      await updateBankJob(jobId, {
        progress: Math.min(70, 35 + Math.round((completed / Math.max(1, ranges.length)) * 30)),
        stage: `Analyzing rendered page batches ${completed}/${ranges.length}`,
      });
      return parsed;
    } catch (error) {
      diagnostics[index] = { startPage, endPage, status: "failed", rowCount: 0, error: diagnosticError(error) };
      failedBatches.push({ pages: range, reason: "failed" });
      return null;
    }
  });

  return {
    parsed: mergeBankStatementResults(results),
    diagnostics,
    failedBatches,
  };
}

async function recoverSinglePages({ fileName, bytes, textPagesByNumber, failedBatches, jobId }) {
  const pageMap = new Map();
  for (const batch of failedBatches) {
    for (const page of batch.pages) {
      const pageNumber = page.pageNumber;
      if (!pageMap.has(pageNumber)) {
        pageMap.set(pageNumber, textPagesByNumber.get(pageNumber) ?? { pageNumber, text: "" });
      }
    }
  }
  const pages = [...pageMap.values()]
    .filter((page) => likelyHasTransactionRows(page) || !String(page.text || "").trim())
    .slice(0, BANK_STATEMENT_SINGLE_PAGE_RECOVERY_LIMIT);
  if (pages.length === 0) {
    return { parsed: normalizeAiBankStatement({}), diagnostics: [] };
  }

  const diagnostics = [];
  const results = await runWithConcurrency(pages, BANK_STATEMENT_BATCH_CONCURRENCY, async (page, index) => {
    try {
      const parsed = await callWithBatchRetries(`recovery page ${page.pageNumber}`, async () => {
        if (String(page.text || "").trim()) {
          return extractBankStatementFromTextBatch(fileName, [page]);
        }
        const images = await renderBankStatementPdfToImages(bytes, fileName, {
          startPage: page.pageNumber,
          endPage: page.pageNumber,
        });
        return extractBankStatementFromImageBatch(fileName, images, `page ${page.pageNumber}`);
      });
      diagnostics[index] = {
        page: page.pageNumber,
        status: parsed.transactions.length > 0 ? "succeeded" : "empty",
        rowCount: parsed.transactions.length,
      };
      const completed = diagnostics.filter(Boolean).length;
      await updateBankJob(jobId, {
        progress: Math.min(74, 70 + Math.round((completed / Math.max(1, pages.length)) * 4)),
        stage: `Recovering difficult pages ${completed}/${pages.length}`,
      });
      return parsed;
    } catch (error) {
      diagnostics[index] = { page: page.pageNumber, status: "failed", rowCount: 0, error: diagnosticError(error) };
      return null;
    }
  });

  return {
    parsed: mergeBankStatementResults(results),
    diagnostics,
  };
}

async function extractBankStatementAdaptive({ fileName, mimeType, bytes, isPdf, isImage, jobId }) {
  const diagnostics = {
    pipeline: null,
    pageCount: isImage ? 1 : null,
    singleShotAttempted: false,
    singleShotRows: 0,
    batchSize: BANK_STATEMENT_BATCH_PAGE_SIZE,
    batchConcurrency: BANK_STATEMENT_BATCH_CONCURRENCY,
    batches: [],
    recovery: [],
    errors: [],
  };
  let parsed = null;
  let extractionSource = "none";
  let extractionError = null;
  let textInfo = { pages: [], pageCount: isImage ? 1 : 0, truncated: false };

  if (isPdf) {
    try {
      textInfo = await extractBankStatementPdfTextPages(bytes);
      diagnostics.pageCount = textInfo.pageCount;
      diagnostics.textPagesExtracted = textInfo.pages.length;
      diagnostics.textExtractionTruncated = textInfo.truncated;
    } catch (error) {
      diagnostics.errors.push({ stage: "pdf_text_extraction", error: diagnosticError(error) });
      console.warn(`[worker] PDF text extraction skipped for ${fileName}: ${diagnosticError(error)}`);
    }
  }

  const canUseSingleShot = !isPdf || Number(textInfo.pageCount || 0) <= BANK_STATEMENT_SINGLE_SHOT_MAX_PAGES;
  if (canUseSingleShot) {
    diagnostics.singleShotAttempted = true;
    try {
      await updateBankJob(jobId, { progress: 45, stage: "Running single-shot AI extraction" });
      if (isPdf && hasUsableBankStatementText(textInfo.pages)) {
        parsed = await extractBankStatementFromText(fileName, textInfo.pages);
        extractionSource = "single_shot_ai_pdf_text";
      } else if (isPdf) {
        parsed = await extractBankStatementFromPdfFile(fileName, mimeType || "application/pdf", bytes);
        extractionSource = "single_shot_ai_pdf_file";
      } else if (isImage) {
        const image = await imageBytesToProviderDataUrl(bytes, mimeType || "image/jpeg", fileName);
        parsed = await extractBankStatementFromImages(fileName, [image]);
        extractionSource = "single_shot_ai_image";
      }
      diagnostics.singleShotRows = parsed?.transactions.length ?? 0;
      if (parsed && parsed.transactions.length > 0) {
        diagnostics.pipeline = "single_shot_ai";
        return { parsed, extractionSource, extractionError: null, diagnostics };
      }
    } catch (error) {
      diagnostics.errors.push({ stage: "single_shot_ai", error: diagnosticError(error) });
      console.warn(`[worker] single-shot AI extraction skipped for ${fileName}: ${diagnosticError(error)}`);
    }
  }

  if (!isPdf) {
    diagnostics.pipeline = "manual_review_required";
    extractionError =
      lastItem(diagnostics.errors)?.error || "No transaction rows were extracted from the image.";
    return { parsed: parsed ?? normalizeAiBankStatement({}), extractionSource, extractionError, diagnostics };
  }

  const textPages = textInfo.pages ?? [];
  const textPagesByNumber = new Map(textPages.map((page) => [page.pageNumber, page]));
  const pageCount = Math.min(Number(textInfo.pageCount || textPages.length || 0), BANK_STATEMENT_MAX_TOTAL_PAGES);

  try {
    await updateBankJob(jobId, { progress: 35, stage: "Running batched AI extraction" });
    let batchResult;
    if (hasUsableBankStatementText(textPages)) {
      batchResult = await extractBankStatementTextBatches(fileName, textPages, jobId);
      extractionSource = "batched_ai_pdf_text";
    } else {
      batchResult = await extractBankStatementImageBatches(fileName, bytes, pageCount, jobId);
      extractionSource = "batched_ai_pdf_images";
    }

    diagnostics.pipeline = "batched_ai";
    diagnostics.batches = batchResult.diagnostics;
    parsed = batchResult.parsed;

    if (batchResult.failedBatches.length > 0 && BANK_STATEMENT_SINGLE_PAGE_RECOVERY_LIMIT > 0) {
      await updateBankJob(jobId, { progress: 70, stage: "Recovering difficult pages" });
      const recovery = await recoverSinglePages({
        fileName,
        bytes,
        textPagesByNumber,
        failedBatches: batchResult.failedBatches,
        jobId,
      });
      diagnostics.pipeline = "single_page_recovery";
      diagnostics.recovery = recovery.diagnostics;
      parsed = mergeBankStatementResults([parsed, recovery.parsed]);
    }

    if (parsed.transactions.length > 0) {
      return { parsed, extractionSource, extractionError: null, diagnostics };
    }
  } catch (error) {
    diagnostics.errors.push({ stage: "batched_ai", error: diagnosticError(error) });
    console.warn(`[worker] batched AI extraction failed for ${fileName}: ${diagnosticError(error)}`);
  }

  diagnostics.pipeline = "manual_review_required";
  extractionError =
    lastItem(diagnostics.errors)?.error ||
    "No transaction rows were extracted. The file may need manual review or a clearer scan.";
  return {
    parsed: parsed ?? normalizeAiBankStatement({}),
    extractionSource: extractionSource === "none" ? "manual_review_required" : extractionSource,
    extractionError,
    diagnostics,
  };
}

async function updateBankJob(jobId, fields) {
  const { error } = await supabase
    .from("bank_statement_extraction_jobs")
    .update(fields)
    .eq("id", jobId);
  if (error) throw error;
}

async function claimNextBankStatementJob() {
  const { data, error } = await supabase.rpc("claim_bank_statement_extraction_job", {
    worker_name: WORKER_NAME,
    stale_after: WORKER_STALE_RUNNING_JOB_INTERVAL,
  });

  if (error) {
    const message = error instanceof Error ? error.message : String(error?.message ?? error ?? "");
    if (message.includes("claim_bank_statement_extraction_job")) {
      return null;
    }
    throw error;
  }

  const claimedJob = Array.isArray(data) ? data[0] : data;
  return claimedJob?.id ? claimedJob : null;
}

async function getBankJob(jobId) {
  const { data, error } = await supabase
    .from("bank_statement_extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function requeueBankJob(jobId, errorMessage) {
  const job = await getBankJob(jobId);
  if (!job || isTerminalJobStatus(job.status)) return;
  if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
    await updateBankJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "Failed",
      error: errorMessage,
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    });
    await supabase
      .from("bank_statement_imports")
      .update({
        status: "failed",
        processing_meta: {
          jobStatus: "failed",
          extractionError: errorMessage,
          failedAt: new Date().toISOString(),
        },
      })
      .eq("id", job.import_id)
      .eq("owner_user_id", job.owner_user_id);
    return;
  }
  await updateBankJob(jobId, {
    status: "queued",
    progress: 0,
    stage: "Queued after worker failure",
    error: errorMessage,
    locked_at: null,
    locked_by: null,
    next_run_at: new Date(Date.now() + WORKER_POLL_INTERVAL_MS).toISOString(),
  });
}

async function runBankStatementJob(job) {
  const { data: importRow, error: importError } = await supabase
    .from("bank_statement_imports")
    .select("*")
    .eq("id", job.import_id)
    .eq("owner_user_id", job.owner_user_id)
    .maybeSingle();

  if (importError) throw importError;
  if (!importRow) {
    await updateBankJob(job.id, {
      status: "cancelled",
      progress: 100,
      stage: "Cancelled",
      error: "Bank statement import was deleted.",
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    });
    return;
  }

  await updateBankJob(job.id, { progress: 15, stage: "Downloading statement" });
  const { data: storedFile, error: downloadError } = await supabase.storage
    .from(importRow.storage_bucket || BANK_STATEMENT_BUCKET)
    .download(importRow.storage_path);
  if (downloadError) throw downloadError;

  const mimeType = importRow.mime_type || "";
  const fileName = importRow.original_file_name || "bank-statement";
  const bytes = new Uint8Array(await storedFile.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`Downloaded bank statement file "${fileName}" is empty.`);
  }
  await updateBankJob(job.id, { progress: 30, stage: "Preparing pages for AI" });
  const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(fileName);
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileName);
  const extraction = await extractBankStatementAdaptive({
    fileName,
    mimeType,
    bytes,
    isPdf,
    isImage,
    jobId: job.id,
  });
  const parsed = extraction.parsed ?? normalizeAiBankStatement({});
  const extractionSource = extraction.extractionSource;
  const extractionError = extraction.extractionError;
  const extractionDiagnostics = extraction.diagnostics;
  console.log(
    `[worker] ${extractionDiagnostics.pipeline} returned ${parsed.transactions.length} row(s) for ${fileName}`
  );

  const account = {
    bankName: importRow.extracted_bank_name || parsed.account.bankName || null,
    accountNumber: importRow.extracted_account_number || parsed.account.accountNumber || null,
    accountHolderName: importRow.extracted_account_holder_name || parsed.account.accountHolderName || null,
    ifscCode: importRow.extracted_ifsc_code || parsed.account.ifscCode || null,
  };
  const processingMeta =
    importRow.processing_meta && typeof importRow.processing_meta === "object" && !Array.isArray(importRow.processing_meta)
      ? importRow.processing_meta
      : {};
  const previousAnalysis =
    processingMeta.analysis && typeof processingMeta.analysis === "object" && !Array.isArray(processingMeta.analysis)
      ? processingMeta.analysis
      : {};
  const connectionId =
    typeof previousAnalysis.connectionId === "string" && previousAnalysis.connectionId.trim()
      ? previousAnalysis.connectionId.trim()
      : "";
  await updateBankJob(job.id, { progress: 68, stage: "Syncing Tally ledgers" });
  const tallyMasterSync = await ensureTallyMastersForAnalysis(connectionId, job.owner_user_id);
  if (tallyMasterSync.status === "succeeded") {
    console.log(
      `[worker] Tally masters synced before bank statement matching command=${tallyMasterSync.commandId}.`
    );
  } else if (tallyMasterSync.status !== "skipped") {
    console.warn(
      `[worker] Tally master sync before bank statement matching did not complete: ${tallyMasterSync.status} ${tallyMasterSync.reason}.`
    );
  }
  await updateBankJob(job.id, { progress: 72, stage: "Matching Tally ledgers" });
  const tallyLedgers = await loadTallyLedgers(connectionId, job.owner_user_id);
  console.log(
    `[worker] Loaded ${tallyLedgers.length} Tally ledger(s) for bank statement matching connection=${connectionId || "none"}.`
  );
  const matchedTransactions = await matchTransactionLedgers(parsed.transactions, tallyLedgers);
  const ledgerMatchedCount = matchedTransactions.filter((transaction) => transaction.suggested_ledger_name).length;
  const ledgerUnmatchedCount = Math.max(0, matchedTransactions.length - ledgerMatchedCount);
  const normalizedAccountNumber = normalizeAccountNumber(account.accountNumber);
  const { data: candidateRows, error: candidateError } = normalizedAccountNumber
    ? await supabase
        .from("bank_accounts")
        .select("id")
        .eq("owner_user_id", job.owner_user_id)
        .eq("account_number_normalized", normalizedAccountNumber)
        .limit(5)
    : { data: [], error: null };
  if (candidateError) throw candidateError;
  const candidateCount = (candidateRows ?? []).length;
  const selectedAccountId = candidateCount === 1 ? candidateRows[0].id : null;
  const finalStatus =
    parsed.transactions.length === 0
      ? "manual_review_required"
      : candidateCount > 1
        ? "needs_account_selection"
        : "ready_to_review";

  await updateBankJob(job.id, { progress: 75, stage: "Saving preview rows" });
  await supabase
    .from("bank_statement_import_preview_transactions")
    .delete()
    .eq("import_id", job.import_id)
    .eq("owner_user_id", job.owner_user_id);

  const rows = matchedTransactions.map((transaction, index) => ({
    import_id: job.import_id,
    owner_user_id: job.owner_user_id,
    ...transaction,
    row_index: index + 1,
  }));
  if (rows.length > 0) {
    const { error: previewInsertError } = await supabase
      .from("bank_statement_import_preview_transactions")
      .insert(rows);
    if (previewInsertError) throw previewInsertError;
  }

  const completedAt = new Date().toISOString();
  const { error: importUpdateError } = await supabase
    .from("bank_statement_imports")
    .update({
      bank_account_id: selectedAccountId,
      statement_period_start: parsed.statementPeriodStart,
      statement_period_end: parsed.statementPeriodEnd,
      extracted_bank_name: account.bankName,
      extracted_account_number: account.accountNumber,
      extracted_account_holder_name: account.accountHolderName,
      extracted_ifsc_code: account.ifscCode,
      status: finalStatus,
      processing_meta: {
        ...processingMeta,
        parser: "openrouter_bank_statement_v1",
        extractionSource,
        jobStatus: "completed",
        extractionError,
        extractionDiagnostics,
        normalizedAccountNumber,
        maskedAccountNumber: maskAccountNumber(account.accountNumber),
        ifscCode: account.ifscCode,
        previewTransactionCount: rows.length,
        completedAt,
        analysis: {
          ...previousAnalysis,
          status: "completed",
          progress: 100,
          stage: "Statement analyzed",
          error: null,
          tallyMasterSync,
          tallyLedgerCount: tallyLedgers.length,
          ledgerMatching: {
            status: "completed",
            matchedCount: ledgerMatchedCount,
            unmatchedCount: ledgerUnmatchedCount,
            totalCount: matchedTransactions.length,
            completedAt,
          },
          completedAt,
          updatedAt: completedAt,
        },
      },
    })
    .eq("id", job.import_id)
    .eq("owner_user_id", job.owner_user_id);
  if (importUpdateError) throw importUpdateError;

  await updateBankJob(job.id, {
    status: "succeeded",
    progress: 100,
    stage: "Completed",
    error: null,
    result: {
      importId: job.import_id,
      transactionCount: rows.length,
      status: finalStatus,
    },
    locked_at: null,
    locked_by: null,
    finished_at: new Date().toISOString(),
  });
}

async function getJob(jobId) {
  const { data, error } = await supabase
    .from("packet_processing_jobs")
    .select("id, case_id, status, attempt_count, max_attempts, locked_at, locked_by, result, error, updated_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function markCaseFailed(caseId, message) {
  const { data: caseRow } = await supabase
    .from("packet_cases")
    .select("processing_meta")
    .eq("id", caseId)
    .maybeSingle();

  const existingMeta =
    caseRow?.processing_meta && typeof caseRow.processing_meta === "object" && !Array.isArray(caseRow.processing_meta)
      ? caseRow.processing_meta
      : {};

  await supabase
    .from("packet_cases")
    .update({
      status: "failed",
      processing_meta: {
        ...existingMeta,
        lastProcessingError: message,
      },
    })
    .eq("id", caseId);
}

async function failJob(job, message) {
  await supabase
    .from("packet_processing_jobs")
    .update({
      status: "failed",
      progress: 100,
      stage: "Failed",
      error: message,
      locked_at: null,
      locked_by: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  await markCaseFailed(job.case_id, message);
}

async function requeueJob(jobId, errorMessage) {
  const job = await getJob(jobId);
  if (!job || isTerminalJobStatus(job.status)) {
    return;
  }

  if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
    await failJob(job, errorMessage);
    return;
  }

  const nextRunAt = new Date(Date.now() + WORKER_POLL_INTERVAL_MS).toISOString();
  await supabase
    .from("packet_processing_jobs")
    .update({
      status: "queued",
      progress: 0,
      stage: "Queued after worker dispatch failure",
      error: errorMessage,
      locked_at: null,
      locked_by: null,
      next_run_at: nextRunAt,
    })
    .eq("id", jobId)
    .eq("status", "running");
}

async function recoverStaleRunningJobs() {
  const cutoff = new Date(Date.now() - WORKER_STALE_RUNNING_JOB_MS).toISOString();
  const { data: jobs, error } = await supabase
    .from("packet_processing_jobs")
    .select("id, case_id, status, attempt_count, max_attempts, locked_at")
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .limit(10);

  if (error) {
    throw error;
  }

  for (const job of jobs ?? []) {
    const message = `Processing job was stale for more than ${Math.round(WORKER_STALE_RUNNING_JOB_MS / 60000)} minutes.`;
    if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
      await failJob(job, message);
      continue;
    }

    await supabase
      .from("packet_processing_jobs")
      .update({
        status: "queued",
        progress: 0,
        stage: "Queued after stale worker run",
        error: message,
        locked_at: null,
        locked_by: null,
        next_run_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "running");
  }
}

async function claimNextJob() {
  await recoverStaleRunningJobs();

  const { data, error } = await supabase.rpc("claim_packet_processing_job", {
    worker_name: WORKER_NAME,
    stale_after: WORKER_STALE_RUNNING_JOB_INTERVAL,
  });

  if (error) {
    throw error;
  }

  const claimedJob = Array.isArray(data) ? data[0] : data;

  if (!claimedJob?.id) {
    return null;
  }

  return claimedJob;
}

async function runJob(job) {
  if (!job?.id) {
    throw new Error("Cannot run a packet processing job without an id.");
  }

  const startedAt = Date.now();
  const response = await fetch(`${APP_BASE_URL}/api/internal/jobs/${job.id}/run`, {
    method: "POST",
    headers: {
      "x-worker-secret": WORKER_SECRET,
    },
  });

  if (response.status === 409) {
    const payload = await response.text().catch(() => "");
    console.warn(`[worker] job ${job.id} skipped: ${payload || "not runnable"}`);
    return;
  }

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    if (response.status === 503 && Date.now() - startedAt >= HEROKU_ROUTER_TIMEOUT_GRACE_MS) {
      throw new JobMayStillBeRunningError(
        payload || "Heroku router timed out while the analysis request continued on the web dyno."
      );
    }
    throw new Error(payload || `Internal processing failed (${response.status})`);
  }
}

async function waitForInFlightRun(jobId) {
  const deadline = Date.now() + WORKER_IN_FLIGHT_WAIT_MS;

  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (!job || isTerminalJobStatus(job.status) || job.status === "queued") {
      return job;
    }
    await sleep(WORKER_IN_FLIGHT_POLL_MS);
  }

  return getJob(jobId);
}

async function main() {
  console.log(
    `[worker] started name=${WORKER_NAME} appBase=${APP_BASE_URL} pollMs=${WORKER_POLL_INTERVAL_MS} bankPdfMode=adaptive_ai batchPages=${BANK_STATEMENT_BATCH_PAGE_SIZE} concurrency=${BANK_STATEMENT_BATCH_CONCURRENCY}`
  );
  let lastIdleLogAt = 0;

  while (true) {
    try {
      const bankJob = await claimNextBankStatementJob();
      if (bankJob) {
        try {
          console.log(
            `[worker] claimed bank statement job ${bankJob.id} import=${bankJob.import_id ?? "<unknown>"} attempt=${bankJob.attempt_count ?? "?"}/${bankJob.max_attempts ?? "?"}`
          );
          await runBankStatementJob(bankJob);
          console.log(`[worker] completed bank statement job ${bankJob.id}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
          console.error(`[worker] bank statement extraction failed for job ${bankJob.id}: ${message}`);
          await requeueBankJob(bankJob.id, message);
        }
        continue;
      }

      const job = await claimNextJob();
      if (!job) {
        const now = Date.now();
        if (now - lastIdleLogAt >= WORKER_IDLE_LOG_INTERVAL_MS) {
          console.log("[worker] idle: no queued bank statement or packet jobs claimed");
          lastIdleLogAt = now;
        }
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      try {
        console.log(
          `[worker] claimed packet job ${job.id} case=${job.case_id ?? "<unknown>"} attempt=${job.attempt_count ?? "?"}/${job.max_attempts ?? "?"}`
        );
        await runJob(job);
        console.log(`[worker] completed packet job ${job.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        if (error instanceof JobMayStillBeRunningError) {
          console.warn(`[worker] job ${job.id} exceeded router timeout; waiting for in-flight run instead of requeueing`);
          const latestJob = await waitForInFlightRun(job.id);
          if (latestJob?.status === "running") {
            console.warn(`[worker] job ${job.id} is still running; leaving it locked for stale recovery`);
          }
          continue;
        }
        console.error(`[worker] dispatch failed for job ${job.id}: ${message}`);
        await requeueJob(job.id, message);
      }
    } catch (error) {
      const message = formatError(error);
      console.error(`[worker] polling failed: ${message}`);
      await sleep(WORKER_POLL_INTERVAL_MS);
    }
  }
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
