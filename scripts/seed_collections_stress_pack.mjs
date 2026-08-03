import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "output", "pdf", "collections-stress-2026-07-07");
const manifestPath = path.join(outputDir, "collections_stress_manifest.json");

const TALLY_URL = process.env.TALLY_URL || "http://localhost:9000";
const BANK_LEDGER = process.env.KALIKA_STRESS_BANK_LEDGER || "Kotak Mahindra Bank - 6713098600";
const RECOVERY_LEDGER = "Cash Discount Reversal";
const SALES_LEDGER = "Sales Account";
const PURCHASE_LEDGER = "Purchase Account";
const BANK_CHARGE_LEDGER = "Bank Charges";

const data = {
  companyFinancialYear: "2026-27",
  statementPeriodStart: "2026-07-01",
  statementPeriodEnd: "2026-07-31",
  bankAccountName: "Kotak Mahindra Bank",
  accountNumber: "6713098600",
  accountHolderName: "Kalika Steel Alloys Pvt Ltd",
  invoiceDate: "2026-07-01",
  ledgers: {
    fullCustomer: "Raghav Metal Industries",
    lateCustomer: "Arihant Steel Corporation",
    timelyCustomer: "Mehta Alloy Traders",
    combinedCustomer: "Kiran Foundry Works",
    partCustomer: "Sudarshan Tubes Pvt Ltd",
    noBillCustomer: "Orbit Castings LLP",
    supplier: "Noble Industrial Supplies",
    sales: SALES_LEDGER,
    purchase: PURCHASE_LEDGER,
    recovery: RECOVERY_LEDGER,
    bankCharges: BANK_CHARGE_LEDGER,
  },
  refs: {
    full: "RMI/26-27/184",
    late: "ASC/26-27/209",
    timely: "MAT/26-27/224",
    combinedA: "KFW/26-27/301",
    combinedB: "KFW/26-27/302",
    part: "STP/26-27/327",
    supplier: "NIS/26-27/418",
  },
};

const transactions = [
  {
    date: "2026-07-05",
    dateLabel: "05 Jul 2026",
    narration: `NEFT CR FROM ${data.ledgers.fullCustomer} UTR AXN260705184 AGAINST ${data.refs.full}`,
    reference: "AXN260705184",
    debit: null,
    credit: 118000,
  },
  {
    date: "2026-07-10",
    dateLabel: "10 Jul 2026",
    narration: `RTGS CR FROM ${data.ledgers.timelyCustomer} UTR IC260710224 REF ${data.refs.timely}`,
    reference: "IC260710224",
    debit: null,
    credit: 115640,
  },
  {
    date: "2026-07-12",
    dateLabel: "12 Jul 2026",
    narration: `NEFT CR FROM ${data.ledgers.combinedCustomer} UTR SBI260712301 REF ${data.refs.combinedA} ${data.refs.combinedB}`,
    reference: "SBI260712301",
    debit: null,
    credit: 100000,
  },
  {
    date: "2026-07-20",
    dateLabel: "20 Jul 2026",
    narration: `IMPS CR FROM ${data.ledgers.partCustomer} UTR KKB260720327 REF ${data.refs.part}`,
    reference: "KKB260720327",
    debit: null,
    credit: 73000,
  },
  {
    date: "2026-07-22",
    dateLabel: "22 Jul 2026",
    narration: `NEFT DR TO ${data.ledgers.supplier} UTR YES260722418 REF ${data.refs.supplier}`,
    reference: "YES260722418",
    debit: 75000,
    credit: null,
  },
  {
    date: "2026-07-24",
    dateLabel: "24 Jul 2026",
    narration: `UPI CR ${data.ledgers.noBillCustomer} UTR UPI260724001`,
    reference: "UPI260724001",
    debit: null,
    credit: 88000,
  },
  {
    date: "2026-07-25",
    dateLabel: "25 Jul 2026",
    narration: "BANK CHARGES JULY STATEMENT",
    reference: "CHG260725001",
    debit: 236,
    credit: null,
  },
  {
    date: "2026-07-31",
    dateLabel: "31 Jul 2026",
    narration: `NEFT CR FROM ${data.ledgers.lateCustomer} UTR HDF260731209 REF ${data.refs.late}`,
    reference: "HDF260731209",
    debit: null,
    credit: 115640,
  },
];

let runningBalance = 500000;
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

