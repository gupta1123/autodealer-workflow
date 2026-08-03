import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "output", "pdf", "multi-company-bank-workflow-v1");
const manifestPath = path.join(outputDir, "manifest.json");
const tallyUrl = process.env.TALLY_URL || "http://localhost:9000";
const tag = "MCB-260712-V1";

const companies = {
  nyx: {
    name: "Nyx",
    bankLedger: "HDFC Bank - 700001111",
    bankName: "HDFC Bank",
    accountNumber: "700001111",
    salesLedger: "Sales Account",
    purchaseLedger: "Purchase Account",
    bankChargesLedger: "Bank Charges",
  },
  solution: {
    name: "Solution Nyx",
    bankLedger: "ICICI Bank - 8822014500",
    bankName: "ICICI Bank",
    accountNumber: "8822014500",
    salesLedger: "Solution Sales Account",
    purchaseLedger: "Solution Purchase Account",
    bankChargesLedger: "Solution Bank Charges",
  },
};

const refs = {
  nyxVardhan: `${tag}-VMW-901`,
  nyxRudra: `${tag}-RFP-902`,
  nyxTriveni: `${tag}-TCP-903`,
  nyxNobleBill: `${tag}-NIS-904`,
  nyxFoundPayment: `${tag}-HDFC-PAY-904`,
  nyxFoundCharge: `${tag}-HDFC-CHG-905`,
  nyxMissingPayment: `${tag}-HDFC-MISS-906`,
  nyxMissingCharge: `${tag}-HDFC-CHG-907`,
  solutionCrystal: `${tag}-CCL-101`,
  solutionBluePeak: `${tag}-BPF-102`,
  solutionSapphire: `${tag}-STC-103`,
  solutionNova: `${tag}-NAT-104`,
  solutionMetro: `${tag}-MOM-201`,
};

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "gi"))].map(
    (match) => match[0]
  );
}

function money(value) {
  return Number(value).toFixed(2);
}

function tallyDate(value) {
  return String(value).replace(/-/g, "");
}

