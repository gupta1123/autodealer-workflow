import test from 'node:test';import assert from 'node:assert/strict';
import {LocalAgentRuntime} from './runtime.mjs';
const identity={organizationId:'org',ownerUserId:'owner',connectionId:'connection',installationId:'pc',companyGuid:'guid',companyName:'Example',financialYear:'2026-27',sessionGeneration:1};
test('bank vector retrieval includes the full party name in narration ahead of semantic hits',async()=>{
 const rows=Array.from({length:12},(_,i)=>({guid:String(i),name:i===11?'Exact narration name':`Semantic ledger ${i}`}));
 const reads=[];let embedded;
 const runtime={activeIdentity:identity,storage:{call:async()=>rows},ledgerLookupCache:new Map(),ensureVectorIndex:async()=>{},requestSemanticEmbeddings:async q=>{embedded=q;return q.map(()=>[1]);},vectors:{query:async args=>{reads.push(args);return rows.slice(0,10).map((r,i)=>({id:r.guid,score:0.9-i/100}));}}};
 const result=await LocalAgentRuntime.prototype.suggestLedgerBatch.call(runtime,[{id:'row',name:'NEFT/123/Exact narration name/CR'}],{identity,vectorOnly:true,topK:10});
 assert.equal(reads[0].topK,10);assert.deepEqual(embedded,['NEFT/123/Exact narration name/CR']);assert.equal(result.row.suggestions.length,10);assert.equal(result.row.searchMode,'hybrid');assert.equal(result.row.deterministic.length,0);
 assert.equal(result.row.suggestions[0].ledger.name,'Exact narration name');
});
