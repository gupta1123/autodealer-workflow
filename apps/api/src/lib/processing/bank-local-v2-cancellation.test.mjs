import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {cancellableFetch,watchBankAnalysis} from './bank-local-v2-cancellation.mjs';
test('cancellation aborts an active transport without modifying request body or headers',async()=>{
  const controller=new AbortController(),chunk=new AbortController();let captured;
  const fetcher=cancellableFetch(async(_url,options)=>{captured=options;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));},controller.signal);
  const pending=fetcher('http://fixture',{body:'unchanged',headers:{test:'same'},signal:chunk.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(captured.body,'unchanged');assert.deepEqual(captured.headers,{test:'same'});
  assert.equal(chunk.signal.aborted,false);
});
test('socket cancellation is checked durably, ignores other jobs, and cleans up',async()=>{
  let emit,reads=0,stopped=0,state='analyzing';
  const control=watchBankAnalysis({identity:{ownerUserId:'owner',connectionId:'connection'},jobId:'job',
    subscribe:(_o,_c,event,status)=>{emit=event;status(true);return()=>{stopped++;};},
    readStatus:async()=>{reads++;return{state};}});
  emit({jobId:'other',type:'bank_job_cancelled'});await delay(0);assert.equal(reads,0);
  emit({jobId:'job',type:'bank_job_cancelled'});await delay(0);assert.equal(control.signal.aborted,false);
  state='cancelled';emit({jobId:'job',type:'bank_job_cancelled'});await delay(0);assert.equal(control.signal.aborted,true);
  control.stop();assert.equal(stopped,1);
});
test('offline status fallback cancels, whereas online connections do not poll',async()=>{
  let online,reads=0;
  const control=watchBankAnalysis({identity:{ownerUserId:'o',connectionId:'c'},jobId:'j',pollMs:5,
    subscribe:(_o,_c,_event,status)=>{online=status;status(true);return()=>{};},readStatus:async()=>{reads++;return{state:'cancelled'};}});
  await delay(20);assert.equal(reads,0);online(false);await delay(20);
  assert.equal(control.signal.aborted,true);control.stop();
});
test('organization access notification durably rechecks a running AI job and stops on revocation',async()=>{
 let changed,disposed=0,reads=0;
 const control=watchBankAnalysis({identity:{organizationId:'org',ownerUserId:'o',connectionId:'c'},jobId:'j',pollMs:5,
  subscribe:(_o,_c,_event,status)=>{status(true);return()=>{disposed++;};},
  subscribeAccess:(org,event,status)=>{assert.equal(org,'org');changed=event;status(true);return()=>{disposed++;};},
  readStatus:async()=>{reads++;throw {code:'42501'};}});
 await delay(15);assert.equal(reads,0);changed();await delay(0);assert.equal(control.signal.aborted,true);
 control.stop();assert.equal(disposed,2);
});
