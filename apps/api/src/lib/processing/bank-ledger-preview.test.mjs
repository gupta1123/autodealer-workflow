import test from 'node:test';import assert from 'node:assert/strict';
import {prepareLocalPreview} from './bank-local-preview.mjs';
import {contextDigest,processLocalBankV2} from './bank-local-v2.mjs';
const names=['Balaji Steel Traders','Balaji Steel Transport'];
const data={account:{accountNumber:'12345'},openingBalance:1000,transactions:[{transactionDate:'2026-10-07',description:'RTGS BALAJI STEEL',debitAmount:100,balanceAmount:900}]};
const close={mappingSource:'vector_ai_match',matchType:'close_match',ledgerName:null,candidateLedgerNames:names,confidence:0,reason:'Two plausible parties'};
function preview(result,extra={}){return prepareLocalPreview({data,diagnostics:{mode:'connector_anydoc_vector_v1',coverage:{complete:true,sourceRows:1},ledgerModel:'configured-ledger-model',ledgerRecommendations:result?[result]:[],...extra}},names);}
test('close matches retain candidates, source and actual ledger model without auto-selection',()=>{
 const p=preview(close),r=p.rows[0].raw_payload.aiLedgerRecommendation;
 assert.equal(r.matchType,'close_match');assert.deepEqual(r.candidateLedgerNames,names);assert.equal(r.ledgerName,null);
 assert.equal(r.model,'configured-ledger-model');assert.equal(r.source,'vector_ai_match');assert.equal(r.status,'completed');
 assert.equal(p.metadata.ledgerRecommendationIncompleteCount,0);
 assert.equal(p.metadata.extractionDiagnostics.localParsing.ledgerRecommendations,undefined);
});
test('unavailable matching stays unavailable while a genuine AI Suspense decision is completed',()=>{
 for(const result of [null,{...close,mappingSource:'none',reason:'AI unavailable'}]){
  const p=preview(result),r=p.rows[0].raw_payload.aiLedgerRecommendation;
  assert.equal(r.status,'unavailable');assert.equal(r.model,null);assert.equal(p.metadata.ledgerRecommendationIncompleteCount,1);assert.match(p.metadata.ledgerRecommendationError,/unavailable/);
 }
 const p=preview({...close,matchType:'suspense',candidateLedgerNames:[]});
 assert.equal(p.rows[0].raw_payload.aiLedgerRecommendation.status,'completed');assert.equal(p.metadata.ledgerRecommendationError,null);
});
test('direct matches must be active allowed names at sufficient confidence',()=>{
 const valid=preview({...close,matchType:'direct_match',ledgerName:names[0],confidence:0.95});assert.equal(valid.rows[0].suggested_ledger_name,names[0]);
 for(const result of [{...close,matchType:'direct_match',ledgerName:'Other company ledger',confidence:1},{...close,matchType:'direct_match',ledgerName:names[0],confidence:0.89}])assert.equal(preview(result).rows[0].suggested_ledger_name,null);
 const outside=preview({...close,candidateLedgerNames:[names[0],'Other company ledger']});assert.equal(outside.rows[0].raw_payload.aiLedgerRecommendation.matchType,'suspense');
});
test('invalid extraction still defers matching even when an AI decision is present',()=>{
 const p=preview(close,{coverage:{complete:false,sourceRows:2}});assert.equal(p.extractionIncomplete,true);assert.equal(p.rows[0].raw_payload.aiLedgerRecommendation.status,'deferred');
});
test('v2 finalization carries the structured decision through the real preparation path',async()=>{
 const envelope={pipelineVersion:2,schemaVersion:3,jobId:'j',commandId:'c',sourceHash:'a'.repeat(64),identity:{installationId:'pc'},ledgerNames:[],bankAccountCandidates:[],parsed:{account:{},transactions:[]},vectorCandidates:[names.map(ledgerName=>({ledgerName}))]};envelope.contextHash=contextDigest(envelope);
 let saved;
 await processLocalBankV2({envelope,analyze:async()=>({data,mode:'connector_anydoc_vector_v1',coverage:{complete:true,sourceRows:1},ledgerRecommendations:[close],ledgerModel:'actual-model',vectorCandidates:envelope.vectorCandidates}),store:{claim:async()=>({state:'accepted'}),finalize:async(_e,_d,prepared)=>{saved=prepared;return{state:'completed'};},fail:async()=>{throw Error('Unexpected failure');}}});
 assert.equal(saved.rows[0].raw_payload.aiLedgerRecommendation.matchType,'close_match');assert.equal(saved.rows[0].raw_payload.aiLedgerRecommendation.model,'actual-model');
});
