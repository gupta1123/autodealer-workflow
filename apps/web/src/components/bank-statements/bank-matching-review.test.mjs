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

test('posting status renders duplicate evidence before the bill workflow and distinguishes verified allocations', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  let cell;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.getText(ast).includes('className="posting-status-cell')) cell = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(cell);
  const helpers = ['formatVerifiedBillAllocations', 'outgoingVerificationFromCommand'].map(name =>
    ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name).getText(ast)
  ).join('\n');
  const context = { React, formatCurrencyAmount: String };
  const render = vm.runInNewContext(ts.transpileModule(helpers + `
    (result, posted = false) => {
      const tallyPresence = outgoingVerificationFromCommand({ status: "succeeded", result });
      const transaction = { id: "row" };
      const postedReviewIds = new Set(posted ? ["row"] : []);
      return (${cell.getText(ast)});
    }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context);
  const html = (row, posted) => renderToStaticMarkup(render(row, posted));
  const found = { verificationStatus: 'found', voucherNumber: '27' };
  assert.match(html(found), /Already entered in Tally/);
  assert.doesNotMatch(html(found), /On Account/);
  assert.match(html({ ...found, billAllocations: [] }, true), /Posted successfully.*On Account/s);
  assert.match(html({ ...found, billAllocations: [{ referenceName: 'INV-9', amount: 150 }, { billType: 'Advance', referenceName: 'ADV-1', amount: 50 }] }), /INV-9.*150.*Advance.*50/);
  assert.match(html({ verificationStatus: 'ambiguous', matches: [{ voucherNumber: '55' }] }), /Possible duplicate.*Voucher 55/s);
  assert.match(html({ verificationStatus: 'ambiguous' }), /Review before posting/);
  assert.match(html({ verificationStatus: 'unchecked' }), /Unchecked/);
});

test('live Tally subgroup ledgers qualify for bills by their root group and bank direction', () => {
  const names = ['normalizeName', 'normalizeLiveLedgerMasters', 'masterParentDescendsFromGroupMap',
    'findLedgerByNormalizedName', 'getSelectedLedger', 'parseNumber', 'isSuspenseLedgerName', 'getPartyBillMatchContext'];
  const code = names.map(name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === name).getText(ast)).join('\n');
  const api = vm.runInNewContext(ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText +
    '\n({normalizeLiveLedgerMasters,getPartyBillMatchContext})', {ledgerMasterIndexCache:new WeakMap()});
  const groups = [{name:'Unknown',parent:'Sundry Debtors'}, {name:'SCRAP',parent:'Transport'}, {name:'Transport',parent:'Sundry Creditors'}];
  const ledgers = api.normalizeLiveLedgerMasters([{name:'Kadam Traders',parent:'Unknown'},
    {name:'M P Karnataka Transport',parent:'SCRAP'}, {name:'Loan',parent:'Bank OD Account'},
    {name:'Disabled',parent:'Unknown',billWiseEnabled:false}], groups);
  const check = (ledger, payment=false) => api.getPartyBillMatchContext({
    selectedLedgerName:ledger,creditAmount:payment?0:100,debitAmount:payment?100:0, description:'NEFT'
  }, ledgers);
  assert.equal(check('Kadam Traders').eligible,true);
  assert.equal(check('M P Karnataka Transport', true).eligible,true);
  assert.equal(check('Kadam Traders',true).eligible,false);
  assert.equal(check('Disabled').eligible,false);
  assert.equal(check('Loan',true).eligible,false);
  assert.equal(check('Suspense').eligible,false);
  assert.match(source,/const masters = normalizeLiveLedgerMasters\(\s*payload\.ledgers/);
});
