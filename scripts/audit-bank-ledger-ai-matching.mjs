#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const promptSourcePath = path.join(repoRoot, "apps/api/src/lib/bank-statement-ledger-matching.ts");
const defaultLedgerFilePath = path.join(repoRoot, "docs/tally-test-ledgers.md");
const defaultReportPath = path.join(repoRoot, "docs/bank-ledger-ai-matching-audit-report.md");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_BANK_LEDGER_MODEL || "deepseek/deepseek-v4-pro";
const MAX_TOKENS = Number(process.env.OPENROUTER_BANK_LEDGER_MAX_OUTPUT_TOKENS || 4096);
const TIMEOUT_MS = Number(process.env.OPENROUTER_BANK_LEDGER_TIMEOUT_MS || 45_000);
const DEFAULT_BATCH_SIZE = Math.min(
  25,
  Math.max(1, Number(process.env.OPENROUTER_BANK_LEDGER_BATCH_SIZE || 3) || 3)
);

const defaultCases = [
  {
    id: "sahil-tra-close-match",
    description: "NEFT RECEIPT FROM SAHIL TRA",
    referenceNumber: "SAHILTRA0801",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil TRA",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sahil Transport", "Sahil Transport And Suppliers"],
    },
  },
  {
    id: "sahil-transp-close-match",
    description: "NEFT RECEIPT FROM SAHIL TRANSP",
    referenceNumber: "SAHILTRANSP0801",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil TRANSP",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sahil Transport", "Sahil Transport And Suppliers"],
    },
  },
  {
    id: "sahil-ste-direct-match",
    description: "NEFT RECEIPT FROM SAHIL STE",
    referenceNumber: "SAHILSTE0801",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil STE",
    expected: {
      matchType: "direct_match",
      ledgerName: "Sahil Steel Suppliers",
      candidateLedgerNames: [],
    },
  },
  {
    id: "sahil-root-close-match",
    description: "NEFT RECEIPT FROM SAHIL",
    referenceNumber: "SAHIL0801",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sahil Transport", "Sahil Transport And Suppliers", "Sahil Steel Suppliers"],
    },
  },
  {
    id: "sahil-sup-close-match",
    description: "NEFT RECEIPT FROM SAHIL SUP",
    referenceNumber: "SAHILSUP0801",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil SUP",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sahil Transport And Suppliers", "Sahil Steel Suppliers"],
    },
  },
  {
    id: "kamal-trad-close-match",
    description: "NEFT RECEIPT FROM KAMAL TRAD",
    referenceNumber: "KAMALTRAD0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamal TRAD",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Kamal Traders", "Kamla Traders", "Kamaal Traders", "Kamal Trading Co"],
    },
  },
  {
    id: "kamal-root-close-match",
    description: "NEFT RECEIPT FROM KAMAL",
    referenceNumber: "KAMAL0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamal",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: [
        "Kamal Traders",
        "Kamla Traders",
        "Kamaal Traders",
        "Kamal Trading Co",
        "Kamal Steel",
        "Kamal Metal",
        "Kamal Enterprises",
      ],
    },
  },
  {
    id: "kamla-traders-ocr-close-match",
    description: "NEFT RECEIPT FROM KAMLA TRADERS",
    referenceNumber: "KAMLATRD0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamla Traders",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Kamla Traders", "Kamal Traders"],
    },
  },
  {
    id: "kamal-ste-direct-match",
    description: "NEFT RECEIPT FROM KAMAL STE",
    referenceNumber: "KAMALSTE0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamal STE",
    expected: {
      matchType: "direct_match",
      ledgerName: "Kamal Steel",
      candidateLedgerNames: [],
    },
  },
  {
    id: "kamal-metal-direct-match",
    description: "NEFT RECEIPT FROM KAMAL MET",
    referenceNumber: "KAMALMET0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamal MET",
    expected: {
      matchType: "direct_match",
      ledgerName: "Kamal Metal",
      candidateLedgerNames: [],
    },
  },
  {
    id: "kamal-enterprise-direct-match",
    description: "NEFT RECEIPT FROM KAMAL ENTERPRISE",
    referenceNumber: "KAMALENT0801",
    creditAmount: 45000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Kamal Enterprise",
    expected: {
      matchType: "direct_match",
      ledgerName: "Kamal Enterprises",
      candidateLedgerNames: [],
    },
  },
  {
    id: "ambika-root-close-match",
    description: "NEFT RECEIPT FROM AMBIKA",
    referenceNumber: "AMBIKA0801",
    creditAmount: 50000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Ambika",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: [
        "Ambika Traders Malegaon Baramati Pune",
        "Ambika Steel",
        "Ambika Trading Co",
      ],
    },
  },
  {
    id: "ambika-trad-close-match",
    description: "NEFT RECEIPT FROM AMBIKA TRAD",
    referenceNumber: "AMBIKATRD0801",
    creditAmount: 50000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Ambika TRAD",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Ambika Traders Malegaon Baramati Pune", "Ambika Trading Co"],
    },
  },
  {
    id: "ambika-steel-direct-match",
    description: "NEFT RECEIPT FROM AMBIKA STEEL",
    referenceNumber: "AMBIKASTE0801",
    creditAmount: 50000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Ambika Steel",
    expected: {
      matchType: "direct_match",
      ledgerName: "Ambika Steel",
      candidateLedgerNames: [],
    },
  },
  {
    id: "sarvagny-ocr-close-match",
    description: "NEFT RECEIPT FROM SARGVNY TRADERS",
    referenceNumber: "SARGVNY0801",
    creditAmount: 25000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sargvny Traders",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sargvny Traders", "Sarvagny Traders"],
    },
  },
  {
    id: "sarang-traders-direct-match",
    description: "NEFT RECEIPT FROM SARANG TRADERS",
    referenceNumber: "SARANG0801",
    creditAmount: 25000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sarang Traders",
    expected: {
      matchType: "direct_match",
      ledgerName: "Sarang Traders",
      candidateLedgerNames: [],
    },
  },
  {
    id: "manibhadra-ocr-close-match",
    description: "NEFT RECEIPT FROM MANIBHADRA STEEL CEMENT",
    referenceNumber: "MANIBHADRA0801",
    creditAmount: 30000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Manibhadra Steel Cement",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Manibhaddar Steel And Cement Company", "Manibhadra Steel Cement Co"],
    },
  },
  {
    id: "jindal-root-close-match",
    description: "NEFT RECEIPT FROM JINDAL",
    referenceNumber: "JINDAL0801",
    creditAmount: 35000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Jindal",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Jai Bhagwan Banarasidas Jindal", "Bangarsidas R Jindal"],
    },
  },
  {
    id: "axis-bank-root-close-match",
    description: "NEFT TRANSFER TO AXIS BANK",
    referenceNumber: "AXIS0801",
    creditAmount: null,
    debitAmount: 10000,
    category: "bank_transfer",
    counterpartyName: "Axis Bank",
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Axis Bank WCDL A/c 92108044607205", "Axis Bank OD Account"],
    },
  },
  {
    id: "axis-account-direct-match",
    description: "NEFT TRANSFER TO AXIS BANK WCDL A/C 92108044607205",
    referenceNumber: "AXISWCDL0801",
    creditAmount: null,
    debitAmount: 10000,
    category: "bank_transfer",
    counterpartyName: "Axis Bank WCDL A/c 92108044607205",
    expected: {
      matchType: "direct_match",
      ledgerName: "Axis Bank WCDL A/c 92108044607205",
      candidateLedgerNames: [],
    },
  },
  {
    id: "interest-credit-direct-match",
    description: "INTEREST CREDIT",
    referenceNumber: "INT0801",
    creditAmount: 900,
    debitAmount: null,
    category: "interest",
    counterpartyName: "Interest Credit",
    expected: {
      matchType: "direct_match",
      ledgerName: "Interest Credit",
      candidateLedgerNames: [],
    },
  },
  {
    id: "bank-charges-direct-match",
    description: "BANK CHARGES GST FOR NEFT",
    referenceNumber: "CHG0803",
    creditAmount: null,
    debitAmount: 118,
    category: "bank_charges",
    counterpartyName: "Bank Charges GST",
    expected: {
      matchType: "direct_match",
      ledgerName: "Bank Charges",
      candidateLedgerNames: [],
    },
  },
  {
    id: "cash-deposit-direct-match",
    description: "CASH DEPOSIT",
    referenceNumber: "CASH0801",
    creditAmount: 20000,
    debitAmount: null,
    category: "cash",
    counterpartyName: "Cash",
    expected: {
      matchType: "direct_match",
      ledgerName: "Cash",
      candidateLedgerNames: [],
    },
  },
  {
    id: "office-supplies-direct-match",
    description: "UPI PAYMENT TO OFFICE SUPPLIES",
    referenceNumber: "OFFICE0801",
    creditAmount: null,
    debitAmount: 3500,
    category: "office_expense",
    counterpartyName: "Office Supplies",
    expected: {
      matchType: "direct_match",
      ledgerName: "Office Supplies",
      candidateLedgerNames: [],
    },
  },
  {
    id: "transport-vendor-direct-match",
    description: "NEFT PAYMENT TO TRANSPORT VENDOR",
    referenceNumber: "TRANSPORT0801",
    creditAmount: null,
    debitAmount: 8500,
    category: "transport",
    counterpartyName: "Transport Vendor",
    expected: {
      matchType: "direct_match",
      ledgerName: "Transport Vendor",
      candidateLedgerNames: [],
    },
  },
  {
    id: "generic-upi-suspense",
    description: "UPI PAYMENT 9188201001",
    referenceNumber: "9188201001",
    creditAmount: null,
    debitAmount: 5500,
    category: "payment",
    counterpartyName: null,
    expected: {
      matchType: "suspense",
      ledgerName: null,
      candidateLedgerNames: [],
    },
  },
  {
    id: "sahil-tra-reject-wrong-saved-mapping",
    description: "NEFT RECEIPT FROM SAHIL TRA",
    referenceNumber: "SAHILTRA0802",
    creditAmount: 12000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: "Sahil TRA",
    savedMapping: {
      ledgerName: "Sahil Steel Suppliers",
      sourceLabel: "Previous wrong manual mapping",
      notes: "Should not override current root/descriptor collision.",
    },
    expected: {
      matchType: "close_match",
      ledgerName: null,
      candidateLedgerNames: ["Sahil Transport", "Sahil Transport And Suppliers"],
    },
  },
  {
    id: "reference-only-ignore-saved-mapping",
    description: "NEFT REF 928377001",
    referenceNumber: "928377001",
    creditAmount: 10000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: null,
    savedMapping: {
      ledgerName: "Kamal Traders",
      sourceLabel: "Previous narration mapping",
      notes: "Reference-only narration cannot validate party root.",
    },
    expected: {
      matchType: "suspense",
      ledgerName: null,
      candidateLedgerNames: [],
    },
  },
  {
    id: "reference-only-suspense",
    description: "NEFT REF 928377001",
    referenceNumber: "928377001",
    creditAmount: 10000,
    debitAmount: null,
    category: "receipt",
    counterpartyName: null,
    expected: {
      matchType: "suspense",
      ledgerName: null,
      candidateLedgerNames: [],
    },
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    ledgerFile: defaultLedgerFilePath,
    casesFile: "",
    report: defaultReportPath,
    filter: "",
    batchSize: DEFAULT_BATCH_SIZE,
    generatedLedgerCount: 0,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--ledger-file") options.ledgerFile = path.resolve(args[++index] || "");
    else if (arg === "--cases") options.casesFile = path.resolve(args[++index] || "");
    else if (arg === "--report") options.report = path.resolve(args[++index] || "");
    else if (arg === "--filter") options.filter = args[++index] || "";
    else if (arg === "--batch-size") {
      options.batchSize = Math.min(25, Math.max(1, Number(args[++index] || DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE));
    }
    else if (arg === "--generated-ledgers") {
      options.generatedLedgerCount = Math.min(5000, Math.max(0, Number(args[++index] || 0) || 0));
    }
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/audit-bank-ledger-ai-matching.mjs [options]",
        "",
        "Options:",
        "  --ledger-file <path>  Markdown ledger table or JSON array of {name, group} ledgers.",
        "  --cases <path>        JSON file with test cases. Defaults to built-in cases.",
        "  --report <path>       Markdown report path.",
        "  --filter <text,...>   Run cases whose id includes any comma-separated filter.",
        "  --batch-size <count>  Transactions per AI request (default: 12, maximum: 25).",
        "  --generated-ledgers N  Add N neutral static distractor ledgers (maximum: 5000).",
        "  --dry-run             Write report with prompts only; do not call OpenRouter.",
      ].join("\n"));
      process.exit(0);
    }
  }

  return options;
}

