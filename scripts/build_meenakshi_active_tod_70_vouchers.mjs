import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const COMPANY = "Solution Nyx";
const STOCK_ITEM = "M S Scrap & Sponge Iron";
const SALES_LEDGER = "Solution Sales Account";
const UNIT = "MTS";
const PERIOD_START = "2026-08-15";
const PERIOD_END = "2026-09-14";
const DATA_END = "2026-08-24";
const OUTPUT = path.resolve(ROOT, "output/solution-nyx-fy26-27/meenakshi-active-tod-70");

const coveredCustomers = [
  "Apex Rebar Projects", "Apex Steel Corporation", "Balaji Rebar Projects", "Balaji Steel Corporation",
  "Bharat Rebar Projects", "Bharath Rebar Projects", "Bharath Steel Corporation", "Central India Rebar Projects",
  "Central India Steel Corporation", "Crystal Rebar Projects", "Crystal Steel Corporation", "Deccan Rebar Projects",
  "Deccan Steel Corporation", "Eastern Rebar Projects", "Eastern Steel Corporation", "Ganesh Rebar Projects",
  "Ganesh Steel Corporation", "Indus Rebar Projects", "Indus Steel Corporation", "Kaveri Rebar Projects",
  "Kaveri Steel Corporation", "Mahaveer Rebar Projects", "Mahaveer Steel Corporation", "Mahavir Rebar Projects",
  "Narmada Rebar Projects", "Narmada Steel Corporation", "Omkar Rebar Projects", "Orion Rebar Projects",
  "Orion Steel Corporation", "Pioneer Rebar Projects", "Pioneer Steel Corporation", "Sai Rebar Projects",
  "Shakti Rebar Projects", "Shakti Steel Corporation", "Surya Rebar Projects", "Surya Steel Corporation",
  "Triveni Rebar Projects", "Triveni Steel Corporation", "Vidarbha Rebar Projects", "Vidarbha Steel Corporation",
];

const noActivityCustomers = new Set([
  "Apex Steel Corporation", "Balaji Steel Corporation", "Bharat Rebar Projects",
  "Crystal Steel Corporation", "Kaveri Steel Corporation",
]);

const scenarioDefinitions = [
  { scenario: "below_first_slab", customers: 7, totalTonnes: "80.000", expectedTier: null, expectedPercentage: null },
  { scenario: "near_first_slab", customers: 7, totalTonnes: "95.000", expectedTier: null, expectedPercentage: null },
  { scenario: "first_slab", customers: 7, totalTonnes: "160.000", expectedTier: "100", expectedPercentage: "2" },
  { scenario: "second_slab", customers: 7, totalTonnes: "360.000", expectedTier: "250", expectedPercentage: "3" },
  { scenario: "top_slab", customers: 7, totalTonnes: "580.000", expectedTier: "500", expectedPercentage: "5" },
];

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function escapeXml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function compactDate(value) { return value.replaceAll("-", ""); }
function money(value) { return Number(value).toFixed(2); }
function quantity(value) { return Number(value).toFixed(3); }
function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function buildRows() {
  const activeCustomers = coveredCustomers.filter((name) => !noActivityCustomers.has(name));
  if (activeCustomers.length !== 35) throw new Error(`Expected 35 active customers; found ${activeCustomers.length}.`);
  const assigned = [];
  let customerOffset = 0;
  for (const definition of scenarioDefinitions) {
    for (let index = 0; index < definition.customers; index += 1) {
      assigned.push({ customer: activeCustomers[customerOffset], ...definition });
      customerOffset += 1;
    }
  }
  const vouchers = [];
  let sequence = 20_001;
  let dateOffset = 0;
  for (const assignment of assigned) {
    const total = Number(assignment.totalTonnes);
    const quantities = [total * 0.45, total * 0.55];
    for (let invoiceIndex = 0; invoiceIndex < quantities.length; invoiceIndex += 1) {
      const voucherNumber = `SI/26-27/${sequence}`;
      const reference = `INV/26-27/${sequence}`;
      const date = addDays(PERIOD_START, dateOffset % 10);
      const rate = 34_200 + ((sequence - 20_001) % 12) * 350;
      const taxableValue = Number((quantities[invoiceIndex] * rate).toFixed(2));
      vouchers.push({
        id: voucherNumber,
        remoteId: `SNX/26-27/${voucherNumber}`,
        voucherType: "Sales",
        voucherNumber,
        reference,
        date,
        partyLedger: assignment.customer,
        stockItem: STOCK_ITEM,
        salesLedger: SALES_LEDGER,
        quantity: quantity(quantities[invoiceIndex]),
        unit: UNIT,
        rate: money(rate),
        taxableValue: money(taxableValue),
        debit: money(taxableValue),
        credit: money(taxableValue),
        narration: `Goods supplied against ${reference}.`,
        scenario: assignment.scenario,
        expectedTierTonnes: assignment.expectedTier,
        expectedDiscountPercentage: assignment.expectedPercentage,
      });
      sequence += 1;
      dateOffset += 1;
    }
  }
  return { assigned, vouchers };
}

