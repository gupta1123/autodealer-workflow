import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "output", "pdf", "bank-cash-discount-june-july-2026");
const manifestPath = path.join(outputDir, "bank_cash_discount_manifest.json");
const readmePath = path.join(outputDir, "README.md");

const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Nyx";
const BANK_LEDGER = process.env.KALIKA_STRESS_BANK_LEDGER || "Kotak Mahindra Bank - 6713098600";
const SALES_LEDGER = "Sales Account";
const PURCHASE_LEDGER = "Purchase Account";
const BANK_CHARGE_LEDGER = "Bank Charges";
const RECOVERY_LEDGER = "Cash Discount Reversal";

const data = {
  companyFinancialYear: "2026-27",
  statementPeriodStart: "2026-07-01",
  statementPeriodEnd: "2026-07-09",
  statementPeriodStartLabel: "01 Jul 2026",
  statementPeriodEndLabel: "09 Jul 2026",
  bankAccountName: "Kotak Mahindra Bank",
  accountNumber: "6713098600",
  accountHolderName: "Nyx",
  openingStartDate: "2026-06-15",
  openingEndDate: "2026-06-25",
  supplierBillDate: "2026-06-22",
  exactInvoiceDate: "2026-06-18",
  splitInvoiceDate: "2026-06-20",
  partialInvoiceDate: "2026-06-20",
  lateInvoiceDate: "2026-06-15",
  timelyInvoiceDate: "2026-06-25",
  timelyReceiptDate: "2026-07-03",
  exactReceiptDate: "2026-07-03",
  midStatementDate: "2026-07-07",
  statementDate: "2026-07-09",
  whatsappPhone: "9765723830",
  ledgers: {
    fullCustomer: "Vardhan Metal Works",
    splitCustomer: "Kalyani Tubes",
    partialCustomer: "Rudra Forge Private Limited",
    lateCustomer: "Triveni Components Pvt Ltd",
    timelyCustomer: "Harshita Processors",
    amountOnlyCustomer: "Apex Bright Bars",
    overpayCustomer: "Bhavani Metal Products",
    advanceCustomer: "Orchid Castings LLP",
    foundSupplier: "Noble Industrial Supplies",
    foundSupplierAlt: "Prakash Bearing House",
    missingSupplier: "Zenith Industrial Stores",
    missingSupplierAlt: "Western Mill Stores",
    ambiguousSupplierA: "Mangal Spares",
    ambiguousSupplierB: "Tirupati Tools",
    sales: SALES_LEDGER,
    purchase: PURCHASE_LEDGER,
    recovery: RECOVERY_LEDGER,
    bankCharges: BANK_CHARGE_LEDGER,
  },
  refs: {
    full: "VMW/26-27/601",
    splitA: "KTU/26-27/602",
    splitB: "KTU/26-27/603",
    partial: "RFP/26-27/604",
    late: "TCP/26-27/605",
    timely: "HPR/26-27/606",
    amountOnly: "ABB/26-27/607",
    overpay: "BMP/26-27/608",
    foundSupplierBill: "NIS/26-27/701",
    foundSupplierPayment: "YES260707701",
    foundSupplierAltBill: "PBH/26-27/704",
    foundSupplierAltPayment: "HDF260703704",
    missingSupplierPayment: "IC260707702",
    missingSupplierAltPayment: "SBI260703705",
    bankChargeFound: "CHG260709703",
    bankChargeMissing: "CHG260709704",
    bankChargeFoundEarly: "CHG260703706",
    bankChargeMissingMid: "CHG260707707",
    ambiguousA: "AMB260709A",
    ambiguousB: "AMB260709B",
    ambiguousStatement: "JUL090000",
  },
};