async function currentLedgerNames() {
  const xml = await exportCollection("Kalika Stress Ledger Read", "Ledger", "Name,Parent,IsBillWiseOn");
  return new Set(
    extractBlocks(xml, "LEDGER")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

async function currentBillRefs() {
  const xml = await exportCollection(
    "Kalika Stress Bill Read",
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
    date: data.invoiceDate,
    voucherType: "Sales",
    voucherNumber: referenceName,
    partyLedgerName: customerLedger,
    narration: `Invoice ${referenceName}; payment terms as agreed.`,
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

async function seedTally() {
  const ledgerNames = await currentLedgerNames();
  const ledgerDefinitions = [
    { name: data.ledgers.fullCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.lateCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.timelyCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.combinedCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.partCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.noBillCustomer, parent: "Sundry Debtors", billWise: true },
    { name: data.ledgers.supplier, parent: "Sundry Creditors", billWise: true },
    { name: data.ledgers.sales, parent: "Sales Accounts", billWise: false },
    { name: data.ledgers.purchase, parent: "Purchase Accounts", billWise: false },
    { name: data.ledgers.recovery, parent: "Indirect Incomes", billWise: false },
    { name: data.ledgers.bankCharges, parent: "Indirect Expenses", billWise: false },
  ];
  const missingLedgers = ledgerDefinitions.filter((ledger) => !ledgerNames.has(ledger.name));
  if (missingLedgers.length > 0) {
    await postTallyXml(wrapMasterMessages(missingLedgers.map(ledgerXml)));
  }

  const billRefs = await currentBillRefs();
  const vouchers = [
    !billRefs.has(data.refs.full)
      ? salesVoucher({ customerLedger: data.ledgers.fullCustomer, referenceName: data.refs.full, amount: 118000 })
      : null,
    !billRefs.has(data.refs.late)
      ? salesVoucher({ customerLedger: data.ledgers.lateCustomer, referenceName: data.refs.late, amount: 118000 })
      : null,
    !billRefs.has(data.refs.timely)
      ? salesVoucher({ customerLedger: data.ledgers.timelyCustomer, referenceName: data.refs.timely, amount: 118000 })
      : null,
    !billRefs.has(data.refs.combinedA)
      ? salesVoucher({ customerLedger: data.ledgers.combinedCustomer, referenceName: data.refs.combinedA, amount: 40000 })
      : null,
    !billRefs.has(data.refs.combinedB)
      ? salesVoucher({ customerLedger: data.ledgers.combinedCustomer, referenceName: data.refs.combinedB, amount: 60000 })
      : null,
    !billRefs.has(data.refs.part)
      ? salesVoucher({ customerLedger: data.ledgers.partCustomer, referenceName: data.refs.part, amount: 118000 })
      : null,
    !billRefs.has(data.refs.supplier)
      ? purchaseVoucher({ supplierLedger: data.ledgers.supplier, referenceName: data.refs.supplier, amount: 75000 })
      : null,
  ].filter(Boolean);

  if (vouchers.length > 0) {
    await postTallyXml(wrapVoucherMessages(vouchers, data.invoiceDate));
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: connections, error: connectionError } = await supabase
    .from("tally_connections")
    .select("id, owner_user_id, last_company_name, display_name, status, last_company_loaded, last_heartbeat_at, updated_at")
    .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (connectionError) throw connectionError;

  const connection = (connections || []).find((item) => item.last_company_loaded === true) || connections?.[0];
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
    company_name: connection.last_company_name || connection.display_name,
    financial_year: data.companyFinancialYear,
    party_ledger_name: data.ledgers.lateCustomer,
    linked_invoice_number: data.refs.late,
    linked_invoice_date: data.invoiceDate,
    original_invoice_amount: 118000,
    cash_discount_rule_id: ruleId,
    cash_discount_rule_name: ruleName,
    discount_deadline: "2026-07-16",
    receipt_date: "2026-07-31",
    amount_received: 115640,
    recoverable_amount: 2360,
    reason_code: "late_short_payment",
    narration: `Cash discount recovery against invoice ${data.refs.late}. Payment received after discount period.`,
    gst_mode: "finance_review",
    debit_note_date: "2026-07-31",
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
      gstin: null,
      email: null,
      phone: null,
      contactPerson: null,
      address: null,
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

function writeManifest() {
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    companyFinancialYear: data.companyFinancialYear,
    bankLedgerName: BANK_LEDGER,
    bankAccountName: data.bankAccountName,
    accountNumber: data.accountNumber,
    accountHolderName: data.accountHolderName,
    statementPeriodStart: data.statementPeriodStart,
    statementPeriodEnd: data.statementPeriodEnd,
    statementPeriodStartLabel: "01 Jul 2026",
    statementPeriodEndLabel: "31 Jul 2026",
    pdfPath: path.join(outputDir, "AccountStatement_01-Jul-2026_31-Jul-2026.pdf"),
    ledgers: data.ledgers,
    refs: data.refs,
    expectedCases: [
      {
        row: 1,
        expected: `${data.refs.full} should allocate 118000 and become zero pending after Send to Tally.`,
      },
      {
        row: 2,
        expected: `${data.refs.timely} has the same 2% difference but the receipt date is inside 15 days, so it should not become a recovery proposal.`,
      },
      {
        row: 3,
        expected: `${data.refs.combinedA} and ${data.refs.combinedB} should both clear from one receipt.`,
      },
      {
        row: 4,
        expected: `${data.refs.part} should remain partly open and should not be treated as Cash Discount.`,
      },
      {
        row: 5,
        expected: `${data.refs.supplier} should allocate against the supplier bill and clear.`,
      },
      {
        row: 6,
        expected: `${data.ledgers.noBillCustomer} has no open bill and should need an advance/new reference decision.`,
      },
      {
        row: 7,
        expected: "Bank charge should post to an expense ledger and should not enter Collections.",
      },
      {
        row: 8,
        expected: `${data.refs.late} should allocate 115640 against 118000, leaving 2360 for the Collections debit-note proposal.`,
      },
    ],
    transactions,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
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
  console.log("Preparing realistic Collections stress pack.");
  const tallyResult = await seedTally();
  console.log(`Tally: created ledgers=${tallyResult.createdLedgers.length}, created vouchers=${tallyResult.createdVouchers}`);
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
  console.log("Expected cases:");
  for (const item of manifest.expectedCases) {
    console.log(`- Row ${item.row}: ${item.expected}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
