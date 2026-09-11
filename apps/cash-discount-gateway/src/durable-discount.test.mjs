import test from 'node:test';import assert from 'node:assert/strict';
import {waitForDurableDiscount} from './durable-discount.mjs';
const ids={commandId:'11111111-1111-1111-1111-111111111111',connectionId:'22222222-2222-2222-2222-222222222222'};
test('durable wait observes saved status and never submits another write',async()=>{
 const states=['queued','claimed','succeeded'],paths=[],waits=[];
 const result=await waitForDurableDiscount({...ids,read:async path=>{paths.push(path);return {command:{status:states.shift()}};},wait:async ms=>waits.push(ms)});
 assert.equal(result.status,'succeeded');assert.equal(paths.length,3);assert.ok(paths.every(p=>p.endsWith('/commands/'+ids.commandId)));assert.deepEqual(waits,[2000,2000]);
});
test('missing authorization, uncertain results and cancellation stop notification polling',async()=>{
 for(const command of [null,{status:'failed',error:'Verify first'},{status:'cancelled'}])
  await assert.rejects(waitForDurableDiscount({...ids,read:async()=>({command}),wait:async()=>assert.fail('terminal state polled')}));
 const controller=new AbortController();controller.abort();let read=false;
 await assert.rejects(waitForDurableDiscount({...ids,signal:controller.signal,read:async()=>{read=true;}}));assert.equal(read,false);
});
test('gateway cannot fall back to an unrecorded live write for a team job',async()=>{
 const {readFile}=await import('node:fs/promises');const code=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 const start=code.indexOf('if(item.authority || prepared.durable) {',code.indexOf('if (item.phase === "revalidating")'));
 const stop=code.indexOf('item.commandPayload = prepared.commandPayload',start);
 const branch=code.slice(start,stop);assert.match(branch,/prepared\.durable/);assert.match(branch,/waitForDurableDiscount/);assert.match(branch,/return;/);
 assert.doesNotMatch(branch,/cash_discount_execute_debit_note/);
});
