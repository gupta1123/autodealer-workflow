import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "output", "pdf", "collections-bank-test");
const manifestPath = path.join(outputDir, "collections_test_manifest.json");

const TEST_TAG = process.env.KALIKA_TEST_TAG || "KTC-260707";
const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const BANK_LEDGER = process.env.KALIKA_TEST_BANK_LEDGER || "Kotak Mahindra Bank - 6713098600";

const testData = {
  companyFinancialYear: "2026-27",
  invoiceDate: "2026-07-01",
  statementPeriodStart: "2026-07-01",
  statementPeriodEnd: "2026-07-31",
  bankAccountName: "Kotak Mahindra Bank",
  accountNumber: "6713098600",
  accountHolderName: "Kalika Steel Alloys Pvt Ltd",
  ledgers: {
    exactCustomer: `${TEST_TAG} Exact Match Customer`,
    shortCustomer: `${TEST_TAG} Short Late Customer`,
    splitCustomer: `${TEST_TAG} Split Bills Customer`,
    advanceCustomer: `${TEST_TAG} Advance Customer`,
    supplier: `${TEST_TAG} Test Supplier`,
    sales: `${TEST_TAG} Sales Account`,
    purchase: `${TEST_TAG} Purchase Account`,
    recovery: "Cash Discount Reversal",
  },
  refs: {
    exact: `${TEST_TAG}-INV-EXACT-1001`,
    short: `${TEST_TAG}-INV-SHORT-1002`,
    splitA: `${TEST_TAG}-INV-SPLIT-1003`,
    splitB: `${TEST_TAG}-INV-SPLIT-1004`,
    supplier: `${TEST_TAG}-PUR-SUP-2001`,
  },
};

const transactions = [
  {
    date: "2026-07-01",
    dateLabel: "01 Jul 2026",
    narration: `NEFT/${TEST_TAG}/Receipt from ${testData.ledgers.exactCustomer} against ${testData.refs.exact}`,
    reference: `UTR-${TEST_TAG}-001`,
    debit: null,
    credit: 118000,
  },
  {
    date: "2026-07-02",
    dateLabel: "02 Jul 2026",
    narration: `NEFT/${TEST_TAG}/Receipt from ${testData.ledgers.splitCustomer} against ${testData.refs.splitA} and ${testData.refs.splitB}`,
    reference: `UTR-${TEST_TAG}-002`,
    debit: null,
    credit: 100000,
  },
  {
    date: "2026-07-31",
    dateLabel: "31 Jul 2026",
    narration: `NEFT/${TEST_TAG}/Late short receipt from ${testData.ledgers.shortCustomer} against ${testData.refs.short}`,
    reference: `UTR-${TEST_TAG}-003`,
    debit: null,
    credit: 115640,
  },
  {
    date: "2026-07-31",
    dateLabel: "31 Jul 2026",
    narration: `NEFT/${TEST_TAG}/Advance receipt from ${testData.ledgers.advanceCustomer}`,
    reference: `UTR-${TEST_TAG}-004`,
    debit: null,
    credit: 25000,
  },
  {
    date: "2026-07-31",
    dateLabel: "31 Jul 2026",
    narration: `NEFT/${TEST_TAG}/Payment to ${testData.ledgers.supplier} against ${testData.refs.supplier}`,
    reference: `UTR-${TEST_TAG}-005`,
    debit: 75000,
    credit: null,
  },
  {
    date: "2026-07-31",
    dateLabel: "31 Jul 2026",
    narration: `Bank charges for ${TEST_TAG} test statement`,
    reference: `CHG-${TEST_TAG}-006`,
    debit: 236,
    credit: null,
  },
];

let runningBalance = 100000;
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

