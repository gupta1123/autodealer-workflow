import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { formatFromBytes, formatFromExtension, toDocument, toMarkdownBytes } from "@firecrawl/anydoc";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  ".doc", ".docx", ".docm", ".odt", ".rtf", ".epub", ".pdf",
  ".ppt", ".pps", ".pot", ".pptx", ".pptm", ".ppsx", ".ppsm", ".odp",
  ".xls", ".xlsx", ".xlsm", ".xlsb", ".ods", ".csv",
];

let bankStatementModulesPromise = null;

async function loadBankStatementModules() {
  if (bankStatementModulesPromise) return bankStatementModulesPromise;
  const runtimeRoot = new URL("./backend-logic/", import.meta.url);
  const sourceRoot = new URL("../../../api/worker/", import.meta.url);
  const packagedRoot = process.env.KALIKA_BANK_WORKER_ROOT
    ? pathToFileURL(path.resolve(process.env.KALIKA_BANK_WORKER_ROOT) + path.sep)
    : process.resourcesPath
      ? pathToFileURL(path.join(process.resourcesPath, "bank-statement-worker") + path.sep)
      : null;
  const load = async (name) => {
    try {
      return await import(new URL(name, runtimeRoot));
    } catch {
      try {
        return await import(new URL(name, sourceRoot));
      } catch (sourceError) {
        if (!packagedRoot) throw sourceError;
        return import(new URL(name, packagedRoot));
      }
    }
  };
  bankStatementModulesPromise = Promise.all([
    load("bank-statement-deterministic.mjs"),
    load("bank-statement-account.mjs"),
    load("bank-statement-markdown-amounts.mjs"),
    load("bank-statement-running-balance.mjs"),
    load("bank-statement-resilience.mjs"),
    load("bank-statement-pdf-columns.mjs"),
    load("bank-statement-layout.mjs"),
  ]).then(([deterministic, account, amounts, runningBalance, resilience, pdfColumns, layout]) => ({
    deterministic,
    account,
    amounts,
    runningBalance,
    resilience,
    pdfColumns,
    layout,
  }));
  return bankStatementModulesPromise;
}

function normalizeOutput(value) {
  const output = String(value || "markdown").trim().toLowerCase();
  if (output === "md") return "markdown";
  if (output !== "markdown" && output !== "json") {
    throw new Error('Document output must be "markdown" or "json".');
  }
  return output;
}

