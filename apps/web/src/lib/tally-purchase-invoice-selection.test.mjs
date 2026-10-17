import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function client(apiFetch) {
  const exports={};
  const code=ts.transpileModule(await readFile(new URL('./tally-purchase-posting.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code,{exports,AbortSignal,require(name){
    if(name==='@/lib/api-client')return {apiFetch};
    if(name==='@/lib/tally-purchase-live-envelope')return {};
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
