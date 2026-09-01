import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const COMPANY = "Solution Nyx";
const PACK = path.resolve("output", "solution-nyx-fy26-27", "meenakshi-active-tod-70");
const review = JSON.parse(readFileSync(path.join(PACK, "review.json"), "utf8"));

function compactDate(value) {
  return value.replaceAll("-", "");
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function tag(block, name) {
  const value = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1];
  return value == null ? null : decodeXml(value.replace(/<[^>]+>/g, "").trim());
}

function blocks(xml, namePattern) {
  return [...xml.matchAll(new RegExp(`<${namePattern}\\b[^>]*>[\\s\\S]*?<\\/${namePattern}>`, "gi"))].map((match) => match[0]);
}

function number(value) {
  if (value == null) return null;
  const parsed = Number(value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameMoney(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.01;
}

async function exportDate(date) {
  const request = [
    '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Meenakshi TOD Imported Voucher Verification</ID></HEADER>',
    `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY}</SVCURRENTCOMPANY><SVFROMDATE TYPE="Date">${date}</SVFROMDATE><SVTODATE TYPE="Date">${date}</SVTODATE></STATICVARIABLES>`,
    '<TDL><TDLMESSAGE><COLLECTION NAME="Meenakshi TOD Imported Voucher Verification"><TYPE>Voucher</TYPE><FETCH>Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,Narration,PersistedView,AllInventoryEntries.*,AllLedgerEntries.*</FETCH></COLLECTION></TDLMESSAGE></TDL>',
    '</DESC></BODY></ENVELOPE>',
  ].join("");
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: request,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Tally returned HTTP ${response.status} for ${date}`);
  return response.text();
}

const expectedByReference = new Map(review.vouchers.map((voucher) => [voucher.reference, voucher]));
const dates = [...new Set(review.vouchers.map((voucher) => compactDate(voucher.date)))].sort();
const actualByReference = new Map();
const duplicateReferences = [];

for (const date of dates) {
  const xml = await exportDate(date);
  for (const voucherBlock of blocks(xml, "VOUCHER")) {
    const reference = tag(voucherBlock, "REFERENCE");
    if (!expectedByReference.has(reference)) continue;
    if (actualByReference.has(reference)) duplicateReferences.push(reference);
    actualByReference.set(reference, voucherBlock);
  }
}

const failures = [];
const savedVoucherNumbers = [];
for (const [reference, expected] of expectedByReference) {
  const voucher = actualByReference.get(reference);
  if (!voucher) {
    failures.push({ reference, field: "presence", expected: "one saved voucher", actual: "missing" });
    continue;
  }

  const inventory = blocks(voucher, "ALLINVENTORYENTRIES\\.LIST").find((entry) => tag(entry, "STOCKITEMNAME") === expected.stockItem);
  const ledgerEntries = blocks(voucher, "(?:ALL)?LEDGERENTRIES\\.LIST");
  const partyEntries = ledgerEntries.filter((entry) => tag(entry, "LEDGERNAME") === expected.partyLedger);
  const partyEntry = partyEntries.find((entry) => tag(entry, "NAME") === reference) ?? partyEntries.at(-1);
  const salesAllocation = inventory && blocks(inventory, "ACCOUNTINGALLOCATIONS\\.LIST").find((entry) => tag(entry, "LEDGERNAME") === expected.salesLedger);
  const checks = [
    ["date", compactDate(expected.date), tag(voucher, "DATE")],
    ["voucherType", expected.voucherType, tag(voucher, "VOUCHERTYPENAME")],
    ["partyLedger", expected.partyLedger, tag(voucher, "PARTYLEDGERNAME")],
    ["stockItem", expected.stockItem, inventory && tag(inventory, "STOCKITEMNAME")],
    ["unit", expected.unit, inventory && tag(inventory, "ACTUALQTY")?.replace(/^-?\d+(?:\.\d+)?\s*/, "")],
    ["salesLedger", expected.salesLedger, salesAllocation && tag(salesAllocation, "LEDGERNAME")],
    ["godown", "Main Location", inventory && tag(inventory, "GODOWNNAME")],
    ["batch", "Primary Batch", inventory && tag(inventory, "BATCHNAME")],
    ["billReference", reference, partyEntry && tag(partyEntry, "NAME")],
    ["narration", expected.narration, tag(voucher, "NARRATION")],
  ];
  for (const [field, expectedValue, actualValue] of checks) {
    if (actualValue !== expectedValue) failures.push({ reference, field, expected: expectedValue, actual: actualValue ?? null });
  }

  const actualQuantity = inventory && number(tag(inventory, "ACTUALQTY"));
  if (actualQuantity !== Number(expected.quantity)) failures.push({ reference, field: "quantity", expected: Number(expected.quantity), actual: actualQuantity });
  const billedQuantity = inventory && number(tag(inventory, "BILLEDQTY"));
  if (billedQuantity !== Number(expected.quantity)) failures.push({ reference, field: "billedQuantity", expected: Number(expected.quantity), actual: billedQuantity });
  const inventoryAmount = inventory && number(tag(inventory, "AMOUNT"));
  if (!sameMoney(inventoryAmount, expected.taxableValue)) failures.push({ reference, field: "inventoryAmount", expected: Number(expected.taxableValue), actual: inventoryAmount });
  const salesAmount = salesAllocation && number(tag(salesAllocation, "AMOUNT"));
  if (!sameMoney(salesAmount, expected.credit)) failures.push({ reference, field: "salesCredit", expected: Number(expected.credit), actual: salesAmount });
  const partyAmount = partyEntry && number(tag(partyEntry, "AMOUNT"));
  if (!sameMoney(partyAmount, -Number(expected.debit))) failures.push({ reference, field: "partyDebit", expected: -Number(expected.debit), actual: partyAmount });
  savedVoucherNumbers.push(tag(voucher, "VOUCHERNUMBER"));
}

for (const reference of duplicateReferences) failures.push({ reference, field: "uniqueness", expected: 1, actual: "duplicate" });

const result = {
  schemaVersion: "1.0.0",
  status: failures.length === 0 ? "passed" : "failed",
  companyName: COMPANY,
  tallyUrl: TALLY_URL,
  checkedAt: new Date().toISOString(),
  expectedVoucherCount: expectedByReference.size,
  foundVoucherCount: actualByReference.size,
  uniqueSavedVoucherNumberCount: new Set(savedVoucherNumbers).size,
  checkedDates: dates,
  failures,
};
writeFileSync(path.join(PACK, "readback-verification.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