function tallyMessage(voucher) {
  const q = `${voucher.quantity} ${UNIT}`;
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    '<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">',
    `<DATE>${compactDate(voucher.date)}</DATE><EFFECTIVEDATE>${compactDate(voucher.date)}</EFFECTIVEDATE>`,
    '<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>',
    `<REFERENCE>${escapeXml(voucher.reference)}</REFERENCE><REFERENCEDATE>${compactDate(voucher.date)}</REFERENCEDATE>`,
    `<PARTYLEDGERNAME>${escapeXml(voucher.partyLedger)}</PARTYLEDGERNAME><NARRATION>${escapeXml(voucher.narration)}</NARRATION><BASICBASEPARTYNAME>${escapeXml(voucher.partyLedger)}</BASICBASEPARTYNAME>`,
    '<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW><VCHENTRYMODE>Item Invoice</VCHENTRYMODE><ISINVOICE>Yes</ISINVOICE><ISOPTIONAL>No</ISOPTIONAL><DIFFACTUALQTY>No</DIFFACTUALQTY>',
    `<LEDGERENTRIES.LIST><LEDGERNAME>${escapeXml(voucher.partyLedger)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER><ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE><AMOUNT>-${voucher.debit}</AMOUNT>`,
    `<BILLALLOCATIONS.LIST><NAME>${escapeXml(voucher.reference)}</NAME><BILLTYPE>New Ref</BILLTYPE><BILLCREDITPERIOD>0 Days</BILLCREDITPERIOD><AMOUNT>-${voucher.debit}</AMOUNT></BILLALLOCATIONS.LIST></LEDGERENTRIES.LIST>`,
    `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>${escapeXml(STOCK_ITEM)}</STOCKITEMNAME>`,
    '<GSTHSNINFERAPPLICABILITY>Specify Details Here</GSTHSNINFERAPPLICABILITY><GSTHSNNAME>72044900</GSTHSNNAME>',
    `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><RATE>${voucher.rate}/${UNIT}</RATE><AMOUNT>${voucher.taxableValue}</AMOUNT>`,
    `<ACTUALQTY>${q}</ACTUALQTY><BILLEDQTY>${q}</BILLEDQTY>`,
    `<BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME><BATCHNAME>Primary Batch</BATCHNAME><AMOUNT>${voucher.taxableValue}</AMOUNT><ACTUALQTY>${q}</ACTUALQTY><BILLEDQTY>${q}</BILLEDQTY><BATCHRATE>${voucher.rate}/${UNIT}</BATCHRATE></BATCHALLOCATIONS.LIST>`,
    `<ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${escapeXml(SALES_LEDGER)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${voucher.taxableValue}</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>`,
    '</ALLINVENTORYENTRIES.LIST>',
    '</VOUCHER></TALLYMESSAGE>',
  ].join("");
}

function envelope(vouchers) {
  return [
    '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>',
    `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE TYPE="Date">${compactDate(vouchers[0].date)}</SVFROMDATE><SVTODATE TYPE="Date">${compactDate(vouchers.at(-1).date)}</SVTODATE><SVCURRENTDATE TYPE="Date">${compactDate(vouchers.at(-1).date)}</SVCURRENTDATE>`,
    `</STATICVARIABLES></DESC><DATA>${vouchers.map(tallyMessage).join("")}</DATA>`,
    '</BODY></ENVELOPE>',
  ].join("");
}

