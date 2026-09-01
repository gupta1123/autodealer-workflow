import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const RECONCILIATION_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/retained-master-reconciliation.json");
const MASTER_BATCH_SIZE = 250;
const VOUCHER_BATCH_SIZE = 50;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function tallyDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO voucher date: ${value}`);
  return `${match[1]}${match[2]}${match[3]}`;
}

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid money value: ${value}`);
  return parsed.toFixed(2);
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function languageNameXml(name) {
  return `<LANGUAGENAME.LIST><NAME.LIST TYPE="String"><NAME>${escapeXml(name)}</NAME></NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>`;
}

function groupXml(group) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<GROUP NAME="${escapeXml(group.name)}" ACTION="Create">`,
    `<NAME>${escapeXml(group.name)}</NAME>`,
    `<PARENT>${escapeXml(group.parent)}</PARENT>`,
    "<ISSUBLEDGER>No</ISSUBLEDGER>",
    languageNameXml(group.name),
    "</GROUP></TALLYMESSAGE>",
  ].join("");
}

const STATE_NAMES = new Map([
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["27", "Maharashtra"],
]);

function gstLedgerConfiguration(name) {
  const dutyHead = name.includes("CGST")
    ? "CGST"
    : name.includes("SGST")
      ? "SGST"
      : name.includes("IGST")
        ? "IGST"
        : null;
  if (!dutyHead) return "";
  const rate = name.includes("18%") ? "18" : "9";
  return `<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>${dutyHead}</GSTDUTYHEAD><RATEOFTAXCALCULATION>${rate}</RATEOFTAXCALCULATION>`;
}

function ledgerXml(ledger) {
  const stateName = ledger.gstStateCode ? STATE_NAMES.get(String(ledger.gstStateCode)) : null;
  const registrationType = ledger.gstRegistrationType === "Regular" ? "Regular" : "Unregistered/Consumer";
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(ledger.name)}" ACTION="Create">`,
    `<NAME>${escapeXml(ledger.name)}</NAME>`,
    `<PARENT>${escapeXml(ledger.parent)}</PARENT>`,
    `<ISBILLWISEON>${ledger.billWise ? "Yes" : "No"}</ISBILLWISEON>`,
    "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
    stateName ? `<COUNTRYNAME>India</COUNTRYNAME><STATENAME>${stateName}</STATENAME>` : "",
    `<GSTREGISTRATIONTYPE>${registrationType}</GSTREGISTRATIONTYPE>`,
    ledger.gstin ? `<PARTYGSTIN>${escapeXml(ledger.gstin)}</PARTYGSTIN>` : "",
    gstLedgerConfiguration(ledger.name),
    languageNameXml(ledger.name),
    "</LEDGER></TALLYMESSAGE>",
  ].join("");
}

function unitXml(unit) {
  const decimals = ["KG", "LTR", "MTR"].includes(unit.name) ? 3 : 0;
  const formalNames = {
    KG: "Kilograms",
    NOS: "Numbers",
    PCS: "Pieces",
    BDL: "Bundles",
    BAG: "Bags",
    BOX: "Boxes",
    LTR: "Litres",
    MTR: "Metres",
    CASE: "Cases",
    SET: "Sets",
  };
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    '<UNIT ACTION="Create">',
    `<NAME>${escapeXml(unit.name)}</NAME>`,
    "<ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>",
    `<ORIGINALNAME>${escapeXml(formalNames[unit.name])}</ORIGINALNAME>`,
    `<DECIMALPLACES>${decimals}</DECIMALPLACES>`,
    "</UNIT></TALLYMESSAGE>",
  ].join("");
}

function godownXml(godown) {
  const parent = godown.parent === "Primary" ? "" : godown.parent;
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<GODOWN NAME="${escapeXml(godown.name)}" ACTION="Create">`,
    `<NAME>${escapeXml(godown.name)}</NAME>`,
    `<PARENT>${escapeXml(parent)}</PARENT>`,
    languageNameXml(godown.name),
    "</GODOWN></TALLYMESSAGE>",
  ].join("");
}

function stockGroupXml(group) {
  const parent = group.parent === "Primary" ? "" : group.parent;
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<STOCKGROUP NAME="${escapeXml(group.name)}" ACTION="Create">`,
    `<NAME>${escapeXml(group.name)}</NAME>`,
    `<PARENT>${escapeXml(parent)}</PARENT>`,
    "<ISADDABLE>Yes</ISADDABLE>",
    languageNameXml(group.name),
    "</STOCKGROUP></TALLYMESSAGE>",
  ].join("");
}

