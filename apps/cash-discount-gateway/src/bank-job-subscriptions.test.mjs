import test from 'node:test';import assert from 'node:assert/strict';
import {createScopedBankSubscriptions} from './bank-job-subscriptions.mjs';
const id='11111111-1111-1111-1111-111111111111';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let authorized=true,revision=1,state='preparing',callback,calls=0,unsubscribed=0,timer;
 const events=[];
 const broker=createScopedBankSubscriptions({
  authorize:async jobId=>{calls++;if(!authorized)throw Error('Revoked');return {jobId,importId:'import',ownerUserId:'creator',connectionId:'connection',revision,state};},
  subscribe:(owner,connection,event,online)=>{assert.equal(owner,'creator');assert.equal(connection,'connection');callback=event;online(true);return ()=>{unsubscribed++;};},
  send:event=>events.push(event),setTimer:fn=>{timer=fn;return 1;},clearTimer(){timer=undefined;},
 });
 return {broker,events,get calls(){return calls;},get unsubscribed(){return unsubscribed;},
  emit:jobId=>callback({jobId}),revoke(){authorized=false;},next(){revision++;state='completed';},timer:()=>timer?.()};
}
test('subscription sends only authorized durable job state, not raw shared-channel payloads',async()=>{
 const f=fixture();await f.broker.watch(id);assert.equal(f.calls,1);
 f.emit('another-company-job');await tick();assert.equal(f.calls,1);
 f.next();f.emit(id);await tick();assert.equal(f.calls,2);
 assert.equal(f.events.at(-1).type,'bank_job_completed');assert.equal(f.unsubscribed,1);f.broker.close();
});
test('revocation rechecked before delivery closes subscription without leaking new status',async()=>{
 const f=fixture();await f.broker.watch(id);f.revoke();f.next();f.emit(id);await tick();
 assert.ok(!f.events.some(e=>e.type==='bank_job_completed'));assert.equal(f.events.at(-1).online,false);assert.equal(f.unsubscribed,1);f.broker.close();
});
test('idle revocation and repeated watch stay bounded',async()=>{
 const f=fixture();await f.broker.watch(id);await f.broker.watch(id);assert.equal(f.calls,1);
 f.revoke();f.timer();await tick();assert.equal(f.unsubscribed,1);f.broker.close();
});
test('unsubscribe during pending authorization cannot attach a channel',async()=>{
 let resolve,subscribed=false;const broker=createScopedBankSubscriptions({authorize:()=>new Promise(r=>resolve=r),subscribe:()=>{subscribed=true;},send(){},setTimer:()=>1,clearTimer(){}});
 const pending=broker.watch(id);broker.unwatch(id);resolve({jobId:id,revision:1});await pending;assert.equal(subscribed,false);broker.close();
});
