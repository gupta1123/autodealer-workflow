import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function compile(file, imports = {}) {
  const javascript = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', javascript)(name => {
    if (!(name in imports)) throw Error('Unexpected import '+name);
    return imports[name];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const {prepareLiveTallyCatalogue} = compile('./tally-purchase-posting.ts', {
  '@/lib/api-client': {},
  '@/lib/tally-company-selection': {},
  '@/lib/tally-purchase-live-envelope': compile('./tally-purchase-live-envelope.ts'),
});
const name = 'Transportation Inward @ 18.00%';
function catalogue() {
  return {source:'live_tally', companyName:'Company', masters:{
    ledgers:[...Array.from({length:100},(_,i)=>({name:`A general expense ${i}`,guid:`expense-${i}`,parent:'Direct Expenses'})), {name,guid:'transport-id',parent:'Expenses'}],
    groups:[], stockItems:[], units:[], godowns:[],
  }};
}

test('Transportation Inward reaches live validation even before any case selection', () => {
  const result = prepareLiveTallyCatalogue(catalogue());
  assert.ok(result.compactResult.masters.ledgers.some(row=>row.name===name));
});

test('the saved transportation selection survives a large catalogue and keeps its Tally identity', () => {
  const data=catalogue();
  data.masters.ledgers.unshift(...Array.from({length:100},(_,i)=>({name:`Freight ${i}`,guid:`freight-${i}`,parent:'Expenses'})));
  const result=prepareLiveTallyCatalogue(data,{freightLedgerName:name,lines:[]});
  const selected=result.compactResult.masters.ledgers.find(row=>row.name===name);
  assert.equal(selected.guid,'transport-id');
});
