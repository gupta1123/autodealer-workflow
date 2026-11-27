import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('./route.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const handlers = ast.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ['PATCHHandler', 'asSavedReview'].includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(handlers + '\nexports.patch = PATCHHandler', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test('scoped ledger saves preserve other lines, read once, and reject stale revisions', async () => {
  let loads = 0, builds = 0, writes = 0, conflict = false;
  const posting = { id:'posting', revision:5, connection_id:'pc', status:'draft', review_patch:{
    postingCompanyId:'company-id', narration:'keep', lines:[{ lineId:'first', quantity:'5', taxRate:'18' }],
  }};
  const conditions = {};
  const db = { from:() => db, update(row){ this.row = row; return this; },
    eq(key,value){ conditions[key] = value; return this; }, select:() => db,
    maybeSingle(){ writes++; return {data:conflict ? null : {...posting,...this.row}}; },
  };
  const context = { posting, supabase:db, connection:{id:'pc'}, selectedCompanyName:'Company',
    postingCompanyId:'company-id', documents:[], files:[], mappings:[] };
  const env = { exports:{}, requireRequestUser:async()=>({id:'actor'}), recycledCaseResponse:async()=>null,
    loadContext:async()=>{loads++; return context;}, isPostingLocked:()=>false,
    prepareContext:async(_,actor,review)=>{ builds++; return {duplicateExists:false,duplicate:'duplicate-key',
      prepared:{review,source:{documentId:'invoice'},suggestedStatus:'draft'}}; },
    purchaseMappingProposals:()=>[], getSourceFile:()=>null, sourceReference:()=>null,
    responseBody:(ctx,prepared)=>({review:prepared.review, revision:ctx.posting.revision}),
    jsonWithCors:(_,data,init)=>({data,status:init?.status ?? 200}),
    accessFailureResponse:()=>null, serializeError:String,
  };
  vm.runInNewContext(code,env);
  const body = {ledgerEdit:true,expectedRevision:5, connectionId:'pc',companyName:'Company',
    review:{supplierLedgerName:'Supplier',lines:[{lineId:'second',purchaseLedgerName:'Purchase'}]}};
  const patch = changes => env.exports.patch({json:async()=>({...body,...changes})},{params:{id:'case'}});
  const saved = await patch({});
  assert.equal(saved.status,200);
  assert.equal(saved.data.review.narration,'keep');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.data.review.lines)),[
    {lineId:'first',quantity:'5',taxRate:'18'},{lineId:'second',purchaseLedgerName:'Purchase'},
  ]);
  assert.equal(saved.data.revision,6);
  assert.deepEqual([loads,builds,writes],[1,1,1]);
  assert.equal(conditions.revision,5);
  assert.equal(conditions.status,'draft');
  assert.equal((await patch({expectedRevision:4})).status,409);
  assert.equal((await patch({companyName:'Different company'})).status,409);
  assert.equal((await patch({review:{invoiceTotal:'10'}})).status,400);
  assert.equal(writes,1);
  conflict=true;
  assert.equal((await patch({})).status,409);
});
