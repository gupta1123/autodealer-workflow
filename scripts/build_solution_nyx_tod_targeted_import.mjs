import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const COMPANY = "Solution Nyx";
const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const DATA_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const SOURCE_PACK = path.resolve(ROOT, "output/solution-nyx-fy26-27/tally-import/8489163914d8");
const OUTPUT_PACK = path.resolve(ROOT, "output/solution-nyx-fy26-27/tod-targeted-70");
const QUOTAS = {
  TOD_BELOW_TIER: 14,
  TOD_NEAR_TIER: 12,
  TOD_EXACT_TIER: 12,
  TOD_ABOVE_TIER: 14,
  TOD_GROWTH_ACCOUNT: 7,
  TOD_HIGH_VOLUME: 6,
  TOD_NEW_ACCOUNT: 5,
};

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function decodeXml(value) {
  return String(value).replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&apos;", "'");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function voucherReference(block) {
  return decodeXml(block.match(/<REFERENCE\b[^>]*>([\s\S]*?)<\/REFERENCE>/i)?.[1]?.trim() ?? "");
}

function envelope(messages) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>",
    `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(COMPANY)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>`,
    `<REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`,
  ].join("");
}

function committedVoucherReferences() {
  const state = JSON.parse(readFileSync(path.join(SOURCE_PACK, "import-state.json"), "utf8"));
  const references = new Set();
  for (const item of state.completed.filter((entry) => entry.category === "vouchers")) {
    const xml = readFileSync(path.join(SOURCE_PACK, item.file), "utf8");
    for (const match of xml.matchAll(/<REFERENCE\b[^>]*>([\s\S]*?)<\/REFERENCE>/gi)) {
      const reference = decodeXml(match[1].trim());
      if (reference) references.add(reference);
    }
  }
  return references;
}

