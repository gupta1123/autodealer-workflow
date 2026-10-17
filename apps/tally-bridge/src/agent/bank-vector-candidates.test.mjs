import test from 'node:test';import assert from 'node:assert/strict';
import {LocalAgentRuntime} from './runtime.mjs';
const identity={organizationId:'org',ownerUserId:'owner',connectionId:'connection',installationId:'pc',companyGuid:'guid',companyName:'Example',financialYear:'2026-27',sessionGeneration:1};
test('bank vector retrieval returns ten semantic candidates without adding lexical matches',async()=>{
 const rows=Array.from({length:12},(_,i)=>({guid:String(i),name:i===11?'Exact narration name':`Semantic ledger ${i}`}));
 const reads=[];let embedded;
 const runtime={activeIdentity:identity,storage:{call:async()=>rows},ledgerLookupCache:new Map(),ensureVectorIndex:async()=>{},requestSemanticEmbeddings:async q=>{embedded=q;return q.map(()=>[1]);},vectors:{query:async args=>{reads.push(args);return rows.slice(0,10).map((r,i)=>({id:r.guid,score:0.9-i/100}));}}};
 const result=await LocalAgentRuntime.prototype.suggestLedgerBatch.call(runtime,[{id:'row',name:'Exact narration name'}],{identity,vectorOnly:true,topK:10});
 assert.equal(reads[0].topK,10);assert.deepEqual(embedded,['Exact narration name']);assert.equal(result.row.suggestions.length,10);assert.equal(result.row.searchMode,'vector_only');assert.equal(result.row.deterministic.length,0);
 assert(!result.row.suggestions.some(s=>s.ledger.name==='Exact narration name'));
});
