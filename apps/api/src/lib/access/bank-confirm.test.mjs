import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile} from 'node:fs/promises';import ts from 'typescript';import {createHash} from 'node:crypto';
const source=await readFile(new URL('../../app/api/bank-statements/imports/[id]/confirm/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class AccessError extends Error{constructor(message,status=403){super(message);this.status=status;}}
function fixture({team=true,otherCompany=false}={}) {
 const writes=[],reads=[],checks=[],exports={};
 const records={bank_statement_imports:[{id:'import',owner_user_id:'creator',bank_account_id:'account',status:'ready_to_review',processing_meta:{},created_at:'2026-09-01'}],
 bank_accounts:[{id:'account',owner_user_id:team?'account-owner':'actor',account_number_normalized:'123'}],bank_transactions:[],bank_transaction_posting_log:[]};
 const db={from(table){let action='read',data,filters=[];const q={select(){return this;},eq(k,v){filters.push([k,v]);return this;},or(){return this;},neq(){return this;},in(){return this;},
 insert(value){action='insert';data=value;return this;},upsert(value){action='upsert';data=value;return this;},update(value){action='update';data=value;return this;},delete(){action='delete';return this;},
 single(){return Promise.resolve(execute(true));},then(resolve,reject){return Promise.resolve(execute(false)).then(resolve,reject);}};
 function execute(single){
  if(action!=='read')writes.push({table,action,data,filters});else reads.push({table,filters});
  let rows=records[table]||[];
  if(table==='bank_statement_imports'&&filters.some(([k])=>k==='bank_account_id'))rows=[];
  return {data:single?{...rows[0],...(action==='update'?data:{})}:rows,error:null};
 }return q;}};
 const imports={
 '@/lib/access/route-boundary':{withTeamAccess:fn=>fn},
 '@/lib/access/resources':{requireResourceAccess:async(_req,type)=>{checks.push(type);return {scope:{organization_id:'org',company_id:type==='bank_account'&&otherCompany?'other':'company',creator_user_id:'creator'}};}},
 '@/lib/access/server':{AccessError},'@/lib/access/failures':{accessFailureResponse:(r,e)=>e instanceof AccessError?Response.json({error:e.message},{status:e.status}):null},
 '@/lib/api/cors':{jsonWithCors:(_r,body,init)=>Response.json(body,init),optionsWithCors:()=>new Response()},
 'node:crypto':{createHash},'@/lib/api/request-auth':{requireRequestUser:async()=>({id:'actor'})},
 '@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},
 '@/lib/bank-statements':{BANK_STATEMENT_BUCKET:'bank',buildTransactionFingerprint:()=> 'fingerprint',extractCounterpartyName:()=> 'Party',
  maskAccountNumber:v=>v,normalizeAccountNumber:v=>v||'',normalizeIfscCode:v=>v||'',parseAmount:v=>v==null?null:Number(v),parseDate:v=>v||null,serializeAccount:v=>v},
 };
 vm.runInNewContext(code,{exports,require:name=>{if(!imports[name])throw Error(name);return imports[name];},process:{env:{TEAM_ACCESS_ENFORCEMENT:team?'true':'false'}},Date,console});
 const run=()=>exports.POST(new Request('http://localhost/api/bank-statements/imports/import/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:'account',transactions:[{transactionDate:'2026-09-01',description:'Receipt',creditAmount:100}]})}),{params:Promise.resolve({id:'import'})});
 return {run,writes,reads,checks};
}
test('shared confirmation preserves account namespace and records actual confirmer without deleting history',async()=>{
 const f=fixture();const response=await f.run();assert.equal(response.status,200,await response.text());
 assert.deepEqual(f.checks,['bank_import','bank_account']);
 const inserted=f.writes.find(w=>w.table==='bank_transactions'&&w.action==='insert');assert.equal(inserted.data[0].owner_user_id,'account-owner');
 const saved=f.writes.find(w=>w.table==='bank_statement_imports'&&w.action==='update');assert.equal(saved.data.processing_meta.confirmedByUserId,'actor');
 assert.ok(!f.writes.some(w=>w.action==='delete'||w.table==='storage_cleanup_queue'));
});
test('cross-company account selection is rejected before any persistence',async()=>{
 const f=fixture({otherCompany:true});assert.equal((await f.run()).status,403);assert.equal(f.writes.length,0);
});
test('legacy confirmation retains actor ownership and does not query team authority',async()=>{
 const f=fixture({team:false});const response=await f.run();assert.equal(response.status,200,await response.text());assert.equal(f.checks.length,0);
 assert.equal(f.writes.find(w=>w.table==='bank_transactions').data[0].owner_user_id,'actor');
});
