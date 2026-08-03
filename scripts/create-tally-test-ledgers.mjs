#!/usr/bin/env node

const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const COMPANY_NAME = process.env.TALLY_COMPANY || "";
const GROUP_NAME = process.env.TALLY_GROUP || "Sundry Debtors";
const LEDGER_COUNT = Number(process.env.LEDGER_COUNT || 1000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const PREFIX = process.env.LEDGER_PREFIX || "AI Match Test Party";
const DRY_RUN = process.env.DRY_RUN !== "0";
const INCLUDE_EDGE_CASES = process.env.INCLUDE_EDGE_CASES !== "0";

const edgeCaseLedgers = [
  "Kamal Traders",
  "Kamla Traders",
  "Kamaal Traders",
  "Kamal Trading Co",
  "Kamal Steel",
  "Kamal Metal",
  "Kamal Enterprises",
  "Ambika Traders Malegaon Baramati Pune",
  "Ambika Steel",
  "Ambika Trading Co",
  "Sargvny Traders",
  "Sarvagny Traders",
  "Sarang Traders",
  "Sahil Transport And Suppliers",
  "Sahil Steel Suppliers",
  "Sahil Transport",
  "Jai Bhagwan Banarasidas Jindal",
  "Bangarsidas R Jindal",
  "Manibhaddar Steel And Cement Company",
  "Manibhadra Steel Cement Co",
  "Axis Bank WCDL A/c 92108044607205",
  "Axis Bank OD Account",
  "Interest Credit",
  "Bank Charges",
  "Cash",
];

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function uniqueNames(names) {
  const seen = new Set();
  const result = [];
  for (const name of names) {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name.trim());
  }
  return result;
}

function buildLedgerNames() {
  const seedNames = INCLUDE_EDGE_CASES ? edgeCaseLedgers : [];
  const generatedCount = Math.max(0, LEDGER_COUNT - uniqueNames(seedNames).length);
  const generated = Array.from({ length: generatedCount }, (_, index) => {
    return `${PREFIX} ${String(index + 1).padStart(4, "0")}`;
  });
  return uniqueNames([...seedNames, ...generated]).slice(0, LEDGER_COUNT);
}

function tallyMessageForLedger(name) {
  const ledgerName = escapeXml(name);
  return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <LEDGER NAME="${ledgerName}" ACTION="Create">
          <NAME>${ledgerName}</NAME>
          <PARENT>${escapeXml(GROUP_NAME)}</PARENT>
          <ISBILLWISEON>Yes</ISBILLWISEON>
          <AFFECTSSTOCK>No</AFFECTSSTOCK>
          <OPENINGBALANCE>0</OPENINGBALANCE>
        </LEDGER>
      </TALLYMESSAGE>`;
}

function buildEnvelope(ledgerNames) {
  const companyBlock = COMPANY_NAME
    ? `
          <SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`
    : "";

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>${companyBlock}
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${ledgerNames.map(tallyMessageForLedger).join("")}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function postToTally(xml) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
    },
    body: xml,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Tally request failed with HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }
  return text;
}

async function main() {
  if (!Number.isFinite(LEDGER_COUNT) || LEDGER_COUNT < 0) {
    throw new Error("LEDGER_COUNT must be a non-negative number.");
  }
  if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE <= 0) {
    throw new Error("BATCH_SIZE must be greater than zero.");
  }

  const ledgerNames = buildLedgerNames();
  const batches = chunk(ledgerNames, Math.floor(BATCH_SIZE));
  console.log(`Tally URL: ${TALLY_URL}`);
  console.log(`Company: ${COMPANY_NAME || "(currently loaded Tally company)"}`);
  console.log(`Group: ${GROUP_NAME}`);
  console.log(`Ledgers to create: ${ledgerNames.length}`);
  console.log(`Batch size: ${Math.floor(BATCH_SIZE)}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);

  if (DRY_RUN) {
    console.log("\nSample ledger names:");
    for (const name of ledgerNames.slice(0, 20)) {
      console.log(`- ${name}`);
    }
    console.log("\nDry run only. Set DRY_RUN=0 to post these ledgers to Tally.");
    return;
  }

  for (const [index, batch] of batches.entries()) {
    const xml = buildEnvelope(batch);
    const responseText = await postToTally(xml);
    console.log(`Batch ${index + 1}/${batches.length}: created/imported ${batch.length} ledgers`);
    console.log(responseText.slice(0, 500).replace(/\s+/g, " ").trim());
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