function extractPrompt(source) {
  const match = source.match(/const BANK_LEDGER_MATCHING_SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error(`Could not find BANK_LEDGER_MATCHING_SYSTEM_PROMPT in ${promptSourcePath}`);
  }
  return match[1];
}

function extractLedgerNames(markdown) {
  const relevant = markdown.split("## Generated Load-Test Ledgers")[0] || markdown;
  const matches = relevant
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("| `")) return [];
      const match = trimmed.match(/^\| `([^`]+)`/);
      return match ? [match[1].trim()] : [];
    });
  return [...new Set(matches)]
    .filter((name) => name && name !== "---")
    .map((name) => ({ name, group: "Sundry Debtors" }));
}

function extractLedgers(filePath, source) {
  if (path.extname(filePath).toLowerCase() !== ".json") {
    return extractLedgerNames(source);
  }

  const parsed = JSON.parse(source);
  const rows = Array.isArray(parsed) ? parsed : parsed?.ledgers;
  if (!Array.isArray(rows)) {
    throw new Error(`JSON ledger fixture must be an array or contain a ledgers array: ${filePath}`);
  }

  const ledgers = rows.flatMap((row) => {
    if (typeof row === "string" && row.trim()) {
      return [{ name: row.trim(), group: null }];
    }
    if (!row || typeof row !== "object" || typeof row.name !== "string" || !row.name.trim()) {
      return [];
    }
    return [{
      name: row.name.trim(),
      group: typeof row.group === "string" && row.group.trim() ? row.group.trim() : null,
    }];
  });

  const deduped = new Map();
  for (const ledger of ledgers) {
    const key = normalizeName(ledger.name);
    if (key && !deduped.has(key)) deduped.set(key, ledger);
  }
  return [...deduped.values()];
}

function addGeneratedLedgers(ledgers, count) {
  const deduped = new Map(ledgers.map((ledger) => [normalizeName(ledger.name), ledger]));
  for (let index = 1; index <= count; index += 1) {
    const name = `TMT Load Test Party ${String(index).padStart(4, "0")}`;
    const key = normalizeName(name);
    if (!deduped.has(key)) {
      deduped.set(key, {
        name,
        group: index % 2 === 0 ? "Sundry Creditors" : "Sundry Debtors",
      });
    }
  }
  return [...deduped.values()];
}

function normalizeName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameStringArrayIgnoreOrder(left = [], right = []) {
  const leftNormalized = left.map(normalizeName).sort();
  const rightNormalized = right.map(normalizeName).sort();
  return (
    leftNormalized.length === rightNormalized.length &&
    leftNormalized.every((value, index) => value === rightNormalized[index])
  );
}

function readJsonFromModel(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Model did not return JSON: ${raw.slice(0, 500)}`);
    return JSON.parse(match[0]);
  }
}