function tallyDate(value) {
  return String(value).replaceAll("-", "");
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
    throw new Error(lineError || `Tally returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

function buildCollectionExportXml(collectionName, tallyType, fetchFields) {
  return [
    "<ENVELOPE>",
    "<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(collectionName)}</ID></HEADER>`,
    "<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>",
    "<TDL><TDLMESSAGE>",
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

async function currentLedgerNames() {
  const xml = await exportCollection("KTC Seed Ledger Read", "Ledger", "Name,Parent,IsBillWiseOn");
  return new Set(
    extractBlocks(xml, "LEDGER")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

async function currentBillRefs() {
  const xml = await exportCollection(
    "KTC Seed Bill Read",
    "Bill",
    "Name,LedgerName,PartyLedgerName,VoucherNumber,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount"
  );
  return new Set(
    extractBlocks(xml, "BILL")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

function ledgerXml({ name, parent, billWise = false }) {
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
    "</LEDGER>",
    "</TALLYMESSAGE>",
  ].join("");
}

function wrapMasterMessages(messages) {
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>",
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

function voucherXml({ date, voucherType, voucherNumber, partyLedgerName, narration, entries }) {
  const voucherDate = tallyDate(date);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${voucherDate}</DATE>`,
    `<EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(voucherNumber)}</REFERENCE>`,
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
    `<SVFROMDATE>${voucherDate}</SVFROMDATE><SVTODATE>${voucherDate}</SVTODATE><SVCURRENTDATE>${voucherDate}</SVCURRENTDATE>`,
    "</STATICVARIABLES>",
    "</REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

function salesVoucher({ customerLedger, referenceName, amount }) {
  return voucherXml({
    date: testData.invoiceDate,
    voucherType: "Sales",
    voucherNumber: referenceName,
    partyLedgerName: customerLedger,
    narration: `Test sales invoice for ${referenceName}`,
    entries: [
      ledgerEntryXml({
        ledgerName: customerLedger,
        amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocations: billAllocationXml({
          referenceName,
          referenceType: "New Ref",
          amount,
          isDebit: true,
        }),
      }),
      ledgerEntryXml({ ledgerName: testData.ledgers.sales, amount, isDebit: false }),
    ],
  });
}

function purchaseVoucher({ supplierLedger, referenceName, amount }) {
  return voucherXml({
    date: testData.invoiceDate,
    voucherType: "Purchase",
    voucherNumber: referenceName,
    partyLedgerName: supplierLedger,
    narration: `Test supplier purchase bill for ${referenceName}`,
    entries: [
      ledgerEntryXml({
        ledgerName: supplierLedger,
        amount,
        isDebit: false,
        isPartyLedger: true,
        billAllocations: billAllocationXml({
          referenceName,
          referenceType: "New Ref",
          amount,
          isDebit: false,
        }),
      }),
      ledgerEntryXml({ ledgerName: testData.ledgers.purchase, amount, isDebit: true }),
    ],
  });
}

async function seedTally() {
  const ledgerNames = await currentLedgerNames();
  const ledgerDefinitions = [
    { name: testData.ledgers.exactCustomer, parent: "Sundry Debtors", billWise: true },
    { name: testData.ledgers.shortCustomer, parent: "Sundry Debtors", billWise: true },
    { name: testData.ledgers.splitCustomer, parent: "Sundry Debtors", billWise: true },
    { name: testData.ledgers.advanceCustomer, parent: "Sundry Debtors", billWise: true },
    { name: testData.ledgers.supplier, parent: "Sundry Creditors", billWise: true },
    { name: testData.ledgers.sales, parent: "Sales Accounts", billWise: false },
    { name: testData.ledgers.purchase, parent: "Purchase Accounts", billWise: false },
    { name: testData.ledgers.recovery, parent: "Indirect Incomes", billWise: false },
  ];
  const missingLedgers = ledgerDefinitions.filter((ledger) => !ledgerNames.has(ledger.name));
  if (missingLedgers.length > 0) {
    await postTallyXml(wrapMasterMessages(missingLedgers.map(ledgerXml)));
  }

  const billRefs = await currentBillRefs();
  const vouchers = [
    !billRefs.has(testData.refs.exact)
      ? salesVoucher({ customerLedger: testData.ledgers.exactCustomer, referenceName: testData.refs.exact, amount: 118000 })
      : null,
    !billRefs.has(testData.refs.short)
      ? salesVoucher({ customerLedger: testData.ledgers.shortCustomer, referenceName: testData.refs.short, amount: 118000 })
      : null,
    !billRefs.has(testData.refs.splitA)
      ? salesVoucher({ customerLedger: testData.ledgers.splitCustomer, referenceName: testData.refs.splitA, amount: 40000 })
      : null,
    !billRefs.has(testData.refs.splitB)
      ? salesVoucher({ customerLedger: testData.ledgers.splitCustomer, referenceName: testData.refs.splitB, amount: 60000 })
      : null,
    !billRefs.has(testData.refs.supplier)
      ? purchaseVoucher({ supplierLedger: testData.ledgers.supplier, referenceName: testData.refs.supplier, amount: 75000 })
      : null,
  ].filter(Boolean);

  if (vouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(vouchers, testData.invoiceDate));
  }

  return {
    createdLedgers: missingLedgers.map((ledger) => ledger.name),
    createdVouchers: vouchers.length,
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: connections, error: connectionError } = await supabase
    .from("tally_connections")
    .select("id, owner_user_id, last_company_name, display_name, status, last_company_loaded, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (connectionError) throw connectionError;
  const connection = (connections || []).find((item) => item.last_company_loaded === true) || connections?.[0];
  if (!connection) return { skipped: true, reason: "No Tally connection row found." };

  const ruleName = `${TEST_TAG} - 2% CD within 15 days`;
  const { data: existingRules, error: ruleReadError } = await supabase
    .from("cash_discount_rules")
    .select("id")
    .eq("owner_user_id", connection.owner_user_id)
    .eq("connection_id", connection.id)
    .eq("rule_name", ruleName)
    .limit(1);
  if (ruleReadError) throw ruleReadError;

  const rulePayload = {
    owner_user_id: connection.owner_user_id,
    connection_id: connection.id,
    rule_name: ruleName,
    scope_type: "company",
    scope_key: TEST_TAG,
    scope_label: "Kalika test collection customers",
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
    updated_at: new Date().toISOString(),
  };

  let ruleId = existingRules?.[0]?.id || null;
  if (ruleId) {
    const { error } = await supabase.from("cash_discount_rules").update(rulePayload).eq("id", ruleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("cash_discount_rules").insert(rulePayload).select("id").single();
    if (error) throw error;
    ruleId = data.id;
  }

  const proposalPayload = {
    owner_user_id: connection.owner_user_id,
    connection_id: connection.id,
    company_name: connection.last_company_name || connection.display_name,
    financial_year: testData.companyFinancialYear,
    party_ledger_name: testData.ledgers.shortCustomer,
    linked_invoice_number: testData.refs.short,
    linked_invoice_date: testData.invoiceDate,
    original_invoice_amount: 118000,
    cash_discount_rule_id: ruleId,
    cash_discount_rule_name: ruleName,
    discount_deadline: "2026-07-16",
    receipt_date: "2026-07-31",
    amount_received: 115640,
    recoverable_amount: 2360,
    reason_code: "late_short_payment",
    narration: `Late short payment under ${ruleName}; recover missed cash discount against ${testData.refs.short}.`,
    gst_mode: "finance_review",
    debit_note_date: "2026-07-31",
    status: "pending_approval",
    updated_at: new Date().toISOString(),
  };

  const { data: existingProposal, error: proposalReadError } = await supabase
    .from("debit_note_proposals")
    .select("id")
    .eq("owner_user_id", connection.owner_user_id)
    .eq("connection_id", connection.id)
    .eq("linked_invoice_number", testData.refs.short)
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
    proposalInvoice: testData.refs.short,
  };
}

function writeManifest() {
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = {
    testTag: TEST_TAG,
    generatedAt: new Date().toISOString(),
    bankLedgerName: BANK_LEDGER,
    bankAccountName: testData.bankAccountName,
    accountNumber: testData.accountNumber,
    accountHolderName: testData.accountHolderName,
    statementPeriodStart: testData.statementPeriodStart,
    statementPeriodEnd: testData.statementPeriodEnd,
    statementPeriodStartLabel: "01 Jul 2026",
    statementPeriodEndLabel: "31 Jul 2026",
    pdfPath: path.join(outputDir, `AccountStatement_${TEST_TAG}_01-Jul-2026_31-Jul-2026.pdf`),
    ledgers: testData.ledgers,
    refs: testData.refs,
    expectedCases: [
      {
        row: 1,
        case: "Exact Bill Match",
        expected: `${testData.refs.exact} should allocate 118000 and become zero pending after Send to Tally.`,
      },
      {
        row: 2,
        case: "Split Across Bills",
        expected: `${testData.refs.splitA} and ${testData.refs.splitB} should both clear.`,
      },
      {
        row: 3,
        case: "Late Short Payment",
        expected: `${testData.refs.short} receives 115640 against 118000; 2360 stays recoverable and seeded Collections proposal appears.`,
      },
      {
        row: 4,
        case: "No Pending Bill - Advance",
        expected: "No open bill exists; app should create an advance allocation.",
      },
      {
        row: 5,
        case: "Supplier Payment",
        expected: `${testData.refs.supplier} should allocate against the supplier open bill and clear after Send to Tally.`,
      },
      {
        row: 6,
        case: "Non-party Charge",
        expected: "Bank charge should not ask for bill allocation.",
      },
    ],
    transactions,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

function renderPdf() {
  const pythonScript = path.join(repoRoot, "scripts", "create_collections_bank_statement_pdf.py");
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
  console.log(`Seeding collections test data with tag ${TEST_TAG}`);
  const tallyResult = await seedTally();
  console.log(`Tally: created ledgers=${tallyResult.createdLedgers.length}, created vouchers=${tallyResult.createdVouchers}`);
  const supabaseResult = await seedSupabase();
  console.log(`Supabase: ${supabaseResult.skipped ? `skipped (${supabaseResult.reason})` : `rule=${supabaseResult.ruleName}, proposal=${supabaseResult.proposalInvoice}`}`);
  const manifest = writeManifest();
  const pdfPath = renderPdf();
  console.log(`PDF: ${pdfPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log("Expected cases:");
  for (const item of manifest.expectedCases) {
    console.log(`- Row ${item.row}: ${item.case}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
