// Manual, bounded diagnostic only. Every Tally request is EXPORT; never IMPORT.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildCollectionExportXml, openBillPendingFormula, buildRequestedLedgerFormula, selectCashDiscountLedgers, fetchCustomerOpenBillsFromTally } from '../apps/tally-bridge/src/bridge.mjs';
import { readBoundedXml } from '../apps/tally-bridge/src/cash-discount-runtime.mjs';

const directory = path.resolve('.codex-run/cash-discount-benchmark-20260831');
fs.mkdirSync(directory, { recursive: true });
const mode = process.argv[2] || 'discover';
const companyName = 'Solution Nyx';
const tallyUrl = 'http://localhost:9000';
const dateFrom = '2026-04-01';
const dateTo = '2026-08-31';
const results = [];
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"','&quot;');
const decode = (s='') => s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").trim();
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi'))].map(m=>m[0]).filter(b=>new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*<`,'i').test(b));
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
const named = (xml) => decode(xml.match(/\bNAME="([^"]*)"/i)?.[1] || tag(xml,'NAME'));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const voucherFingerprints = (xml) => [...new Set(blocks(xml,'VOUCHER').map(x => hash(x.replace(/\s+/g,' ').trim())))].sort();
const fields = 'MasterID,GUID,Date,EffectiveDate,VoucherTypeName,VoucherNumber,Reference,Narration,PartyLedgerName,AllLedgerEntries.LedgerName,AllLedgerEntries.Amount,AllLedgerEntries.IsDeemedPositive,AllLedgerEntries.BillAllocations.Name,AllLedgerEntries.BillAllocations.BillType,AllLedgerEntries.BillAllocations.Amount';
const metaFields = 'Name,Parent,GUID,PartyGSTIN,IsBillWiseOn,Email,EmailId,LedgerEmail,LedgerEmailId,LedgerMobile,Mobile,MobileNo,PhoneNumber,Phone,LedgerPhone,ContactPerson,Contact,AttentionTo,Address,Address1,Address2,Address3,Address4,Pincode';
const billFields = 'Name,Parent,LedgerName,PartyLedgerName,IsAdvance,BillType,TypeOfRef,Date,BillDate,DueDate,VoucherNumber,VoucherTypeName,OpeningBalance,ClosingBalance,Balance,PendingAmount,Amount';
async function request(label, xml) {
  if (!xml.includes('<TALLYREQUEST>Export</TALLYREQUEST>') || /<TALLYREQUEST>Import|<ACTION>|ACTION="/i.test(xml)) throw new Error('Read-only guard rejected request');
  const started = performance.now();
  fs.writeFileSync(path.join(directory,label+'-request.xml'),xml);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('10-second diagnostic limit exceeded; stop all tests and let Tally settle.')), 10_000);
  try {
    const response = await fetch(tallyUrl,{method:'POST',headers:{'content-type':'text/xml'},body:xml,signal:abort.signal});
    const data = await readBoundedXml(response, 8*1024*1024);
    const ms = Math.round(performance.now()-started);
    if (!response.ok || !data.includes('</ENVELOPE>') || /<LINEERROR>|<STATUS>0<\/STATUS>/i.test(data)) throw new Error(`Invalid export: ${data.slice(0,500)}`);
    const stats = {label,ms,bytes:Buffer.byteLength(data),vouchers:blocks(data,'VOUCHER').length,bills:blocks(data,'BILL').length,ledgers:blocks(data,'LEDGER').length};
    results.push(stats);
    fs.writeFileSync(path.join(directory,label+'.xml'),data);
    fs.writeFileSync(path.join(directory,mode+'-results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(stats));
    return data;
  } catch(error) { console.error(label,error.message); throw error; }
  finally { clearTimeout(timer); }
}
const collection = (label, options) => request(label,buildCollectionExportXml({collectionName:'Kalika Readonly Benchmark',companyName,dateFrom,dateTo,...options}));
function union(names, fetchFields=fields) {
  const members = names.map((name,index)=>`<COLLECTION NAME="KBenchLedger${index}" ISMODIFY="No"><TYPE>Vouchers : Ledger</TYPE><CHILDOF>${escape('"'+name.replaceAll('"','\\"')+'"')}</CHILDOF><FETCH>${escape(fetchFields)}</FETCH></COLLECTION>`).join('');
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>KBenchUnion</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escape(companyName)}</SVCURRENTCOMPANY><SVFROMDATE TYPE="Date">${dateFrom.replaceAll('-','')}</SVFROMDATE><SVTODATE TYPE="Date">${dateTo.replaceAll('-','')}</SVTODATE><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE>${members}<COLLECTION NAME="KBenchUnion" ISMODIFY="No"><COLLECTIONS>${names.map((_,index)=>`KBenchLedger${index}`).join(',')}</COLLECTIONS><FETCH>${escape(fetchFields)}</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}
function compactReport(sourceXml, columnMap, rowTag='ROW', nested=false) {
  const sourceDefinitions=sourceXml.match(/<TDLMESSAGE>([\s\S]*)<\/TDLMESSAGE>/)[1];
  const sourceName=sourceXml.match(/<ID>(.*?)<\/ID>/)[1];
  const mainFields=Object.entries(columnMap).map(([name,expr])=>`<FIELD NAME="KB${name}"><TYPE>String</TYPE><SET>${escape(expr)}</SET><XMLTAG>"${name}"</XMLTAG></FIELD>`).join('');
  const extra = nested ? `<PART NAME="KBEntries"><TOPLINES>KBEntry</TOPLINES><REPEAT>KBEntry : AllLedgerEntries</REPEAT></PART><LINE NAME="KBEntry"><LEFTFIELDS>KBLedger,KBLedAmount,KBLedSign</LEFTFIELDS><XMLTAG>"ENTRY"</XMLTAG><EXPLODE>KBBills : Yes</EXPLODE></LINE><FIELD NAME="KBLedger"><TYPE>String</TYPE><SET>$LedgerName</SET><XMLTAG>"LEDGER"</XMLTAG></FIELD><FIELD NAME="KBLedAmount"><TYPE>String</TYPE><SET>$Amount</SET><XMLTAG>"AMOUNT"</XMLTAG></FIELD><FIELD NAME="KBLedSign"><TYPE>String</TYPE><SET>$IsDeemedPositive</SET><XMLTAG>"SIGN"</XMLTAG></FIELD><PART NAME="KBBills"><TOPLINES>KBBill</TOPLINES><REPEAT>KBBill : BillAllocations</REPEAT></PART><LINE NAME="KBBill"><LEFTFIELDS>KBBillName,KBBillType,KBBillAmount</LEFTFIELDS><XMLTAG>"BILLALLOC"</XMLTAG></LINE><FIELD NAME="KBBillName"><TYPE>String</TYPE><SET>$Name</SET><XMLTAG>"NAME"</XMLTAG></FIELD><FIELD NAME="KBBillType"><TYPE>String</TYPE><SET>$BillType</SET><XMLTAG>"TYPE"</XMLTAG></FIELD><FIELD NAME="KBBillAmount"><TYPE>String</TYPE><SET>$Amount</SET><XMLTAG>"AMOUNT"</XMLTAG></FIELD>` : '';
  const defs = `${sourceDefinitions}<REPORT NAME="KBReport"><FORMS>KBForm</FORMS></REPORT><FORM NAME="KBForm"><TOPPARTS>KBPart</TOPPARTS><XMLTAG>"ENVELOPE"</XMLTAG></FORM><PART NAME="KBPart"><TOPLINES>KBLine</TOPLINES><REPEAT>KBLine : ${sourceName}</REPEAT></PART><LINE NAME="KBLine"><LEFTFIELDS>${Object.keys(columnMap).map(n=>'KB'+n).join(',')}</LEFTFIELDS><XMLTAG>"${rowTag}"</XMLTAG>${nested?'<EXPLODE>KBEntries : Yes</EXPLODE>':''}</LINE>${mainFields}${extra}`;
  return sourceXml.replace('<TYPE>Collection</TYPE>','<TYPE>Data</TYPE>').replace(/<ID>.*?<\/ID>/,'<ID>KBReport</ID>').replace('<STATICVARIABLES>','<STATICVARIABLES><EXPLODEFLAG>Yes</EXPLODEFLAG>').replace(/<TDLMESSAGE>[\s\S]*<\/TDLMESSAGE>/,()=>`<TDLMESSAGE>${defs}</TDLMESSAGE>`).replaceAll('TOPPARTS','PARTS').replaceAll('TOPLINES','LINES');
}
// A tiny company-only read verifies the target before any business query.
const companies = await collection('company-check-'+mode,{tallyType:'Company',fetchFields:'Name,GUID'});
if (!blocks(companies,'COMPANY').some(b=>named(b)===companyName)) throw new Error('Expected company not loaded');
if(mode==='discover') {
  const groupXml = await collection('groups',{tallyType:'Group',fetchFields:'Name,Parent,GUID'});
  const ledgerXml = await collection('all-ledgers-minimal',{tallyType:'Ledger',fetchFields:'Name,Parent,GUID,IsBillWiseOn'});
  const billXml = await collection('open-bills-current',{tallyType:'Bill',dateFrom:null,fetchFields:billFields,formulae:[{name:'BenchPending',formula:openBillPendingFormula()}],filterNames:['BenchPending']});
  const ledgers=blocks(ledgerXml,'LEDGER').map(b=>({name:named(b),parent:tag(b,'PARENT'),guid:tag(b,'GUID')}));
  const groups=blocks(groupXml,'GROUP').map(b=>({name:named(b),parent:tag(b,'PARENT')}));
  const billRecords=blocks(billXml,'BILL').map(b=>({ledgerName:tag(b,'PARENT')||tag(b,'LEDGERNAME')||tag(b,'PARTYLEDGERNAME'),name:named(b),date:tag(b,'BILLDATE')||tag(b,'DATE'),opening:tag(b,'OPENINGBALANCE'),closing:tag(b,'CLOSINGBALANCE'),isAdvance:tag(b,'ISADVANCE')}));
  const names=new Set(billRecords.map(b=>b.ledgerName));
  const candidates=ledgers.filter(l=>names.has(l.name));
  const auto=selectCashDiscountLedgers(candidates,groups,{});
  const strict=selectCashDiscountLedgers(candidates,groups,{mode:'strict'});
  const summary={companyName,totalLedgers:ledgers.length,totalBills:billRecords.length,billLedgerCount:names.size,automatic:auto.length,strict:strict.length,salesLinkedExceptions:auto.length-strict.length,sample:strict.slice(0,10).map(l=>l.name)};
  fs.writeFileSync(path.join(directory,'discovery.json'),JSON.stringify({summary,ledgers,groups,billRecords},null,2));
  console.log(JSON.stringify(summary));
} else if(mode==='compare') {
  const {summary} = JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const names=summary.sample.slice(0,10);
  if(names.length!==10) throw new Error('Need 10 known in-scope customers');
  const sequential=[];
  for (const [i,name] of names.entries()) sequential.push(await collection('individual-'+i,{tallyType:'Vouchers : Ledger',childOf:JSON.stringify(name),fetchFields:fields}));
  for(let repeat=0;repeat<3;repeat++) {
    const data=await request('union10-'+repeat,union(names));
    console.log(JSON.stringify({comparison:'union10 vs individual',sameRecords:JSON.stringify(voucherFingerprints(data))===JSON.stringify(voucherFingerprints(sequential.join('\n'))),uniqueIndividual:voucherFingerprints(sequential.join('\n')).length,uniqueUnion:voucherFingerprints(data).length}));
  }
  const {ledgers}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  await collection('metadata-50-current',{tallyType:'Ledger',fetchFields:metaFields,formulae:[{name:'BenchNames',formula:buildRequestedLedgerFormula(ledgers.filter(l=>l.name).slice(0,50).map(l=>l.name),['$Name'])}],filterNames:['BenchNames']});
} else if(mode==='scale') {
  const {ledgers,groups,billRecords}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const openNames=new Set(billRecords.map(b=>b.ledgerName));
  const names=selectCashDiscountLedgers(ledgers.filter(l=>openNames.has(l.name)),groups,{mode:'strict'}).slice(100,200).map(l=>l.name);
  for(const size of [10,25,50,100]) {
    const data=await request('union-'+size+'-first',union(names.slice(0,size)));
    const repeated=await request('union-'+size+'-repeat',union(names.slice(0,size)));
    if(JSON.stringify(voucherFingerprints(data))!==JSON.stringify(voucherFingerprints(repeated))) throw new Error('Repeated union differed');
  }
  const baseline=[];
  for(const [i,name] of names.slice(0,10).entries()) baseline.push(await collection('scale-individual-'+i,{tallyType:'Vouchers : Ledger',childOf:JSON.stringify(name),fetchFields:fields}));
  const unionData=fs.readFileSync(path.join(directory,'union-10-first.xml'),'utf8');
  console.log(JSON.stringify({comparison:'second sample union vs individual',sameRecords:JSON.stringify(voucherFingerprints(unionData))===JSON.stringify(voucherFingerprints(baseline.join('\n')))}));
  const compact=await request('compact-union100',compactReport(union(names),{ID:'$MasterID',GUID:'$GUID',DATE:'$Date',EFFECTIVEDATE:'$EffectiveDate',VTYPE:'$VoucherTypeName',NUMBER:'$VoucherNumber',REFERENCE:'$Reference',PARTY:'$PartyLedgerName',NARRATION:'$Narration'},'VOUCHER',true));
  console.log(JSON.stringify({compactVouchers:blocks(compact,'VOUCHER').length,compactEntries:blocks(compact,'ENTRY').length,compactBills:blocks(compact,'BILLALLOC').length}));
  await request('compact-ledgers-all',compactReport(buildCollectionExportXml({collectionName:'KBLedgers',companyName,tallyType:'Ledger',fetchFields:'Name,Parent,GUID,IsBillWiseOn'}),{NAME:'$Name',PARENT:'$Parent',GUID:'$GUID',BILLWISE:'$IsBillWiseOn'},'LEDGER'));
} else if(mode==='compact') {
  const {summary}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const data=await request('compact-ledgers-v2',compactReport(buildCollectionExportXml({collectionName:'KBLedgers',companyName,tallyType:'Ledger',fetchFields:'Name,Parent,GUID,IsBillWiseOn'}),{NAME:'$Name',PARENT:'$Parent',GUID:'$GUID',BILLWISE:'$IsBillWiseOn'},'LEDGER'));
  if(blocks(data,'LEDGER').length===0) throw new Error('Compact report returned zero ledger rows; invalid candidate');
  await request('compact-union10-v2',compactReport(union(summary.sample),{ID:'$MasterID',GUID:'$GUID',DATE:'$Date',EFFECTIVEDATE:'$EffectiveDate',VTYPE:'$VoucherTypeName',NUMBER:'$VoucherNumber',REFERENCE:'$Reference',PARTY:'$PartyLedgerName',NARRATION:'$Narration'},'VOUCHER',true));
} else if(mode==='sales') {
  const {summary,billRecords}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const names=summary.sample;
  const data=await collection('sales-type-sample10',{tallyType:'Vouchers : VoucherType',childOf:'"Sales"',fetchFields:fields,formulae:[{name:'BenchParties',formula:buildRequestedLedgerFormula(names,['$PartyLedgerName'])}],filterNames:['BenchParties']});
  const baseline=names.flatMap((_,i)=>blocks(fs.readFileSync(path.join(directory,'individual-'+i+'.xml'),'utf8'),'VOUCHER')).filter(v=>tag(v,'VOUCHERTYPENAME')==='Sales').join('\n');
  console.log(JSON.stringify({comparison:'Sales-type sample vs individual Sales',sameRecords:JSON.stringify(voucherFingerprints(data))===JSON.stringify(voucherFingerprints(baseline)),expectedSales:blocks(baseline,'VOUCHER').length,actualSales:blocks(data,'VOUCHER').length}));
  const headers='MasterID,GUID,Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,Narration';
  const week=await collection('sales-headers-week',{tallyType:'Vouchers : VoucherType',childOf:'"Sales"',fetchFields:headers,dateFrom:'2026-08-24'});
  if(Buffer.byteLength(week)>2*1024*1024) throw new Error('Stop before widening date window');
  const sales=await collection('sales-headers-fy',{tallyType:'Vouchers : VoucherType',childOf:'"Sales"',fetchFields:headers});
  const openRefs=new Set(billRecords.map(b=>b.ledgerName+'|'+b.name));
  const vouchers=blocks(sales,'VOUCHER').map(v=>({id:tag(v,'MASTERID'),party:tag(v,'PARTYLEDGERNAME'),reference:tag(v,'REFERENCE'),number:tag(v,'VOUCHERNUMBER'),narration:tag(v,'NARRATION')}));
  const openSales=vouchers.filter(v=>openRefs.has(v.party+'|'+v.reference)||openRefs.has(v.party+'|'+v.number));
  console.log(JSON.stringify({salesHeaderCount:vouchers.length,openSalesMatchedByReference:openSales.length,matchedCustomerCount:new Set(openSales.map(v=>v.party)).size,matchedWithCDMarker:openSales.filter(v=>/cash\s*discount|\bC\.?D\.?\b/i.test(v.narration)).length,note:'Reference matching is a candidate filter only; BillAllocations verification still required.'}));
} else if(mode==='candidates') {
  const {billRecords}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const headers='MasterID,GUID,Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,Narration';
  const data=await collection('sales-cd-headers',{tallyType:'Vouchers : VoucherType',childOf:'"Sales"',fetchFields:headers,formulae:[{name:'BenchCD',formula:'($Narration contains "cash discount") OR ($Narration contains "C.D.") OR ($Narration contains "CD")'}],filterNames:['BenchCD']});
  const allSales=fs.readFileSync(path.join(directory,'sales-headers-fy.xml'),'utf8');
  const expected=blocks(allSales,'VOUCHER').filter(v=>/cash discount|C\.D\.|CD/i.test(tag(v,'NARRATION'))).join('\n');
  console.log(JSON.stringify({comparison:'CD-header TDL filter vs local filter',sameRecords:JSON.stringify(voucherFingerprints(expected))===JSON.stringify(voucherFingerprints(data)),expected:blocks(expected,'VOUCHER').length}));
  const openRefs=new Set(billRecords.map(b=>b.ledgerName+'|'+b.name));
  const openSales=blocks(data,'VOUCHER').filter(v=>openRefs.has(tag(v,'PARTYLEDGERNAME')+'|'+tag(v,'REFERENCE'))||openRefs.has(tag(v,'PARTYLEDGERNAME')+'|'+tag(v,'VOUCHERNUMBER')));
  const parties=[...new Set(openSales.map(v=>tag(v,'PARTYLEDGERNAME')))];
  console.log(JSON.stringify({cdOpenInvoices:openSales.length,cdOpenCustomers:parties.length}));
  // A previously untested 25-customer sample measures the narrow candidate path.
  const sample=parties.slice(Math.floor(parties.length/2),Math.floor(parties.length/2)+25);
  const evidence=await request('candidate25-first',union(sample));
  await request('candidate25-repeat',union(sample));
  // Verify sale/receipt evidence for three customers independently, not just row counts.
  for(const [i,name] of sample.slice(0,3).entries()) {
    const individual=await collection('candidate-control-'+i,{tallyType:'Vouchers : Ledger',childOf:JSON.stringify(name),fetchFields:fields});
    const expectedVouchers=blocks(individual,'VOUCHER');
    const unionIds=new Map(blocks(evidence,'VOUCHER').map(v=>[tag(v,'GUID'),v]));
    console.log(JSON.stringify({control:i,expected:expectedVouchers.length,sameRecords:expectedVouchers.every(v=>hash(v.replace(/\s+/g,' ').trim())===hash((unionIds.get(tag(v,'GUID'))||'').replace(/\s+/g,' ').trim()))}));
  }
  await collection('voucher-types',{tallyType:'VoucherType',fetchFields:'Name,Parent,GUID'});
} else if(mode==='pilot') {
  const pilotStart=performance.now();
  const {ledgers,groups}=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8'));
  const freshBills=await collection('pilot-open-bills',{tallyType:'Bill',dateFrom:null,fetchFields:billFields,formulae:[{name:'BenchPending',formula:openBillPendingFormula()}],filterNames:['BenchPending']});
  const billBlocks=blocks(freshBills,'BILL');
  if(billBlocks.some(b=>(tag(b,'BILLDATE')||'20260401')<'20260401')) throw new Error('Pilot must extend the FY for carry-forward bills before proceeding');
  const openNames=new Set(billBlocks.map(b=>tag(b,'PARENT')||tag(b,'LEDGERNAME')));
  const names=selectCashDiscountLedgers(ledgers.filter(l=>openNames.has(l.name)),groups,{}).map(l=>l.name);
  const byLedger={};
  const parseTimes=[];
  for(let offset=0;offset<names.length;offset+=50) {
    if(performance.now()-pilotStart>45_000) { console.log('Pilot stopped at its 45-second budget; do not retry automatically.'); break; }
    const sample=names.slice(offset,offset+50);
    const data=await request('pilot-batch-'+offset,union(sample));
    const sampleSet=new Set(sample);
    const selectedBills=billBlocks.filter(b=>sampleSet.has(tag(b,'PARENT')||tag(b,'LEDGERNAME'))).join('\n');
    const beforeParse=performance.now();
    const parsed=await fetchCustomerOpenBillsFromTally({tallyUrl},{companyName,ledgerNames:sample,dateFrom,asOfDate:dateTo},{forceVoucherEvidence:true,billExport:{xml:selectedBills,batchCount:1},voucherExport:{xml:data,batchCount:1},exportCollection:()=>{throw new Error('Unexpected extra Tally call during parsing');}});
    parseTimes.push(performance.now()-beforeParse);
    Object.assign(byLedger,parsed.result.byLedger);
  }
  const summary={targetCustomers:names.length,processedCustomers:Object.keys(byLedger).length,complete:Object.keys(byLedger).length===names.length,elapsedMs:Math.round(performance.now()-pilotStart),totalParseMs:Math.round(parseTimes.reduce((a,b)=>a+b,0)),readCalls:results.length-1,openBillRows:Object.values(byLedger).reduce((sum,b)=>sum+(b.openBills?.length||0),0),resultBytes:Buffer.byteLength(JSON.stringify(byLedger)),maxBatchMs:Math.max(...results.filter(r=>r.label.startsWith('pilot-batch')).map(r=>r.ms)),maxBatchBytes:Math.max(...results.filter(r=>r.label.startsWith('pilot-batch')).map(r=>r.bytes))};
  fs.writeFileSync(path.join(directory,'pilot-output.json'),JSON.stringify({summary,byLedger}));
  console.log(JSON.stringify(summary));
  const controlNames=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8')).summary.sample.slice(0,3);
  for(const [i,name] of controlNames.entries()) {
    const data=fs.readFileSync(path.join(directory,'individual-'+i+'.xml'),'utf8');
    const control=await fetchCustomerOpenBillsFromTally({tallyUrl},{companyName,ledgerNames:[name],dateFrom,asOfDate:dateTo},{forceVoucherEvidence:true,billExport:{xml:billBlocks.filter(b=>tag(b,'PARENT')===name).join('\n'),batchCount:1},voucherExport:{xml:data,batchCount:1},exportCollection:()=>{throw new Error('Unexpected query');}});
    console.log(JSON.stringify({parserControl:i,sameBillAndReceiptResults:JSON.stringify(control.result.byLedger[name])===JSON.stringify(byLedger[name])}));
  }
} else if(mode==='verify') {
  const {byLedger}=JSON.parse(fs.readFileSync(path.join(directory,'pilot-output.json'),'utf8'));
  const names=Object.keys(byLedger);
  const billXml=fs.readFileSync(path.join(directory,'pilot-open-bills.xml'),'utf8');
  const chosen=[5,51,107,351,707,1050,1551,1951,2122].map(i=>names[i]).filter(Boolean);
  let exact=0;
  for(const [i,name] of chosen.entries()) {
    const data=await collection('final-control-'+i,{tallyType:'Vouchers : Ledger',childOf:JSON.stringify(name),fetchFields:fields});
    const control=await fetchCustomerOpenBillsFromTally({tallyUrl},{companyName,ledgerNames:[name],dateFrom,asOfDate:dateTo},{forceVoucherEvidence:true,billExport:{xml:blocks(billXml,'BILL').filter(b=>tag(b,'PARENT')===name).join('\n'),batchCount:1},voucherExport:{xml:data,batchCount:1},exportCollection:()=>{throw new Error('Unexpected query');}});
    const equal=JSON.stringify(control.result.byLedger[name])===JSON.stringify(byLedger[name]);
    if(equal) exact++;
    console.log(JSON.stringify({parserControl:i,exactMatch:equal}));
  }
  console.log(JSON.stringify({independentFinalChecks:chosen.length,exactMatches:exact}));
  const groups=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8')).groups;
  const ledgerRows=JSON.parse(fs.readFileSync(path.join(directory,'discovery.json'),'utf8')).ledgers;
  const strictNames=new Set(selectCashDiscountLedgers(ledgerRows,groups,{mode:'strict'}).map(l=>l.name));
  const extra=names.filter(n=>!strictNames.has(n));
  console.log(JSON.stringify({outOfGroup:extra.length,verifiedSalesExceptions:extra.filter(n=>byLedger[n].openBills.some(b=>b.sourceSalesLedgerName)).length,extraWithNoSalesEvidence:extra.filter(n=>!byLedger[n].openBills.some(b=>b.sourceSalesLedgerName)).length}));
} else { throw new Error('Unknown benchmark mode'); }
