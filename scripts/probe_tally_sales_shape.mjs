const request = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Sales Shape Probe</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY><SVFROMDATE>20260401</SVFROMDATE><SVTODATE>20260823</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Sales Shape Probe"><TYPE>Voucher</TYPE><FETCH>Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,PersistedView,IsInvoice,AllInventoryEntries.*,AllLedgerEntries.*</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
const response = await fetch("http://127.0.0.1:9000", { method: "POST", headers: { "Content-Type": "text/xml" }, body: request });
const text = await response.text();
const vouchers = [...text.matchAll(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi)].map((match) => match[0]);
const sales = vouchers.filter((voucher) => /<VOUCHERTYPENAME>Sales/i.test(voucher));
const requestedReference = process.argv.find((value) => value.startsWith("--reference="))?.slice(12);
const inventorySale = requestedReference
  ? sales.find((voucher) => voucher.includes(`<REFERENCE TYPE="String">${requestedReference}</REFERENCE>`) || voucher.includes(`<REFERENCE>${requestedReference}</REFERENCE>`))
  : sales.find((voucher) => /<ALLINVENTORYENTRIES\.LIST>\s*<STOCKITEMNAME>/i.test(voucher));
console.log(JSON.stringify({ vouchers: vouchers.length, sales: sales.length, inventorySaleFound: Boolean(inventorySale) }, null, 2));
if (inventorySale) console.log(inventorySale.slice(0, 20_000));
