import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Solution Nyx";
const TEST_TAG = process.env.KALIKA_NARRATION_TEST_TAG || "NARR-CD-260713";
const outputPath = path.join(repoRoot, "output", "narration-cash-discount-test", "manifest.json");

const testCases = [
  {
    id: "tiered_late",
    customer: `${TEST_TAG} Tiered Late Customer`,
    invoiceNumber: `${TEST_TAG}-TIERED-LATE`,
    invoiceDate: "2026-06-01",
    receiptNumber: `${TEST_TAG}-RCPT-TIERED-LATE`,
    receiptDate: "2026-06-25",
    amount: 100000,
    receiptAmount: 98500,
    narration: "Cash discount: 1.5% if paid within 7 days; 1% if paid within 15 days; otherwise full payment is due.",
    expected: "Create debit note for INR 1,500. The final 15-day window expired and the balance equals the 1.5% discount taken late.",
  },
  {
    id: "one_percent_late",
    customer: `${TEST_TAG} One Percent Late Customer`,
    invoiceNumber: `${TEST_TAG}-ONE-PCT-LATE`,
    invoiceDate: "2026-06-01",
    receiptNumber: `${TEST_TAG}-RCPT-ONE-PCT-LATE`,
    receiptDate: "2026-06-25",
    amount: 80000,
    receiptAmount: 79200,
    narration: "Cash discount of 1% if payment is received within 15 days; otherwise full payment is due.",
    expected: "Create debit note for INR 800. The 15-day window expired and the balance equals the narrated 1% discount.",
  },
  {
    id: "no_terms",
    customer: `${TEST_TAG} No Terms Customer`,
    invoiceNumber: `${TEST_TAG}-NO-TERMS`,
    invoiceDate: "2026-06-01",
    receiptNumber: `${TEST_TAG}-RCPT-NO-TERMS`,
    receiptDate: "2026-06-25",
    amount: 60000,
    receiptAmount: 59100,
    narration: "Payment due in 30 days from invoice date. Full payment is due after delivery.",
    expected: "Do not show a cash-discount candidate even though INR 900 remains; narration has no explicit discount term.",
  },
  {
    id: "tiered_unpaid",
    customer: `${TEST_TAG} Tiered Unpaid Customer`,
    invoiceNumber: `${TEST_TAG}-TIERED-UNPAID`,
    invoiceDate: "2026-06-01",
    receiptNumber: null,
    receiptDate: null,
    amount: 50000,
    receiptAmount: null,
    narration: "Cash discount: 1.5% if paid within 7 days; 1% if paid within 15 days; otherwise full payment is due.",
    expected: "Create an unpaid tier-reversal debit note for INR 761.42. Tally amount INR 50,000 is treated as net after 1.5%; all discount windows have expired, so the gross payable amount is INR 50,761.42.",
  },
  {
    id: "tiered_second_tier_unpaid",
    customer: `${TEST_TAG} Tiered Second Tier Customer`,
    invoiceNumber: `${TEST_TAG}-TIERED-SECOND-TIER`,
    invoiceDate: "2026-07-05",
    receiptNumber: null,
    receiptDate: null,
    amount: 80000,
    receiptAmount: null,
    narration: "Cash discount: 1.5% if paid within 7 days; 1% if paid within 15 days; otherwise full payment is due.",
    expected: "On 13 Jul 2026, create an incremental INR 406.09 debit note. Tally amount INR 80,000 is net after 1.5%; the 1.5% tier expired on 12 Jul while the 1% tier remains until 20 Jul, so the payable amount becomes INR 80,406.09.",
  },
  {
    id: "tiered_within_window",
    customer: `${TEST_TAG} Tiered Within Window Customer`,
    invoiceNumber: `${TEST_TAG}-TIERED-WITHIN-WINDOW`,
    invoiceDate: "2026-07-08",
    receiptNumber: `${TEST_TAG}-RCPT-TIERED-WITHIN-WINDOW`,
    receiptDate: "2026-07-12",
    amount: 100000,
    receiptAmount: 98500,
    narration: "Cash discount: 1.5% if paid within 7 days; 1% if paid within 15 days; otherwise full payment is due.",
    expected: "Do not create a debit note while the final narrated window is still open (until 23 Jul 2026).",
  },
];

