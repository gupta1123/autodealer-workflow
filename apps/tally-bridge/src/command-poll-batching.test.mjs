import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('./bridge.mjs',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const cycleCode=section('async function runOnce(', '\nfunction cashDiscountGatewayUrl(');
const drainCode=section('async function drainPendingCommands(', '\nfunction decodeRealtimeFrame(');
function fixture(commands,{failSecondClaim=false}={}) {
  const queue=[...commands],claims=[],batches=[],events=[];
  const scope={MAX_COMMANDS_PER_CYCLE:50,DEFAULT_COMPANY_LIST_INTERVAL_MS:300000,Date,
    console:{log(){},warn(){},error(){}},normalizeLooseName:s=>String(s).toLowerCase(),
    receiveNextCommands:async(_config,limit)=>{claims.push(limit);if(failSecondClaim&&claims.length===2)throw Error('claim unavailable');return queue.splice(0,limit);},
    processClaimedCommands:async(_config,batch)=>{batches.push(Array.from(batch,c=>c.id));events.push('batch');},
    runCommand:async(_config,command)=>{events.push('single:'+command.id);},
    testTally:async()=>{events.push('heartbeat');return {tallyReachable:true,companyLoaded:true,companyName:'Company'};},
    fetchAvailableCompanies:async()=>[{companyName:'Company'}],sendHeartbeat:async()=>({connection:{id:'connection'}}),
  };
  vm.runInNewContext(cycleCode+'\n'+drainCode+'\nthis.cycle=runOnce;this.drain=drainPendingCommands;',scope);
  return {queue,claims,batches,events,cycle:()=>scope.cycle({tallyUrl:'mock'}),drain:()=>scope.drain({}, {})};
}
const bankCommands=count=>Array.from({length:count},(_,i)=>({id:'bank-'+i,commandType:'post_bank_voucher',payload:{}}));

test('fallback heartbeat groups twelve ready bank vouchers in one cycle',async()=>{
  const f=fixture(bankCommands(12));await f.cycle();
  assert.equal(f.queue.length,0);
  assert.deepEqual(f.batches,[bankCommands(12).map(c=>c.id)]);
  assert.equal(f.events.some(e=>e.startsWith('single:bank')),false);
});
test('fallback drain honors the fifty-command cycle budget',async()=>{
  const f=fixture(bankCommands(65));await f.cycle();
  assert.equal(f.batches.flat().length,50);assert.equal(f.queue.length,15);
  assert.ok(f.claims.every(limit=>limit>0&&limit<=50));
});
test('verified debit-note PDF is completed before the Tally heartbeat',async()=>{
  const f=fixture([{id:'pdf',commandType:'export_debit_note_pdf',payload:{}},...bankCommands(12)]);
  await f.cycle();assert.deepEqual(f.events.slice(0,2),['single:pdf','heartbeat']);
  assert.equal(f.queue.length,0);assert.equal(f.batches.flat().length,12);
});
test('early PDF work counts toward the same fifty-command cycle budget',async()=>{
  const f=fixture([{id:'pdf',commandType:'export_debit_note_pdf',payload:{}},...bankCommands(65)]);
  await f.cycle();assert.equal(f.batches.flat().length,49);assert.equal(f.queue.length,16);
});
test('a failed additional claim does not strand the already claimed bank command',async()=>{
  const f=fixture(bankCommands(12),{failSecondClaim:true});await f.cycle();
  assert.deepEqual(f.batches,[['bank-0']]);assert.equal(f.queue.length,11);
});
