import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const execute = process.argv.includes("--execute");
if (!execute) throw new Error("Refusing to repair retained ledger identities without --execute.");
const TALLY_URL = "http://127.0.0.1:9000";
const COMPANY_NAME = "Solution Nyx";
const DATA_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const CLEANUP_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/tally-import/ad380a368955/cleanup/cleanup-state.json");
const RECONCILIATION_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/retained-master-reconciliation.json");
const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const cleanup = JSON.parse(readFileSync(CLEANUP_PATH, "utf8"));
const reconciliation = JSON.parse(readFileSync(RECONCILIATION_PATH, "utf8"));

const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const decodeXml = (value) => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const tagText = (xml, name) => xml.match(new RegExp(`<${name}(?: [^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
const counter = (xml, name) => Number(tagText(xml, name) || 0);
const languageNameXml = (name) => `<LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>${escapeXml(name)}</NAME></NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>`;

async function postXml(xml) {
  const response = await fetch(TALLY_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8" }, body: xml, signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally HTTP ${response.status}: ${text.slice(0, 1000)}`);
  return text;
}

async function liveNames() {
  const xml = await postXml(`<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Solution Nyx Identity Repair</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Solution Nyx Identity Repair"><TYPE>Ledger</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`);
  return new Set([...xml.matchAll(/<LEDGER\b[^>]*\bNAME="([^"]+)"/gi)].map((match) => decodeXml(match[1])));
}

function envelope(messages) {
  return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

function validate(response, expected, mutation) {
  const result = { created: counter(response, "CREATED"), altered: counter(response, "ALTERED"), deleted: counter(response, "DELETED"), errors: counter(response, "ERRORS"), exceptions: counter(response, "EXCEPTIONS"), lineError: tagText(response, "LINEERROR") || null };
  if (result[mutation] !== expected || result.errors || result.exceptions || result.lineError) throw new Error(`${mutation} mismatch: ${JSON.stringify(result)}`);
  return result;
}

const STATE_NAMES = new Map([["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"], ["27", "Maharashtra"]]);
function ledgerCreateXml(ledger) {
  const stateName = ledger.gstStateCode ? STATE_NAMES.get(String(ledger.gstStateCode)) : null;
  const registrationType = ledger.gstRegistrationType === "Regular" ? "Regular" : "Unregistered/Consumer";
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(ledger.name)}" ACTION="Create"><NAME>${escapeXml(ledger.name)}</NAME><PARENT>${escapeXml(ledger.parent)}</PARENT><ISBILLWISEON>${ledger.billWise ? "Yes" : "No"}</ISBILLWISEON><AFFECTSSTOCK>No</AFFECTSSTOCK>${stateName ? `<COUNTRYNAME>India</COUNTRYNAME><STATENAME>${stateName}</STATENAME>` : ""}<GSTREGISTRATIONTYPE>${registrationType}</GSTREGISTRATIONTYPE>${ledger.gstin ? `<PARTYGSTIN>${escapeXml(ledger.gstin)}</PARTYGSTIN>` : ""}${languageNameXml(ledger.name)}</LEDGER></TALLYMESSAGE>`;
}

const customers = dataset.masters.ledgers.filter((ledger) => ledger.category === "customer");
const uglyNames = cleanup.retained.ledgers.filter((name) => /\s-\sC\d{5}$/i.test(name));
const repairs = uglyNames.map((historicalOldName) => {
  const code = Number(historicalOldName.match(/C(\d{5})$/i)[1]);
  const index = code - 10_001;
  const currentName = reconciliation.mappings.find((item) => item.oldName === historicalOldName)?.newName;
  const target = customers[index];
  if (!currentName || !target) throw new Error(`Cannot map retained identity ${historicalOldName}.`);
  return { historicalOldName, index, currentName, target };
});

const before = await liveNames();
const changes = repairs.filter(({ currentName, target }) => currentName !== target.name);
for (const { currentName, target } of changes) {
  if (!before.has(currentName)) throw new Error(`Retained source ledger is missing: ${currentName}`);
  if (!before.has(target.name)) throw new Error(`Expected duplicate target ledger is missing: ${target.name}`);
}

if (changes.length) {
  const swaps = changes.map((change, index) => ({ ...change, holdingName: `Account Reclassification Holding ${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}` }));
  for (const { holdingName } of swaps) if (before.has(holdingName)) throw new Error(`Holding ledger already exists: ${holdingName}`);
  const holdMessages = swaps.map(({ target, holdingName }) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(target.name)}" ACTION="Alter"><NAME>${escapeXml(holdingName)}</NAME>${languageNameXml(holdingName)}</LEDGER></TALLYMESSAGE>`);
  validate(await postXml(envelope(holdMessages)), changes.length, "altered");
  const renameMessages = changes.map(({ currentName, target }) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(currentName)}" ACTION="Alter"><NAME>${escapeXml(target.name)}</NAME><PARENT>${escapeXml(target.parent)}</PARENT>${languageNameXml(target.name)}</LEDGER></TALLYMESSAGE>`);
  validate(await postXml(envelope(renameMessages)), changes.length, "altered");
  const vacatedByName = new Map(changes.map(({ currentName }) => [currentName, dataset.masters.ledgers.find((ledger) => ledger.name === currentName)]));
  const releaseMessages = swaps.map(({ currentName, holdingName }) => {
    const ledger = vacatedByName.get(currentName);
    if (!ledger) throw new Error(`Vacated ledger definition not found: ${currentName}`);
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(holdingName)}" ACTION="Alter"><NAME>${escapeXml(ledger.name)}</NAME><PARENT>${escapeXml(ledger.parent)}</PARENT>${languageNameXml(ledger.name)}</LEDGER></TALLYMESSAGE>`;
  });
  validate(await postXml(envelope(releaseMessages)), changes.length, "altered");
}

const finalReusedNames = new Set(repairs.map(({ target }) => target.name));
const vacatedLedgers = changes.map(({ currentName }) => dataset.masters.ledgers.find((ledger) => ledger.name === currentName)).filter((ledger) => ledger && !finalReusedNames.has(ledger.name));

const after = await liveNames();
for (const { target } of repairs) if (!after.has(target.name)) throw new Error(`Exact retained target is missing after repair: ${target.name}`);
for (const ledger of vacatedLedgers) if (!after.has(ledger.name)) throw new Error(`Vacated planned ledger was not recreated: ${ledger.name}`);
const codedRemaining = [...after].filter((name) => /\s-\sC\d{5}$/i.test(name));
if (codedRemaining.length) throw new Error(`Coded ledger names remain: ${codedRemaining.join(", ")}`);

reconciliation.status = "complete";
reconciliation.updatedAt = new Date().toISOString();
reconciliation.identityRepair = { completedAt: reconciliation.updatedAt, exactIndexMapping: true, identitySwaps: changes.length, renamedRetainedIdentities: changes.length, recreatedVacatedLedgers: 0 };
reconciliation.mappings = repairs.map(({ historicalOldName, index, currentName, target }) => ({ oldName: historicalOldName, datasetCustomerIndex: index, priorReconciledName: currentName, newName: target.name, parent: target.parent, reconciled: true }));
reconciliation.retainedExistingMastersToReuse.ledgers = [...cleanup.retained.ledgers.filter((name) => !/\s-\sC\d{5}$/i.test(name)), ...repairs.map(({ target }) => target.name)];
writeFileSync(RECONCILIATION_PATH, `${JSON.stringify(reconciliation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "complete", repairs: repairs.length, identitySwaps: changes.length, codedRemaining: codedRemaining.length }, null, 2));
