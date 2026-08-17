const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Solution Nyx";
const TEST_TAG = process.env.KALIKA_CD_UI_TEST_TAG || "KALIKA-TEST-CD-260816";
const SALES_LEDGER = `${TEST_TAG} Sales`;

const groupTestGroups = [
  { name: "TEST CD Direct Receivables", parent: "Current Assets" },
  { name: "TEST CD Regional Receivables", parent: "Current Assets" },
  { name: "TEST CD West Receivables", parent: "TEST CD Regional Receivables" },
  { name: "TEST CD East Receivables", parent: "TEST CD Regional Receivables" },
  { name: "TEST CD Special Accounts", parent: "Current Assets" },
];

const candidates = [
  {
    customer: `${TEST_TAG} North Customer`,
    invoiceNumber: `${TEST_TAG}-ONE-PCT-A`,
    invoiceDate: "2026-07-10",
    amount: 99_000,
    narration: "Cash Discount 1%",
    expectedDebitNote: 1_000,
  },
  {
    customer: `${TEST_TAG} West Customer`,
    invoiceNumber: `${TEST_TAG}-ONE-PCT-B`,
    invoiceDate: "2026-07-12",
    amount: 49_500,
    narration: "One percent cash discount",
    expectedDebitNote: 500,
  },
  {
    customer: `${TEST_TAG} South Customer`,
    invoiceNumber: `${TEST_TAG}-ONE-FIVE-PCT-A`,
    invoiceDate: "2026-07-20",
    amount: 98_500,
    narration: "C.D. @ 1.50 percent",
    expectedDebitNote: 1_500,
  },
  {
    customer: `${TEST_TAG} East Customer`,
    invoiceNumber: `${TEST_TAG}-ONE-FIVE-PCT-B`,
    invoiceDate: "2026-07-22",
    amount: 197_000,
    narration: "One and a half percent cash discount",
    expectedDebitNote: 3_000,
  },
  {
    customer: `${TEST_TAG} Direct Group Customer`,
    parentGroup: "TEST CD Direct Receivables",
    invoiceNumber: `${TEST_TAG}-GROUP-DIRECT` ,
    invoiceDate: "2026-07-11",
    amount: 60_000,
    narration: "Cash discount 1%",
    expectedDebitNote: 600,
  },
  {
    customer: `${TEST_TAG} West Region Customer`,
    parentGroup: "TEST CD West Receivables",
    invoiceNumber: `${TEST_TAG}-GROUP-WEST-NESTED`,
    invoiceDate: "2026-07-19",
    amount: 80_000,
    narration: "C.D. 1.5%",
    expectedDebitNote: 1_200,
  },
  {
    customer: `${TEST_TAG} East Region Customer`,
    parentGroup: "TEST CD East Receivables",
    invoiceNumber: `${TEST_TAG}-GROUP-EAST-NESTED`,
    invoiceDate: "2026-07-13",
    amount: 120_000,
    narration: "One percent cash discount",
    expectedDebitNote: 1_200,
  },
  {
    customer: `${TEST_TAG} Special Account Customer`,
    parentGroup: "TEST CD Special Accounts",
    invoiceNumber: `${TEST_TAG}-GROUP-SPECIAL-OUTSIDE`,
    invoiceDate: "2026-07-21",
    amount: 200_000,
    narration: "One and a half percent cash discount",
    expectedDebitNote: 3_000,
  },
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tallyDate(value) {
  return String(value).replaceAll("-", "");
}

function money(value) {
  return Number(value).toFixed(2);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractBlocks(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "gi"))]
    .map((match) => match[0]);
}

