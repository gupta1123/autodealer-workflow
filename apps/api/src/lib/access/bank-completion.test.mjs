import test from 'node:test';import assert from 'node:assert/strict';
import vm from 'node:vm';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(await readFile(new URL('./bank-completion.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({AccessError:class extends Error{}})});
const {bankCompletion,completeTeamBank}=exports;
test('uncertain posting cannot be acknowledged as successfully posted',()=>{
 for(const r of [{},{possibleDuplicateInTally:true,voucherId:'1'}])assert.equal(bankCompletion('post_bank_voucher',true,r,null).status,'needs_tally_review');
 assert.equal(bankCompletion('post_bank_voucher',false,{voucherId:'1'},'timeout').status,'needs_tally_review');
 assert.equal(bankCompletion('post_bank_voucher',true,{voucherId:'1'},null).status,'posted');
});
test('verification distinguishes found, ambiguous, missing and failed reads',()=>{
 for(const value of ['found','matched','verified'])assert.equal(bankCompletion('verify_bank_transaction',true,{verificationStatus:value},null).status,'verified');
 assert.equal(bankCompletion('verify_bank_transaction',true,{verificationStatus:'ambiguous'},null).status,'needs_tally_review');
 assert.equal(bankCompletion('verify_bank_transaction',true,{verificationStatus:'missing'},null).status,'missing_in_tally');
 assert.equal(bankCompletion('verify_bank_transaction',false,{},'error').status,'verification_failed');
});
test('one atomic callback RPC preserves conflicts for durable retry handling',async()=>{
 const calls=[];const input={commandId:'cmd',connectionId:'pc',bridgeTokenHash:'hash',type:'post_bank_voucher',success:true,result:{voucherId:'1'},error:null,
 db:{rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'cmd'}};}}};
 assert.equal((await completeTeamBank(input)).id,'cmd');assert.equal(calls.length,1);assert.equal(calls[0].name,'access_complete_bank_command');
 const conflict={code:'40001'};await assert.rejects(completeTeamBank({...input,db:{rpc:async()=>({error:conflict})}}),e=>e===conflict);
});
