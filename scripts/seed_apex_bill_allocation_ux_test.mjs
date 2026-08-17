const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Solution Nyx";
const CUSTOMER_LEDGER = "Apex Rebar Projects";
const SALES_LEDGER = "Solution Sales Account";

const testBills = [
  { date: "2026-08-12", reference: "APX-UX-TEST-101", amount: 12000 },
  { date: "2026-08-13", reference: "APX-UX-TEST-102", amount: 18500 },
  { date: "2026-08-14", reference: "APX-UX-TEST-103", amount: 27500 },
  { date: "2026-08-15", reference: "APX-UX-TEST-104", amount: 9000 },
  { date: "2026-08-16", reference: "APX-UX-TEST-105", amount: 36000 },
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tallyDate(value) {
  return String(value).replaceAll("-", "");
}

function money(value) {
  return Number(value).toFixed(2);
}

function getAttribute(block, name) {
  const match = block.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function getTagText(block, name) {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function extractBlocks(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "gi"))].map((match) => match[0]);
}

async function postTallyXml(xml) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
  });
  const text = await response.text();
  const lineError = text.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.trim();
  if (!response.ok || lineError) {
    throw new Error(lineError || `Tally returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

function collectionXml(name, type, fields) {
  return [
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(name)}</ID></HEADER><BODY><DESC><STATICVARIABLES>`,
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES><TDL><TDLMESSAGE>",
    `<COLLECTION NAME="${escapeXml(name)}" ISMODIFY="No"><TYPE>${escapeXml(type)}</TYPE><FETCH>${escapeXml(fields)}</FETCH></COLLECTION>`,
    "</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
}

async function exportCollection(name, type, fields) {
  return postTallyXml(collectionXml(name, type, fields));
}

function billAllocationXml(reference, amount) {
  return [
    "<BILLALLOCATIONS.LIST>",
    `<NAME>${escapeXml(reference)}</NAME>`,
    "<BILLTYPE>New Ref</BILLTYPE>",
    `<BILLDATE>${tallyDate(testBills.find((bill) => bill.reference === reference)?.date)}</BILLDATE>`,
    `<AMOUNT>-${money(amount)}</AMOUNT>`,
    "</BILLALLOCATIONS.LIST>",
  ].join("");
}

function ledgerEntryXml({ ledger, amount, debit, party = false, billAllocation = "" }) {
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledger)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${party ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<AMOUNT>${debit ? "-" : ""}${money(amount)}</AMOUNT>`,
    billAllocation,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function voucherXml(bill) {
  const date = tallyDate(bill.date);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    '<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">',
    `<DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE>`,
    "<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>",
    `<VOUCHERNUMBER>${escapeXml(bill.reference)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(bill.reference)}</REFERENCE>`,
    `<PARTYLEDGERNAME>${escapeXml(CUSTOMER_LEDGER)}</PARTYLEDGERNAME>`,
    "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>",
    `<NARRATION>Kalika bill allocation UX test ${escapeXml(bill.reference)}</NARRATION>`,
    ledgerEntryXml({
      ledger: CUSTOMER_LEDGER,
      amount: bill.amount,
      debit: true,
      party: true,
      billAllocation: billAllocationXml(bill.reference, bill.amount),
    }),
    ledgerEntryXml({ ledger: SALES_LEDGER, amount: bill.amount, debit: false }),
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

function importXml(bills) {
  const dates = bills.map((bill) => tallyDate(bill.date)).sort();
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${dates[0]}</SVFROMDATE><SVTODATE>${dates.at(-1)}</SVTODATE><SVCURRENTDATE>${dates.at(-1)}</SVCURRENTDATE>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...bills.map(voucherXml),
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

async function readState() {
  const [ledgerXml, billXml] = await Promise.all([
    exportCollection("Kalika Apex UX Ledgers", "Ledger", "Name,Parent,IsBillWiseOn"),
    exportCollection("Kalika Apex UX Bills", "Bill", "Name,LedgerName,PartyLedgerName,VoucherNumber,Date,OpeningBalance,ClosingBalance,PendingAmount"),
  ]);
  const ledgers = new Map(
    extractBlocks(ledgerXml, "LEDGER").map((block) => {
      const name = getAttribute(block, "NAME") || getTagText(block, "NAME");
      return [name.toLowerCase(), { name, parent: getTagText(block, "PARENT"), billWise: getTagText(block, "ISBILLWISEON") }];
    })
  );
  const bills = extractBlocks(billXml, "BILL").map((block) => ({
    reference: getAttribute(block, "NAME") || getTagText(block, "NAME"),
    ledger: getTagText(block, "LEDGERNAME") || getTagText(block, "PARTYLEDGERNAME"),
    voucherNumber: getTagText(block, "VOUCHERNUMBER"),
    closingBalance: getTagText(block, "CLOSINGBALANCE") || getTagText(block, "PENDINGAMOUNT"),
  }));
  return { ledgers, bills };
}

async function main() {
  const before = await readState();
  for (const required of [CUSTOMER_LEDGER, SALES_LEDGER]) {
    if (!before.ledgers.has(required.toLowerCase())) {
      throw new Error(`Required Tally ledger is missing: ${required}`);
    }
  }
  const customer = before.ledgers.get(CUSTOMER_LEDGER.toLowerCase());
  if (String(customer.billWise).toLowerCase() !== "yes") {
    throw new Error(`${CUSTOMER_LEDGER} is not bill-wise enabled in Tally.`);
  }

  const existingRefs = new Set(before.bills.map((bill) => bill.reference));
  const missing = testBills.filter((bill) => !existingRefs.has(bill.reference));
  if (missing.length > 0) await postTallyXml(importXml(missing));

  const after = await readState();
  const verified = testBills.map((bill) => {
    const tallyBill = after.bills.find((candidate) => candidate.reference === bill.reference);
    return { ...bill, found: Boolean(tallyBill), tallyLedger: tallyBill?.ledger || null, pending: tallyBill?.closingBalance || null };
  });
  if (verified.some((bill) => !bill.found)) {
    throw new Error(`Tally did not return every test bill: ${JSON.stringify(verified)}`);
  }
  console.log(JSON.stringify({ company: COMPANY_NAME, customer: CUSTOMER_LEDGER, created: missing.length, skippedExisting: testBills.length - missing.length, bills: verified }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
