import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('./bank-queue-fetch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Request,Response,AbortSignal,URL,Date,console});
const make=options=>exports.createBankQueueFetch({warn:()=>{},...options});
test('a stalled read is retried once and returns its complete body',async()=>{
 let calls=0;
 const fetch=make({fetchImpl:async()=>{if(++calls===1)throw new DOMException('Timed out','TimeoutError');return Response.json({ok:true});}});
 assert.deepEqual(await (await fetch('https://example.com/rest/v1/groups')).json(),{ok:true});assert.equal(calls,2);
});
test('gateway errors on reads are retried, while permission errors are returned',async()=>{
 for(const status of [403,503]){let calls=0;const fetch=make({fetchImpl:async()=>new Response('body',{status:++calls===1?status:200})});assert.equal((await fetch('https://example.com/masters')).status,status===403?403:200);assert.equal(calls,status===403?1:2);}
});
test('an interrupted command RPC is never replayed',async()=>{
 let calls=0;const fetch=make({fetchImpl:async()=>{calls++;throw Error('network failure');}});
 await assert.rejects(fetch('https://example.com/rpc/admit',{method:'POST'}),/network failure/);assert.equal(calls,1);
});
test('the total budget prevents another attempt after the deadline',async()=>{
 let time=0,calls=0;const fetch=make({now:()=>time,budgetMs:1000,fetchImpl:async()=>{calls++;time=1001;throw Error('timeout');}});
 await assert.rejects(fetch('https://example.com/masters'),/timeout/);assert.equal(calls,1);
});
test('body transfer failures are included in the read retry',async()=>{
 let calls=0;const fetch=make({fetchImpl:async()=>{calls++;return calls===1?{status:200,text:async()=>{throw Error('body interrupted');}}:new Response('complete');}});
 assert.equal(await (await fetch('https://example.com/masters')).text(),'complete');assert.equal(calls,2);
});
test('an aborted caller does not trigger a read retry',async()=>{
 const controller=new AbortController();let calls=0;
 const fetch=make({fetchImpl:async()=>{calls++;controller.abort();throw Error('aborted');}});
 await assert.rejects(fetch('https://example.com/masters',{signal:controller.signal}),/aborted/);assert.equal(calls,1);
});
