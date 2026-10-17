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

function fixture({valid=true,storageError=false}={}) {
 const queries=[];
 const db={from(table){queries.push(table);assert.equal(table,'tally_connections','Retired endpoint must not read or enroll financial schedules');
  const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:valid?{bridge_token_hash:hash('bridge')}:null,error:storageError?{}:null})};return q;
 }};
 const route=compile('apps/api/src/app/api/collections/follow-ups/automatic/route.ts',{
  '@/lib/api/cors':{jsonWithCors:(_request,body,init={})=>Response.json(body,init)},
  '@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},'@/lib/tally/connections':{hashSecret:hash},
 });
 const request=(action,token='bridge')=>route.POST(new Request('http://test/automatic',{method:'POST',headers:{'content-type':'application/json',...(token?{'x-bridge-token':token}:{})},body:JSON.stringify({connectionId:'connection',action,id:'old-schedule',scan:{scanSummary:{complete:true}}})}));
 return {queries,request};
}
test('all old background actions return no work and cannot enroll or send',async()=>{
 const f=fixture();for(const action of ['context','reconcile','deliver']){
  const response=await f.request(action);assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.disabled,true);assert.deepEqual(body.contexts,[]);assert.deepEqual(body.tasks,[]);
 }
 assert.deepEqual(f.queries,['tally_connections','tally_connections','tally_connections']);
});
test('retired endpoint still requires valid connector authentication',async()=>{
 assert.equal((await fixture().request('deliver','wrong')).status,401);
 assert.equal((await fixture().request('deliver',null)).status,401);
 assert.equal((await fixture({valid:false}).request('deliver')).status,401);
 assert.equal((await fixture({storageError:true}).request('context')).status,503);
});
test('new, legacy and explicitly enabled settings all resolve to manual-only sending',async()=>{
 for(const value of [null,{}, {automatic:true,plan:{name:'Existing plan'}}, {automatic:false}]){
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:value===null?null:{value,revision:4},error:null})};
  const defaults=compile('apps/api/src/lib/followups/defaults.ts',{
   '@/lib/supabase/admin':{createSupabaseAdminClient:()=>({from:()=>q})},
   '@/lib/access/server':{AccessError:Error},'@autodealer/shared/lib/reminder-preset':{standardReminderPlan:()=>({name:'Default plan'})},
  });
  assert.equal(defaults.DEFAULT_REMINDER_SETTING.automatic,false);
  const result=await defaults.reminderDefaults('org');assert.equal(result.value.automatic,false);
  if(value?.plan)assert.deepEqual(result.value.plan,value.plan);
 }
});

test('settings reject enabling automatic sending and preserve manual template saves',async()=>{
 const saved=[];class AccessError extends Error{constructor(message,status=403){super(message);this.status=status;}}
 const route=compile('apps/api/src/app/api/settings/payment-reminders/route.ts',{
  '@/lib/access/server':{requirePermission:async()=>({organizationId:'org',member:{user_id:'user'}}),AccessError},
  '@/lib/access/route-boundary':{withTeamAccess:handler=>handler},
  '@/lib/api/cors':{jsonWithCors:(_request,body,init={})=>Response.json(body,init),optionsWithCors:()=>new Response()},
  '@/lib/supabase/admin':{createSupabaseAdminClient:()=>({rpc:async(_name,args)=>{saved.push(args);return {data:args.p_value,error:null};}})},
  '@/lib/followups/defaults':{REMINDER_SETTING:'payment-reminders',reminderDefaults:async()=>({value:{automatic:true}})},
  '@/lib/followups/messages':{reminderMessages:()=>[{key:'payment_reminder_v2',text:'Reminder'}]},
  '@autodealer/shared/lib/followup-pipeline':{validateReminderPlan:plan=>plan},
 });
 const send=automatic=>route.POST(new Request('http://test/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:1,automatic,onceTemplate:'payment_reminder_v2',plan:{stages:[{template:'payment_reminder_v2'}]}})}));
 assert.equal((await send(true)).status,400);assert.equal(saved.length,0);
 assert.equal((await send(undefined)).status,200);assert.equal(saved[0].p_value.automatic,false);
});
