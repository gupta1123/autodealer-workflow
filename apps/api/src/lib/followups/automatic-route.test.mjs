import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const compile=(path,imports={})=>{
  const code=ts.transpileModule(fs.readFileSync(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiledModule={exports:{}};
  new Function('require','module','exports',code)(name=>imports[name]??(name.startsWith('node:')?require(name):(()=>{throw Error(`Unexpected dependency: ${name}`);})()),compiledModule,compiledModule.exports);
  return compiledModule.exports;
};
const terms=compile('apps/api/src/lib/payment-terms.ts');
const dates={'businessDateText':()=> '2026-10-12'};
const policy=compile('apps/api/src/lib/followups/automatic-policy.ts',{'@/lib/payment-terms':terms,'@/lib/business-date':dates});
const shared=compile('packages/shared/src/lib/followup-pipeline.ts');
const history=compile('apps/api/src/lib/collections-history.ts');
class Rejected extends Error {}

function fixture({legacyCategories=false}={}) {
  const scope={connectionId:'connection',companyName:'Company',companyGuid:'guid',financialYear:'2026-27',installationId:'install',sessionGeneration:1};
  const tables={tally_connections:[{id:'connection',owner_user_id:'owner',organization_id:'org',installation_id:'install',session_generation:1,bridge_token_hash:hash('bridge'),last_company_name:'Company',last_company_loaded:true,last_tally_reachable:true,last_heartbeat_at:new Date().toISOString(),revoked_at:null}],access_company_links:[{organization_id:'org',connection_id:'connection',installation_id:'install',company_id:'company',company_guid:'guid',financial_year:'2026-27'}],invoice_followup_pipelines:[]};
  let canSend=true,automatic=true,provider='accepted'; const submissions=[];
  const db={from:table=>{
    let filters=[],kind='read',patch=null,single=false,start=0,end=Infinity;
    const query={select:()=>query,eq:(key,value)=>{filters.push(row=>row[key]===value);return query;},is:(key,value)=>{filters.push(row=>(row[key]??null)===value);return query;},lte:(key,value)=>{filters.push(row=>row[key]!=null&&row[key]<=value);return query;},limit:n=>{end=n;return query;},order:()=>query,range:(a,b)=>{start=a;end=b+1;return query;},maybeSingle:()=>{single=true;return query;},insert:value=>{kind='insert';patch=value;return query;},update:value=>{kind='update';patch=value;return query;},then:(resolve,reject)=>{
      try {
        let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));
        if(kind==='insert' && legacyCategories && patch.payment_category==='regular_credit') return Promise.resolve({data:null,error:{code:'23514'}}).then(resolve,reject);
        if(kind==='insert') {const row={id:`row-${tables[table].length}`,status:'active',revision:1,stage_index:0,stage_sent:0,...patch};tables[table].push(row);rows=[row];}
        if(kind==='update')rows.forEach(row=>Object.assign(row,patch));
        rows=rows.slice(start,end);return Promise.resolve({data:structuredClone(single?rows[0]??null:rows),error:null}).then(resolve,reject);
      }catch(error){return Promise.reject(error).then(resolve,reject);}
    }};return query;
  },rpc:async(name,args)=>{
    if(name==='access_snapshot')return{data:{sharingEnabled:true,member:{must_change_password:false},companies:[{id:'company',name:'Company'}]},error:null};
    const row=tables.invoice_followup_pipelines.find(row=>row.id===args.p_id);
    if(name==='followup_claim_send'){
      if(!canSend||row.status!=='active'||row.revision!==args.p_revision||Date.parse(row.next_due_at)>Date.now()||Date.parse(row.verification_expires_at)<=Date.now())return{data:null,error:{code:'40001'}};
      row.status='sending';row.revision++;return{data:{attempt_id:'attempt'},error:null};
    }
    if(name==='followup_finish_send'){
      Object.assign(row,args.p_status==='accepted'?args.p_next:{status:args.p_status==='uncertain'?'uncertain':'active'});row.verification_expires_at=null;row.revision++;return{data:true,error:null};
    }
    throw Error(`Unexpected RPC ${name}`);
  }};
  const plan={name:'Automatic test',stages:[{name:'First',template:'payment_reminder_v2',unit:'days',delay:0,every:1,limit:2}]};
  const route=compile('apps/api/src/app/api/collections/follow-ups/automatic/route.ts',{
    '@autodealer/shared/lib/access':{canAccess:()=>canSend},'@autodealer/shared/lib/followup-pipeline':shared,
    '@/lib/api/cors':{jsonWithCors:(_,body,options={})=>Response.json(body,options)},'@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},
    '@/lib/tally/connections':{hashSecret:hash},'@/lib/cash-discount-customer-scope':{getCashDiscountCustomerScopeOrDefault:async()=>({})},
    '@/lib/business-date':dates,'@/lib/followups/automatic-policy':policy,'@/lib/followups/defaults':{reminderDefaults:async()=>({value:{plan,automatic}})},
    '@/lib/followups/messages':{reminderMessages:()=>[{key:'payment_reminder_v2'}],submitReminder:async(_,row)=>{submissions.push(row.outstanding);if(provider==='uncertain')throw Error('timeout');if(provider==='rejected')throw new Rejected('rejected');return'provider-id';}},
    '@/lib/msg91/whatsapp':{WhatsappRejectedError:Rejected,normalizeWhatsappPhone:value=>String(value??'').replace(/\D/g,'')},'@/lib/collections-history':history,
  });
  const bill={referenceName:'INV',invoiceDate:'2026-10-10',narration:'ADVANCE RTGS',originalAmount:98500,pendingAmount:98500};
  const request=async(body,token='bridge')=>route.POST(new Request('http://test/automatic',{method:'POST',headers:{'content-type':'application/json','x-bridge-token':token},body:JSON.stringify({...scope,...body})}));
  const enroll=async(values={})=>request({action:'reconcile',scan:{companyName:'Company',companyGuid:'guid',financialYear:'2026-27',cache:{updatedAt:new Date().toISOString()},scanSummary:{complete:true},ledgers:[{name:'Customer',raw:{phone:'919999999999'}}],openBillsResult:{result:{byLedger:{Customer:{complete:true,openBills:[{...bill,...values}]}}}}}});
  const deliver=async(values={})=>request({action:'deliver',id:tables.invoice_followup_pipelines[0]?.id,evidence:{complete:true,byLedger:{Customer:{openBills:[{...bill,...values}]}}}});
  return{tables,submissions,request,enroll,deliver,bill,setProvider:value=>provider=value,setPermission:value=>canSend=value,setAutomatic:value=>automatic=value};
}