function stockItemXml(item) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<STOCKITEM NAME="${escapeXml(item.name)}" ACTION="Create">`,
    `<NAME>${escapeXml(item.name)}</NAME>`,
    `<PARENT>${escapeXml(item.parent)}</PARENT>`,
    `<BASEUNITS>${escapeXml(item.baseUnit)}</BASEUNITS>`,
    "<GSTAPPLICABLE>Applicable</GSTAPPLICABLE>",
    "<GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>",
    "<GSTHSNINFERAPPLICABILITY>Specify Details Here</GSTHSNINFERAPPLICABILITY>",
    `<GSTHSNNAME>${escapeXml(item.hsnCode)}</GSTHSNNAME>`,
    languageNameXml(item.name),
    "</STOCKITEM></TALLYMESSAGE>",
  ].join("");
}

function masterEnvelope(companyName, messages) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function billAllocationsXml(entry, isDebit) {
  return (entry.billAllocations ?? []).map((bill) => {
    const amount = Math.abs(Number(bill.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid bill allocation ${bill.reference}`);
    return [
      "<BILLALLOCATIONS.LIST>",
      `<NAME>${escapeXml(bill.reference)}</NAME>`,
      `<BILLTYPE>${escapeXml(bill.type)}</BILLTYPE>`,
      `<AMOUNT>${isDebit ? "-" : ""}${amount.toFixed(2)}</AMOUNT>`,
      "</BILLALLOCATIONS.LIST>",
    ].join("");
  }).join("");
}

