import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function client(apiFetch) {
  const exports={};
  const envelope={};
  vm.runInNewContext(ts.transpileModule(await readFile(new URL('./tally-purchase-live-envelope.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports:envelope});
  const code=ts.transpileModule(await readFile(new URL('./tally-purchase-posting.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code,{exports,AbortSignal,require(name){
    if(name==='@/lib/api-client')return {apiFetch};
    if(name==='@/lib/tally-purchase-live-envelope')return envelope;
    if(name==='@/lib/tally-company-selection')return {};
    throw Error(name);
  }});
  return exports;
}

test('invoice selection saves the chosen document to the active company with a bounded wait',async()=>{
  let sent;
  const api=await client(async(path,request)=>{sent={path,request};return Response.json({review:{selectedInvoiceDocumentId:'aglow-invoice'}});});
  const result=await api.selectTallyPurchaseInvoice('case','aglow-invoice','existing-pc','Kalika (25-26)',{companyName:'Kalika (25-26)'});
  assert.equal(sent.path,'/api/cases/case/tally-posting');
  assert.equal(sent.request.method,'PATCH');
  assert.equal(sent.request.signal.aborted,false);
  assert.deepEqual(JSON.parse(sent.request.body),{review:{selectedInvoiceDocumentId:'aglow-invoice'},connectionId:'existing-pc',companyName:'Kalika (25-26)',liveMasters:{companyName:'Kalika (25-26)'},compactResponse:true});
  assert.equal(result.review.selectedInvoiceDocumentId,'aglow-invoice');
});

test('a rejected selection surfaces the server explanation instead of reporting success',async()=>{
  const api=await client(async()=>Response.json({error:'The active Tally company is a different business from this case'},{status:403}));
  await assert.rejects(api.selectTallyPurchaseInvoice('case','invoice','pc','Other business'),/different business/);
});

test('choosing an invoice rebuilds stock and supplier candidates omitted before selection',async()=>{
  const api=await client(()=>{throw Error('No network read is needed');});
  const full={source:'live_tally',companyName:'Kalika (25-26)',masters:{
    ledgers:[{name:'Aglow Impex Inc',guid:'supplier',gstin:'27ANEPK3982A1Z5'}],
    stockItems:[{name:'M S Scrap & Sponge Iron',guid:'scrap',hsnCode:'72044900',unitName:'KG'}],
    units:[{name:'KG',guid:'kg'}],groups:[],
  }};
  const initial=api.prepareLiveTallyCatalogue(full,null);
  assert.equal(initial.compactResult.masters.stockItems.length,0);
  const selected=api.prepareLiveTallyCatalogue(full,{supplierName:'AGLOW IMPEX INC.',supplierGstin:'27ANEPK3982A1Z5',lines:[{description:'M.S.SCRAP',hsn:'72044900',unit:'KG'}]});
  assert.equal(selected.compactResult.masters.stockItems[0].name,'M S Scrap & Sponge Iron');
  assert(selected.compactResult.masters.ledgers.some(row=>row.name==='Aglow Impex Inc'));
});
