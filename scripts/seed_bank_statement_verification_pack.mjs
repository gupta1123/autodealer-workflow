import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "output", "pdf", "bank-statement-verification-2026-08");
const manifestPath = path.join(outputDir, "bank_statement_verification_manifest.json");
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
  statementPeriodStart: "2026-08-01",
  statementPeriodEnd: "2026-08-31",
  statementPeriodStartLabel: "01 Aug 2026",
  statementPeriodEndLabel: "31 Aug 2026",
  bankAccountName: "Kotak Mahindra Bank",
  accountNumber: "6713098600",
  accountHolderName: "Nyx",
  invoiceDate: "2026-08-01",
  timelyReceiptDate: "2026-08-02",
  statementDate: "2026-08-31",
  ledgers: {
    fullCustomer: "Vardhan Metal Works",
    splitCustomer: "Kalyani Tubes",
    partialCustomer: "Rudra Forge Private Limited",
    lateCustomer: "Triveni Components Pvt Ltd",
    timelyCustomer: "Harshita Processors",
    advanceCustomer: "Orchid Castings LLP",
    foundSupplier: "Noble Industrial Supplies",
    missingSupplier: "Zenith Industrial Stores",
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
    foundSupplierBill: "NIS/26-27/701",
    foundSupplierPayment: "YES260831701",
    missingSupplierPayment: "IC260831702",
    bankChargeFound: "CHG260831703",
    bankChargeMissing: "CHG260831704",
    ambiguousA: "AMB260831A",
    ambiguousB: "AMB260831B",
    ambiguousStatement: "AUG831000",
  },
};

