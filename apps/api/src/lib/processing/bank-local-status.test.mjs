import test from 'node:test';
import assert from 'node:assert/strict';
import { bankLocalStatus } from './bank-local-status.mjs';
const row = { id: 'import', processing_meta: { pipelineVersion: 2, selectedContext: { connectionId: 'pc', companyName: 'Company' }, preview: { transactions: ['private'] }, ledgerNames: ['private'] } };
test('compact v2 status excludes processing inputs and preview data', () => {
  const status = bankLocalStatus(row, { id: 'job', status: 'running', progress: 20 });
  assert.equal(status.processing, true);
  assert.equal(status.connectionId, 'pc');
  assert.equal(JSON.stringify(status).includes('private'), false);
});
test('missing v2 jobs fail closed instead of requesting a legacy paid replay', () => {
  const status = bankLocalStatus(row, null);
  assert.equal(status.processing, false);
  assert.equal(status.job.status, 'failed');
});
test('terminal jobs stop waiting and legacy imports do not enter v2', () => {
  for (const status of ['succeeded', 'failed', 'cancelled']) assert.equal(bankLocalStatus(row, { status }).processing, false);
  assert.equal(bankLocalStatus({ processing_meta: {} }, null), null);
});
