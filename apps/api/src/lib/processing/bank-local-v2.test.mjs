import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeLocalBankEnvelope, contextDigest, processLocalBankV2 } from './bank-local-v2.mjs';
import { prepareLocalPreview } from './bank-local-preview.mjs';

const envelope = { pipelineVersion: 2, jobId: 'job', commandId: 'command', markdown: 'private document',
  sourceHash: 'a'.repeat(64), identity: { installationId: 'installation' },
  ledgerNames: ['Bank', 'Customer Z', 'Customer A'], bankAccountCandidates: [{ ledgerName: 'Bank', accountNumber: '1234' }] };
envelope.contextHash = contextDigest(envelope);
const ai = { data: { account: { accountNumber: '1234' }, openingBalance: 100,
  transactions: [{ date: '2026-09-01', description: 'Receipt', credit: 20, balance: 120, suggestedLedgerName: 'Customer A', suggestionConfidence: 0.9 }] },
  aiMs: 10, coverage: { complete: true, sourceRows: 1 } };
function setup(overrides = {}) {
  const calls = [], notices = [];
  const store = {
    claim: async () => { calls.push('claim'); return { state: 'accepted', revision: 2 }; },
    finalize: async (_e, digest, prepared) => { calls.push('finalize'); assert.equal(prepared.rows.length, 1); return { state: 'completed', importId: 'import', revision: 3, digest }; },
    fail: async () => { calls.push('fail'); },
    checkpoint: async (_e, _digest, prepared) => {
      calls.push('checkpoint');
      for (const key of ['markdown','ledgerNames','bankAccountCandidates','token']) assert.equal(Object.hasOwn(prepared, key), false);
    }, ...overrides,
  };
  return { calls, notices, store, run: extra => processLocalBankV2({ envelope, store,
    analyze: async input => { calls.push('ai'); assert.deepEqual(input, { markdown: envelope.markdown, ledgerNames: envelope.ledgerNames,
      bankAccountCandidates: envelope.bankAccountCandidates, traceId: envelope.commandId }); return structuredClone(ai); },
    notify: async (type, data) => { notices.push({ type, data }); if (type === 'bank_job_completed') assert.ok(calls.includes('finalize')); },
    sleep: async () => {}, ...extra }) };
}

test('v2 preserves complete ordered AI inputs and does one AI invocation before final commit', async () => {
  const f = setup(); const result = await f.run();
  assert.equal(result.state, 'completed'); assert.deepEqual(f.calls, ['claim','ai','finalize']);
  assert.equal(f.notices.at(-1).type, 'bank_job_completed');
});
test('compressed envelope validates context digest without sorting or dropping ledger names', () => {
  assert.deepEqual(decodeLocalBankEnvelope(gzipSync(JSON.stringify(envelope))), envelope);
  assert.throws(() => decodeLocalBankEnvelope(gzipSync(JSON.stringify({ ...envelope, ledgerNames: [...envelope.ledgerNames].reverse() }))), /context hash/);
});
for (const state of ['completed','analyzing','cancelled','failed','busy']) test(`a ${state} claim cannot start AI again`, async () => {
  const f = setup({ claim: async () => ({ state }) });
  assert.equal((await f.run()).state, state); assert.deepEqual(f.calls, []);
});
test('transient finalization failure retries saving, not AI', async () => {
  const f = setup(); const finalize = f.store.finalize; let failures = 2;
  f.store.finalize = async (...args) => { if (failures-- > 0) throw Object.assign(new Error('temporary'), { code: '40001' }); return finalize(...args); };
  assert.equal((await f.run()).state, 'completed'); assert.equal(f.calls.filter(x => x === 'ai').length, 1);
});
test('after three save retries, checkpoint receives structured result only', async () => {
  let attempts = 0; const f = setup({ finalize: async () => { attempts++; throw Object.assign(new Error('temporary'), { status: 503 }); } });
  assert.equal((await f.run()).state, 'recovery'); assert.equal(attempts, 4);
  assert.deepEqual(f.calls, ['claim','ai','checkpoint']); assert.ok(!f.notices.some(x => x.type === 'bank_job_completed'));
});
test('permanent save conflict is not retried or checkpointed', async () => {
  const f = setup({ finalize: async () => { throw Object.assign(new Error('conflict'), { code: '23505' }); } });
  await assert.rejects(f.run(), /conflict/); assert.deepEqual(f.calls, ['claim','ai']);
});
test('lost notifications do not invalidate a committed result', async () => {
  const f = setup(); assert.equal((await f.run({ notify: async () => { throw new Error('offline'); } })).state, 'completed');
});
test('failed progress delivery cannot prevent AI, discard its output, or change a completed result', async () => {
  const f = setup();
  assert.equal((await f.run({ progress: async () => { throw new Error('closed stream'); } })).state, 'completed');
  assert.deepEqual(f.calls, ['claim','ai','finalize']);
});
test('failed checkpoint reports uncertainty and never silently repeats AI', async () => {
  const f = setup({ finalize: async () => { throw Object.assign(new Error('temporary'), { status: 503 }); }, checkpoint: async () => { throw new Error('offline'); } });
  await assert.rejects(f.run(), { code: 'RESULT_NOT_DURABLE' }); assert.equal(f.calls.filter(x => x === 'ai').length, 1);
});
test('aborting during AI prevents any finalization', async () => {
  const controller = new AbortController(); const f = setup();
  await assert.rejects(f.run({ signal: controller.signal, analyze: async () => { controller.abort(); return structuredClone(ai); } }), { name: 'AbortError' });
  assert.deepEqual(f.calls, ['claim','fail']);
});
test('invalid coverage preserves manual review and defers ledger suggestions', () => {
  const result = prepareLocalPreview({ data: ai.data, diagnostics: { coverage: { complete: false, sourceRows: 2 } } }, envelope.ledgerNames);
  assert.equal(result.extractionIncomplete, true); assert.equal(result.rows[0].suggested_ledger_name, null);
  assert.equal(result.rows[0].raw_payload.aiLedgerRecommendation.status, 'deferred');
});
