import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { handleLocalBankV2, BANK_LOCAL_V2_CONTENT_TYPE } from './bank-local-v2-http.mjs';
import { contextDigest } from './bank-local-v2.mjs';

function fixture() {
  const envelope = { pipelineVersion: 2, jobId: 'job', commandId: 'command', markdown: 'PRIVATE CONTENT',
    sourceHash: 'a'.repeat(64), identity: { ownerUserId: 'owner', connectionId: 'connection', installationId: 'installation' },
    ledgerNames: ['Bank', 'Customer'], bankAccountCandidates: [] };
  envelope.contextHash = contextDigest(envelope);
  const claims = { jobId: 'command', ownerUserId: 'owner', connectionId: 'connection' };
  const calls = [];
  const options = { verifyToken: () => claims,
    store: { claim: async () => { calls.push('claim'); return { state: 'accepted', revision: 2 }; },
      finalize: async () => { calls.push('finalize'); return { state: 'completed', importId: 'import', revision: 3 }; },
      fail: async () => {}, checkpoint: async () => {} },
    analyze: async () => { calls.push('ai'); return { data: { account: {}, transactions: [] }, coverage: { complete: true, sourceRows: 0 } }; },
  };
  return { envelope, claims, calls, options, request: () => new Request('http://localhost/result', {
    method: 'POST', headers: { Authorization: 'Bearer TEST', 'Content-Type': BANK_LOCAL_V2_CONTENT_TYPE }, body: gzipSync(JSON.stringify(envelope)),
  }) };
}

test('invalid token and token scope are rejected before any claim or AI', async () => {
  const f = fixture();
  assert.equal((await handleLocalBankV2(f.request(), { ...f.options, verifyToken: () => null })).status, 401);
  f.claims.connectionId = 'other';
  assert.equal((await handleLocalBankV2(f.request(), f.options)).status, 403);
  assert.deepEqual(f.calls, []);
});
test('stream reports completion only after commit and contains no private input', async () => {
  const f = fixture(); const response = await handleLocalBankV2(f.request(), f.options);
  const body = await response.text(); const messages = body.trim().split('\n').map(JSON.parse);
  assert.deepEqual(f.calls, ['claim','ai','finalize']);
  assert.equal(messages[0].type, 'ack'); assert.equal(messages.at(-1).state, 'completed');
  assert.equal(body.includes('PRIVATE CONTENT'), false); assert.equal(body.includes('ledgerNames'), false);
});
test('duplicate accepted request reads existing state without starting another AI call', async () => {
  const f = fixture(); f.options.store.claim = async () => ({ state: 'analyzing', revision: 2 });
  const response = await handleLocalBankV2(f.request(), f.options);
  assert.match(await response.text(), /"state":"analyzing"/); assert.deepEqual(f.calls, []);
});
test('disconnect after acceptance does not discard paid analysis or final saving', async () => {
  const f = fixture(); let release, committed;
  const wait = new Promise(r => { release = r; }); const saved = new Promise(r => { committed = r; });
  f.options.analyze = async () => { await wait; return { data: { account: {}, transactions: [] }, coverage: {} }; };
  f.options.store.finalize = async () => { committed(); return { state: 'completed', revision: 3 }; };
  const response = await handleLocalBankV2(f.request(), f.options);
  await response.body.cancel(); release(); await saved;
});
test('claim errors are sanitized and never echo database or document details', async () => {
  const f = fixture(); f.options.store.claim = async () => { throw Object.assign(new Error('PRIVATE CONTENT secret'), { code: '42501' }); };
  const body = await (await handleLocalBankV2(f.request(), f.options)).text();
  assert.match(body, /JOB_STATE_CONFLICT/); assert.equal(body.includes('secret'), false); assert.deepEqual(f.calls, []);
});
