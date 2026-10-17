import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./WorkspacePage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('WorkspacePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WorkspacePage');
const actions = ['handleCreateCaseDraft', 'startSmartSplitAnalysis'].map(name => component.body.statements.find(node =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name)
).getText(ast)).join('\n');

function setup() {
  const created = [], analysis = [], destinations = [], errors = [];
  const result = {};
  vm.runInNewContext(ts.transpileModule(actions + '\nresult.create = handleCreateCaseDraft; result.smartSplit = startSmartSplitAnalysis;',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    result, hasUploads: true, queuedUploads: ['document'], persistence: { savedCase: null }, draftCaseStatus: 'idle',
    setCaseDraftCreated() {}, setDraftCaseStatus() {}, setDraftCaseError: error => { if (error) errors.push(error); },
    updateSavedCase() {}, setDuplicateCaseNotice() {}, getDuplicateCaseFromError: () => null,
    createDraftCase: async params => { created.push(params); return { case: { id: 'case' } }; },
    enqueueCaseAnalysis: async (id, options) => { analysis.push({ id, ...options }); return { case: { id } }; },
    router: { replace: target => destinations.push(target) },
  });
  return { result, created, analysis, destinations, errors };
}

test('Create case works without a company field, remembered preference or Tally connection', async () => {
  const h = setup(); await h.result.create();
  assert.equal(h.errors.length, 0);
  assert.equal(h.created.length, 1);
  assert.deepEqual(Object.keys(h.created[0]), ['uploads']);
});

test('multi-document analysis creates the draft without a company choice and continues to analysis', async () => {
  const h = setup(); await h.result.smartSplit({ invoice: true });
  assert.equal(h.errors.length, 0);
  assert.deepEqual(Object.keys(h.created[0]), ['uploads']);
  assert.equal(h.analysis[0].analysisMode, 'smart_split');
  assert.deepEqual(h.destinations, ['/cases/case']);
});