const transactions = [
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: `RTGS CR FROM Vardhan Metals Work UTR KKB260703601 AGAINST ${data.refs.full}`,
    reference: "KKB260703601",
    debit: null,
    credit: 118000,
  },
  {
    date: data.timelyReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: `NEFT CR FROM Harshita Processor UTR HDF260703606 REF ${data.refs.timely}`,
    reference: "HDF260703606",
    debit: null,
    credit: 115640,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: `NEFT CR FROM ${data.ledgers.amountOnlyCustomer} UTR AXN260703607`,
    reference: "AXN260703607",
    debit: null,
    credit: 64000,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: `NEFT DR TO Prakash Bearings House UTR ${data.refs.foundSupplierAltPayment} REF ${data.refs.foundSupplierAltBill}`,
    reference: data.refs.foundSupplierAltPayment,
    debit: 42000,
    credit: null,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: `IMPS DR TO ${data.ledgers.missingSupplierAlt} UTR ${data.refs.missingSupplierAltPayment}`,
    reference: data.refs.missingSupplierAltPayment,
    debit: 31000,
    credit: null,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: "BANK SMS ALERT CHARGES",
    reference: data.refs.bankChargeFoundEarly,
    debit: 59,
    credit: null,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: "UPI CR FROM RAJESH TRADERS UTR UPI260703609",
    reference: "UPI260703609",
    debit: null,
    credit: 27500,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: "ATM CASH WITHDRAWAL REF ATM260703001",
    reference: "ATM260703001",
    debit: 10000,
    credit: null,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: "INTEREST CREDIT",
    reference: "INT260703001",
    debit: null,
    credit: 1820,
  },
  {
    date: data.exactReceiptDate,
    dateLabel: "03 Jul 2026",
    narration: "ACCOUNT MAINTENANCE FEE",
    reference: "FEE260703002",
    debit: 472,
    credit: null,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `NEFT CR FROM Kalyani Tube UTR HDF260707602 REF ${data.refs.splitA} ${data.refs.splitB}`,
    reference: "HDF260707602",
    debit: null,
    credit: 100000,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `IMPS CR FROM Rudra Forge Pvt Ltd UTR SBI260707604 REF ${data.refs.partial}`,
    reference: "SBI260707604",
    debit: null,
    credit: 73000,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `NEFT CR FROM ${data.ledgers.overpayCustomer} UTR YES260707608 REF ${data.refs.overpay}`,
    reference: "YES260707608",
    debit: null,
    credit: 76000,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `UPI CR FROM ${data.ledgers.advanceCustomer} UTR UPI260707607`,
    reference: "UPI260707607",
    debit: null,
    credit: 88000,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `NEFT DR TO Noble Industrial Supply UTR ${data.refs.foundSupplierPayment} REF ${data.refs.foundSupplierBill}`,
    reference: data.refs.foundSupplierPayment,
    debit: 75000,
    credit: null,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: `RTGS DR TO ${data.ledgers.missingSupplier} UTR ${data.refs.missingSupplierPayment}`,
    reference: data.refs.missingSupplierPayment,
    debit: 64000,
    credit: null,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: "BANK GUARANTEE COMMISSION",
    reference: data.refs.bankChargeMissingMid,
    debit: 1180,
    credit: null,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: "NEFT CR FROM SAI ENGG WORKS UTR HDF260707610 REF SEW/26-27/610",
    reference: "HDF260707610",
    debit: null,
    credit: 52500,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: "IMPS CR FROM SHREE STEEL UTR IC260707611",
    reference: "IC260707611",
    debit: null,
    credit: 14750,
  },
  {
    date: data.midStatementDate,
    dateLabel: "07 Jul 2026",
    narration: "NEFT DR OFFICE RENT REF RENT260707",
    reference: "RENT260707",
    debit: 36000,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: `NEFT CR FROM Triveni Components Private Limited UTR AXN260709605 REF ${data.refs.late}`,
    reference: "AXN260709605",
    debit: null,
    credit: 115640,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "BANK CHARGES JULY STATEMENT",
    reference: data.refs.bankChargeFound,
    debit: 236,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "BANK SERVICE FEE JULY",
    reference: data.refs.bankChargeMissing,
    debit: 590,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: `NEFT DR SUPPLIER PAYMENT REF ${data.refs.ambiguousStatement}`,
    reference: data.refs.ambiguousStatement,
    debit: 50000,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "NEFT CR FROM MADHAV ROLLING MILLS UTR HDF260709612 REF MRM/26-27/612",
    reference: "HDF260709612",
    debit: null,
    credit: 94500,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "RTGS CR FROM OMEGA STEEL UTR KKB260709613",
    reference: "KKB260709613",
    debit: null,
    credit: 125000,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "UPI DR COURIER CHARGES UTR UPI260709614",
    reference: "UPI260709614",
    debit: 850,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "NEFT DR POWER BILL REF MSEDCL260709",
    reference: "MSEDCL260709",
    debit: 18600,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "CASH DEPOSIT BY SELF",
    reference: "CSH260709001",
    debit: null,
    credit: 22000,
  },
  {
    date: data.statementDate,
    dateLabel: "09 Jul 2026",
    narration: "CHEQUE RETURN CHARGES",
    reference: "CHQRET260709",
    debit: 354,
    credit: null,
  },
];