async function readRequestBytes(request) {
  if (request?.filePath) {
    const filePath = path.resolve(String(request.filePath));
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("Document path does not point to a file.");
    if (stat.size === 0) throw new Error("Document is empty.");
    if (stat.size > MAX_DOCUMENT_BYTES) throw new Error("Document is larger than the 25 MB limit.");
    return { bytes: fs.readFileSync(filePath), fileName: path.basename(filePath) };
  }

  const remoteUrl = request?.documentUrl || request?.sourceUrl || request?.url;
  if (remoteUrl) {
    const parsedUrl = new URL(String(remoteUrl));
    if (parsedUrl.protocol !== "https:") throw new Error("Remote documents must use HTTPS.");
    const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Document download failed with HTTP ${response.status}.`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_DOCUMENT_BYTES) throw new Error("Document is larger than the 25 MB limit.");
    if (!response.body) throw new Error("Document download returned no content.");
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        throw new Error("Document is larger than the 25 MB limit.");
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, byteLength);
    if (!bytes.length) throw new Error("Document is empty.");
    const urlName = path.basename(decodeURIComponent(parsedUrl.pathname)) || "document";
    return { bytes, fileName: path.basename(String(request?.fileName || urlName)) };
  }

  let bytes = null;
  if (Buffer.isBuffer(request?.bytes) || request?.bytes instanceof Uint8Array) {
    bytes = Buffer.from(request.bytes);
  } else if (typeof request?.base64 === "string" && request.base64.trim()) {
    const encoded = request.base64.trim().replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
      throw new Error("Document base64 content is invalid.");
    }
    bytes = Buffer.from(encoded, "base64");
  }
  if (!bytes?.length) throw new Error("Document request requires filePath, bytes, or base64.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Document is larger than the 25 MB limit.");
  return { bytes, fileName: path.basename(String(request?.fileName || "document")) };
}

function requestedFormat(request, fileName, bytes) {
  const explicit = String(request?.format || "").trim().toLowerCase().replace(/^\./, "");
  if (explicit) {
    const format = formatFromExtension(explicit);
    if (!format) throw new Error(`Unsupported document format: ${explicit}.`);
    return format;
  }
  return formatFromBytes(bytes) || formatFromExtension(path.extname(fileName));
}

function jsonSafeDocument(document) {
  return {
    ...document,
    assets: (document.assets || []).map((asset) => {
      const { data, ...rest } = asset;
      return {
        ...rest,
        byteLength: data?.length || 0,
        dataBase64: data ? Buffer.from(data).toString("base64") : "",
      };
    }),
  };
}

function metadata({ fileName, format, bytes, startedAt, structured }) {
  return {
    fileName,
    format,
    byteLength: bytes.length,
    structured,
    parser: "firecrawl-anydoc",
    processing: "local",
    ocrUsed: false,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function approximatePdfPageCount(bytes) {
  const source = Buffer.from(bytes).toString("latin1");
  return Math.max(1, (source.match(/\/Type\s*\/Page\b/g) || []).length);
}

function physicalDate(value) {
  const match = String(value || "").match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
}

function transactionsFromPhysicalRows(rows) {
  return rows.map((row, sourceIndex) => ({
    row_index: sourceIndex + 1,
    transaction_date: physicalDate(row.sourceDate),
    value_date: physicalDate(row.sourceDate),
    description: String(row.narration || "").replace(/\s+/g, " ").trim(),
    reference_number: row.reference || null,
    debit_amount: row.debitAmount > 0 ? row.debitAmount : null,
    credit_amount: row.creditAmount > 0 ? row.creditAmount : null,
    balance_amount: row.balanceAmount,
    transaction_type: "unknown",
    category: row.creditAmount > 0 ? "receipt" : "payment",
    counterparty_name: null,
    suggested_ledger_name: null,
    suggestion_confidence: null,
    suggestion_reason: null,
    confirmed_ledger_name: null,
    additional_charges: [],
    confidence: 0.95,
    raw_payload: {
      rowNumber: sourceIndex + 1,
      source: "physical_pdf_columns",
      extractionProvenance: {
        startPage: row.page,
        endPage: row.page,
        sourceIndex,
        method: "physical_pdf_columns",
      },
    },
  }));
}

// The words on each page with their positions, as pdf.js reports them.
async function readPdfPages(bytes, maxPages = 300) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  try {
    if (pdf.numPages > maxPages) throw new Error("PDF page limit exceeded");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push({ pageNumber, width: page.view[2] - page.view[0], items: text.items });
      page.cleanup();
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

function transactionsFromLayoutRows(rows) {
  return rows.map((row, sourceIndex) => ({
    row_index: sourceIndex + 1,
    transaction_date: row.transactionDate,
    value_date: row.valueDate || row.transactionDate,
    description: row.narration,
    reference_number: row.reference || null,
    debit_amount: row.debitAmount,
    credit_amount: row.creditAmount,
    balance_amount: row.balanceAmount,
    transaction_type: "unknown",
    category: row.creditAmount > 0 ? "receipt" : "payment",
    counterparty_name: null,
    suggested_ledger_name: null,
    suggestion_confidence: null,
    suggestion_reason: null,
    confirmed_ledger_name: null,
    additional_charges: [],
    confidence: row.issues?.length ? 0.6 : 0.95,
    raw_payload: {
      rowNumber: sourceIndex + 1,
      source: "page_layout",
      ...(row.derivedBalance ? { derivedBalance: true } : {}),
      ...(row.issues?.length ? { amountValidationIssue: row.issues.join(",") } : {}),
      row: { sourcePage: row.page },
      extractionProvenance: { startPage: row.page, endPage: row.page, sourceIndex, method: "page_layout" },
    },
  }));
}

// verified (every balance step checked) beats unavailable beats failed; then
// fewer breaks, then more rows.
function candidateRank(candidate) {
  const status = candidate.balanceValidation.status;
  return [status === "verified" ? 2 : status === "unavailable" ? 1 : 0,
    -candidate.balanceValidation.breaks.length, candidate.transactions.length];
}

function betterCandidate(left, right) {
  const a = candidateRank(left);
  const b = candidateRank(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? left : right;
  return left;
}

export async function processBankStatementMarkdownLocal(markdown, { pageCount = 1, pdfBytes = null } = {}) {
  const { deterministic, account, amounts, runningBalance, resilience, pdfColumns, layout } =
    await loadBankStatementModules();
  const candidates = [];
  const attempts = {};

  // 1. The Markdown tables AnyDoc produced.
  let normalized = deterministic.deterministicTransactionsFromAnydoc(markdown);
  const source = amounts.extractBankStatementMarkdownAmounts(markdown);
  if (normalized?.transactions?.length) {
    // AnyDoc can preserve all cells while shifting an empty debit/credit cell
    // in the normalized table. Reapply the amounts read from the original
    // Markdown columns before judging running-balance continuity.
    normalized = amounts.reconcileBankStatementMarkdownAmounts({ ...normalized, openingBalance: source.openingBalance }, markdown);
    candidates.push({
      pipeline: "deterministic_anydoc",
      headers: normalized.headers,
      transactions: resilience.addBankStatementPageProvenance(normalized.transactions, {
        startPage: 1, endPage: Math.max(1, Number(pageCount) || 1), method: "deterministic_anydoc",
      }),
      openingBalance: source.openingBalance,
      markdownAmounts: normalized.markdownAmountDiagnostics ?? null,
    });
  } else attempts.deterministic_anydoc = "no transaction table";

  // 2. The page itself: every word where the bank printed it. Rows that AnyDoc
  // turned into prose, totals lines and wrapped amounts are read correctly here.
  let pageLayout = null;
  // pdf.js loads from the agent's own modules; the copied worker files cannot import it.
  let pages = null;
  if (pdfBytes) {
    try {
      pages = await readPdfPages(pdfBytes);
    } catch (error) {
      attempts.pdf_text = error instanceof Error ? error.message : String(error);
    }
  }
  if (pages) {
    try {
      pageLayout = layout.extractBankStatementLayout(pages);
      if (pageLayout.detected && pageLayout.rows.length) {
        candidates.push({
          pipeline: "page_layout",
          headers: pageLayout.columns.map((column) => column.label),
          transactions: transactionsFromLayoutRows(pageLayout.rows),
          openingBalance: pageLayout.openingBalance,
        });
      } else attempts.page_layout = pageLayout.issues?.join(",") || "no rows";
    } catch (error) {
      attempts.page_layout = error instanceof Error ? error.message : String(error);
    }
  }

  // 3. The original fixed PNB/Central Bank column readers.
  if (!candidates.length && pages) {
    try {
      const physical = pdfColumns.extractBankStatementPhysicalColumns(pages);
      if (physical.detected && physical.rows.length) {
        candidates.push({ pipeline: "physical_pdf_columns", physicalLayout: physical.layout, headers: [`physical:${physical.layout}`],
          transactions: transactionsFromPhysicalRows(physical.rows), openingBalance: source.openingBalance });
      }
    } catch (error) {
      attempts.physical_pdf_columns = error instanceof Error ? error.message : String(error);
    }
  }

  if (!candidates.length) {
    const error = new Error("The bank-statement tables could not be normalized deterministically.");
    error.code = "deterministic_extraction_unavailable";
    throw error;
  }
  for (const candidate of candidates) {
    candidate.balanceValidation = runningBalance.validateRunningBalanceContinuity(candidate.transactions, candidate.openingBalance);
  }
  // Prefer the page reading when it proves more of the statement; keep the
  // Markdown reading when both are equally proven.
  const chosen = candidates.reduce((best, candidate) => betterCandidate(best, candidate));

  // Account and period: what the page labels say first, Markdown second.
  const fromLayout = pageLayout?.detected ? pageLayout.account : {};
  const fromMarkdown = account.extractAccountFromBankStatementMarkdown(markdown);
  const saneHolder = (value) => (String(value || "").length <= 80 ? value : "");
  const statementAccount = account.mergeBankStatementAccount(fromLayout, { ...fromMarkdown, accountHolderName: saneHolder(fromMarkdown.accountHolderName) });
  const dates = chosen.transactions.map((transaction) => transaction.transaction_date).filter(Boolean).sort();

  // A balance mismatch is a review condition, not a parser crash. The backend
  // repeats this validation and safely marks the import as requiring manual
  // review, so no inconsistent statement can be posted automatically.
  return {
    parsed: {
      account: statementAccount,
      statementPeriodStart: pageLayout?.statementPeriodStart || dates[0] || null,
      statementPeriodEnd: pageLayout?.statementPeriodEnd || dates.at(-1) || null,
      openingBalance: chosen.openingBalance ?? null,
      closingBalance: pageLayout?.closingBalance ?? null,
      transactions: chosen.transactions,
      pageResults: [],
    },
    diagnostics: {
      pipeline: chosen.pipeline,
      physicalLayout: chosen.physicalLayout ?? null,
      rowCount: chosen.transactions.length,
      headers: chosen.headers,
      normalized: true,
      markdownAmounts: chosen.markdownAmounts ?? null,
      balanceValidation: chosen.balanceValidation,
      duplicateRowsRemoved: chosen.pipeline === "page_layout" ? pageLayout.duplicatesRemoved : 0,
      derivedBalances: chosen.pipeline === "page_layout" ? pageLayout.derivedBalances : false,
      candidates: candidates.map((candidate) => ({
        pipeline: candidate.pipeline, rows: candidate.transactions.length, balance: candidate.balanceValidation.status,
        breaks: candidate.balanceValidation.breaks.length,
      })),
      attempts,
      used: true,
    },
  };
}

export async function parseDocumentLocal(request = {}) {
  const startedAt = performance.now();
  const output = normalizeOutput(request.output || request.outputFormat);
  const { bytes, fileName } = await readRequestBytes(request);
  const format = requestedFormat(request, fileName, bytes);
  if (!format) {
    throw new Error("Document format could not be detected. Supply a supported file extension or format.");
  }

  try {
    if (output === "markdown") {
      const markdown = await toMarkdownBytes(bytes, format);
      return {
        outputFormat: "markdown",
        content: markdown,
        metadata: metadata({ fileName, format, bytes, startedAt, structured: false }),
      };
    }
    if (format === "pdf") {
      const markdown = await toMarkdownBytes(bytes, format);
      const bankStatement = await processBankStatementMarkdownLocal(markdown, {
        pageCount: request.pageCount || approximatePdfPageCount(bytes),
        pdfBytes: bytes,
      });
      return {
        outputFormat: "json",
        content: bankStatement.parsed,
        metadata: {
          ...metadata({ fileName, format, bytes, startedAt, structured: true }),
          sourceFormat: "anydoc_markdown",
          diagnostics: bankStatement.diagnostics,
        },
      };
    }
    const document = await toDocument(bytes, format);
    return {
      outputFormat: "json",
      content: jsonSafeDocument(document),
      metadata: metadata({ fileName, format, bytes, startedAt, structured: true }),
    };
  } catch (error) {
    const wrapped = new Error(error?.message || "Document could not be parsed locally.");
    wrapped.code = error?.code || "parse_failed";
    throw wrapped;
  }
}
