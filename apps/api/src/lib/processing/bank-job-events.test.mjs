import test from 'node:test';
import assert from 'node:assert/strict';
import { compactBankJobEvent } from './bank-job-events.mjs';

test('bank broadcasts include compact status only, never accounting inputs', () => {
  assert.deepEqual(compactBankJobEvent('bank_job_completed', { jobId: 'job', importId: 'import', revision: 3, state: 'completed',
    markdown: 'secret', rows: [1], ledgerNames: ['private'], token: 'secret' }),
    { type: 'bank_job_completed', jobId: 'job', importId: 'import', revision: 3, state: 'completed' });
  assert.equal(compactBankJobEvent('rows', { jobId: 'job', revision: 3 }), null);
  assert.equal(compactBankJobEvent('bank_job_completed', { jobId: 'job' }), null);
});