async function requestTally(xml) {
  const response = await fetch(tallyUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xml,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  const lineError = text.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.trim();
  const errors = Number(text.match(/<ERRORS[^>]*>([^<]+)<\/ERRORS>/i)?.[1] ?? 0);
  if (!response.ok || lineError || errors > 0) {
    throw new Error(lineError || `Tally import failed (HTTP ${response.status}, errors ${errors}).`);
  }
  return text;
}

function buildCollectionExportXml(companyName, collectionName, tallyType, fetchFields) {
  return [
    "<ENVELOPE>",
    "<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>",
    `<ID>${escapeXml(collectionName)}</ID></HEADER>`,
    "<BODY><DESC><STATICVARIABLES>",
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES><TDL><TDLMESSAGE>",
    `<COLLECTION NAME="${escapeXml(collectionName)}" ISMODIFY="No">`,
    `<TYPE>${escapeXml(tallyType)}</TYPE><FETCH>${escapeXml(fetchFields)}</FETCH>`,
    "</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
}

async function exportCollection(companyName, collectionName, tallyType, fetchFields) {
  return requestTally(buildCollectionExportXml(companyName, collectionName, tallyType, fetchFields));
}

async function currentLedgerNames(companyName) {
  const xml = await exportCollection(companyName, `${tag} Ledger Read`, "Ledger", "Name,Parent,IsBillWiseOn");
  return new Set(
    extractBlocks(xml, "LEDGER")
      .map((block) => getAttribute(block, "NAME") || getTagText(block, "NAME"))
      .filter(Boolean)
  );
}

async function currentReferenceKeys(companyName) {
  const bridgePath = path.join(repoRoot, "apps", "tally-bridge", "src", "bridge.mjs");
  const output = execFileSync(
    process.execPath,
    [bridgePath, "list-vouchers", "--company-name", companyName, "--all", "true", "--tally-url", tallyUrl],
    { encoding: "utf8", timeout: 20000 }
  );
  const voucherResult = JSON.parse(output);
  const keys = new Set();
  for (const voucher of voucherResult.vouchers ?? []) {
    for (const value of [
      voucher.voucherNumber,
      voucher.reference,
      voucher.narration,
    ]) {
      if (value) keys.add(String(value));
    }
  }
  return keys;
}

function billAllocationXml(referenceName, referenceType, amount, isDebit) {
  return [
    "<BILLALLOCATIONS.LIST>",
    `<NAME>${escapeXml(referenceName)}</NAME>`,
    `<BILLTYPE>${escapeXml(referenceType)}</BILLTYPE>`,
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    "</BILLALLOCATIONS.LIST>",
  ].join("");
}

function ledgerEntryXml({ ledgerName, amount, isDebit, isPartyLedger = false, billAllocation = "" }) {
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`,
    `<ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${isDebit ? "-" : ""}${money(amount)}</AMOUNT>`,
    billAllocation,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

function voucherXml({ date, voucherType, reference, partyLedgerName, narration, entries }) {
  const voucherDate = tallyDate(date);
  return [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER VCHTYPE="${escapeXml(voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `<DATE>${voucherDate}</DATE><EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>`,
    `<VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>`,
    `<VOUCHERNUMBER>${escapeXml(reference)}</VOUCHERNUMBER>`,
    `<REFERENCE>${escapeXml(reference)}</REFERENCE>`,
    partyLedgerName ? `<PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>` : "",
    "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>",
    `<NARRATION>${escapeXml(narration)}</NARRATION>`,
    ...entries,
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

function salesVoucher(company, party, reference, amount) {
  return voucherXml({
    date: "2026-07-10",
    voucherType: "Sales",
    reference,
    partyLedgerName: party,
    narration: `${tag} fresh sales bill ${reference}.`,
    entries: [
      ledgerEntryXml({
        ledgerName: party,
        amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocation: billAllocationXml(reference, "New Ref", amount, true),
      }),
      ledgerEntryXml({ ledgerName: company.salesLedger, amount, isDebit: false }),
    ],
  });
}

function purchaseVoucher(company, party, reference, amount) {
  return voucherXml({
    date: "2026-07-10",
    voucherType: "Purchase",
    reference,
    partyLedgerName: party,
    narration: `${tag} fresh purchase bill ${reference}.`,
    entries: [
      ledgerEntryXml({
        ledgerName: party,
        amount,
        isDebit: false,
        isPartyLedger: true,
        billAllocation: billAllocationXml(reference, "New Ref", amount, false),
      }),
      ledgerEntryXml({ ledgerName: company.purchaseLedger, amount, isDebit: true }),
    ],
  });
}

function paymentVoucher(company, party, paymentReference, billReference, amount) {
  return voucherXml({
    date: "2026-07-12",
    voucherType: "Payment",
    reference: paymentReference,
    partyLedgerName: party,
    narration: `${tag} HDFC payment to ${party}; UTR ${paymentReference}; bill ${billReference}.`,
    entries: [
      ledgerEntryXml({
        ledgerName: party,
        amount,
        isDebit: true,
        isPartyLedger: true,
        billAllocation: billAllocationXml(billReference, "Agst Ref", amount, true),
      }),
      ledgerEntryXml({ ledgerName: company.bankLedger, amount, isDebit: false }),
    ],
  });
}

function bankChargeVoucher(company, reference, amount) {
  return voucherXml({
    date: "2026-07-12",
    voucherType: "Payment",
    reference,
    partyLedgerName: company.bankLedger,
    narration: `${tag} HDFC bank charge; ref ${reference}.`,
    entries: [
      ledgerEntryXml({ ledgerName: company.bankChargesLedger, amount, isDebit: true }),
      ledgerEntryXml({ ledgerName: company.bankLedger, amount, isDebit: false }),
    ],
  });
}

function wrapVoucherMessages(companyName, date, messages) {
  const voucherDate = tallyDate(date);
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    `<SVFROMDATE>${voucherDate}</SVFROMDATE><SVTODATE>${voucherDate}</SVTODATE>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

async function seedCompany({ company, openingVouchers, existingVouchers }) {
  console.log(`[${company.name}] reading existing references...`);
  const keys = await currentReferenceKeys(company.name);
  const openingToCreate = openingVouchers.filter((item) => !keys.has(item.reference));
  if (openingToCreate.length > 0) {
    console.log(`[${company.name}] creating ${openingToCreate.length} opening voucher(s)...`);
    await requestTally(
      wrapVoucherMessages(
        company.name,
        "2026-07-10",
        openingToCreate.map((item) => item.xml)
      )
    );
  }

  console.log(`[${company.name}] verifying opening references...`);
  const refreshedKeys = await currentReferenceKeys(company.name);
  const existingToCreate = existingVouchers.filter((item) => !refreshedKeys.has(item.reference));
  if (existingToCreate.length > 0) {
    console.log(`[${company.name}] creating ${existingToCreate.length} bank voucher(s)...`);
    await requestTally(
      wrapVoucherMessages(
        company.name,
        "2026-07-12",
        existingToCreate.map((item) => item.xml)
      )
    );
  }

  return {
    companyName: company.name,
    openingCreated: openingToCreate.map((item) => item.reference),
    existingCreated: existingToCreate.map((item) => item.reference),
  };
}

function withBalances(openingBalance, rows) {
  let balance = openingBalance;
  return rows.map((row) => {
    balance += Number(row.credit ?? 0) - Number(row.debit ?? 0);
    return { ...row, balance };
  });
}

function buildManifest(seedResult) {
  const hdfcRows = withBalances(500000, [
    { date: "12 Jul 2026", narration: `RTGS CR FRM VARDHN MTL WRKS REF ${refs.nyxVardhan}`, reference: "HDFX260712901", debit: null, credit: 118000 },
    { date: "12 Jul 2026", narration: `IMPS CR RUDRA FRG PRVT LMTD REF ${refs.nyxRudra}`, reference: "HDFX260712902", debit: null, credit: 73000 },
    { date: "12 Jul 2026", narration: `NEFT CR TRVN CMPNTS PVT LM REF ${refs.nyxTriveni}`, reference: "HDFX260712903", debit: null, credit: 118000 },
    { date: "12 Jul 2026", narration: `NEFT DR NOBL INDL SUPLYS REF ${refs.nyxNobleBill}`, reference: refs.nyxFoundPayment, debit: 75000, credit: null },
    { date: "12 Jul 2026", narration: "RTGS DR WSTN MILL STRS - PAYMENT NOT ENTERED", reference: refs.nyxMissingPayment, debit: 64000, credit: null },
    { date: "12 Jul 2026", narration: "BANK SERV CHG HDFC", reference: refs.nyxFoundCharge, debit: 236, credit: null },
    { date: "12 Jul 2026", narration: "BANK MAINT FEE HDFC", reference: refs.nyxMissingCharge, debit: 590, credit: null },
    { date: "12 Jul 2026", narration: "NEFT DR NOBL INDL SUPLYS - KOTAK UTR REUSED", reference: "YES260707701", debit: 75000, credit: null },
    { date: "12 Jul 2026", narration: "INT CR QTR", reference: `${tag}-HDFC-INT-908`, debit: null, credit: 1250 },
    { date: "12 Jul 2026", narration: "ATM CASH WDL", reference: `${tag}-HDFC-ATM-909`, debit: 10000, credit: null },
  ]);

  const iciciRows = withBalances(900000, [
    { date: "12 Jul 2026", narration: `NEFT CR CRYSTL CMPNTS L.L.P. REF ${refs.solutionCrystal}`, reference: "SOLIC260712101", debit: null, credit: 75000 },
    { date: "12 Jul 2026", narration: `RTGS CR BLUEPEAK FABRCTR REF ${refs.solutionBluePeak}`, reference: "SOLIC260712102", debit: null, credit: 64000 },
    { date: "12 Jul 2026", narration: `IMPS CR SAPPHRE TUBE COMPANY REF ${refs.solutionSapphire}`, reference: "SOLIC260712103", debit: null, credit: 40000 },
    { date: "12 Jul 2026", narration: `NEFT CR NOVA ALLOY TRDG CO REF ${refs.solutionNova}`, reference: "SOLIC260712104", debit: null, credit: 62000 },
    { date: "12 Jul 2026", narration: `NEFT DR METRO OFFC MART REF ${refs.solutionMetro}`, reference: `${tag}-ICICI-MISS-201`, debit: 28500, credit: null },
    { date: "12 Jul 2026", narration: "NEFT DR VERTEX INDL SUPLS", reference: "ICICI260708201", debit: 45000, credit: null },
    { date: "12 Jul 2026", narration: "NEFT DR PIONEER FUEL SVCS", reference: "YES260709301", debit: 36000, credit: null },
    { date: "12 Jul 2026", narration: "BANK SERV CHG ICICI", reference: "SOLCHG260709001", debit: 236, credit: null },
    { date: "12 Jul 2026", narration: "CASH DEP SELF - AXIS REF REUSED", reference: "CSH260709001", debit: null, credit: 22000 },
    { date: "12 Jul 2026", narration: "UPI CR ORION FASTENER SOLUTIONS", reference: "UPI260712999", debit: null, credit: 12345 },
  ]);

  return {
    tag,
    generatedAt: new Date().toISOString(),
    seeded: seedResult,
    existingPdf: path.join(
      repoRoot,
      "output",
      "pdf",
      "bank-cash-discount-june-july-2026",
      "AccountStatement_09-Jul-2026.pdf"
    ),
    outputDir,
    pdfs: [
      {
        fileName: "01_Nyx_Kotak_Existing_09-Jul-2026.pdf",
        source: "existing",
        companyName: "Nyx",
        bankName: "Kotak Mahindra Bank",
        bankLedger: "Kotak Mahindra Bank - 6713098600",
        accountNumber: "6713098600",
      },
      {
        fileName: "02_Nyx_HDFC_12-Jul-2026.pdf",
        source: "generated",
        companyName: companies.nyx.name,
        bankName: companies.nyx.bankName,
        bankLedger: companies.nyx.bankLedger,
        accountNumber: companies.nyx.accountNumber,
        period: "12 Jul 2026 to 12 Jul 2026",
        openingBalance: 500000,
        transactions: hdfcRows,
      },
      {
        fileName: "03_Solution-Nyx_ICICI_12-Jul-2026.pdf",
        source: "generated",
        companyName: companies.solution.name,
        bankName: companies.solution.bankName,
        bankLedger: companies.solution.bankLedger,
        accountNumber: companies.solution.accountNumber,
        period: "12 Jul 2026 to 12 Jul 2026",
        openingBalance: 900000,
        transactions: iciciRows,
      },
    ],
    refs,
    expected: {
      hdfc: [
        "Auto-select HDFC Bank - 700001111 for Nyx.",
        "Match difficult customer/supplier names without inventing a ledger.",
        `${refs.nyxFoundPayment} and ${refs.nyxFoundCharge} are found in HDFC.`,
        `${refs.nyxMissingPayment} and ${refs.nyxMissingCharge} remain missing.`,
        "YES260707701 exists in Kotak but must not count as an HDFC match.",
      ],
      icici: [
        "Block while Tally is open to Nyx; proceed only after switching to Solution Nyx.",
        "Auto-select ICICI Bank - 8822014500.",
        "Clear the four fresh difficult-name customer bills.",
        `${refs.solutionMetro} exists, but ${tag}-ICICI-MISS-201 has no Payment voucher.`,
        "Existing Vertex, Pioneer and bank-charge references are found in ICICI.",
        "CSH260709001 exists in Axis and must not count as an ICICI match.",
        "ORION FASTENER SOLUTIONS must not be forced to Orion Fasteners Pvt Ltd.",
      ],
    },
  };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const nyx = companies.nyx;
  const solution = companies.solution;
  const nyxResult = await seedCompany({
    company: nyx,
    openingVouchers: [
      { reference: refs.nyxVardhan, xml: salesVoucher(nyx, "Vardhan Metal Works", refs.nyxVardhan, 118000) },
      { reference: refs.nyxRudra, xml: salesVoucher(nyx, "Rudra Forge Private Limited", refs.nyxRudra, 73000) },
      { reference: refs.nyxTriveni, xml: salesVoucher(nyx, "Triveni Components Pvt Ltd", refs.nyxTriveni, 118000) },
      { reference: refs.nyxNobleBill, xml: purchaseVoucher(nyx, "Noble Industrial Supplies", refs.nyxNobleBill, 75000) },
    ],
    existingVouchers: [
      {
        reference: refs.nyxFoundPayment,
        xml: paymentVoucher(nyx, "Noble Industrial Supplies", refs.nyxFoundPayment, refs.nyxNobleBill, 75000),
      },
      { reference: refs.nyxFoundCharge, xml: bankChargeVoucher(nyx, refs.nyxFoundCharge, 236) },
    ],
  });

  const solutionResult = await seedCompany({
    company: solution,
    openingVouchers: [
      { reference: refs.solutionCrystal, xml: salesVoucher(solution, "Crystal Components LLP", refs.solutionCrystal, 75000) },
      { reference: refs.solutionBluePeak, xml: salesVoucher(solution, "BluePeak Fabricators", refs.solutionBluePeak, 64000) },
      { reference: refs.solutionSapphire, xml: salesVoucher(solution, "Sapphire Tube Co", refs.solutionSapphire, 40000) },
      { reference: refs.solutionNova, xml: salesVoucher(solution, "Nova Alloy Traders", refs.solutionNova, 62000) },
      { reference: refs.solutionMetro, xml: purchaseVoucher(solution, "Metro Office Mart", refs.solutionMetro, 28500) },
    ],
    existingVouchers: [],
  });

  const manifest = buildManifest([nyxResult, solutionResult]);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ manifestPath, seeded: manifest.seeded }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
