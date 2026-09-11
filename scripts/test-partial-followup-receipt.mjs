const company='Solution Nyx', party='Gajanan Shah Projects Enterprises, Surat', bill='INV/26-27/06371';
const ref='TEST-PARTIAL-06371-20260907';
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function post(xml){const r=await fetch('http://127.0.0.1:9000',{method:'POST',headers:{'Content-Type':'text/xml'},body:xml,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.text();}
async function collection(type,fields,filter){return post(`<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PartialReceiptProbe</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY><SVFROMDATE>20260401</SVFROMDATE><SVTODATE>20270331</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="PartialReceiptProbe"><TYPE>${type}</TYPE><FETCH>${fields}</FETCH><FILTER>PartialFilter</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="PartialFilter">${esc(filter)}</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`);}
const banks=await collection('Ledger','Name,Parent','$Parent = "Bank Accounts"');
const bank=[...banks.matchAll(/<LEDGER NAME="([^"]+)"/g)].map(m=>m[1]).find(n=>n.includes('Axis'));
if(!bank)throw Error('Expected Axis bank ledger not found');
const bills=await collection('Bill','Name,Parent,LedgerName,OpeningBalance,ClosingBalance,Date',`$Name = "${bill}"`);
console.log('BANK',bank,'BILL BEFORE',bills);
const existing=await collection('Voucher','VoucherNumber,Reference,Narration',`$Reference = "${ref}"`);
if(/<VOUCHER\s[^>]*>/.test(existing))throw Error('Test receipt already exists; refusing duplicate');
if(!bills.includes(party)||!bills.includes(bill))throw Error('Exact customer bill not confirmed');
if(process.argv.includes('--execute')){
 const xml=`<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>20260907</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><REFERENCE>${ref}</REFERENCE><NARRATION>TEST partial receipt for payment follow-up UI verification - ${ref}</NARRATION><ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(bank)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-10000.00</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(party)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>10000.00</AMOUNT><BILLALLOCATIONS.LIST><NAME>${bill}</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>10000.00</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
 console.log('IMPORT',await post(xml));
 console.log('BILL AFTER',await collection('Bill','Name,Parent,OpeningBalance,ClosingBalance,Date',`$Name = "${bill}"`));
}