const transactions = [
  {
    date: data.timelyReceiptDate,
    dateLabel: "02 Aug 2026",
    narration: `NEFT CR FROM ${data.ledgers.timelyCustomer} UTR HDF260802606 REF ${data.refs.timely}`,
    reference: "HDF260802606",
    debit: null,
    credit: 115640,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `RTGS CR FROM ${data.ledgers.fullCustomer} UTR KKB260831601 AGAINST ${data.refs.full}`,
    reference: "KKB260831601",
    debit: null,
    credit: 118000,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `NEFT CR FROM ${data.ledgers.splitCustomer} UTR HDF260831602 REF ${data.refs.splitA} ${data.refs.splitB}`,
    reference: "HDF260831602",
    debit: null,
    credit: 100000,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `IMPS CR FROM ${data.ledgers.partialCustomer} UTR SBI260831604 REF ${data.refs.partial}`,
    reference: "SBI260831604",
    debit: null,
    credit: 73000,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `UPI CR FROM ${data.ledgers.advanceCustomer} UTR UPI260831607`,
    reference: "UPI260831607",
    debit: null,
    credit: 88000,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `NEFT CR FROM ${data.ledgers.lateCustomer} UTR AXN260831605 REF ${data.refs.late}`,
    reference: "AXN260831605",
    debit: null,
    credit: 115640,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `NEFT DR TO ${data.ledgers.foundSupplier} UTR ${data.refs.foundSupplierPayment} REF ${data.refs.foundSupplierBill}`,
    reference: data.refs.foundSupplierPayment,
    debit: 75000,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `RTGS DR TO ${data.ledgers.missingSupplier} UTR ${data.refs.missingSupplierPayment}`,
    reference: data.refs.missingSupplierPayment,
    debit: 64000,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: "BANK CHARGES FOR AUGUST STATEMENT",
    reference: data.refs.bankChargeFound,
    debit: 236,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: "BANK SERVICE FEE AUGUST",
    reference: data.refs.bankChargeMissing,
    debit: 590,
    credit: null,
  },
  {
    date: data.statementDate,
    dateLabel: "31 Aug 2026",
    narration: `NEFT DR SUPPLIER PAYMENT REF ${data.refs.ambiguousStatement}`,
    reference: data.refs.ambiguousStatement,
    debit: 50000,
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

function ledgerXml({ name, parent, billWise = false, email = "", phone = "", address = "" }) {
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
    `<NAME>${escapeXml(name)}</NAME>`,
    `<PARENT>${escapeXml(parent)}</PARENT>`,
    `<ISBILLWISEON>${billWise ? "Yes" : "No"}</ISBILLWISEON>`,
    "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
    email ? `<EMAIL>${escapeXml(email)}</EMAIL>` : "",
    phone ? `<PHONENUMBER>${escapeXml(phone)}</PHONENUMBER>` : "",
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

function wrapVoucherMessages(messages, date) {
  const voucherDate = tallyDate(date);
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>",
    "<STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${voucherDate}</SVFROMDATE><SVTODATE>${voucherDate}</SVTODATE><SVCURRENTDATE>${voucherDate}</SVCURRENTDATE>`,
    "</STATICVARIABLES>",
    "</REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function salesVoucher({ customerLedger, referenceName, amount }) {
  return voucherXml({
    date: data.invoiceDate,
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

function purchaseVoucher({ supplierLedger, referenceName, amount }) {
  return voucherXml({
    date: data.invoiceDate,
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

function paymentVoucher({ partyLedger, voucherNumber, referenceName, amount, narration, ledgerBillReference = null }) {
  return voucherXml({
    date: data.statementDate,
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

function bankChargeVoucher({ voucherNumber, referenceName, amount, narration }) {
  return voucherXml({
    date: data.statementDate,
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
      phone: "8080830803",
      email: "accounts@trivenicomponents.example",
      address: "MIDC Area, Pune",
    },
    { name: data.ledgers.timelyCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.advanceCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.foundSupplier, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.missingSupplier, parent: "Sundry Creditors", billWise: true },
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

  const [billRefs, voucherKeys] = await Promise.all([currentBillRefs(), currentVoucherKeys()]);
  const openingVouchers = [
    !billRefs.has(data.refs.full) && !hasAnyKey(voucherKeys, [data.refs.full])
      ? salesVoucher({ customerLedger: data.ledgers.fullCustomer, referenceName: data.refs.full, amount: 118000 })
      : null,
    !billRefs.has(data.refs.splitA) && !hasAnyKey(voucherKeys, [data.refs.splitA])
      ? salesVoucher({ customerLedger: data.ledgers.splitCustomer, referenceName: data.refs.splitA, amount: 45000 })
      : null,
    !billRefs.has(data.refs.splitB) && !hasAnyKey(voucherKeys, [data.refs.splitB])
      ? salesVoucher({ customerLedger: data.ledgers.splitCustomer, referenceName: data.refs.splitB, amount: 55000 })
      : null,
    !billRefs.has(data.refs.partial) && !hasAnyKey(voucherKeys, [data.refs.partial])
      ? salesVoucher({ customerLedger: data.ledgers.partialCustomer, referenceName: data.refs.partial, amount: 118000 })
      : null,
    !billRefs.has(data.refs.late) && !hasAnyKey(voucherKeys, [data.refs.late])
      ? salesVoucher({ customerLedger: data.ledgers.lateCustomer, referenceName: data.refs.late, amount: 118000 })
      : null,
    !billRefs.has(data.refs.timely) && !hasAnyKey(voucherKeys, [data.refs.timely])
      ? salesVoucher({ customerLedger: data.ledgers.timelyCustomer, referenceName: data.refs.timely, amount: 118000 })
      : null,
    !billRefs.has(data.refs.foundSupplierBill) && !hasAnyKey(voucherKeys, [data.refs.foundSupplierBill])
      ? purchaseVoucher({
          supplierLedger: data.ledgers.foundSupplier,
          referenceName: data.refs.foundSupplierBill,
          amount: 75000,
        })
      : null,
  ].filter(Boolean);

  if (openingVouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(openingVouchers, data.invoiceDate));
  }

  const refreshedVoucherKeys = await currentVoucherKeys();
  const existingPaymentVouchers = [
    !hasAnyKey(refreshedVoucherKeys, [data.refs.foundSupplierPayment, "PAY-AUG-701"])
      ? paymentVoucher({
          partyLedger: data.ledgers.foundSupplier,
          voucherNumber: "PAY-AUG-701",
          referenceName: data.refs.foundSupplierPayment,
          amount: 75000,
          ledgerBillReference: data.refs.foundSupplierBill,
          narration: `NEFT payment to ${data.ledgers.foundSupplier} against ${data.refs.foundSupplierBill}; UTR ${data.refs.foundSupplierPayment}.`,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.bankChargeFound, "PAY-AUG-703"])
      ? bankChargeVoucher({
          voucherNumber: "PAY-AUG-703",
          referenceName: data.refs.bankChargeFound,
          amount: 236,
          narration: `Bank charges for August statement; ref ${data.refs.bankChargeFound}.`,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.ambiguousA, "PAY-AUG-801"])
      ? paymentVoucher({
          partyLedger: data.ledgers.ambiguousSupplierA,
          voucherNumber: "PAY-AUG-801",
          referenceName: data.refs.ambiguousA,
          amount: 50000,
          narration: `NEFT payment to ${data.ledgers.ambiguousSupplierA}; ref ${data.refs.ambiguousA}.`,
        })
      : null,
    !hasAnyKey(refreshedVoucherKeys, [data.refs.ambiguousB, "PAY-AUG-802"])
      ? paymentVoucher({
          partyLedger: data.ledgers.ambiguousSupplierB,
          voucherNumber: "PAY-AUG-802",
          referenceName: data.refs.ambiguousB,
          amount: 50000,
          narration: `NEFT payment to ${data.ledgers.ambiguousSupplierB}; ref ${data.refs.ambiguousB}.`,
        })
      : null,
  ].filter(Boolean);

  if (existingPaymentVouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(existingPaymentVouchers, data.statementDate));
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
    .eq("connection_id", connection.id)
    .eq("rule_name", ruleName)
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
    party_phone: "8080830803",
    party_contact_person: "Accounts Team",
    party_address: "MIDC Area, Pune",
    linked_invoice_number: data.refs.late,
    linked_invoice_date: data.invoiceDate,
    original_invoice_amount: 118000,
    cash_discount_rule_id: ruleId,
    cash_discount_rule_name: ruleName,
    discount_deadline: "2026-08-16",
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
      phone: "8080830803",
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

function expectedCases() {
  return [
    {
      row: 1,
      area: "Incoming receipt with allowed cash discount",
      expected: `${data.refs.timely} receives INR 115640 against INR 118000 inside the 15 day discount window. It should post as a receipt and should not become a recovery debit-note item.`,
    },
    {
      row: 2,
      area: "Incoming receipt clears one bill",
      expected: `${data.refs.full} should allocate INR 118000 and become zero pending after Send to Tally.`,
    },
    {
      row: 3,
      area: "Incoming receipt clears two bills",
      expected: `${data.refs.splitA} and ${data.refs.splitB} should both clear from one INR 100000 receipt.`,
    },
    {
      row: 4,
      area: "Incoming partial receipt",
      expected: `${data.refs.partial} should post INR 73000 and keep INR 45000 pending.`,
    },
    {
      row: 5,
      area: "Incoming advance/no open bill",
      expected: `${data.ledgers.advanceCustomer} has no open bill. It should need an advance/new reference decision, not force-match to another invoice.`,
    },
    {
      row: 6,
      area: "Late short cash discount recovery",
      expected: `${data.refs.late} receives INR 115640 after the 15 day window. The remaining INR 2360 should be shown in Cash Discounts as a debit-note recovery candidate.`,
    },
    {
      row: 7,
      area: "Outgoing payment already entered",
      expected: `${data.refs.foundSupplierPayment} already exists in Tally. It should be verified/found and should not create a duplicate Payment voucher.`,
    },
    {
      row: 8,
      area: "Outgoing payment missing in Tally",
      expected: `${data.refs.missingSupplierPayment} has no Tally payment. It should be marked missing in Tally.`,
    },
    {
      row: 9,
      area: "Bank charge already entered",
      expected: `${data.refs.bankChargeFound} already exists as a Bank Charges payment in Tally. It should be verified/found.`,
    },
    {
      row: 10,
      area: "Bank charge missing in Tally",
      expected: `${data.refs.bankChargeMissing} has no Tally voucher. It should be marked missing in Tally.`,
    },
    {
      row: 11,
      area: "Ambiguous outgoing payment",
      expected: `The INR 50000 debit should find two equally likely Tally payments and stop as needs review, not auto-mark as found.`,
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
    pdfPath: path.join(outputDir, "AccountStatement_01-Aug-2026_31-Aug-2026.pdf"),
    ledgers: data.ledgers,
    refs: data.refs,
    expectedCases: expectedCases(),
    transactions,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(readmePath, buildReadme(manifest));
  return manifest;
}

function buildReadme(manifest) {
  const rows = manifest.expectedCases
    .map((item) => `| ${item.row} | ${item.area} | ${item.expected} |`)
    .join("\n");
  return `# Bank Statement Verification Pack

Generated for company: ${manifest.companyName}

Upload this file in Bank Statements:

\`${manifest.pdfPath}\`

Use bank ledger:

\`${manifest.bankLedgerName}\`

## Expected Results

| Row | Area | Expected |
| --- | --- | --- |
${rows}

## Notes

- The uploaded PDF intentionally contains only realistic bank-statement rows. Scenario labels are kept here, outside the PDF.
- The script creates August 2026 opening invoices/bills and a few existing outgoing Tally vouchers so the outgoing verification can prove found, missing, and needs-review states.
- Cash Discounts is tested through a pending system proposal for \`${data.refs.late}\`, with phone \`8080830803\` on the proposal snapshot.
`;
}

function renderPdf() {
  const pythonScript = path.join(repoRoot, "scripts", "create_collections_stress_statement_pdf.py");
  const result = spawnSync("python", [pythonScript, manifestPath], {
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
  const manifest = writeManifest();
  const pdfPath = renderPdf();
  console.log(`PDF: ${pdfPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Readme: ${readmePath}`);
  console.log("Expected cases:");
  for (const item of manifest.expectedCases) {
    console.log(`- Row ${item.row}: ${item.area} - ${item.expected}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
