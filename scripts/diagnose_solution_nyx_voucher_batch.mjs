import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const fileArg = process.argv.find((value) => value.startsWith("--file="))?.slice(7);
const execute = process.argv.includes("--execute");
const only = Number(process.argv.find((value) => value.startsWith("--only="))?.slice(7) ?? 0);
const remoteIdSuffix = process.argv.find((value) => value.startsWith("--remoteid-suffix="))?.slice(18) ?? "";
const voucherNumberSuffix = process.argv.find((value) => value.startsWith("--voucher-number-suffix="))?.slice(24) ?? "";
const partyOverride = process.argv.find((value) => value.startsWith("--party="))?.slice(8) ?? "";
const referenceSuffix = process.argv.find((value) => value.startsWith("--reference-suffix="))?.slice(19) ?? "";
const stripTax = process.argv.includes("--strip-tax");
const stripBill = process.argv.includes("--strip-bill");
const accountingOnly = process.argv.includes("--accounting-only");
const allLedgerList = process.argv.includes("--all-ledger-list");
const minimalSales = process.argv.includes("--minimal-sales");
const removeRemoteId = process.argv.includes("--remove-remoteid");
const removeEntryMode = process.argv.includes("--remove-entrymode");
const minimalWithInventory = process.argv.includes("--minimal-with-inventory");
const officialItemFixes = process.argv.includes("--official-item-fixes");
const positiveQuantity = process.argv.includes("--positive-quantity");
const childObjView = process.argv.includes("--child-objview");
const destinationGodown = process.argv.includes("--destination-godown");
if (!fileArg || !execute) throw new Error("Use --execute --file=<voucher XML path>.");
const filePath = path.resolve(ROOT, fileArg);
const xml = readFileSync(filePath, "utf8");
const messages = [...xml.matchAll(/<TALLYMESSAGE\b[\s\S]*?<\/TALLYMESSAGE>/gi)].map((match) => match[0]);
const counter = (value, name) => Number(value.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, "i"))?.[1] ?? 0);
const text = (value, name) => value.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;
const envelope = (message) => `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${message}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

const results = [];
for (const [index, originalMessage] of messages.entries()) {
  if (only && index + 1 !== only) continue;
  let message = remoteIdSuffix ? originalMessage.replace(/REMOTEID="([^"]+)"/i, (_, id) => `REMOTEID="${id}${remoteIdSuffix}"`) : originalMessage;
  if (voucherNumberSuffix) message = message.replace(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/i, (_, number) => `<VOUCHERNUMBER>${number}${voucherNumberSuffix}</VOUCHERNUMBER>`);
  if (partyOverride) {
    const originalParty = text(message, "PARTYLEDGERNAME");
    message = message.replaceAll(`<PARTYLEDGERNAME>${originalParty}</PARTYLEDGERNAME>`, `<PARTYLEDGERNAME>${partyOverride}</PARTYLEDGERNAME>`).replaceAll(`<LEDGERNAME>${originalParty}</LEDGERNAME>`, `<LEDGERNAME>${partyOverride}</LEDGERNAME>`);
  }
  if (referenceSuffix) {
    const originalReference = text(message, "REFERENCE");
    message = message.replaceAll(originalReference, `${originalReference}${referenceSuffix}`);
  }
  if (stripTax) {
    const inventoryAmount = message.match(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i)?.[1];
    const partyAmount = message.match(/<LEDGERENTRIES\.LIST>[\s\S]*?<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i)?.[1];
    if (!inventoryAmount || !partyAmount) throw new Error("Cannot identify sales amounts for --strip-tax.");
    message = message.replaceAll(partyAmount, `-${Math.abs(Number(inventoryAmount)).toFixed(2)}`);
    message = message.replace(/<LEDGERENTRIES\.LIST>[\s\S]*?<LEDGERNAME>Output (?:CGST|SGST|IGST)[^<]*<\/LEDGERNAME>[\s\S]*?<\/LEDGERENTRIES\.LIST>/gi, "");
  }
  if (stripBill) message = message.replace(/<BILLALLOCATIONS\.LIST>[\s\S]*?<\/BILLALLOCATIONS\.LIST>/gi, "");
  if (accountingOnly) {
    const inventoryAmount = message.match(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i)?.[1];
    if (!inventoryAmount) throw new Error("Cannot identify inventory amount for --accounting-only.");
    message = message.replace(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/gi, "");
    message = message.replace(/OBJVIEW="Invoice Voucher View"/i, 'OBJVIEW="Accounting Voucher View"').replace(/<PERSISTEDVIEW>Invoice Voucher View<\/PERSISTEDVIEW>/i, "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>").replace(/<VCHENTRYMODE>Item Invoice<\/VCHENTRYMODE>/i, "<VCHENTRYMODE>Accounting Invoice</VCHENTRYMODE>").replace(/<ISINVOICE>Yes<\/ISINVOICE>/i, "<ISINVOICE>No</ISINVOICE>");
    message = message.replace("</VOUCHER>", `<LEDGERENTRIES.LIST><LEDGERNAME>Solution Sales Account</LEDGERNAME><ISPARTYLEDGER>No</ISPARTYLEDGER><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${Math.abs(Number(inventoryAmount)).toFixed(2)}</AMOUNT></LEDGERENTRIES.LIST></VOUCHER>`);
  }
  if (allLedgerList) message = message.replaceAll("<LEDGERENTRIES.LIST>", "<ALLLEDGERENTRIES.LIST>").replaceAll("</LEDGERENTRIES.LIST>", "</ALLLEDGERENTRIES.LIST>");
  if (minimalSales) {
    const date = text(message, "DATE");
    const voucherNumber = text(message, "VOUCHERNUMBER");
    const reference = text(message, "REFERENCE");
    const party = text(message, "PARTYLEDGERNAME");
    const partyAmount = Math.abs(Number(message.match(/<LEDGERENTRIES\.LIST>[\s\S]*?<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>[\s\S]*?<AMOUNT>([^<]+)<\/AMOUNT>/i)?.[1]));
    const inventoryBlock = minimalWithInventory
      ? (originalMessage.match(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/i)?.[0] ?? "").replace(/<ACCOUNTINGALLOCATIONS\.LIST>[\s\S]*?<\/ACCOUNTINGALLOCATIONS\.LIST>/gi, "")
      : "";
    message = `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER><REFERENCE>${reference}</REFERENCE><PARTYLEDGERNAME>${party}</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE><NARRATION>Commercial sale ${reference}</NARRATION>${inventoryBlock}<ALLLEDGERENTRIES.LIST><LEDGERNAME>${party}</LEDGERNAME><ISPARTYLEDGER>Yes</ISPARTYLEDGER><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><REMOVEZEROENTRIES>No</REMOVEZEROENTRIES><AMOUNT>-${partyAmount.toFixed(2)}</AMOUNT><BILLALLOCATIONS.LIST><NAME>${reference}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-${partyAmount.toFixed(2)}</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Solution Sales Account</LEDGERNAME><ISPARTYLEDGER>No</ISPARTYLEDGER><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><REMOVEZEROENTRIES>No</REMOVEZEROENTRIES><AMOUNT>${partyAmount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>`;
  }
  if (removeRemoteId) message = message.replace(/\sREMOTEID="[^"]+"/i, "");
  if (removeEntryMode) message = message.replace(/<VCHENTRYMODE>[^<]*<\/VCHENTRYMODE>/i, "");
  if (officialItemFixes) {
    message = message.replace(/<ISINVOICE>Yes<\/ISINVOICE>/i, "<ISINVOICE>Yes</ISINVOICE><OBJVIEW>Invoice Voucher View</OBJVIEW>");
    message = message.replace(/<ACTUALQTY>-([0-9.]+\s+[^<]+)<\/ACTUALQTY>/gi, "<ACTUALQTY>$1</ACTUALQTY>").replace(/<BILLEDQTY>-([0-9.]+\s+[^<]+)<\/BILLEDQTY>/gi, "<BILLEDQTY>$1</BILLEDQTY>");
    message = message.replace(/<BATCHALLOCATIONS\.LIST><GODOWNNAME>([^<]+)<\/GODOWNNAME>/gi, "<BATCHALLOCATIONS.LIST><GODOWNNAME>$1</GODOWNNAME><BATCHNAME>Primary Batch</BATCHNAME><DESTINATIONGODOWNNAME>$1</DESTINATIONGODOWNNAME>");
  }
  if (positiveQuantity) message = message.replace(/<ACTUALQTY>-([0-9.]+\s+[^<]+)<\/ACTUALQTY>/gi, "<ACTUALQTY>$1</ACTUALQTY>").replace(/<BILLEDQTY>-([0-9.]+\s+[^<]+)<\/BILLEDQTY>/gi, "<BILLEDQTY>$1</BILLEDQTY>");
  if (childObjView) message = message.replace(/<ISINVOICE>Yes<\/ISINVOICE>/i, "<ISINVOICE>Yes</ISINVOICE><OBJVIEW>Invoice Voucher View</OBJVIEW>");
  if (destinationGodown) message = message.replace(/<BATCHALLOCATIONS\.LIST><GODOWNNAME>([^<]+)<\/GODOWNNAME>/gi, "<BATCHALLOCATIONS.LIST><GODOWNNAME>$1</GODOWNNAME><DESTINATIONGODOWNNAME>$1</DESTINATIONGODOWNNAME>");
  const response = await fetch("http://127.0.0.1:9000", { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8" }, body: envelope(message), signal: AbortSignal.timeout(60_000) });
  const body = await response.text();
  const result = {
    index: index + 1,
    voucherType: text(message, "VOUCHERTYPENAME"),
    reference: text(message, "REFERENCE"),
    partyLedger: text(message, "PARTYLEDGERNAME"),
    created: counter(body, "CREATED"),
    altered: counter(body, "ALTERED"),
    errors: counter(body, "ERRORS"),
    exceptions: counter(body, "EXCEPTIONS"),
    lineError: text(body, "LINEERROR"),
  };
  results.push(result);
  console.log(JSON.stringify(result));
}
const outputPath = `${filePath}.diagnostic.json`;
writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, records: results.length, failed: results.filter((item) => item.errors || item.exceptions || item.lineError).length }, null, 2));
