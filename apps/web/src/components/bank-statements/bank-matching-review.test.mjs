import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=fs.readFileSync(new URL('./BankStatementsPage.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('bank.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['normalizeReviewTransaction','getReviewStatus','getReviewStatusLabel'];
const functions=names.map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name).getText(ast)).join('\n');
const exports={};vm.runInNewContext(ts.transpileModule(functions+'\nexports.normalize=normalizeReviewTransaction;exports.label=getReviewStatusLabel;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,crypto:{randomUUID:()=> 'fixture'},
 readRecommendation:t=>t.rawPayload?.aiLedgerRecommendation,fallbackReviewLedgerName:()=>'',findCompanySuspenseLedger:()=>({name:'Suspense'}),
 findLedgerByNormalizedName:(rows,name)=>rows.find(r=>r.name===name)||null,isSuspenseLedgerName:name=>/^suspense$/i.test(name||''),
 ledgerNameCandidateVariants:()=>[],standardLedgerNameForTransaction:()=>'',findLedgerByCandidates:()=>null,
});
const masters=[{name:'Suspense'},{name:'Balaji Traders'},{name:'Balaji Transport'}];
function row(recommendation,confirmedLedgerName){return exports.normalize({id:'row',transactionDate:'2026-10-07',description:'RTGS BALAJI',debitAmount:100,confirmedLedgerName,rawPayload:{aiLedgerRecommendation:recommendation}},masters);}
test('close matches display choices and require selection instead of silently posting Suspense',()=>{
 const r=row({status:'completed',matchType:'close_match',action:'use_suspense',ledgerName:null,candidateLedgerNames:['Balaji Traders','Balaji Transport']});
 assert.equal(exports.label(r),'Close match');assert.equal(r.requiresUserConfirmation,true);assert.deepEqual(Array.from(r.candidateLedgerNames),['Balaji Traders','Balaji Transport']);assert.equal(r.selectedLedgerName,'Suspense');
});
test('matching failure displays unavailable and requires a manual decision',()=>{
 const recommendation={status:'unavailable',matchType:'suspense',action:'use_suspense',ledgerName:null,reason:'Provider unavailable'};
 const r=row(recommendation);assert.equal(exports.label(r),'Matching unavailable');assert.equal(r.requiresUserConfirmation,true);assert.equal(r.suggestionReason,'Provider unavailable');
 const confirmed=row(recommendation,'Balaji Traders');assert.equal(confirmed.requiresUserConfirmation,false);assert.equal(exports.label(confirmed),'Ledger matched');
 const genuine=row({...recommendation,status:'completed'});assert.equal(exports.label(genuine),'In Suspense');assert.equal(genuine.requiresUserConfirmation,false);
});
