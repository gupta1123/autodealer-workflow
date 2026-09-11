import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BANK_V2_FUNCTIONS,BANK_TEAM_FUNCTIONS,bankV2SchemaReady,createBankV2Readiness} from './bank-local-v2-readiness.mjs';
function schema() { return {paths:{'/bank_local_pipeline_runs':{},'/bank_local_pipeline_checkpoints':{},
  ...Object.fromEntries(Object.entries(BANK_V2_FUNCTIONS).map(([name,args])=>[
    `/rpc/bank_local_v2_${name}`,{post:{parameters:[{in:'body',schema:{properties:Object.fromEntries(args.map(a=>[a,{}]))}}]}}
  ]))}}; }
test('team mode requires the shared document authority functions before admission',()=>{
 const s=schema();assert.equal(bankV2SchemaReady(s,true),false);s.paths['/access_bank_document_jobs']={};
 for(const [name,args] of Object.entries(BANK_TEAM_FUNCTIONS))s.paths[`/rpc/${name}`]={post:{parameters:[{in:'body',schema:{properties:Object.fromEntries(args.map(a=>[a,{}]))}}]}};
 assert.equal(bankV2SchemaReady(s,true),true);delete s.paths['/rpc/access_assert_bank_document'];assert.equal(bankV2SchemaReady(s,true),false);
});
test('requires every installed function, signature and table',()=>{
  assert.equal(bankV2SchemaReady(schema()),true);
  for(const name of Object.keys(BANK_V2_FUNCTIONS)) {const s=schema();delete s.paths[`/rpc/bank_local_v2_${name}`];assert.equal(bankV2SchemaReady(s),false);}
  const s=schema();delete s.paths['/rpc/bank_local_v2_claim'].post.parameters[0].schema.properties.p_identity;
  assert.equal(bankV2SchemaReady(s),false);assert.equal(bankV2SchemaReady({}),false);
});
test('coalesces reads, caches success, refreshes and fails closed',async()=>{
  let calls=0,time=0,fail=false;
  const ready=createBankV2Readiness({now:()=>time,fetchImpl:async()=>{calls++;if(fail)throw Error();return Response.json(schema());}});
  assert.deepEqual(await Promise.all([ready('http://fixture','key'),ready('http://fixture','key')]),[true,true]);
  assert.equal(calls,1);await ready('http://fixture','key');assert.equal(calls,1);
  time=300001;fail=true;assert.equal(await ready('http://fixture','key'),false);assert.equal(calls,2);
  fail=false;time+=10001;assert.equal(await ready('http://fixture','key'),true);
  assert.equal(await ready(null,'key'),false);
});
