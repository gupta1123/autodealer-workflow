import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankAccountCatalogue, bankAccountScopeKey } from './bank-account-catalogue.ts';

const scope = { connectionId: 'pc-1', companyName: 'Solution Nyx', companyGuid: 'nyx-guid', financialYear: '2026-27' };
const axis = { name: 'Axis Bank - 7440012233', parent: 'Bank Accounts', bankAccountNumber: '7440012233' };

test('bank discovery is scoped independently of any transaction candidate list and coalesces reads', async () => {
  const states = []; let calls = 0;
  const reader = createBankAccountCatalogue(async (selected, signal) => {
    calls++; assert.deepEqual(selected, scope); assert.equal(signal.aborted, false);
    return { companyName: 'Solution Nyx', bankLedgers: [axis] };
  }, state => states.push(state));
  const first = reader.load(scope), second = reader.load(scope);
  assert.equal(first, second);
  assert.deepEqual(await first, [axis]);
  await reader.load(scope);
  assert.equal(calls, 1);
  assert.equal(states.at(-1).loading, false);
  await reader.load(scope, true);
  assert.equal(calls, 2);
});

test('old company responses cannot overwrite the selected company and previous reads are cancelled', async () => {
  const states = [], reads = [];
  const reader = createBankAccountCatalogue((selected, signal) => new Promise(resolve => reads.push({ selected, signal, resolve })), state => states.push(state));
  const first = reader.load(scope);
  const rejected = assert.rejects(first, /abort|changed/i);
  const nextScope = { ...scope, connectionId: 'pc-2', companyGuid: 'kalika-guid', companyName: 'Kalika Steel' };
  const second = reader.load(nextScope);
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve({ companyName: 'Kalika Steel', bankLedgers: [{ name: 'Kalika Bank' }] });
  await second;
  reads[0].resolve({ companyName: 'Solution Nyx', bankLedgers: [axis] });
  await rejected;
  assert.equal(states.at(-1).scopeKey, bankAccountScopeKey(nextScope));
  assert.equal(states.at(-1).ledgers[0].name, 'Kalika Bank');
});

test('same company on a different PC or financial year has a distinct catalogue scope', async () => {
  const calls = [];
  const reader = createBankAccountCatalogue(async selected => { calls.push(selected); return { bankLedgers: [axis] }; }, () => {});
  for (const selected of [scope, { ...scope, financialYear: '2025-26' }, { ...scope, connectionId: 'pc-2' }]) await reader.load(selected);
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map(bankAccountScopeKey)).size, 3);
});

test('an unavailable read remains an error and can be explicitly retried', async () => {
  const states = []; let calls = 0;
  const reader = createBankAccountCatalogue(async () => {
    if (++calls === 1) throw new Error('Connector unavailable');
    return { bankLedgers: [axis] };
  }, state => states.push(state));
  await assert.rejects(reader.load(scope), /Connector unavailable/);
  assert.equal(states.at(-1).error, 'Connector unavailable');
  assert.deepEqual(await reader.load(scope), [axis]);
  assert.equal(states.at(-1).error, '');
});

test('wrong-company replies and failed Tally exports are not accepted as an empty successful catalogue', async () => {
  for (const result of [{ companyName: 'Another company', bankLedgers: [axis] },
    { companyName: 'Solution Nyx', bankLedgers: [], errors: [{ error: 'Tally read failed' }] }]) {
    const states = [];
    const reader = createBankAccountCatalogue(async () => result, state => states.push(state));
    await assert.rejects(reader.load(scope));
    assert.ok(states.at(-1).error);
    assert.equal(states.at(-1).ledgers.length, 0);
  }
});

test('unmount or access revocation aborts a read and prevents publishing its result', async () => {
  let resolve, signal; const states = [];
  const reader = createBankAccountCatalogue((_scope, activeSignal) => {
    signal = activeSignal; return new Promise(done => { resolve = done; });
  }, state => states.push(state));
  const pending = reader.load(scope);
  const rejected = assert.rejects(pending, /abort/i);
  reader.cancel();
  resolve({ bankLedgers: [axis] });
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(states.length, 1);
});
