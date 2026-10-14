import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalAgentRuntime} from './runtime.mjs';
import {financialYearRange} from './receivables.mjs';
function runtime(check,statePatch={}) {
  const agent=Object.create(LocalAgentRuntime.prototype);
  agent.activeIdentity={organizationId:'org',installationId:'install',companyGuid:'guid',companyName:'Company',financialYear:'2026-27'};
  agent.storage={call:async()=>({status:'ready',financialYear:financialYearRange('2026-27').label,...statePatch})};
  agent.receivables={checkForChanges:check,loadSnapshot:async()=>({allBills:()=>[],recordsFor:()=>({})})};
  agent.directGateway={invoke:async()=>{}};
  return agent;
}
test('automatic discovery refuses a busy or backed-off dues check',async()=>{
  await assert.rejects(runtime(async()=>null).preparedReceivablesFor({companyName:'Company',financialYear:'2026-27',requireFresh:true}),/still being verified/);
});
test('automatic discovery refuses unresolved deletion evidence and failed checks',async()=>{
  await assert.rejects(runtime(async()=>({changed:0}),{pendingFullBillCheck:true}).preparedReceivablesFor({companyName:'Company',requireFresh:true}),/still being verified/);
  await assert.rejects(runtime(async()=>{throw Error('Tally offline');}).preparedReceivablesFor({companyName:'Company',requireFresh:true}),/Tally offline/);
});
test('automatic discovery returns dues only after a successful current check',async()=>{
  const result=await runtime(async()=>({changed:0})).preparedReceivablesFor({companyName:'Company',financialYear:'2026-27',requireFresh:true});
  assert.deepEqual(await result.allBills(),[]);
});
