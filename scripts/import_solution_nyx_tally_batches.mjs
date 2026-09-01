import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const args = process.argv.slice(2);
const execute = args.includes("--execute");
const allowVoucherAltered = args.includes("--allow-voucher-altered");
const coalesceVoucherFiles = Number(args.find((arg) => arg.startsWith("--coalesce-voucher-files="))?.slice("--coalesce-voucher-files=".length) ?? 1);
if (!Number.isInteger(coalesceVoucherFiles) || coalesceVoucherFiles < 1 || coalesceVoucherFiles > 10) throw new Error("--coalesce-voucher-files must be an integer from 1 to 10.");
const packArg = args.find((arg) => arg.startsWith("--pack="))?.slice("--pack=".length);
const allowAlteredOrders = new Set(args
  .filter((arg) => arg.startsWith("--allow-altered-order="))
  .map((arg) => Number(arg.slice("--allow-altered-order=".length)))
  .filter(Number.isFinite));
if (!packArg) throw new Error("Provide --pack=<absolute-or-relative-pack-directory>.");
if (!execute) throw new Error("Refusing to import without the explicit --execute flag.");

const packRoot = path.resolve(process.cwd(), packArg);
const manifestPath = path.join(packRoot, "manifest.json");
const statePath = path.join(packRoot, "import-state.json");
const responseDir = path.join(packRoot, "responses");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.companyName !== "Solution Nyx") throw new Error(`Target company is not Solution Nyx: ${manifest.companyName}`);
if (manifest.status !== "generated_not_imported") throw new Error(`Pack status is not importable: ${manifest.status}`);
if (manifest.safeguards?.creditNotesIncluded !== 0 || manifest.safeguards?.debitNotesIncluded !== 0) {
  throw new Error("Pack contains prohibited Credit Note or Debit Note vouchers.");
}

mkdirSync(responseDir, { recursive: true });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function counter(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, "i"));
  return match ? Number(match[1].trim()) : 0;
}

function lineError(xml) {
  return xml.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

function parseImportResponse(xml, httpStatus) {
  const result = {
    httpStatus,
    created: counter(xml, "CREATED"),
    altered: counter(xml, "ALTERED"),
    deleted: counter(xml, "DELETED"),
    cancelled: counter(xml, "CANCELLED"),
    ignored: counter(xml, "IGNORED"),
    errors: counter(xml, "ERRORS"),
    exceptions: counter(xml, "EXCEPTIONS"),
    lineError: lineError(xml),
  };
  result.accepted = httpStatus >= 200 && httpStatus < 300 && !result.lineError && result.errors === 0 && result.exceptions === 0;
  return result;
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

async function postXml(xml) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: xml,
    signal: AbortSignal.timeout(120_000),
  });
  return { httpStatus: response.status, text: await response.text() };
}