test('automatic invoice enrollment is idempotent and partial payment sends only the remainder',async()=>{
  const f=fixture();assert.equal((await f.enroll()).status,200);await f.enroll();assert.equal(f.tables.invoice_followup_pipelines.length,1);
  assert.equal((await f.deliver({pendingAmount:48500})).status,200);assert.deepEqual(f.submissions,[48500]);assert.equal(f.tables.invoice_followup_pipelines[0].stage_sent,1);
});
test('finished and paused schedules are not rediscovered or sent',async()=>{
  for(const status of ['paused','finished','stopped']){const f=fixture();await f.enroll();f.tables.invoice_followup_pipelines[0].status=status;await f.enroll();await f.deliver();assert.equal(f.tables.invoice_followup_pipelines.length,1);assert.equal(f.submissions.length,0);}
});
test('settlement stops automatic reminders while retaining the schedule',async()=>{
  const f=fixture();await f.enroll();await f.deliver({pendingAmount:0});assert.equal(f.submissions.length,0);assert.equal(f.tables.invoice_followup_pipelines[0].status,'settled');assert.equal(f.tables.invoice_followup_pipelines[0].next_due_at,null);
});
test('changed narration and ambiguous invoice evidence require review',async()=>{
  const f=fixture();await f.enroll();await f.deliver({narration:'SAME DAY RTGS'});assert.equal(f.submissions.length,0);assert.equal(f.tables.invoice_followup_pipelines[0].status,'review');
  const g=fixture();await g.enroll();await g.request({action:'deliver',id:g.tables.invoice_followup_pipelines[0].id,evidence:{byLedger:{Customer:{openBills:[g.bill,g.bill]}}}});assert.equal(g.submissions.length,0);assert.equal(g.tables.invoice_followup_pipelines[0].status,'review');
});
test('uncertain or rejected submissions are held instead of retried',async()=>{
  for(const provider of ['uncertain','rejected']){const f=fixture();await f.enroll();f.setProvider(provider);await f.deliver();await f.deliver();assert.equal(f.submissions.length,1);assert.equal(f.tables.invoice_followup_pipelines[0].stage_sent,0);assert.equal(f.tables.invoice_followup_pipelines[0].status,provider==='uncertain'?'uncertain':'review');}
});
test('concurrent requests cannot submit an invoice twice',async()=>{
  const f=fixture();await f.enroll();await Promise.all([f.deliver(),f.deliver()]);assert.equal(f.submissions.length,1);
});
test('wrong pairing, company or revoked permission prevents submission',async()=>{
  const f=fixture();assert.equal((await f.request({action:'context'},'wrong')).status,401);await f.enroll();assert.equal((await f.request({action:'deliver',id:f.tables.invoice_followup_pipelines[0].id,companyGuid:'other'})).status,409);f.setPermission(false);assert.equal((await f.deliver()).status,409);assert.equal(f.submissions.length,0);
});
test('disabling automation stops existing automatic schedules from sending',async()=>{
  const f=fixture();await f.enroll();f.setAutomatic(false);await f.deliver();assert.equal(f.submissions.length,0);
});
test('regular invoices enroll only after 30 days, with no extra grace week',async()=>{
  const f=fixture(); await f.enroll({narration:'PAYMENT WITHIN 25 DAYS',invoiceDate:'2026-09-11'});
  assert.equal(f.tables.invoice_followup_pipelines.length,1);
  assert.equal(f.tables.invoice_followup_pipelines[0].payment_category,'regular_credit');
  const g=fixture(); await g.enroll({narration:'PAYMENT WITHIN 25 DAYS',invoiceDate:'2026-09-12'});
  assert.equal(g.tables.invoice_followup_pipelines.length,0);
});

test('a pending category migration does not interrupt existing RTGS reminders',async()=>{
  const f=fixture({legacyCategories:true});
  await f.enroll();
  const response=await f.enroll({narration:'Regular credit',invoiceDate:'2026-09-01'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).regularCreditMigrationRequired,true);
  assert.equal(f.tables.invoice_followup_pipelines.length,1);
  await f.deliver();
  assert.equal(f.submissions.length,1);
});

test('future, ambiguous and non-sales invoices never enroll automatically',async()=>{
  for(const values of [{invoiceDate:'2099-10-12'},{narration:'ADVANCE RTGS SAME DAY RTGS'},{invoiceEvidenceAmbiguous:true},{sourceVoucherType:'Debit Note'},{narration:'Cash discount recovery against invoice INV. Source narration: ADVANCE RTGS'}]){const f=fixture();await f.enroll(values);assert.equal(f.tables.invoice_followup_pipelines.length,0);}
});
