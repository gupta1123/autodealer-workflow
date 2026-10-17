import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./BankStatementsPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('bank.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'BankStatementsPage');
const helperNames = ['normalizeBankAccountNumber', 'getTallyBankLedgerAccountNumber'];
const helpers = helperNames.map(name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join('\n');
const declarations = ['bankLedgerOptions', 'exactBankLedgerMatch'].map(name => component.body.statements.find(
  n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name)
).getText(ast)).join('\n');
function select(ledgers, number = '7440012233') {
  const result = {};
  vm.runInNewContext(ts.transpileModule(helpers + '\n' + declarations + '\nresult.match = exactBankLedgerMatch; result.options = bankLedgerOptions;',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    result, useMemo: fn => fn(), bankAccountCatalogue: { ledgers }, account: { accountNumber: number }, selectedCompany: { id: 'nyx' },
    ledgerMasters: Array.from({ length: 217 }, (_, index) => ({ name: `Party candidate ${index}`, bankAccountNumber: number })),
  });
  return result;
}

test('the real page matches the Axis account from the independent bank list despite a nonempty transaction shortlist', () => {
  const result = select([{ name: 'Axis Bank - 7440012233', bankAccountNumber: '7440012233' }]);
  assert.equal(result.match, 'Axis Bank - 7440012233');
  assert.equal(result.options.length, 1);
});

test('a missing independent bank list cannot be filled or matched from transaction candidates', () => {
  const result = select([]);
  assert.equal(result.match, null);
  assert.equal(result.options.length, 0);
});

test('name-only Tally bank accounts match exactly, while multiple exact accounts require selection', () => {
  assert.equal(select([{ name: 'Axis Bank - 7440012233' }]).match, 'Axis Bank - 7440012233');
  assert.equal(select([{ name: 'Axis primary', bankAccountNumber: '7440012233' }, { name: 'Axis alternate', bankAccountNumber: '7440012233' }]).match, null);
  assert.equal(select([{ name: 'Axis Bank - 7440012234' }]).match, null);
});
