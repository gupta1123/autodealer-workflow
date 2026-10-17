import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../app/api/bank-statements/tally/queue/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({wakeFailure=false,insertFailure=false,team=false,rpcFailure=null}={}) {
  const events=[],exports={};
  const tx={id:'tx',bank_account_id:'account',statement_import_id:'import',transaction_date:'2026-10-14',description:'NEFT FROM Customer',reference_number:'REF-20261014-1',credit_amount:100,debit_amount:0,fingerprint:'fp',tally_status:'pending'};
  const records={tally_connections:[{id:'connection',status:'company_loaded',last_heartbeat_at:new Date().toISOString(),last_company_name:'Company',last_tally_reachable:true,last_company_loaded:true}],
    bank_transactions:[tx],bank_accounts:[{id:'account',tally_ledger_name:'Bank',bank_name:'Bank',account_number_masked:'***123'}],
    bank_statement_imports:[{id:'import',extracted_bank_name:'Bank'}],bank_transaction_posting_log:[],tally_masters:[]};
  records.access_bank_queue_transactions=[tx];
  const db={rpc:async(name,args)=>{events.push({rpc:name,args});return {data:[],error:rpcFailure};},from(table){let action='read',data;const q={select(){return this;},eq(){return this;},is(){return this;},or(){return this;},in(){return this;},order(){return this;},range(){return this;},limit(){return this;},
    insert(value){action='insert';data=value;return this;},upsert(value){action='upsert';data=value;return this;},update(value){action='update';data=value;return this;},
    single(){return Promise.resolve(execute(true));},maybeSingle(){return this.single();},then(resolve,reject){return Promise.resolve(execute(false)).then(resolve,reject);}};
    function execute(single){
      if(action!=='read')events.push(table+':'+action);
      if(table==='tally_bridge_commands'&&action==='insert')return insertFailure?{data:null,error:{message:'insert failed'}}:{data:data.map((c,i)=>({...c,id:'cmd-'+i})),error:null};
      const rows=records[table]||[];return {data:single?rows[0]:rows,error:null};
    }return q;}};
  const normalize=s=>String(s||'').trim().toLowerCase();
  const imports={
    '@/lib/bank-queue-fetch':{createBankQueueFetch:()=>undefined},
    '@/lib/access/route-boundary':{withTeamAccess:f=>f},'@/lib/access/master-store':{requireMasterDataset:async()=>({dataset:{id:'dataset'},access:{organizationId:'org'},link:{company_id:'company'},connection:{...records.tally_connections[0],session_generation:1},predicate:'scope'})},'@/lib/access/server':{AccessError:Error},'@/lib/access/failures':{accessFailureResponse:()=>null},
    '@/lib/tally/command-wake':{wakeTallyConnector:async id=>{events.push('wake:'+id);if(wakeFailure)throw Error('notification unavailable');return true;}},
    '@/lib/api/cors':{jsonWithCors:(_r,b,i)=>Response.json(b,i),optionsWithCors:()=>new Response()},'@/lib/api/request-auth':{requireRequestUser:async()=>({id:'actor'})},
    '@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},'@/lib/bank-statements':{normalizeName:normalize},
    '@/lib/bank-voucher-bill-policy':{validateBankVoucherBillPolicy:()=>null},
    '@/lib/bank-statement-ledger-matching':{buildBankAccountLedgerSourceKey:id=>'account:'+id,buildBankNarrationLedgerSourceKey:()=>'',buildLedgerMappingTarget:name=>({target_master_type:'ledger',target_master_key:name,target_master_name:name})},
    '@/lib/bank-statement-ledger-safety':{classifyPartyLedgerFromGroups:()=>({isPartyLedger:true}),isSuspenseLedgerIdentity:()=>false,masterParentDescendsFromGroup:(p,_g,t)=>p===t,resolveCompanySuspenseLedgerName:()=>''},
  };
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(imports[name],name);return imports[name];},process:{env:{TEAM_ACCESS_ENFORCEMENT:team?'true':'false'}},console:{error(){}},Date});
  const run=()=>exports.POST(new Request('http://localhost/api/bank-statements/tally/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId:'connection',companyName:'Company',accountId:'account',async:false,transactionIds:['tx'],outgoingAction:'post',liveLedgerContext:[{name:'Bank',parent:'Bank Accounts'},{name:'Customer',parent:'Sundry Debtors'}],transactions:[{transactionId:'tx',counterpartyLedgerName:'Customer',directPosting:true}]})}));
  return {events,run};
}
test('legacy posting wakes the connector after commands, posting log and row updates are persisted',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,200,await r.clone().text());
  assert.equal(f.events.at(-1),'wake:connection');
  for(const event of ['tally_bridge_commands:insert','bank_transaction_posting_log:upsert','bank_transactions:update'])assert.ok(f.events.includes(event));
  assert.equal((await r.json()).queuedCount,1);
});
test('notification outage leaves successfully queued commands available to fallback polling',async()=>{
  const f=fixture({wakeFailure:true}),r=await f.run();assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).queuedCount,1);assert.equal(f.events.at(-1),'wake:connection');
});
test('failed command persistence never emits a wake notification',async()=>{
  const f=fixture({insertFailure:true}),r=await f.run();assert.equal(r.status,500);assert.ok(!f.events.some(e=>e.startsWith('wake:')));
});

test('shared posting keeps source narration exact and the UTR in its own field',async()=>{
 const f=fixture({team:true}),r=await f.run();assert.equal(r.status,200,await r.clone().text());
 const rpc=f.events.find(e=>e.rpc==='access_enqueue_bank_batch');
 assert.equal(rpc.args.p_commands[0].payload.narration,'NEFT FROM Customer');
 assert.equal(rpc.args.p_commands[0].payload.bankReferenceNumber,'REF-20261014-1');
 assert.equal(f.events.at(-1),'wake:connection');
});

test('an interrupted admission returns a bounded uncertainty response without replay or wake',async()=>{
 const f=fixture({team:true,rpcFailure:{message:'upstream request timeout'}}),r=await f.run();
 assert.equal(r.status,503);assert.equal((await r.json()).code,'BANK_ADMISSION_UNCONFIRMED');
 assert.equal(f.events.filter(e=>e.rpc).length,1);assert.ok(!f.events.includes('wake:connection'));
});
