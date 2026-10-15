import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForPacketRun } from './wait-for-packet-run.mjs';

test('healthy analysis keeps its turn beyond the old two-minute deadline', async () => {
  let clock = 0, reports = 0;
  const job = await waitForPacketRun('packet', {
    now: () => clock, pollMs: 30_000, reportMs: 120_000, staleMs: 1_200_000,
    sleep: async (ms) => { clock += ms; }, report: () => reports++,
    getJob: async () => ({ status: clock >= 360_000 ? 'succeeded' : 'running', locked_at: new Date(0).toISOString() }),
  });
  assert.equal(job.status, 'succeeded');
  assert.equal(clock, 360_000);
  assert.ok(reports >= 2);
});
test('queued retries, failures, cancellation and removed jobs release the worker', async () => {
  for (const status of ['queued', 'failed', 'cancelled', null]) {
    const row = status ? { status } : null;
    assert.equal(await waitForPacketRun('packet', {
      getJob: async () => row, sleep: async () => assert.fail('should not wait'),
      now: () => 0, pollMs: 1, staleMs: 100, reportMs: 10,
    }), row);
  }
});
test('an abandoned lease returns for stale recovery instead of blocking forever', async () => {
  let clock = 0;
  const job = await waitForPacketRun('packet', {
    getJob: async () => ({ status: 'running', locked_at: new Date(0).toISOString() }),
    now: () => clock, sleep: async (ms) => { clock += ms; }, pollMs: 10, staleMs: 100, reportMs: 30,
  });
  assert.equal(job.status, 'running');
  assert.equal(clock, 100);
});
test('lease refresh extends the wait while an analysis remains healthy', async () => {
  let clock = 0;
  const result = await waitForPacketRun('packet', {
    getJob: async () => ({ status: clock >= 250 ? 'succeeded' : 'running', locked_at: new Date(clock).toISOString() }),
    now: () => clock, sleep: async (ms) => { clock += ms; }, pollMs: 10, staleMs: 100, reportMs: 30,
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(clock, 250);
});
