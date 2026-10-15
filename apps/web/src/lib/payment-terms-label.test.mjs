import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as shared from '../../../tally-bridge/src/collections-analysis/collections-query.mjs';

function compile(url, imports = {}) {
  const javascript = ts.transpileModule(fs.readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', javascript)(name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { paymentTermsLabel } = compile(new URL('./payment-terms-label.ts', import.meta.url));
const { fetchCollectionsPage } = compile(new URL('../components/collections/collections-source.ts', import.meta.url), {
  react: {}, '@autodealer/shared/lib/collections-query': shared,
});

test('terms explain when payment is required, including older narration-only rows', () => {
  assert.equal(paymentTermsLabel({ paymentCategory: 'advance_rtgs' }).label, 'Advance RTGS · Before invoice date');
  assert.equal(paymentTermsLabel({ paymentCategory: 'same_day_rtgs' }).label, 'Same-day RTGS · On invoice date');
  assert.equal(paymentTermsLabel({ narration: 'PAYMENT WITHIN 25 DAYS' }).label, 'Regular credit · Within 30 days');
  assert.equal(paymentTermsLabel({ narration: 'same-day r.t.g.s.' }).name, 'Same-day RTGS');
  assert.equal(paymentTermsLabel({ narration: 'ADVANCE RTGS SAME DAY RTGS' }).name, 'Needs review');
});

test('installed connector pages obtain terms in one bounded batch and join by invoice id', async () => {
  const calls = [];
  const result = await fetchCollectionsPage({ paged: true, dashboardId: 'held' }, { view: 'followUps', page: 8, pageSize: 100 }, async (operation, payload) => {
    calls.push({ operation, payload });
    if (operation === 'collections_query') return { total: 1943, page: 8, pageSize: 100, pageCount: 20, rows: [{ id: 'advance', ageLabel: '1 day overdue' }, { id: 'same-day', ageLabel: '2 days overdue' }] };
    return { rows: [{ id: 'same-day', paymentCategory: 'same_day_rtgs', narration: 'SAME DAY RTGS' }, { id: 'advance', paymentCategory: 'advance_rtgs', narration: 'ADVANCE RTGS' }] };
  });
  assert.deepEqual(calls[1], { operation: 'collections_rows', payload: { dashboardId: 'held', view: 'followUps', ids: ['advance', 'same-day'] } });
  assert.equal(calls.length, 2);
  assert.equal(result.total, 1943);
  assert.equal(result.page, 8);
  assert.equal(paymentTermsLabel(result.rows[0]).name, 'Advance RTGS');
  assert.equal(paymentTermsLabel(result.rows[1]).name, 'Same-day RTGS');
  assert.equal(result.rows[0].ageLabel, '1 day overdue');
});

test('pages carrying terms need no additional detail request', async () => {
  let calls = 0;
  const result = await fetchCollectionsPage({ paged: true, dashboardId: 'held' }, { view: 'followUps' }, async () => {
    calls++;
    return { total: 1, page: 1, pageSize: 100, pageCount: 1, rows: [{ id: 'regular', paymentCategory: null, narration: 'Regular credit' }] };
  });
  assert.equal(calls, 1);
  assert.equal(paymentTermsLabel(result.rows[0]).name, 'Regular credit');
});

test('missing connector details cannot silently label an RTGS invoice as regular', async () => {
  await assert.rejects(fetchCollectionsPage({ paged: true, dashboardId: 'held' }, { view: 'followUps' }, async operation => operation === 'collections_query'
    ? { total: 1, rows: [{ id: 'missing' }] }
    : { rows: [] }), /Payment terms could not be loaded/);
});


test('older connectors cannot silently ignore a selected payment type', async () => {
  await assert.rejects(fetchCollectionsPage({paged:true,dashboardId:'old'}, {view:'followUps',paymentType:'same_day_rtgs'}, async()=>({total:200,rows:[]})),/1.2.35 or later/);
});

test('current connectors return filtered totals and do not need extra detail reads', async () => {
  let calls=0;
  const result=await fetchCollectionsPage({paged:true,dashboardId:'new'}, {view:'followUps',paymentType:'advance_rtgs'}, async(operation,payload)=>{
    calls++;assert.equal(payload.query.paymentType,'advance_rtgs');
    return {total:1,paymentType:'advance_rtgs',rows:[{id:'a',paymentCategory:'advance_rtgs',narration:'ADVANCE RTGS'}]};
  });
  assert.equal(calls,1);assert.equal(result.total,1);assert.equal(result.rows[0].id,'a');
});