function getAttribute(block, name) {
  const match = block.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function getTagText(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
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

function collectionXml(name, type, fields) {
  return [
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(name)}</ID></HEADER><BODY><DESC><STATICVARIABLES>`,
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "<SVFROMDATE>20000401</SVFROMDATE><SVTODATE>20990331</SVTODATE>",
    "</STATICVARIABLES><TDL><TDLMESSAGE>",
    `<COLLECTION NAME="${escapeXml(name)}" ISMODIFY="No"><TYPE>${escapeXml(type)}</TYPE><FETCH>${escapeXml(fields)}</FETCH></COLLECTION>`,
    "</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
}

async function exportCollection(name, type, fields) {
  return postTallyXml(collectionXml(name, type, fields));
}

function ledgerXml({ name, parent, billWise }) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
    `<NAME>${escapeXml(name)}</NAME><PARENT>${escapeXml(parent)}</PARENT>`,
    `<ISBILLWISEON>${billWise ? "Yes" : "No"}</ISBILLWISEON><AFFECTSSTOCK>No</AFFECTSSTOCK>`,
    '<LANGUAGENAME.LIST><NAME.LIST TYPE="String">',
    `<NAME>${escapeXml(name)}</NAME>`,
    '</NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>',
    "</LEDGER></TALLYMESSAGE>",
  ].join("");
}

function groupXml({ name, parent }) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<GROUP NAME="${escapeXml(name)}" ACTION="Create">`,
    `<NAME>${escapeXml(name)}</NAME><PARENT>${escapeXml(parent)}</PARENT>`,
    '<LANGUAGENAME.LIST><NAME.LIST TYPE="String">',
    `<NAME>${escapeXml(name)}</NAME>`,
    '</NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>',
    '</GROUP></TALLYMESSAGE>',
  ].join("");
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

function billAllocationXml(referenceName, amount) {
  return [
    "<BILLALLOCATIONS.LIST>",
    `<NAME>${escapeXml(referenceName)}</NAME><BILLTYPE>New Ref</BILLTYPE>`,
    `<AMOUNT>-${money(amount)}</AMOUNT>`,
    "</BILLALLOCATIONS.LIST>",
  ].join("");
}

function ledgerEntryXml({ ledgerName, amount, isDebit, isPartyLedger = false, billAllocation = "" }) {
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    billAllocation,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function salesVoucherXml(candidate) {
  const date = tallyDate(candidate.invoiceDate);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${escapeXml(candidate.invoiceNumber)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(candidate.invoiceNumber)}</REFERENCE>`,
    `<PARTYLEDGERNAME>${escapeXml(candidate.customer)}</PARTYLEDGERNAME>`,
    "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>",
    `<NARRATION>${escapeXml(candidate.narration)}</NARRATION>`,
    ledgerEntryXml({
      ledgerName: candidate.customer,
      amount: candidate.amount,
      isDebit: true,
      isPartyLedger: true,
      billAllocation: billAllocationXml(candidate.invoiceNumber, candidate.amount),
    }),
    ledgerEntryXml({ ledgerName: SALES_LEDGER, amount: candidate.amount, isDebit: false }),
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

function wrapVoucherMessages(messages) {
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "<SVFROMDATE>20260401</SVFROMDATE><SVTODATE>20270331</SVTODATE>",
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

async function main() {
  const [groupExport, ledgerExport, voucherExport] = await Promise.all([
    exportCollection("Kalika CD UI Test Groups", "Group", "Name,Parent"),
    exportCollection("Kalika CD UI Test Ledgers", "Ledger", "Name,Parent,IsBillWiseOn"),
    exportCollection("Kalika CD UI Test Vouchers", "Voucher", "VoucherNumber,Reference,Narration,PartyLedgerName"),
  ]);
  const existingGroups = new Set(
    extractBlocks(groupExport, "GROUP")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean),
  );
  const existingLedgers = new Set(
    extractBlocks(ledgerExport, "LEDGER")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean),
  );
  const existingVoucherRefs = new Set(
    extractBlocks(voucherExport, "VOUCHER")
      .flatMap((block) => [getTagText(block, "VOUCHERNUMBER"), getTagText(block, "REFERENCE")])
      .filter(Boolean),
  );

  const missingGroups = groupTestGroups.filter((group) => !existingGroups.has(group.name));
  if (missingGroups.length > 0) {
    await postTallyXml(wrapMasterMessages(missingGroups.map(groupXml)));
  }

  const ledgers = [
    ...candidates.map((candidate) => ({
      name: candidate.customer,
      parent: candidate.parentGroup || "Sundry Debtors",
      billWise: true,
    })),
    { name: SALES_LEDGER, parent: "Sales Accounts", billWise: false },
  ];
  const missingLedgers = ledgers.filter((ledger) => !existingLedgers.has(ledger.name));
  if (missingLedgers.length > 0) {
    await postTallyXml(wrapMasterMessages(missingLedgers.map(ledgerXml)));
  }

  const missingCandidates = candidates.filter((candidate) => !existingVoucherRefs.has(candidate.invoiceNumber));
  if (missingCandidates.length > 0) {
    await postTallyXml(wrapVoucherMessages(missingCandidates.map(salesVoucherXml)));
  }

  const billExport = await exportCollection(
    "Kalika CD UI Test Bill Verification",
    "Bill",
    "Name,LedgerName,PartyLedgerName,VoucherNumber,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount",
  );
  const bills = extractBlocks(billExport, "BILL");
  const verification = candidates.map((candidate) => {
    const bill = bills.find((block) =>
      (getAttribute(block, "NAME") || getTagText(block, "NAME")) === candidate.invoiceNumber
    );
    return {
      customer: candidate.customer,
      invoiceNumber: candidate.invoiceNumber,
      narration: candidate.narration,
      expectedDebitNote: candidate.expectedDebitNote,
      openBillFound: Boolean(bill),
      pendingBalance: getTagText(bill || "", "CLOSINGBALANCE") || getTagText(bill || "", "BALANCE") || null,
    };
  });

  if (verification.some((item) => !item.openBillFound)) {
    throw new Error("One or more test invoices were created without a verifiable open bill.");
  }

  console.log(JSON.stringify({
    companyName: COMPANY_NAME,
    testTag: TEST_TAG,
    createdGroups: missingGroups.map((group) => group.name),
    createdLedgers: missingLedgers.map((ledger) => ledger.name),
    createdInvoices: missingCandidates.map((candidate) => candidate.invoiceNumber),
    verification,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