async function fetchLiveVoucherReferences() {
  const request = [
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Codex TOD Voucher References</ID></HEADER>",
    `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(COMPANY)}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>`,
    '<TDL><TDLMESSAGE><COLLECTION NAME="Codex TOD Voucher References" ISMODIFY="No"><TYPE>Voucher</TYPE><FILTER>CodexSalesOnly</FILTER><FETCH>Reference,VoucherNumber,VoucherTypeName</FETCH></COLLECTION><SYSTEM TYPE="Formulae" NAME="CodexSalesOnly">$VoucherTypeName = "Sales"</SYSTEM></TDLMESSAGE></TDL>',
    "</DESC></BODY></ENVELOPE>",
  ].join("");
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: request,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Tally returned HTTP ${response.status}`);
  const xml = await response.text();
  if (!/<VOUCHER\b/i.test(xml)) throw new Error("Solution Nyx voucher export returned no vouchers.");
  return new Set([...xml.matchAll(/<REFERENCE\b[^>]*>([\s\S]*?)<\/REFERENCE>/gi)].map((match) => decodeXml(match[1].trim())).filter(Boolean));
}

function selectCases(cases, liveReferences) {
  const selected = [];
  for (const [scenario, quota] of Object.entries(QUOTAS)) {
    const candidates = cases
      .filter((item) => item.scenario === scenario)
      .map((item) => ({
        ...item,
        existingSourceCount: item.sourceReferences.filter((reference) => liveReferences.has(reference)).length,
      }))
      .sort((left, right) => right.existingSourceCount - left.existingSourceCount || left.customerLedger.localeCompare(right.customerLedger, "en-IN"));
    if (candidates.length < quota) throw new Error(`Only ${candidates.length} ${scenario} cases are available; need ${quota}.`);
    selected.push(...candidates.slice(0, quota));
  }
  return selected;
}

function extractMessages(dataset, references) {
  const wanted = new Set(references);
  const datasetReferences = new Set(dataset.vouchers.map((voucher) => voucher.reference));
  for (const reference of wanted) if (!datasetReferences.has(reference)) throw new Error(`Dataset voucher is missing for ${reference}.`);
  const messages = new Map();
  const sourceManifest = JSON.parse(readFileSync(path.join(SOURCE_PACK, "manifest.json"), "utf8"));
  for (const item of sourceManifest.importOrder.filter((entry) => entry.category === "vouchers")) {
    const xml = readFileSync(path.join(SOURCE_PACK, item.file), "utf8");
    for (const match of xml.matchAll(/<TALLYMESSAGE\b[\s\S]*?<\/TALLYMESSAGE>/gi)) {
      const reference = voucherReference(match[0]);
      if (wanted.has(reference)) messages.set(reference, match[0]);
    }
    if (messages.size === wanted.size) break;
  }
  const missing = [...wanted].filter((reference) => !messages.has(reference));
  if (missing.length) throw new Error(`Could not locate ${missing.length} voucher XML messages: ${missing.slice(0, 5).join(", ")}`);
  return references.map((reference) => messages.get(reference));
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const liveReferences = committedVoucherReferences();
  const referenceSource = "guaranteed_import_state (interrupted uncommitted batch may be safely altered)";
  const selected = selectCases(dataset.expected.todCustomerPeriods, liveReferences);
  const missingReferences = selected.flatMap((item) => item.sourceReferences.filter((reference) => !liveReferences.has(reference)));
  const messages = extractMessages(dataset, missingReferences);
  const batchSize = 20;
  const voucherDir = path.join(OUTPUT_PACK, "vouchers");
  mkdirSync(voucherDir, { recursive: true });
  const importOrder = [];
  for (let offset = 0; offset < messages.length; offset += batchSize) {
    const batch = messages.slice(offset, offset + batchSize);
    const number = Math.floor(offset / batchSize) + 1;
    const relativeFile = `vouchers/${String(number).padStart(3, "0")}-tod-targeted.xml`;
    const xml = envelope(batch);
    writeFileSync(path.join(OUTPUT_PACK, relativeFile), xml, "utf8");
    importOrder.push({ order: number, category: "vouchers", file: relativeFile, records: batch.length, tallyMessageCount: batch.length, bytes: Buffer.byteLength(xml), sha256: sha256(xml) });
  }
  const scenarioCounts = Object.fromEntries(Object.keys(QUOTAS).map((scenario) => [scenario, selected.filter((item) => item.scenario === scenario).length]));
  const plan = {
    schemaVersion: "1.0.0",
    status: "ready_to_import",
    companyName: COMPANY,
    generatedAt: new Date().toISOString(),
    referenceSource,
    targetCustomerCount: selected.length,
    scenarioCounts,
    liveTodReferencesBefore: dataset.expected.todCustomerPeriods.flatMap((item) => item.sourceReferences).filter((reference) => liveReferences.has(reference)).length,
    vouchersToImport: missingReferences.length,
    customersAlreadyComplete: selected.filter((item) => item.existingSourceCount === 3).length,
    selectedCustomers: selected.map((item) => ({ customerLedger: item.customerLedger, scenario: item.scenario, expectedOutcome: item.expectedOutcome, sourceReferences: item.sourceReferences, existingSourceCount: item.existingSourceCount, missingSourceReferences: item.sourceReferences.filter((reference) => !liveReferences.has(reference)) })),
  };
  writeFileSync(path.join(OUTPUT_PACK, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const manifest = {
    schemaVersion: "1.0.0",
    status: "generated_not_imported",
    companyName: COMPANY,
    source: DATA_PATH,
    generatedAt: plan.generatedAt,
    format: "TallyPrime XML Data Interchange",
    counts: { vouchers: missingReferences.length, todCustomersCompletedAfterImport: selected.length },
    safeguards: { creditNotesIncluded: 0, debitNotesIncluded: 0 },
    instructions: ["Import only these missing TOD Sales vouchers into Solution Nyx."],
    importOrder,
  };
  writeFileSync(path.join(OUTPUT_PACK, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(path.join(OUTPUT_PACK, "selected-references.json"), `${JSON.stringify({ selectedCustomerLedgers: selected.map((item) => item.customerLedger), requiredReferences: selected.flatMap((item) => item.sourceReferences), importedReferences: missingReferences }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPack: OUTPUT_PACK, ...plan }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