function ledgerEntryXml(entry, partyLedger, listTag) {
  const debit = Number(entry.debit);
  const credit = Number(entry.credit);
  const isDebit = debit > 0;
  const amount = isDebit ? debit : credit;
  if (!Number.isFinite(amount) || amount <= 0 || (debit > 0 && credit > 0)) {
    throw new Error(`Invalid ledger entry for ${entry.ledgerName}`);
  }
  return [
    `<${listTag}>`,
    `<LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${entry.ledgerName === partyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    billAllocationsXml(entry, isDebit),
    `</${listTag}>`,
  ].join("");
}

function inventoryEntryXml(voucher, line, accountingEntry) {
  const isPurchase = voucher.voucherType === "Purchase";
  const quantity = Number(line.quantity);
  const rate = Number(line.rate);
  const taxableValue = Number(line.taxableValue);
  if (![quantity, rate, taxableValue].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error(`Invalid inventory line on ${voucher.id}`);
  }
  const signedQuantity = `${isPurchase ? "" : "-"}${quantity.toFixed(3)} ${escapeXml(line.unit)}`;
  const signedAmount = `${isPurchase ? "-" : ""}${taxableValue.toFixed(2)}`;
  const allocation = [
    "<BATCHALLOCATIONS.LIST>",
    `<GODOWNNAME>${escapeXml(line.godown)}</GODOWNNAME>`,
    isPurchase ? `<DESTINATIONGODOWNNAME>${escapeXml(line.godown)}</DESTINATIONGODOWNNAME>` : "",
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    `<ACTUALQTY>${signedQuantity}</ACTUALQTY>`,
    `<BILLEDQTY>${signedQuantity}</BILLEDQTY>`,
    "</BATCHALLOCATIONS.LIST>",
  ].join("");
  return [
    "<ALLINVENTORYENTRIES.LIST>",
    `<STOCKITEMNAME>${escapeXml(line.stockItem)}</STOCKITEMNAME>`,
    `<ISDEEMEDPOSITIVE>${isPurchase ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<RATE>${rate.toFixed(2)}/${escapeXml(line.unit)}</RATE>`,
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    `<ACTUALQTY>${signedQuantity}</ACTUALQTY>`,
    `<BILLEDQTY>${signedQuantity}</BILLEDQTY>`,
    allocation,
    "<ACCOUNTINGALLOCATIONS.LIST>",
    `<LEDGERNAME>${escapeXml(accountingEntry.ledgerName)}</LEDGERNAME>`,
    `<ISDEEMEDPOSITIVE>${isPurchase ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    "</ACCOUNTINGALLOCATIONS.LIST>",
    "</ALLINVENTORYENTRIES.LIST>",
  ].join("");
}

function voucherXml(voucher, remotePrefix) {
  const date = tallyDate(voucher.date);
  const isInventoryVoucher = ["Sales", "Purchase"].includes(voucher.voucherType);
  let inventoryXml = "";
  let entries = voucher.entries;
  if (isInventoryVoucher) {
    const accountLedger = voucher.voucherType === "Sales" ? "Solution Sales Account" : "Solution Purchase Account";
    const accountingEntry = voucher.entries.find((entry) => entry.ledgerName === accountLedger);
    if (!accountingEntry || voucher.inventoryLines.length !== 1) throw new Error(`Inventory accounting shape mismatch on ${voucher.id}`);
    inventoryXml = inventoryEntryXml(voucher, voucher.inventoryLines[0], accountingEntry);
    entries = voucher.entries.filter((entry) => entry !== accountingEntry);
  }
  const listTag = isInventoryVoucher ? "LEDGERENTRIES.LIST" : "ALLLEDGERENTRIES.LIST";
  const view = isInventoryVoucher ? "Invoice Voucher View" : "Accounting Voucher View";
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER REMOTEID="${escapeXml(`${remotePrefix}${voucher.id}`)}" VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Create" OBJVIEW="${view}">`,
    `<DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucher.voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(voucher.reference)}</REFERENCE>`,
    voucher.partyLedger ? `<PARTYLEDGERNAME>${escapeXml(voucher.partyLedger)}</PARTYLEDGERNAME>` : "",
    `<PERSISTEDVIEW>${view}</PERSISTEDVIEW>`,
    isInventoryVoucher ? "<VCHENTRYMODE>Item Invoice</VCHENTRYMODE><ISINVOICE>Yes</ISINVOICE>" : "<ISINVOICE>No</ISINVOICE>",
    "<ISOPTIONAL>No</ISOPTIONAL><DIFFACTUALQTY>No</DIFFACTUALQTY>",
    `<NARRATION>${escapeXml(voucher.narration)}</NARRATION>`,
    inventoryXml,
    ...entries.map((entry) => ledgerEntryXml(entry, voucher.partyLedger, listTag)),
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

function voucherEnvelope(companyName, vouchers, messages) {
  const dates = vouchers.map((voucher) => tallyDate(voucher.date)).sort();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${dates[0]}</SVFROMDATE><SVTODATE>${dates.at(-1)}</SVTODATE><SVCURRENTDATE>${dates.at(-1)}</SVCURRENTDATE>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function writeBatch({ outputRoot, category, serial, label, records, messages, xml, importOrder }) {
  const fileName = `${String(serial).padStart(3, "0")}-${label}.xml`;
  const relativePath = `${category}/${fileName}`;
  const absolutePath = path.join(outputRoot, relativePath);
  writeFileSync(absolutePath, xml, "utf8");
  const sha256 = createHash("sha256").update(xml).digest("hex");
  importOrder.push({
    order: importOrder.length + 1,
    category,
    file: relativePath.replaceAll("\\", "/"),
    records,
    tallyMessageCount: messages.length,
    bytes: Buffer.byteLength(xml),
    sha256,
  });
}

function main() {
  const sourceBytes = readFileSync(SOURCE_PATH);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const dataset = JSON.parse(sourceBytes.toString("utf8"));
  if (!dataset.validation?.passed) throw new Error("Source review JSON has not passed validation.");
  if (dataset.metadata?.companyName !== "Solution Nyx") throw new Error("Refusing to build imports for a company other than Solution Nyx.");
  if (dataset.vouchers.some((voucher) => ["Credit Note", "Debit Note"].includes(voucher.voucherType))) {
    throw new Error("Source contains prohibited Credit Note or Debit Note vouchers.");
  }
  const reconciliation = (() => {
    try { return JSON.parse(readFileSync(RECONCILIATION_PATH, "utf8")); } catch { return null; }
  })();
  if (reconciliation && reconciliation.status !== "complete") throw new Error("Retained-master reconciliation is not complete.");
  const reusedGroups = new Set(reconciliation?.retainedExistingMastersToReuse?.groups ?? []);
  const reusedLedgers = new Set(reconciliation?.retainedExistingMastersToReuse?.ledgers ?? []);
  const groupsToCreate = dataset.masters.groups.filter((group) => !reusedGroups.has(group.name));
  const ledgersToCreate = dataset.masters.ledgers.filter((ledger) => !reusedLedgers.has(ledger.name));
  for (const name of reusedGroups) if (!dataset.masters.groups.some((group) => group.name === name)) throw new Error(`Reused group is absent from current dataset: ${name}`);
  for (const name of reusedLedgers) if (!dataset.masters.ledgers.some((ledger) => ledger.name === name)) throw new Error(`Reused ledger is absent from current dataset: ${name}`);

  const outputRoot = path.resolve(ROOT, "output/solution-nyx-fy26-27/tally-import", sourceSha256.slice(0, 12));
  mkdirSync(path.join(outputRoot, "masters"), { recursive: true });
  mkdirSync(path.join(outputRoot, "vouchers"), { recursive: true });
  const importOrder = [];
  let masterSerial = 1;

  const masterPhases = [
    ["accounting-groups", groupsToCreate.map(groupXml)],
    ["inventory-foundations", [
      ...dataset.masters.godowns.map(godownXml),
      ...dataset.masters.stockGroups.map(stockGroupXml),
    ]],
    ["ledgers", ledgersToCreate.map(ledgerXml)],
    ["stock-items", dataset.masters.stockItems.map(stockItemXml)],
  ];
  for (const [phase, messages] of masterPhases) {
    for (const [batchIndex, batch] of chunks(messages, MASTER_BATCH_SIZE).entries()) {
      writeBatch({
        outputRoot,
        category: "masters",
        serial: masterSerial++,
        label: `${phase}-${String(batchIndex + 1).padStart(2, "0")}`,
        records: batch.length,
        messages: batch,
        xml: masterEnvelope(dataset.metadata.companyName, batch),
        importOrder,
      });
    }
  }

  const voucherPriority = new Map([["Purchase", 0], ["Sales", 1], ["Receipt", 2], ["Payment", 3], ["Journal", 4], ["Contra", 5]]);
  const orderedVouchers = [...dataset.vouchers].sort((left, right) => (
    left.date.localeCompare(right.date) ||
    (voucherPriority.get(left.voucherType) - voucherPriority.get(right.voucherType)) ||
    left.id.localeCompare(right.id)
  ));
  for (const [batchIndex, batch] of chunks(orderedVouchers, VOUCHER_BATCH_SIZE).entries()) {
    const messages = batch.map((voucher) => voucherXml(voucher, dataset.reviewInstructions.idempotencyPrefix));
    writeBatch({
      outputRoot,
      category: "vouchers",
      serial: batchIndex + 1,
      label: `vouchers-${String(batchIndex + 1).padStart(3, "0")}`,
      records: batch.length,
      messages,
      xml: voucherEnvelope(dataset.metadata.companyName, batch, messages),
      importOrder,
    });
  }

  const masterFiles = importOrder.filter((item) => item.category === "masters");
  const voucherFiles = importOrder.filter((item) => item.category === "vouchers");
  const manifest = {
    schemaVersion: "1.0.0",
    status: "generated_not_imported",
    companyName: dataset.metadata.companyName,
    source: {
      path: SOURCE_PATH,
      sha256: sourceSha256,
      generatorVersion: dataset.generatorVersion,
    },
    generatedAt: new Date().toISOString(),
    format: "TallyPrime XML Data Interchange",
    batchSizes: { masters: MASTER_BATCH_SIZE, vouchers: VOUCHER_BATCH_SIZE },
    counts: {
      masterRecords: masterFiles.reduce((sum, item) => sum + item.records, 0),
      voucherRecords: voucherFiles.reduce((sum, item) => sum + item.records, 0),
      masterFiles: masterFiles.length,
      voucherFiles: voucherFiles.length,
      totalFiles: importOrder.length,
      vouchersByType: dataset.validation.checks.voucherTypeCounts,
    },
    safeguards: {
      targetCompanyLocked: "Solution Nyx",
      creditNotesIncluded: 0,
      debitNotesIncluded: 0,
      importPerformed: false,
      stableRemoteIdPrefix: dataset.reviewInstructions.idempotencyPrefix,
      importSequenceRequired: true,
      skippedUnusedUnitMasters: dataset.masters.units.length,
      skippedUnusedUnitReason: "No new unit masters are needed; all inventory vouchers and items use the existing MTS unit.",
      reusedRetainedGroups: reusedGroups.size,
      reusedRetainedLedgers: reusedLedgers.size,
    },
    instructions: [
      "Keep Solution Nyx selected in TallyPrime and import files strictly in manifest order.",
      "Import every masters file before the first voucher file.",
      "Stop immediately if Tally reports CREATED/ALTERED/ERROR/EXCEPTION counts different from the current file's record count.",
      "Do not re-import a completed file without first checking the stable REMOTEID and voucher-number results.",
      "After all files, reconcile master totals, Day Book voucher counts, stock summary, GST ledgers, and 3,000 open bills.",
    ],
    importOrder,
  };
  const manifestPath = path.join(outputRoot, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const readme = `# Solution Nyx Tally import pack

Status: generated, not imported.

Source SHA-256: \`${sourceSha256}\`

This pack contains ${manifest.counts.masterFiles} master XML files and ${manifest.counts.voucherFiles} voucher XML files. Import them strictly in the order listed in \`manifest.json\`.

## TallyPrime UI import

1. Open the company **Solution Nyx**.
2. Import every file under \`masters/\` in numeric filename order using **Alt+O > Masters**.
3. Confirm the import result for each file before continuing. Stop on any error or exception.
4. Import every file under \`vouchers/\` in numeric filename order using **Alt+O > Transactions**.
5. Do not repeat a completed file without reconciling its stable REMOTEID and voucher numbers.
6. After completion, reconcile the target master counts, six voucher-type counts, stock summary, GST ledgers, and 3,000 open bills.

Credit Notes and Debit Notes are not included. The XML files are locked to **Solution Nyx** through \`SVCURRENTCOMPANY\`.
`;
  writeFileSync(path.join(outputRoot, "README.md"), readme, "utf8");
  console.log(JSON.stringify({ outputRoot, manifestPath, counts: manifest.counts, sourceSha256 }, null, 2));
}

main();
