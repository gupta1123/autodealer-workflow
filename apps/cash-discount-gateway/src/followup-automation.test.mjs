import test from 'node:test';
import assert from 'node:assert/strict';
import {startFollowupAutomation} from './followup-automation.mjs';

test('background cycle checks each invoice before sending, in sequence',async()=>{
  const events=[];
  const runner=startFollowupAutomation({contexts:async()=>[{}],scan:async()=>{events.push('scan');return{};},reconcile:async()=>[{id:1},{id:2}],read:async(_,task)=>{events.push(`check:${task.id}`);return{amount:task.id};},deliver:async(_,task,evidence)=>{assert.equal(evidence.amount,task.id);events.push(`send:${task.id}`);}});
  try{await runner.tick();assert.deepEqual(events,['scan','check:1','send:1','check:2','send:2']);}finally{runner.stop();}
});
test('offline or failed checks prevent sending',async()=>{
  let sent=0;
  const runner=startFollowupAutomation({contexts:async()=>[{}],scan:async()=>({}),reconcile:async()=>[{id:1}],read:async()=>{throw Error('offline');},deliver:async()=>sent++,report:()=>{}});
  try{await runner.tick();assert.equal(sent,0);}finally{runner.stop();}
});
test('overlapping ticks cannot submit duplicate work',async()=>{
  let finish;let scans=0;
  const runner=startFollowupAutomation({contexts:async()=>[{}],scan:async()=>{scans++;await new Promise(resolve=>finish=resolve);return{};},reconcile:async()=>[],read:async()=>{},deliver:async()=>{}});
  try{const first=runner.tick();await new Promise(resolve=>setImmediate(resolve));await runner.tick();assert.equal(scans,1);finish();await first;}finally{runner.stop();}
});
test('stopping the worker prevents subsequent ticks',async()=>{
  let calls=0;
  const runner=startFollowupAutomation({contexts:async()=>{calls++;return[];},scan:async()=>{},reconcile:async()=>[],read:async()=>{},deliver:async()=>{}});
  runner.stop();await runner.tick();assert.equal(calls,0);
});