const salesLedger = `${TEST_TAG} Test Sales`;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tallyDate(date) {
  return String(date).replaceAll("-", "");
}

function money(value) {
  return Number(value).toFixed(2);
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
    throw new Error(lineError || `Tally returned HTTP ${response.status}: ${text.slice(0, 700)}`);
  }
  return text;
}

function buildCollectionExportXml(collectionName, tallyType, fetchFields) {
  return [
    "<ENVELOPE>",
    "<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(collectionName)}</ID></HEADER>`,
    "<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "<SVFROMDATE>20000401</SVFROMDATE><SVTODATE>20990331</SVTODATE>",
    "</STATICVARIABLES><TDL><TDLMESSAGE>",
    `<COLLECTION NAME="${escapeXml(collectionName)}" ISMODIFY="No">`,
    `<TYPE>${escapeXml(tallyType)}</TYPE>`,
    `<FETCH>${escapeXml(fetchFields)}</FETCH>`,
    "</COLLECTION>",
    "</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
}

async function exportCollection(collectionName, tallyType, fetchFields) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: buildCollectionExportXml(collectionName, tallyType, fetchFields),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally export failed with HTTP ${response.status}.`);
  return text;
}

function extractBlocks(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "gi"))].map((match) => match[0]);
}

function getAttribute(block, attributeName) {
  const match = block.match(new RegExp(`${attributeName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function getTagText(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function wrapMasterMessages(messages) {
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function ledgerXml({ name, parent, billWise }) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
    `<NAME>${escapeXml(name)}</NAME>`,
    `<PARENT>${escapeXml(parent)}</PARENT>`,
    `<ISBILLWISEON>${billWise ? "Yes" : "No"}</ISBILLWISEON>`,
    "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
    "<LANGUAGENAME.LIST><NAME.LIST TYPE=\"String\">",
    `<NAME>${escapeXml(name)}</NAME>`,
    "</NAME.LIST><LANGUAGEID TYPE=\"Number\">1033</LANGUAGEID></LANGUAGENAME.LIST>",
    "</LEDGER></TALLYMESSAGE>",
  ].join("");
}

function billAllocationXml({ referenceName, referenceType, amount, isDebit }) {
  return [
    "<BILLALLOCATIONS.LIST>",
    `<NAME>${escapeXml(referenceName)}</NAME>`,
    `<BILLTYPE>${escapeXml(referenceType)}</BILLTYPE>`,
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    "</BILLALLOCATIONS.LIST>",
  ].join("");
}

function ledgerEntryXml({ ledgerName, amount, isDebit, isPartyLedger = false, billAllocations = "" }) {
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    billAllocations,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function voucherXml({ date, voucherType, voucherNumber, partyLedgerName, narration, entries }) {
  const dateValue = tallyDate(date);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${dateValue}</DATE><EFFECTIVEDATE>${dateValue}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(voucherNumber)}</REFERENCE>`,
    `<PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>`,
    "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>",
    `<NARRATION>${escapeXml(narration)}</NARRATION>`,
    ...entries,
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

function wrapVoucherMessages(messages, date) {
  const dateValue = tallyDate(date);
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${dateValue}</SVFROMDATE><SVTODATE>${dateValue}</SVTODATE><SVCURRENTDATE>${dateValue}</SVCURRENTDATE>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function salesVoucher(testCase) {
  return voucherXml({
    date: testCase.invoiceDate,
    voucherType: "Sales",
    voucherNumber: testCase.invoiceNumber,
    partyLedgerName: testCase.customer,
    narration: testCase.narration,
    entries: [
      ledgerEntryXml({
        ledgerName: testCase.customer,
        amount: testCase.amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocations: billAllocationXml({
          referenceName: testCase.invoiceNumber,
          referenceType: "New Ref",
          amount: testCase.amount,
          isDebit: true,
        }),
      }),
      ledgerEntryXml({ ledgerName: salesLedger, amount: testCase.amount, isDebit: false }),
    ],
  });
}

function receiptVoucher(testCase) {
  return voucherXml({
    date: testCase.receiptDate,
    voucherType: "Receipt",
    voucherNumber: testCase.receiptNumber,
    partyLedgerName: testCase.customer,
    narration: `Receipt against ${testCase.invoiceNumber}.`,
    entries: [
      ledgerEntryXml({ ledgerName: "Cash", amount: testCase.receiptAmount, isDebit: true }),
      ledgerEntryXml({
        ledgerName: testCase.customer,
        amount: testCase.receiptAmount,
        isDebit: false,
        isPartyLedger: true,
        billAllocations: billAllocationXml({
          referenceName: testCase.invoiceNumber,
          referenceType: "Agst Ref",
          amount: testCase.receiptAmount,
          isDebit: false,
        }),
      }),
    ],
  });
}

async function currentNames(collectionName, tallyType, fetchFields) {
  const xml = await exportCollection(collectionName, tallyType, fetchFields);
  const tag = tallyType.toUpperCase();
  return new Set(
    extractBlocks(xml, tag)
      .flatMap((block) =>
        tallyType === "Voucher"
          ? [getTagText(block, "VOUCHERNUMBER"), getTagText(block, "REFERENCE")]
          : [getAttribute(block, "NAME") || getTagText(block, "NAME")]
      )
      .filter(Boolean)
  );
}

async function verifyTestData() {
  const [voucherXml, billXml] = await Promise.all([
    exportCollection(
      "Narrated CD Test Voucher Verification",
      "Voucher",
      "Date,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName"
    ),
    exportCollection(
      "Narrated CD Test Bill Verification",
      "Bill",
      "Name,LedgerName,PartyLedgerName,VoucherNumber,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount"
    ),
  ]);
  const vouchers = extractBlocks(voucherXml, "VOUCHER");
  const bills = extractBlocks(billXml, "BILL");
  return testCases.map((testCase) => {
    const voucher = vouchers.find((block) => getTagText(block, "REFERENCE") === testCase.invoiceNumber);
    const bill = bills.find((block) => {
      const name = getAttribute(block, "NAME") || getTagText(block, "NAME");
      return name === testCase.invoiceNumber;
    });
    return {
      invoiceNumber: testCase.invoiceNumber,
      narrationFound: getTagText(voucher || "", "NARRATION") || null,
      pendingBalance: getTagText(bill || "", "CLOSINGBALANCE") || getTagText(bill || "", "BALANCE") || null,
    };
  });
}

async function main() {
  const [ledgerNames, voucherNames] = await Promise.all([
    currentNames("Narrated CD Test Ledgers", "Ledger", "Name"),
    currentNames("Narrated CD Test Vouchers", "Voucher", "VoucherNumber,Reference"),
  ]);
  const missingLedgers = [
    ...testCases.filter((testCase) => !ledgerNames.has(testCase.customer)).map((testCase) => ({
      name: testCase.customer,
      parent: "Sundry Debtors",
      billWise: true,
    })),
    ...(ledgerNames.has(salesLedger) ? [] : [{ name: salesLedger, parent: "Sales Accounts", billWise: false }]),
  ];
  if (missingLedgers.length > 0) await postTallyXml(wrapMasterMessages(missingLedgers.map(ledgerXml)));

  const vouchersByDate = new Map();
  for (const testCase of testCases) {
    if (!voucherNames.has(testCase.invoiceNumber)) {
      const current = vouchersByDate.get(testCase.invoiceDate) || [];
      current.push(salesVoucher(testCase));
      vouchersByDate.set(testCase.invoiceDate, current);
    }
    if (testCase.receiptNumber && !voucherNames.has(testCase.receiptNumber)) {
      const current = vouchersByDate.get(testCase.receiptDate) || [];
      current.push(receiptVoucher(testCase));
      vouchersByDate.set(testCase.receiptDate, current);
    }
  }
  for (const [date, vouchers] of Array.from(vouchersByDate.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    await postTallyXml(wrapVoucherMessages(vouchers, date));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    tallyUrl: TALLY_URL,
    companyName: COMPANY_NAME,
    testTag: TEST_TAG,
    testCases: testCases.map(({ receiptAmount, ...testCase }) => ({
      ...testCase,
      pendingAmount: receiptAmount === null ? testCase.amount : testCase.amount - receiptAmount,
    })),
  };
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  const verification = await verifyTestData();
  console.log(JSON.stringify({ companyName: COMPANY_NAME, createdOrVerified: testCases.map((testCase) => testCase.invoiceNumber), verification, manifest: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
