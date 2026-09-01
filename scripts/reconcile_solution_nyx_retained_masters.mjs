import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const COMPANY_NAME = "Solution Nyx";
const execute = process.argv.includes("--execute");
const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArgument ? Number(limitArgument.split("=")[1]) : Infinity;
const DATA_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const CLEANUP_STATE_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/tally-import/ad380a368955/cleanup/cleanup-state.json");
const OUTPUT_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/retained-master-reconciliation.json");

const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const cleanup = JSON.parse(readFileSync(CLEANUP_STATE_PATH, "utf8"));

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function tagText(xml, name) {
  return xml.match(new RegExp(`<${name}(?: [^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

async function postXml(xml) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: xml,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally HTTP ${response.status}: ${text.slice(0, 1000)}`);
  return text;
}

async function liveLedgerNames() {
  const xml = await postXml(`<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Solution Nyx Reconciliation Ledgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Solution Nyx Reconciliation Ledgers"><TYPE>Ledger</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`);
  return new Set([...xml.matchAll(/<LEDGER\b[^>]*\bNAME="([^"]+)"/gi)].map((match) => decodeXml(match[1])));
}

function renameEnvelope(mappings) {
  const messages = mappings.map(({ oldName, ledger }) => [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(oldName)}" ACTION="Alter">`,
    `<NAME>${escapeXml(ledger.name)}</NAME><PARENT>${escapeXml(ledger.parent)}</PARENT>`,
    `<LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>${escapeXml(ledger.name)}</NAME></NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>`,
    "</LEDGER></TALLYMESSAGE>",
  ].join(""));
  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

async function main() {
  const uglyNames = cleanup.retained.ledgers.filter((name) => /\s-\sC\d{5}$/i.test(name));
  const before = await liveLedgerNames();
  const customerLedgers = dataset.masters.ledgers.filter((ledger) => ledger.category === "customer");
  const retainedGroups = new Set(cleanup.retained.groups);
  const targetLedgers = customerLedgers.filter((ledger) => retainedGroups.has(ledger.parent)).slice(0, uglyNames.length);
  if (targetLedgers.length !== uglyNames.length) throw new Error("Not enough realistic target customer ledgers under retained groups for reconciliation.");
  let previous = null;
  try { previous = JSON.parse(readFileSync(OUTPUT_PATH, "utf8")); } catch { /* first reconciliation */ }
  const mappings = uglyNames.map((historicalOldName, index) => {
    const previousMapping = previous?.mappings?.find((item) => item.oldName === historicalOldName);
    const candidates = [historicalOldName, previousMapping?.newName, previousMapping?.priorReconciledName].filter(Boolean);
    const sourceName = candidates.find((name) => before.has(name));
    const ledger = targetLedgers[index];
    if (!sourceName && before.has(ledger.name)) return { historicalOldName, oldName: ledger.name, ledger };
    if (!sourceName) throw new Error(`Cannot locate retained ledger descended from ${historicalOldName}.`);
    return { historicalOldName, oldName: sourceName, ledger };
  });
  for (const { oldName, ledger } of mappings) {
    if (oldName === ledger.name) continue;
    const oldExists = before.has(oldName);
    const newExists = before.has(ledger.name);
    if (oldExists && newExists) throw new Error(`Both old and target ledger exist: ${oldName} / ${ledger.name}`);
    if (!oldExists && !newExists) throw new Error(`Neither old nor target ledger exists: ${oldName} / ${ledger.name}`);
  }
  const pending = mappings.filter(({ oldName, ledger }) => oldName !== ledger.name && before.has(oldName)).slice(0, limit);
  if (pending.length && !execute) throw new Error(`Refusing to alter ${pending.length} ledger(s) without --execute.`);
  let responseSummary = null;
  if (pending.length) {
    const response = await postXml(renameEnvelope(pending));
    responseSummary = {
      altered: Number(tagText(response, "ALTERED") || 0),
      errors: Number(tagText(response, "ERRORS") || 0),
      exceptions: Number(tagText(response, "EXCEPTIONS") || 0),
      lineError: tagText(response, "LINEERROR") || null,
    };
    if (responseSummary.altered !== pending.length || responseSummary.errors || responseSummary.exceptions || responseSummary.lineError) {
      throw new Error(`Ledger rename mismatch: ${JSON.stringify(responseSummary)}`);
    }
  }
  const after = await liveLedgerNames();
  const result = {
    companyName: COMPANY_NAME,
    updatedAt: new Date().toISOString(),
    status: mappings.every(({ oldName, ledger }) => oldName === ledger.name ? after.has(ledger.name) : !after.has(oldName) && after.has(ledger.name)) ? "complete" : "in_progress",
    responseSummary,
    mappings: mappings.map(({ historicalOldName, oldName, ledger }) => ({ oldName: historicalOldName, priorReconciledName: oldName, newName: ledger.name, parent: ledger.parent, reconciled: after.has(ledger.name) && (oldName === ledger.name || !after.has(oldName)) })),
    retainedExistingMastersToReuse: {
      groups: cleanup.retained.groups,
      ledgers: [...cleanup.retained.ledgers.filter((name) => !/\s-\sC\d{5}$/i.test(name)), ...targetLedgers.map((ledger) => ledger.name)],
    },
  };
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