async function callOpenRouter(messages) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured. Use --dry-run to generate prompts without calling AI.");
  }

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3001",
          "X-Title": "Bank Ledger AI Matching Audit",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0,
          response_format: { type: "json_object" },
          max_tokens: Number.isFinite(MAX_TOKENS) && MAX_TOKENS > 0 ? MAX_TOKENS : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error?.message || payload?.message || `OpenRouter request failed (${response.status})`);
      }
      const content = payload?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((part) => part?.text || "").join("\n")
        : String(content || "");
      if (text.trim()) return text;
      lastError = "OpenRouter returned an empty message";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "OpenRouter request failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(lastError || "OpenRouter request failed");
}

function buildMessages(prompt, ledgers, testCases) {
  return [
    { role: "system", content: prompt },
    {
      role: "user",
      content: JSON.stringify({
        transactions: testCases.map((testCase, index) => ({
            index,
            transactionDate: testCase.transactionDate || "2026-06-08",
            description: testCase.description,
            referenceNumber: testCase.referenceNumber ?? null,
            debitAmount: testCase.debitAmount ?? null,
            creditAmount: testCase.creditAmount ?? null,
            transactionType: testCase.transactionType ?? null,
            category: testCase.category ?? null,
            counterpartyName: testCase.counterpartyName ?? null,
          })),
        tallyLedgers: ledgers.map((ledger) => ({ name: ledger.name, group: ledger.group })),
      }, null, 2),
    },
  ];
}