let runningBalance = 1250000;
for (const transaction of transactions) {
  runningBalance += Number(transaction.credit || 0) - Number(transaction.debit || 0);
  transaction.balance = Number(runningBalance.toFixed(2));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

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

function getAttribute(block, attributeName) {
  const match = block.match(new RegExp(`${attributeName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function getTagText(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
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

function buildCollectionExportXml(collectionName, tallyType, fetchFields) {
  return [
    "<ENVELOPE>",
    "<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(collectionName)}</ID></HEADER>`,
    "<BODY><DESC><STATICVARIABLES>",
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
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

async function currentLedgerNames() {
  const xml = await exportCollection("Kalika Verification Ledger Read", "Ledger", "Name,Parent,IsBillWiseOn");
  return new Set(
    extractBlocks(xml, "LEDGER")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

async function currentBillRefs() {
  const xml = await exportCollection(
    "Kalika Verification Bill Read",
    "Bill",
    "Name,LedgerName,PartyLedgerName,VoucherNumber,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount"
  );
  return new Set(
    extractBlocks(xml, "BILL")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

async function currentVoucherKeys() {
  const xml = await exportCollection(
    "Kalika Verification Voucher Read",
    "Voucher",
    "Date,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName"
  );
  const keys = new Set();
  for (const block of extractBlocks(xml, "VOUCHER")) {
    for (const value of [
      getTagText(block, "VOUCHERNUMBER"),
      getTagText(block, "REFERENCE"),
      getTagText(block, "NARRATION"),
    ]) {
      if (!value) continue;
      keys.add(value);
    }
  }
  return keys;
}

async function currentVoucherIndexText() {
  const xml = await exportCollection(
    "Kalika Verification Voucher Index",
    "Voucher",
    "Date,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName"
  );
  return decodeXml(xml);
}

function ledgerXml({ name, parent, billWise = false, email = "", phone = "", address = "", action = "Create" }) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(name)}" ACTION="${escapeXml(action)}">`,
    `<NAME>${escapeXml(name)}</NAME>`,
    `<PARENT>${escapeXml(parent)}</PARENT>`,
    `<ISBILLWISEON>${billWise ? "Yes" : "No"}</ISBILLWISEON>`,
    "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
    email ? `<EMAIL>${escapeXml(email)}</EMAIL>` : "",
    phone ? `<PHONENUMBER>${escapeXml(phone)}</PHONENUMBER>` : "",
    phone ? `<LEDGERPHONE>${escapeXml(phone)}</LEDGERPHONE>` : "",
    phone ? `<MOBILENO>${escapeXml(phone)}</MOBILENO>` : "",
    address ? `<ADDRESS.LIST TYPE="String"><ADDRESS>${escapeXml(address)}</ADDRESS></ADDRESS.LIST>` : "",
    '<LANGUAGENAME.LIST><NAME.LIST TYPE="String">',
    `<NAME>${escapeXml(name)}</NAME>`,
    '</NAME.LIST><LANGUAGEID TYPE="Number">1033</LANGUAGEID></LANGUAGENAME.LIST>',
    "</LEDGER>",
    "</TALLYMESSAGE>",
  ].join("");
}

function wrapMasterMessages(messages) {
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>",
    "<STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES>",
    "</REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function billAllocationXml({ referenceName, referenceType, amount, isDebit }) {
  const signedAmount = isDebit ? `-${money(amount)}` : money(amount);
  return [
    "<BILLALLOCATIONS.LIST>",
    `<NAME>${escapeXml(referenceName)}</NAME>`,
    `<BILLTYPE>${escapeXml(referenceType)}</BILLTYPE>`,
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    "</BILLALLOCATIONS.LIST>",
  ].join("");
}

function ledgerEntryXml({ ledgerName, amount, isDebit, isPartyLedger = false, billAllocations = "" }) {
  const signedAmount = isDebit ? `-${money(amount)}` : money(amount);
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    "<REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>",
    `<AMOUNT>${signedAmount}</AMOUNT>`,
    billAllocations,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function voucherXml({ date, voucherType, voucherNumber, referenceName, partyLedgerName, narration, entries }) {
  const voucherDate = tallyDate(date);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${voucherDate}</DATE>`,
    `<EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(referenceName || voucherNumber)}</REFERENCE>`,
    partyLedgerName ? `<PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>` : "",
    "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>",
    "<ISINVOICE>No</ISINVOICE>",
    `<NARRATION>${escapeXml(narration)}</NARRATION>`,
    ...entries,
    "</VOUCHER>",
    "</TALLYMESSAGE>",
  ].join("");
}

function wrapVoucherMessages(messages, fromDate, toDate = fromDate) {
  const voucherFromDate = tallyDate(fromDate);
  const voucherToDate = tallyDate(toDate);
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>",
    "<STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${voucherFromDate}</SVFROMDATE><SVTODATE>${voucherToDate}</SVTODATE><SVCURRENTDATE>${voucherToDate}</SVCURRENTDATE>`,
    "</STATICVARIABLES>",
    "</REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function salesVoucher({ customerLedger, referenceName, amount, date }) {
  return voucherXml({
    date,
    voucherType: "Sales",
    voucherNumber: referenceName,
    referenceName,
    partyLedgerName: customerLedger,
    narration: `Invoice ${referenceName}; commercial terms as agreed.`,
    entries: [
      ledgerEntryXml({
        ledgerName: customerLedger,
        amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocations: billAllocationXml({ referenceName, referenceType: "New Ref", amount, isDebit: true }),
      }),
      ledgerEntryXml({ ledgerName: data.ledgers.sales, amount, isDebit: false }),
    ],
  });
}

function purchaseVoucher({ supplierLedger, referenceName, amount, date }) {
  return voucherXml({
    date,
    voucherType: "Purchase",
    voucherNumber: referenceName,
    referenceName,
    partyLedgerName: supplierLedger,
    narration: `Purchase bill ${referenceName}; payable as agreed.`,
    entries: [
      ledgerEntryXml({
        ledgerName: supplierLedger,
        amount,
        isDebit: false,
        isPartyLedger: true,
        billAllocations: billAllocationXml({ referenceName, referenceType: "New Ref", amount, isDebit: false }),
      }),
      ledgerEntryXml({ ledgerName: data.ledgers.purchase, amount, isDebit: true }),
    ],
  });
}

function paymentVoucher({ partyLedger, voucherNumber, referenceName, amount, narration, ledgerBillReference = null, date }) {
  return voucherXml({
    date,
    voucherType: "Payment",
    voucherNumber,
    referenceName,
    partyLedgerName: partyLedger,
    narration,
    entries: [
      ledgerEntryXml({
        ledgerName: partyLedger,
        amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocations: ledgerBillReference
          ? billAllocationXml({ referenceName: ledgerBillReference, referenceType: "Agst Ref", amount, isDebit: true })
          : "",
      }),
      ledgerEntryXml({ ledgerName: BANK_LEDGER, amount, isDebit: false }),
    ],
  });
}

function bankChargeVoucher({ voucherNumber, referenceName, amount, narration, date }) {
  return voucherXml({
    date,
    voucherType: "Payment",
    voucherNumber,
    referenceName,
    partyLedgerName: BANK_LEDGER,
    narration,
    entries: [
      ledgerEntryXml({ ledgerName: data.ledgers.bankCharges, amount, isDebit: true }),
      ledgerEntryXml({ ledgerName: BANK_LEDGER, amount, isDebit: false }),
    ],
  });
}

function hasAnyKey(keys, values) {
  return values.some((value) => value && keys.has(value));
}

function includesAnyText(text, values) {
  return values.some((value) => value && text.includes(value));
}

async function seedTally() {
  const ledgerNames = await currentLedgerNames();
  const ledgerDefinitions = [
    { name: data.ledgers.fullCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.splitCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.partialCustomer, parent: "Sundry Debtors", billWise: true },
    {
      name: data.ledgers.lateCustomer,
      parent: "Sundry Debtors",
      billWise: true,
      phone: data.whatsappPhone,
      email: "accounts@trivenicomponents.example",
      address: "MIDC Area, Pune",
    },
    { name: data.ledgers.timelyCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.amountOnlyCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.overpayCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.advanceCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.foundSupplier, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.foundSupplierAlt, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.missingSupplier, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.missingSupplierAlt, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.ambiguousSupplierA, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.ambiguousSupplierB, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.sales, parent: "Sales Accounts", billWise: false },
    { name: data.ledgers.purchase, parent: "Purchase Accounts", billWise: false },
    { name: data.ledgers.recovery, parent: "Indirect Incomes", billWise: false },
    { name: data.ledgers.bankCharges, parent: "Indirect Expenses", billWise: false },
  ];
  const missingLedgers = ledgerDefinitions.filter((ledger) => !ledgerNames.has(ledger.name));
  if (missingLedgers.length > 0) {
    await postTallyXml(wrapMasterMessages(missingLedgers.map(ledgerXml)));
  }

  await postTallyXml(
    wrapMasterMessages([
      ledgerXml({
        name: data.ledgers.lateCustomer,
        parent: "Sundry Debtors",
        billWise: true,
        phone: data.whatsappPhone,
        email: "accounts@trivenicomponents.example",
        address: "MIDC Area, Pune",
        action: ledgerNames.has(data.ledgers.lateCustomer) ? "Alter" : "Create",
      }),
    ])
  );

  const [billRefs, voucherKeys] = await Promise.all([currentBillRefs(), currentVoucherKeys()]);
  const openingVouchers = [
    !billRefs.has(data.refs.full) && !hasAnyKey(voucherKeys, [data.refs.full])
      ? salesVoucher({
          customerLedger: data.ledgers.fullCustomer,
          referenceName: data.refs.full,
          amount: 118000,
          date: data.exactInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.splitA) && !hasAnyKey(voucherKeys, [data.refs.splitA])
      ? salesVoucher({
          customerLedger: data.ledgers.splitCustomer,
          referenceName: data.refs.splitA,
          amount: 45000,
          date: data.splitInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.splitB) && !hasAnyKey(voucherKeys, [data.refs.splitB])
      ? salesVoucher({
          customerLedger: data.ledgers.splitCustomer,
          referenceName: data.refs.splitB,
          amount: 55000,
          date: data.splitInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.partial) && !hasAnyKey(voucherKeys, [data.refs.partial])
      ? salesVoucher({
          customerLedger: data.ledgers.partialCustomer,
          referenceName: data.refs.partial,
          amount: 118000,
          date: data.partialInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.late) && !hasAnyKey(voucherKeys, [data.refs.late])
      ? salesVoucher({
          customerLedger: data.ledgers.lateCustomer,
          referenceName: data.refs.late,
          amount: 118000,
          date: data.lateInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.timely) && !hasAnyKey(voucherKeys, [data.refs.timely])
      ? salesVoucher({
          customerLedger: data.ledgers.timelyCustomer,
          referenceName: data.refs.timely,
          amount: 118000,
          date: data.timelyInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.amountOnly) && !hasAnyKey(voucherKeys, [data.refs.amountOnly])
      ? salesVoucher({
          customerLedger: data.ledgers.amountOnlyCustomer,
          referenceName: data.refs.amountOnly,
          amount: 64000,
          date: data.exactInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.overpay) && !hasAnyKey(voucherKeys, [data.refs.overpay])
      ? salesVoucher({
          customerLedger: data.ledgers.overpayCustomer,
          referenceName: data.refs.overpay,
          amount: 50000,
          date: data.splitInvoiceDate,
        })
      : null,
    !billRefs.has(data.refs.foundSupplierBill) && !hasAnyKey(voucherKeys, [data.refs.foundSupplierBill])
      ? purchaseVoucher({
          supplierLedger: data.ledgers.foundSupplier,
          referenceName: data.refs.foundSupplierBill,
          amount: 75000,
          date: data.supplierBillDate,
        })
      : null,
    !billRefs.has(data.refs.foundSupplierAltBill) && !hasAnyKey(voucherKeys, [data.refs.foundSupplierAltBill])
      ? purchaseVoucher({
          supplierLedger: data.ledgers.foundSupplierAlt,
          referenceName: data.refs.foundSupplierAltBill,
          amount: 42000,
          date: data.supplierBillDate,
        })
      : null,
  ].filter(Boolean);

  if (openingVouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(openingVouchers, data.openingStartDate, data.openingEndDate));
  }

  const [refreshedVoucherKeys, refreshedVoucherIndexText] = await Promise.all([
    currentVoucherKeys(),
    currentVoucherIndexText(),
  ]);
  const existingPaymentVouchers = [
    !hasAnyKey(refreshedVoucherKeys, [data.refs.foundSupplierPayment, "PAY-JUL-701"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.foundSupplierPayment, "PAY-JUL-701"])
      ? paymentVoucher({
          partyLedger: data.ledgers.foundSupplier,
          voucherNumber: "PAY-JUL-701",
          referenceName: data.refs.foundSupplierPayment,
          amount: 75000,
          ledgerBillReference: data.refs.foundSupplierBill,
          narration: `NEFT payment to ${data.ledgers.foundSupplier} against ${data.refs.foundSupplierBill}; UTR ${data.refs.foundSupplierPayment}.`,
          date: data.midStatementDate,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.bankChargeFound, "PAY-JUL-703"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.bankChargeFound, "PAY-JUL-703"])
      ? bankChargeVoucher({
          voucherNumber: "PAY-JUL-703",
          referenceName: data.refs.bankChargeFound,
          amount: 236,
          narration: `Bank charges for July statement; ref ${data.refs.bankChargeFound}.`,
          date: data.statementDate,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.foundSupplierAltPayment, "PAY-JUL-704"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.foundSupplierAltPayment, "PAY-JUL-704"])
      ? paymentVoucher({
          partyLedger: data.ledgers.foundSupplierAlt,
          voucherNumber: "PAY-JUL-704",
          referenceName: data.refs.foundSupplierAltPayment,
          amount: 42000,
          ledgerBillReference: data.refs.foundSupplierAltBill,
          narration: `NEFT payment to ${data.ledgers.foundSupplierAlt} against ${data.refs.foundSupplierAltBill}; UTR ${data.refs.foundSupplierAltPayment}.`,
          date: data.exactReceiptDate,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.bankChargeFoundEarly, "PAY-JUL-706"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.bankChargeFoundEarly, "PAY-JUL-706"])
      ? bankChargeVoucher({
          voucherNumber: "PAY-JUL-706",
          referenceName: data.refs.bankChargeFoundEarly,
          amount: 59,
          narration: `Bank SMS alert charges; ref ${data.refs.bankChargeFoundEarly}.`,
          date: data.exactReceiptDate,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.ambiguousA, "PAY-JUL-801"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.ambiguousA, "PAY-JUL-801"])
      ? paymentVoucher({
          partyLedger: data.ledgers.ambiguousSupplierA,
          voucherNumber: "PAY-JUL-801",
          referenceName: data.refs.ambiguousA,
          amount: 50000,
          narration: `NEFT payment to ${data.ledgers.ambiguousSupplierA}; ref ${data.refs.ambiguousA}.`,
          date: data.statementDate,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.ambiguousB, "PAY-JUL-802"]) &&
    !includesAnyText(refreshedVoucherIndexText, [data.refs.ambiguousB, "PAY-JUL-802"])
      ? paymentVoucher({
          partyLedger: data.ledgers.ambiguousSupplierB,
          voucherNumber: "PAY-JUL-802",
          referenceName: data.refs.ambiguousB,
          amount: 50000,
          narration: `NEFT payment to ${data.ledgers.ambiguousSupplierB}; ref ${data.refs.ambiguousB}.`,
          date: data.statementDate,
        })
      : null,
  ].filter(Boolean);

  if (existingPaymentVouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(existingPaymentVouchers, data.midStatementDate, data.statementDate));
  }

  return {
    createdLedgers: missingLedgers.map((ledger) => ledger.name),
    createdOpeningVouchers: openingVouchers.length,
    createdExistingPaymentVouchers: existingPaymentVouchers.length,
  };
}

async function seedSupabase() {
  loadEnvFile(path.join(repoRoot, ".env"));
  loadEnvFile(path.join(repoRoot, "apps", "api", ".env"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { skipped: true, reason: "Supabase service env vars not found." };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: connections, error: connectionError } = await supabase
    .from("tally_connections")
    .select("id, owner_user_id, last_company_name, display_name, status, last_company_loaded, last_heartbeat_at, updated_at")
    .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (connectionError) throw connectionError;

  const connection =
    (connections || []).find((item) => item.last_company_loaded === true && item.last_company_name === COMPANY_NAME) ||
    (connections || []).find((item) => item.last_company_loaded === true) ||
    connections?.[0];
  if (!connection) return { skipped: true, reason: "No Tally connection row found." };

  const ruleName = "Standard 2% within 15 days";
  const { data: existingRules, error: ruleReadError } = await supabase
    .from("cash_discount_rules")
    .select("id")
    .eq("owner_user_id", connection.owner_user_id)
    .eq("rule_name", ruleName)
    .order("created_at", { ascending: true })
    .limit(1);
  if (ruleReadError) throw ruleReadError;

  const now = new Date().toISOString();
  const rulePayload = {
    owner_user_id: connection.owner_user_id,
    connection_id: connection.id,
    rule_name: ruleName,
    scope_type: "company",
    scope_key: "default",
    scope_label: "Default customer collection terms",
    discount_type: "percentage",
    discount_value: 2,
    calculation_base: "invoice_total",
    eligibility_days: 15,
    grace_days: 0,
    payment_condition: "full_payment",
    accounting_treatment: "commercial_credit_note",
    missed_cd_treatment: "debit_note_proposal",
    approval_required: true,
    label: "2% CD",
    is_active: true,
    updated_at: now,
  };

  let ruleId = existingRules?.[0]?.id || null;
  if (ruleId) {
    const { error } = await supabase.from("cash_discount_rules").update(rulePayload).eq("id", ruleId);
    if (error) throw error;
  } else {
    const { data: insertedRule, error } = await supabase
      .from("cash_discount_rules")
      .insert(rulePayload)
      .select("id")
      .single();
    if (error) throw error;
    ruleId = insertedRule.id;
  }

  const proposalPayload = {
    owner_user_id: connection.owner_user_id,
    connection_id: connection.id,
    company_name: connection.last_company_name || connection.display_name || COMPANY_NAME,
    financial_year: data.companyFinancialYear,
    party_ledger_name: data.ledgers.lateCustomer,
    party_gstin: null,
    party_email: "accounts@trivenicomponents.example",
    party_phone: data.whatsappPhone,
    party_contact_person: "Accounts Team",
    party_address: "MIDC Area, Pune",
    linked_invoice_number: data.refs.late,
    linked_invoice_date: data.lateInvoiceDate,
    original_invoice_amount: 118000,
    cash_discount_rule_id: ruleId,
    cash_discount_rule_name: ruleName,
    discount_deadline: "2026-06-30",
    receipt_date: data.statementDate,
    amount_received: 115640,
    recoverable_amount: 2360,
    reason_code: "late_short_payment",
    narration: `Cash discount recovery against invoice ${data.refs.late}. Payment received after discount period.`,
    gst_mode: "finance_review",
    debit_note_date: data.statementDate,
    status: "pending_approval",
    tally_voucher_guid: null,
    tally_voucher_id: null,
    tally_voucher_number: null,
    tally_voucher_date: null,
    tally_open_reference_name: null,
    created_in_tally_at: null,
    last_error: null,
    remaining_recoverable_amount: 2360,
    communication_status: "not_sent",
    customer_snapshot: {
      ledgerName: data.ledgers.lateCustomer,
      parentName: "Sundry Debtors",
      gstin: null,
      email: "accounts@trivenicomponents.example",
      phone: data.whatsappPhone,
      contactPerson: "Accounts Team",
      address: "MIDC Area, Pune",
    },
    updated_at: now,
  };

  const { data: existingProposal, error: proposalReadError } = await supabase
    .from("debit_note_proposals")
    .select("id")
    .eq("owner_user_id", connection.owner_user_id)
    .eq("connection_id", connection.id)
    .eq("linked_invoice_number", data.refs.late)
    .limit(1);
  if (proposalReadError) throw proposalReadError;

  if (existingProposal?.[0]?.id) {
    const { error } = await supabase
      .from("debit_note_proposals")
      .update(proposalPayload)
      .eq("id", existingProposal[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("debit_note_proposals").insert(proposalPayload);
    if (error) throw error;
  }

  return {
    skipped: false,
    connectionId: connection.id,
    ownerUserId: connection.owner_user_id,
    ruleName,
    proposalInvoice: data.refs.late,
  };
}

function statementPacks() {
  return [
    {
      id: "jul03",
      label: "03 Jul 2026",
      start: "2026-07-03",
      end: "2026-07-03",
      startLabel: "03 Jul 2026",
      endLabel: "03 Jul 2026",
      fileName: "AccountStatement_03-Jul-2026.pdf",
      transactions: transactions.filter((transaction) => transaction.date === "2026-07-03"),
    },
    {
      id: "jul07",
      label: "07 Jul 2026",
      start: "2026-07-07",
      end: "2026-07-07",
      startLabel: "07 Jul 2026",
      endLabel: "07 Jul 2026",
      fileName: "AccountStatement_07-Jul-2026.pdf",
      transactions: transactions.filter((transaction) => transaction.date === "2026-07-07"),
    },
    {
      id: "jul09",
      label: "09 Jul 2026",
      start: "2026-07-09",
      end: "2026-07-09",
      startLabel: "09 Jul 2026",
      endLabel: "09 Jul 2026",
      fileName: "AccountStatement_09-Jul-2026.pdf",
      transactions: transactions.filter((transaction) => transaction.date === "2026-07-09"),
    },
  ];
}

function expectedCases() {
  return [
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 1,
      area: "Incoming receipt clears one bill with close party name",
      expected: `Statement says "Vardhan Metals Work" while Tally ledger is "${data.ledgers.fullCustomer}". ${data.refs.full} should allocate INR 118000 and become zero pending after Send to Tally.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 2,
      area: "Incoming receipt with close party name and allowed cash discount",
      expected: `Statement says "Harshita Processor" while Tally ledger is "${data.ledgers.timelyCustomer}". ${data.refs.timely} is dated ${data.timelyInvoiceDate}; receipt on 03 Jul is inside 15 days. It should post as a receipt and should not become a recovery debit-note item.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 3,
      area: "Incoming receipt without invoice reference",
      expected: `${data.ledgers.amountOnlyCustomer} has one INR 64000 pending bill. The row has no bill reference, so matching should use party + amount and allocate ${data.refs.amountOnly}.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 4,
      area: "Outgoing payment already entered with close supplier name",
      expected: `Statement says "Prakash Bearings House" while Tally ledger is "${data.ledgers.foundSupplierAlt}". ${data.refs.foundSupplierAltPayment} already exists in Tally against ${data.refs.foundSupplierAltBill}. It should be verified/found and should not create a duplicate Payment voucher.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 5,
      area: "Outgoing payment missing in Tally",
      expected: `${data.refs.missingSupplierAltPayment} has no Tally payment. It should be marked missing in Tally.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 6,
      area: "Bank charge already entered",
      expected: `${data.refs.bankChargeFoundEarly} already exists as a Bank Charges payment in Tally. It should be verified/found.`,
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 7,
      area: "Incoming credit without known ledger",
      expected: "Rajesh Traders is not seeded as a Tally debtor. It should stay in suspense or need party ledger review, not post to a random ledger.",
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 8,
      area: "Outgoing cash withdrawal",
      expected: "ATM cash withdrawal has no seeded Tally voucher. It should be marked missing or need review, not auto-created silently.",
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 9,
      area: "Bank income credit",
      expected: "Interest credit is non-customer income. It should need a ledger/category decision unless a standard interest ledger is configured.",
    },
    {
      pdf: "AccountStatement_03-Jul-2026.pdf",
      row: 10,
      area: "Bank fee missing in Tally",
      expected: "Account maintenance fee has no seeded Tally voucher. It should be a debit-side missing/needs-review case.",
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 1,
      area: "Incoming receipt clears two bills with close party name",
      expected: `Statement says "Kalyani Tube" while Tally ledger is "${data.ledgers.splitCustomer}". ${data.refs.splitA} and ${data.refs.splitB} should both clear from one INR 100000 receipt.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 2,
      area: "Incoming partial receipt with close party name",
      expected: `Statement says "Rudra Forge Pvt Ltd" while Tally ledger is "${data.ledgers.partialCustomer}". ${data.refs.partial} should post INR 73000 and keep INR 45000 pending.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 3,
      area: "Incoming overpayment creates advance",
      expected: `${data.refs.overpay} has INR 50000 pending, but the receipt is INR 76000. It should clear the bill and leave INR 26000 as advance/new reference.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 4,
      area: "Incoming advance/no open bill",
      expected: `${data.ledgers.advanceCustomer} has no open bill. It should need an advance/new reference decision, not force-match to another invoice.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 5,
      area: "Outgoing payment already entered with close supplier name",
      expected: `Statement says "Noble Industrial Supply" while Tally ledger is "${data.ledgers.foundSupplier}". ${data.refs.foundSupplierPayment} already exists in Tally. It should be verified/found and should not create a duplicate Payment voucher.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 6,
      area: "Outgoing payment missing in Tally",
      expected: `${data.refs.missingSupplierPayment} has no Tally payment. It should be marked missing in Tally.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 7,
      area: "Bank charge missing in Tally",
      expected: `${data.refs.bankChargeMissingMid} has no Tally voucher. It should be marked missing in Tally.`,
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 8,
      area: "Incoming credit with unknown customer",
      expected: "Sai Engg Works is not seeded as a Tally debtor. It should stay in suspense or need ledger review.",
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 9,
      area: "Incoming credit with unknown customer and no invoice reference",
      expected: "Shree Steel has no seeded open bill. It should not be force-matched to another debtor.",
    },
    {
      pdf: "AccountStatement_07-Jul-2026.pdf",
      row: 10,
      area: "Outgoing non-party expense",
      expected: "Office rent has no seeded existing voucher. It should be marked missing/needs review on the debit side.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 1,
      area: "Late short cash discount recovery with close party name",
      expected: `Statement says "Triveni Components Private Limited" while Tally ledger is "${data.ledgers.lateCustomer}". ${data.refs.late} is dated ${data.lateInvoiceDate}; receipt on 09 Jul is after the 15 day deadline (${data.lateInvoiceDate} + 15 days = 30 Jun). The remaining INR 2360 should be shown in Cash Discounts as a debit-note recovery candidate.`,
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 2,
      area: "Bank charge already entered",
      expected: `${data.refs.bankChargeFound} already exists as a Bank Charges payment in Tally. It should be verified/found.`,
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 3,
      area: "Bank charge missing in Tally",
      expected: `${data.refs.bankChargeMissing} has no Tally voucher. It should be marked missing in Tally.`,
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 4,
      area: "Ambiguous outgoing payment",
      expected: `The INR 50000 debit should find two equally likely Tally payments and stop as needs review, not auto-mark as found.`,
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 5,
      area: "Incoming unknown customer with explicit reference",
      expected: "Madhav Rolling Mills has a reference in narration but no seeded ledger/open bill. It should not be posted until the ledger is selected.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 6,
      area: "Incoming unknown customer without invoice reference",
      expected: "Omega Steel has no bill reference and no seeded ledger. It should remain in suspense/needs party ledger.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 7,
      area: "Small outgoing expense",
      expected: "Courier charge has no seeded voucher. It should be shown as missing/needs review on outgoing verification.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 8,
      area: "Utility outgoing payment",
      expected: "Power bill has no seeded voucher. It should be marked missing/needs review.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 9,
      area: "Cash deposit credit",
      expected: "Cash deposit is not a debtor receipt. It should not be matched to customer bills automatically.",
    },
    {
      pdf: "AccountStatement_09-Jul-2026.pdf",
      row: 10,
      area: "Cheque return charge",
      expected: "Cheque return charge is a bank fee-like debit without seeded voucher. It should be missing/needs review.",
    },
    {
      row: "Re-upload",
      area: "Duplicate import protection",
      expected: "Importing the same PDF again should not post duplicate receipts or re-create duplicate outgoing verification logs for rows already handled.",
    },
  ];
}

function writeManifest() {
  fs.mkdirSync(outputDir, { recursive: true });
  const packs = statementPacks();
  const manifest = {
    generatedAt: new Date().toISOString(),
    companyName: COMPANY_NAME,
    companyFinancialYear: data.companyFinancialYear,
    bankLedgerName: BANK_LEDGER,
    bankAccountName: data.bankAccountName,
    accountNumber: data.accountNumber,
    accountHolderName: data.accountHolderName,
    statementPeriodStart: data.statementPeriodStart,
    statementPeriodEnd: data.statementPeriodEnd,
    statementPeriodStartLabel: data.statementPeriodStartLabel,
    statementPeriodEndLabel: data.statementPeriodEndLabel,
    pdfPaths: packs.map((pack) => path.join(outputDir, pack.fileName)),
    ledgers: data.ledgers,
    refs: data.refs,
    whatsappPhone: data.whatsappPhone,
    tallyDataFolderToShare: "C:\\Users\\Public\\TallyPrime\\data\\100000",
    friendSaveLocation: "C:\\Users\\Public\\TallyPrime\\data\\100000",
    expectedCases: expectedCases(),
    transactions,
    packs: packs.map((pack) => ({
      ...pack,
      pdfPath: path.join(outputDir, pack.fileName),
    })),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(readmePath, buildReadme(manifest));
  return manifest;
}

function buildReadme(manifest) {
  const rows = manifest.expectedCases
    .map((item) => `| ${item.pdf ?? ""} | ${item.row} | ${item.area} | ${item.expected} |`)
    .join("\n");
  const pdfList = manifest.pdfPaths.map((pdfPath) => `- \`${pdfPath}\``).join("\n");
  return `# Bank Statement Verification Pack

Generated for company: ${manifest.companyName}

Upload these files in Bank Statements, one by one:

${pdfList}

Use bank ledger:

\`${manifest.bankLedgerName}\`

## Expected Results

| PDF | Row | Area | Expected |
| --- | --- | --- | --- |
${rows}

## Tally Data Handoff

Share this local Tally company folder after seeding:

\`${manifest.tallyDataFolderToShare}\`

Your friend should save it at:

\`${manifest.friendSaveLocation}\`

Then open Tally Prime and load the company from \`C:\\Users\\Public\\TallyPrime\\data\`.

## Notes

- The uploaded PDF intentionally contains only realistic bank-statement rows. Scenario labels are kept here, outside the PDF.
- The script creates June 2026 opening invoices/bills and July 2026 existing outgoing Tally vouchers so the outgoing verification can prove found, missing, and needs-review states.
- Cash Discounts is tested through a pending system proposal for \`${data.refs.late}\`, with phone \`${data.whatsappPhone}\` on the Tally ledger and proposal snapshot.
- No PDF contains scenario hints; the labels live only in this README.
`;
}

function writePackManifest(pack) {
  const packManifestPath = path.join(outputDir, `${pack.id}_manifest.json`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    companyName: COMPANY_NAME,
    companyFinancialYear: data.companyFinancialYear,
    bankLedgerName: BANK_LEDGER,
    bankAccountName: data.bankAccountName,
    accountNumber: data.accountNumber,
    accountHolderName: data.accountHolderName,
    statementPeriodStart: pack.start,
    statementPeriodEnd: pack.end,
    statementPeriodStartLabel: pack.startLabel,
    statementPeriodEndLabel: pack.endLabel,
    pdfPath: path.join(outputDir, pack.fileName),
    transactions: pack.transactions,
  };
  fs.writeFileSync(packManifestPath, JSON.stringify(manifest, null, 2));
  return packManifestPath;
}

function renderPdf(packManifestPath) {
  const pythonScript = path.join(repoRoot, "scripts", "create_collections_stress_statement_pdf.py");
  const result = spawnSync("python", [pythonScript, packManifestPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "PDF generation failed.");
  }
  return result.stdout.trim();
}

async function main() {
  console.log("Preparing bank statement verification pack.");
  if (process.env.KALIKA_PDF_ONLY === "1") {
    console.log("Tally/Supabase seeding skipped because KALIKA_PDF_ONLY=1.");
  } else {
    const tallyResult = await seedTally();
    console.log(
      `Tally: created ledgers=${tallyResult.createdLedgers.length}, opening vouchers=${tallyResult.createdOpeningVouchers}, existing outgoing vouchers=${tallyResult.createdExistingPaymentVouchers}`
    );
    const supabaseResult = await seedSupabase();
    console.log(
      `Supabase: ${
        supabaseResult.skipped
          ? `skipped (${supabaseResult.reason})`
          : `rule=${supabaseResult.ruleName}, proposal=${supabaseResult.proposalInvoice}`
      }`
    );
  }
  const manifest = writeManifest();
  const pdfPaths = [];
  for (const pack of statementPacks()) {
    const packManifestPath = writePackManifest(pack);
    pdfPaths.push(renderPdf(packManifestPath));
  }
  console.log("PDFs:");
  for (const pdfPath of pdfPaths) {
    console.log(`- ${pdfPath}`);
  }
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Readme: ${readmePath}`);
  console.log("Expected cases:");
  for (const item of manifest.expectedCases) {
    console.log(`- ${item.pdf ?? ""} row ${item.row}: ${item.area} - ${item.expected}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