function audit(vouchers, assigned) {
  const references = new Set(vouchers.map((voucher) => voucher.reference));
  const voucherNumbers = new Set(vouchers.map((voucher) => voucher.voucherNumber));
  const activeCustomers = new Set(vouchers.map((voucher) => voucher.partyLedger));
  const countByScenario = Object.fromEntries(scenarioDefinitions.map((definition) => [definition.scenario, assigned.filter((row) => row.scenario === definition.scenario).length]));
  const dateCounts = Object.fromEntries([...new Set(vouchers.map((voucher) => voucher.date))].sort().map((date) => [date, vouchers.filter((voucher) => voucher.date === date).length]));
  const failures = [];
  if (vouchers.length !== 70) failures.push("Voucher count is not 70.");
  if (references.size !== 70 || voucherNumbers.size !== 70) failures.push("Voucher references or numbers are not unique.");
  if (activeCustomers.size !== 35) failures.push("Active customer count is not 35.");
  if (vouchers.some((voucher) => voucher.voucherType !== "Sales")) failures.push("A non-Sales voucher is present.");
  if (vouchers.some((voucher) => voucher.stockItem !== STOCK_ITEM || voucher.unit !== UNIT)) failures.push("An ineligible item or unit is present.");
  if (vouchers.some((voucher) => voucher.date < PERIOD_START || voucher.date > DATA_END)) failures.push("A voucher date is outside the intended active-period window.");
  if (vouchers.some((voucher) => voucher.debit !== voucher.credit)) failures.push("A voucher is not balanced.");
  if (vouchers.some((voucher) => /\b(?:qa|test|dummy|sample|tod)\b/i.test(`${voucher.voucherNumber} ${voucher.reference} ${voucher.narration}`))) failures.push("A visible test marker is present.");
  if (coveredCustomers.some((name) => activeCustomers.has(name) === noActivityCustomers.has(name))) failures.push("Activity/no-activity assignment is inconsistent.");
  return {
    status: failures.length ? "failed" : "passed",
    failures,
    counts: { vouchers: vouchers.length, activeCustomers: activeCustomers.size, noActivityCustomers: noActivityCustomers.size },
    scenarioCustomerCounts: countByScenario,
    dateCounts,
    totals: {
      tonnes: quantity(vouchers.reduce((sum, voucher) => sum + Number(voucher.quantity), 0)),
      taxableValue: money(vouchers.reduce((sum, voucher) => sum + Number(voucher.taxableValue), 0)),
    },
  };
}

function main() {
  const { assigned, vouchers } = buildRows();
  const validation = audit(vouchers, assigned);
  if (validation.status !== "passed") throw new Error(validation.failures.join(" "));
  mkdirSync(path.join(OUTPUT, "vouchers"), { recursive: true });
  const review = {
    schemaVersion: "1.0.0",
    status: "reviewed_ready_for_import",
    companyName: COMPANY,
    generatedAt: new Date().toISOString(),
    purpose: "Current-period Sales activity for the existing active Meenakshi Turnover Discount rule.",
    constraints: { voucherOnly: true, mastersCreated: 0, purchaseVouchers: 0, creditNotes: 0, debitNotes: 0 },
    activeRuleFit: { periodStart: PERIOD_START, periodEnd: PERIOD_END, coveredCustomerCount: coveredCustomers.length, eligibleStockItem: STOCK_ITEM, unit: UNIT, tiers: [{ minimumTonnes: "100", percentage: "2" }, { minimumTonnes: "250", percentage: "3" }, { minimumTonnes: "500", percentage: "5" }] },
    noActivityCustomers: [...noActivityCustomers],
    expectedCustomerResults: assigned.map((row) => ({ customerLedger: row.customer, scenario: row.scenario, expectedEligibleTonnes: row.totalTonnes, expectedTierTonnes: row.expectedTier, expectedDiscountPercentage: row.expectedPercentage, sourceReferences: vouchers.filter((voucher) => voucher.partyLedger === row.customer).map((voucher) => voucher.reference) })),
    vouchers,
    validation,
  };
  writeFileSync(path.join(OUTPUT, "review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  const batchSize = 20;
  const importOrder = [];
  for (let offset = 0; offset < vouchers.length; offset += batchSize) {
    const batch = vouchers.slice(offset, offset + batchSize);
    const number = Math.floor(offset / batchSize) + 1;
    const relativeFile = `vouchers/${String(number).padStart(3, "0")}-sales.xml`;
    const xml = envelope(batch);
    writeFileSync(path.join(OUTPUT, relativeFile), xml, "utf8");
    importOrder.push({ order: number, category: "vouchers", file: relativeFile, records: batch.length, tallyMessageCount: batch.length, bytes: Buffer.byteLength(xml), sha256: sha256(xml) });
  }
  const manifest = {
    schemaVersion: "1.0.0", status: "generated_not_imported", companyName: COMPANY,
    source: path.join(OUTPUT, "review.json"), generatedAt: review.generatedAt,
    format: "TallyPrime XML Data Interchange", counts: { vouchers: vouchers.length },
    safeguards: { mastersIncluded: 0, purchaseVouchersIncluded: 0, creditNotesIncluded: 0, debitNotesIncluded: 0 },
    importOrder,
  };
  writeFileSync(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: OUTPUT, validation }, null, 2));
}

main();