function evaluateCase(testCase, actual, index) {
  const match = actual?.matches?.find((entry) => Number(entry?.index) === index) || {};
  const expected = testCase.expected;
  const actualCandidateNames = Array.isArray(match.candidateLedgerNames)
    ? match.candidateLedgerNames
    : [];

  const matchTypeOk = match.matchType === expected.matchType;
  const ledgerNameOk = normalizeName(match.ledgerName) === normalizeName(expected.ledgerName);
  const candidatesOk = sameStringArrayIgnoreOrder(actualCandidateNames, expected.candidateLedgerNames);
  return {
    passed: matchTypeOk && ledgerNameOk && candidatesOk,
    match,
    checks: { matchTypeOk, ledgerNameOk, candidatesOk },
  };
}

function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\n/g, " ")
    .replace(/\|/g, "\\|");
}

function renderReport({ options, ledgers, prompt, results }) {
  const passedCount = results.filter((result) => result.evaluation?.passed).length;
  const now = new Date().toISOString();
  const lines = [
    "# Bank Ledger AI Matching Audit Report",
    "",
    `Generated at: ${now}`,
    "",
    `Model: \`${MODEL}\``,
    `Ledger file: \`${path.relative(repoRoot, options.ledgerFile)}\``,
    `Prompt source: \`${path.relative(repoRoot, promptSourcePath)}\``,
    `Ledger count: ${ledgers.length}`,
    `Batch size: ${options.batchSize}`,
    `Result: ${passedCount}/${results.length} passed`,
    "",
    "## Summary",
    "",
    "| Case | Expected | Actual | Status | Reason |",
    "|---|---|---|---|---|",
  ];

  for (const result of results) {
    const expected = result.testCase.expected;
    const actual = result.evaluation?.match;
    const expectedText = `${expected.matchType}${expected.ledgerName ? ` -> ${expected.ledgerName}` : ""}${expected.candidateLedgerNames?.length ? ` [${expected.candidateLedgerNames.join(", ")}]` : ""}`;
    const actualText = result.error
      ? `ERROR: ${result.error}`
      : `${actual?.matchType ?? "-"}${actual?.ledgerName ? ` -> ${actual.ledgerName}` : ""}${actual?.candidateLedgerNames?.length ? ` [${actual.candidateLedgerNames.join(", ")}]` : ""}`;
    lines.push(
      `| \`${markdownCell(result.testCase.id)}\` | ${markdownCell(expectedText)} | ${markdownCell(actualText)} | ${result.evaluation?.passed ? "PASS" : "FAIL"} | ${markdownCell(actual?.reason || result.error || "")} |`
    );
  }

  lines.push("", "## Details", "");
  for (const result of results) {
    lines.push(`### ${result.testCase.id}`, "");
    lines.push(`Description: \`${result.testCase.description}\``);
    lines.push(`Counterparty: \`${result.testCase.counterpartyName ?? ""}\``);
    lines.push("");
    lines.push("Expected:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(result.testCase.expected, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("Actual:");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(result.actual ?? { error: result.error }, null, 2));
    lines.push("```");
    lines.push("");
  }

  lines.push("## Prompt Snapshot", "", "```text", prompt, "```", "");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs();
  const [source, ledgerMarkdown] = await Promise.all([
    fs.readFile(promptSourcePath, "utf8"),
    fs.readFile(options.ledgerFile, "utf8"),
  ]);
  const prompt = extractPrompt(source);
  const ledgers = addGeneratedLedgers(
    extractLedgers(options.ledgerFile, ledgerMarkdown),
    options.generatedLedgerCount
  );
  const allCases = options.casesFile
    ? JSON.parse(await fs.readFile(options.casesFile, "utf8"))
    : defaultCases;
  const filterTerms = options.filter
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  const cases = filterTerms.length > 0
    ? allCases.filter((testCase) => filterTerms.some((term) => String(testCase.id).includes(term)))
    : allCases;

  if (cases.length === 0) {
    throw new Error(`No test cases matched filter: ${options.filter}`);
  }

  const results = [];
  for (const batch of chunkValues(cases, options.batchSize)) {
    const messages = buildMessages(prompt, ledgers, batch);
    if (options.dryRun) {
      batch.forEach((testCase, index) => {
        results.push({
          testCase,
          actual: { dryRun: true, batchIndex: index, messages },
          evaluation: { passed: false, match: null },
        });
      });
      continue;
    }

    try {
      const raw = await callOpenRouter(messages);
      const actual = readJsonFromModel(raw);
      batch.forEach((testCase, index) => {
        const evaluation = evaluateCase(testCase, actual, index);
        results.push({ testCase, actual, evaluation });
        console.log(`${evaluation.passed ? "PASS" : "FAIL"} ${testCase.id}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
      batch.forEach((testCase) => {
        results.push({ testCase, error: message, evaluation: { passed: false, match: null } });
        console.log(`FAIL ${testCase.id}: ${message}`);
      });
    }
  }

  const report = renderReport({ options, ledgers, prompt, results });
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, report, "utf8");
  console.log(`Report written to ${options.report}`);

  if (!options.dryRun && results.some((result) => !result.evaluation?.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
