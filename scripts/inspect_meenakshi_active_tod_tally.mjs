const TALLY_URL = process.env.TALLY_URL || "http://127.0.0.1:9000";
const COMPANY = "Solution Nyx";
const ITEM = "M S Scrap & Sponge Iron";

async function post(body) {
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Tally returned HTTP ${response.status}`);
  return response.text();
}

const itemRequest = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Meenakshi TOD Item</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Meenakshi TOD Item"><TYPE>StockItem</TYPE><FETCH>Name,Parent,BaseUnits,ClosingBalance,ClosingValue,RateOfDuty,HSNCode,GSTRate</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
const voucherRequest = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Meenakshi TOD Vouchers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${COMPANY}</SVCURRENTCOMPANY><SVFROMDATE TYPE="Date">20260815</SVFROMDATE><SVTODATE TYPE="Date">20260815</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Meenakshi TOD Vouchers"><TYPE>Voucher</TYPE><FETCH>Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,PersistedView,AllInventoryEntries.*,AllLedgerEntries.*</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

const itemXml = "";
const voucherXml = await post(voucherRequest);
const itemBlock = [...itemXml.matchAll(/<STOCKITEM\b[\s\S]*?<\/STOCKITEM>/gi)].map((match) => match[0]).find((block) => block.includes(`NAME="${ITEM}"`));
const vouchers = [...voucherXml.matchAll(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi)].map((match) => match[0]);
const matching = vouchers.filter((block) => block.includes(`<STOCKITEMNAME>${ITEM}</STOCKITEMNAME>`) || block.includes("<STOCKITEMNAME>M S Scrap &amp; Sponge Iron</STOCKITEMNAME>"));
console.log(JSON.stringify({
  company: COMPANY,
  itemFound: Boolean(itemBlock),
  itemXml: itemBlock,
  periodVoucherCount: vouchers.length,
  matchingVoucherCount: matching.length,
  matchingVoucherSample: matching[0] ?? null,
  voucherSummaries: vouchers.map((block) => ({
    number: block.match(/<VOUCHERNUMBER\b[^>]*>([\s\S]*?)<\/VOUCHERNUMBER>/i)?.[1] ?? null,
    reference: block.match(/<REFERENCE\b[^>]*>([\s\S]*?)<\/REFERENCE>/i)?.[1] ?? null,
    party: block.match(/<PARTYLEDGERNAME\b[^>]*>([\s\S]*?)<\/PARTYLEDGERNAME>/i)?.[1] ?? null,
    stockItems: [...block.matchAll(/<STOCKITEMNAME\b[^>]*>([\s\S]*?)<\/STOCKITEMNAME>/gi)].map((entry) => entry[1]),
  })),
}, null, 2));
