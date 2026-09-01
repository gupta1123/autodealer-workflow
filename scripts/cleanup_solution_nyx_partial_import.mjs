import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const COMPANY_NAME = "Solution Nyx";
const execute = process.argv.includes("--execute");
const DATA_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const PACK_ROOT = path.resolve(ROOT, "output/solution-nyx-fy26-27/tally-import/ad380a368955");
const IMPORT_STATE_PATH = path.join(PACK_ROOT, "import-state.json");
const CLEANUP_DIR = path.join(PACK_ROOT, "cleanup");
const CLEANUP_STATE_PATH = path.join(CLEANUP_DIR, "cleanup-state.json");
const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const importState = JSON.parse(readFileSync(IMPORT_STATE_PATH, "utf8"));

if (!execute) throw new Error("Refusing to delete without --execute.");
mkdirSync(CLEANUP_DIR, { recursive: true });

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function tagText(xml, name) {
  return xml.match(new RegExp(`<${name}(?: [^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function counter(xml, name) {
  const value = tagText(xml, name);
  return value ? Number(value) : 0;
}

async function postXml(xml, timeout = 60_000) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: xml,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally HTTP ${response.status}: ${text.slice(0, 1000)}`);
  return text;
}

function exportCollectionXml(name, type, fields, dates = false) {
  return [
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${escapeXml(name)}</ID></HEADER>`,
    `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>`,
    dates ? "<SVFROMDATE>20260401</SVFROMDATE><SVTODATE>20260823</SVTODATE>" : "",
    `</STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="${escapeXml(name)}"><TYPE>${type}</TYPE><FETCH>${fields}</FETCH></COLLECTION>`,
    "</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
}

async function liveVouchers() {
  const xml = await postXml(exportCollectionXml("Solution Nyx Cleanup Vouchers", "Voucher", "Date,VoucherNumber,VoucherTypeName,Reference,MasterID", true));
  return [...xml.matchAll(/<VOUCHER\b[^>]*>[\s\S]*?<\/VOUCHER>/gi)].map((match) => ({
    raw: match[0],
    date: tagText(match[0], "DATE"),
    voucherNumber: tagText(match[0], "VOUCHERNUMBER"),
    voucherType: tagText(match[0], "VOUCHERTYPENAME"),
    reference: tagText(match[0], "REFERENCE"),
    masterId: Number(tagText(match[0], "MASTERID")),
  }));
}

async function liveNames(type) {
  const xml = await postXml(exportCollectionXml(`Solution Nyx Cleanup ${type}`, type, "Name"));
  return new Set([...xml.matchAll(new RegExp(`<${type}\\b[^>]*\\bNAME="([^"]+)"`, "gi"))].map((match) => match[1]
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function displayDate(yyyymmdd) {
  return `${Number(yyyymmdd.slice(6, 8))}-${MONTHS[Number(yyyymmdd.slice(4, 6)) - 1]}-${yyyymmdd.slice(0, 4)}`;
}

function voucherDeletionEnvelope(vouchers) {
  const messages = vouchers.map((voucher) => [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER DATE="${displayDate(voucher.date)}" TAGNAME="Voucher Number" TAGVALUE="${escapeXml(voucher.voucherNumber)}" VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Delete">`,
    "</VOUCHER></TALLYMESSAGE>",
  ].join(""));
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function masterDeletionEnvelope(type, names) {
  const messages = names.map((name) => [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<${type.toUpperCase()} NAME="${escapeXml(name)}" ACTION="Delete"><NAME>${escapeXml(name)}</NAME></${type.toUpperCase()}>`,
    "</TALLYMESSAGE>",
  ].join(""));
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function validateResponse(response, expected, label, allowCannotDelete = false) {
  const result = {
    deleted: counter(response, "DELETED"),
    altered: counter(response, "ALTERED"),
    created: counter(response, "CREATED"),
    errors: counter(response, "ERRORS"),
    exceptions: counter(response, "EXCEPTIONS"),
    lineError: tagText(response, "LINEERROR") || null,
  };
  const deletionCountMatches = allowCannotDelete
    ? result.deleted + result.errors === expected
    : result.deleted === expected && result.errors === 0;
  const allowedLineError = allowCannotDelete && result.errors > 0 && result.lineError === "Cannot be deleted!";
  if (!deletionCountMatches || result.exceptions || (result.lineError && !allowedLineError) || result.altered || result.created) {
    throw new Error(`${label} cleanup mismatch: expected DELETED=${expected}; received ${JSON.stringify(result)}`);
  }
  return result;
}

async function deleteVouchers(state) {
  const generatedReferences = new Set(dataset.vouchers.map((voucher) => voucher.reference));
  const expectedImported = importState.completed
    .filter((item) => item.category === "vouchers")
    .reduce((sum, item) => sum + item.records, 0) + Number(importState.failed?.result?.created ?? 0);
  const live = await liveVouchers();
  const targets = live.filter((voucher) => generatedReferences.has(voucher.reference));
  if (targets.length === 0 && state.deleted.vouchers === expectedImported) return;
  if (targets.length + state.deleted.vouchers !== expectedImported) throw new Error(`Expected ${expectedImported} imported vouchers, found ${targets.length} live plus ${state.deleted.vouchers} already deleted.`);
  for (const [index, batch] of chunks(targets, 50).entries()) {
    const response = await postXml(voucherDeletionEnvelope(batch));
    validateResponse(response, batch.length, `voucher batch ${index + 1}`);
    state.deleted.vouchers += batch.length;
    state.updatedAt = new Date().toISOString();
    writeFileSync(CLEANUP_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(`Deleted voucher batch ${index + 1}: ${batch.length}`);
  }
  const remaining = (await liveVouchers()).filter((voucher) => generatedReferences.has(voucher.reference));
  if (remaining.length) throw new Error(`${remaining.length} generated voucher references remain after cleanup.`);
}

async function deleteMasterPhase(state, { label, type, names }) {
  const current = await liveNames(type);
  const targets = names.filter((name) => current.has(name));
  state.deleted[label] = names.length - targets.length;
  state.retained[label] = [];
  for (const [index, batch] of chunks(targets, 100).entries()) {
    const response = await postXml(masterDeletionEnvelope(type, batch));
    const result = validateResponse(response, batch.length, `${label} batch ${index + 1}`, true);
    state.deleted[label] += result.deleted;
    state.updatedAt = new Date().toISOString();
    writeFileSync(CLEANUP_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(`Processed ${label} batch ${index + 1}: deleted=${result.deleted}, retained=${result.errors}`);
  }
  const refreshed = await liveNames(type);
  state.retained[label] = names.filter((name) => refreshed.has(name));
  state.updatedAt = new Date().toISOString();
  writeFileSync(CLEANUP_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function main() {
  const state = (() => {
    try { return JSON.parse(readFileSync(CLEANUP_STATE_PATH, "utf8")); } catch { return {
    status: "in_progress",
    companyName: COMPANY_NAME,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deleted: { vouchers: 0, stockItems: 0, ledgers: 0, stockGroups: 0, godowns: 0, groups: 0 },
    retained: { stockItems: [], ledgers: [], stockGroups: [], godowns: [], groups: [] },
  }; }
  })();
  state.retained ??= { stockItems: [], ledgers: [], stockGroups: [], godowns: [], groups: [] };
  writeFileSync(CLEANUP_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await deleteVouchers(state);
  const phases = [
    { label: "stockItems", type: "StockItem", names: dataset.masters.stockItems.map((item) => item.name) },
    { label: "ledgers", type: "Ledger", names: dataset.masters.ledgers.map((item) => item.name) },
    { label: "stockGroups", type: "StockGroup", names: dataset.masters.stockGroups.map((item) => item.name) },
    { label: "godowns", type: "Godown", names: dataset.masters.godowns.map((item) => item.name) },
    { label: "groups", type: "Group", names: dataset.masters.groups.map((item) => item.name) },
  ];
  for (const phase of phases) await deleteMasterPhase(state, phase);
  const retainedTotal = Object.values(state.retained).reduce((sum, values) => sum + values.length, 0);
  state.status = retainedTotal === 0 ? "complete" : "complete_with_edit_log_retained_masters";
  state.completedAt = new Date().toISOString();
  state.updatedAt = state.completedAt;
  writeFileSync(CLEANUP_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(state, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