async function verifyCompanyAvailable() {
  const request = [
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Solution Nyx Import Preflight</ID></HEADER>",
    "<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE>",
    '<COLLECTION NAME="Solution Nyx Import Preflight"><TYPE>Group</TYPE><FETCH>Name</FETCH></COLLECTION>',
    "</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
  const response = await postXml(request);
  if (response.httpStatus < 200 || response.httpStatus >= 300 || !/<GROUP\b/i.test(response.text)) {
    throw new Error(`Solution Nyx preflight export failed at ${TALLY_URL}.`);
  }
}

function initialState() {
  return {
    schemaVersion: "1.0.0",
    status: "in_progress",
    companyName: manifest.companyName,
    tallyUrl: TALLY_URL,
    manifestSha256: sha256(readFileSync(manifestPath)),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed: [],
    failed: null,
  };
}

async function main() {
  await verifyCompanyAvailable();
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : initialState();
  const currentManifestSha256 = sha256(readFileSync(manifestPath));
  if (state.manifestSha256 !== currentManifestSha256) {
    const completedStillMatches = state.completed.every((completed) => {
      const current = manifest.importOrder.find((item) => item.order === completed.order);
      return current?.file === completed.file && current?.records === completed.records;
    });
    if (!completedStillMatches) throw new Error("Updated manifest no longer matches already completed batches.");
    state.previousManifestSha256 = state.manifestSha256;
    state.manifestSha256 = currentManifestSha256;
    state.manifestUpdatedAt = new Date().toISOString();
    writeJsonAtomic(statePath, state);
  }
  if (state.status === "complete") {
    console.log(JSON.stringify({ status: state.status, message: "This pack is already marked complete.", completed: state.completed.length }, null, 2));
    return;
  }
  const completedOrders = new Set(state.completed.map((item) => item.order));
  console.log(`Importing ${manifest.importOrder.length - completedOrders.size} remaining batch(es) into Solution Nyx at ${TALLY_URL}.`);

  const pendingItems = manifest.importOrder.filter((item) => !completedOrders.has(item.order));
  const importGroups = [];
  for (let index = 0; index < pendingItems.length;) {
    const item = pendingItems[index];
    const group = item.category === "vouchers" ? pendingItems.slice(index, index + coalesceVoucherFiles).filter((candidate) => candidate.category === "vouchers") : [item];
    importGroups.push(group);
    index += group.length;
  }

  for (const items of importGroups) {
    const loaded = items.map((item) => {
      const xmlPath = path.join(packRoot, item.file);
      const xmlBytes = readFileSync(xmlPath);
      if (sha256(xmlBytes) !== item.sha256) throw new Error(`Hash mismatch for ${item.file}.`);
      const xml = xmlBytes.toString("utf8");
      if (!xml.includes("<SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY>")) throw new Error(`Company lock missing in ${item.file}.`);
      return { item, xml };
    });
    const first = loaded[0];
    const expectedRecords = items.reduce((sum, item) => sum + item.records, 0);
    const xml = loaded.length === 1 ? first.xml : first.xml.replace(/<REQUESTDATA>[\s\S]*?<\/REQUESTDATA>/i, `<REQUESTDATA>${loaded.flatMap(({ xml: value }) => [...value.matchAll(/<TALLYMESSAGE\b[\s\S]*?<\/TALLYMESSAGE>/gi)].map((match) => match[0])).join("")}</REQUESTDATA>`);

    let posted;
    try {
      posted = await postXml(xml);
    } catch (error) {
      state.failed = { orders: items.map((item) => item.order), files: items.map((item) => item.file), error: error.message, at: new Date().toISOString() };
      state.updatedAt = new Date().toISOString();
      writeJsonAtomic(statePath, state);
      throw error;
    }
    const responsePath = path.join(responseDir, `${String(items[0].order).padStart(3, "0")}-${String(items.at(-1).order).padStart(3, "0")}.xml`);
    writeFileSync(responsePath, posted.text, "utf8");
    const result = parseImportResponse(posted.text, posted.httpStatus);
    const alteredIsAllowed = items.every((item) => allowAlteredOrders.has(item.order) || (allowVoucherAltered && item.category === "vouchers"));
    const hasUnexpectedMutation = (!alteredIsAllowed && result.altered !== 0) || result.deleted !== 0 || result.cancelled !== 0 || result.ignored !== 0;
    const createdMatches = alteredIsAllowed
      ? result.created + result.altered === expectedRecords
      : result.created === expectedRecords;
    if (!result.accepted || hasUnexpectedMutation || !createdMatches) {
      state.failed = { orders: items.map((item) => item.order), files: items.map((item) => item.file), expectedRecords, result, responsePath, at: new Date().toISOString() };
      state.updatedAt = new Date().toISOString();
      writeJsonAtomic(statePath, state);
      throw new Error(`Stopped at ${items[0].file}..${items.at(-1).file}: expected accepted records=${expectedRecords}; received ${JSON.stringify(result)}.`);
    }

    for (const item of items) state.completed.push({
      order: item.order,
      category: item.category,
      file: item.file,
      records: item.records,
      result: { ...result, coalescedOrders: items.map((entry) => entry.order), coalescedAcceptedRecords: expectedRecords },
      completedAt: new Date().toISOString(),
    });
    state.failed = null;
    state.updatedAt = new Date().toISOString();
    writeJsonAtomic(statePath, state);
    console.log(`[${items[0].order}-${items.at(-1).order}/${manifest.importOrder.length}] ${items.length} file(s): CREATED=${result.created}, ALTERED=${result.altered}`);
  }

  state.status = "complete";
  state.completedAt = new Date().toISOString();
  state.updatedAt = state.completedAt;
  writeJsonAtomic(statePath, state);
  console.log(JSON.stringify({ status: state.status, completedBatches: state.completed.length, completedAt: state.completedAt, statePath }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
