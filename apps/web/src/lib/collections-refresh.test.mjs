import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as shared from '../../../tally-bridge/src/collections-analysis/collections-query.mjs';

// Exercise the hook's effects, requests and cleanups without a browser DOM.
function harness(remote) {
  const slots = [], timers = new Map();
  let cursor = 0, timerId = 0, effects = [], recoveries = 0;
  const hooks = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        previous?.cleanup?.();
        const slot = slots[index] = { deps };
        effects.push(() => { slot.cleanup = effect(); });
      }
    },
  };
  const javascript = ts.transpileModule(fs.readFileSync(new URL('../components/collections/collections-source.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', 'window', javascript)(name => {
    if (name === 'react') return hooks;
    if (name === '@autodealer/shared/lib/collections-query') return shared;
    throw Error(name);
  }, compiledModule, compiledModule.exports, {
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    render(dashboard, query) {
      cursor = 0;
      const result = compiledModule.exports.useCollectionsList(dashboard, query, remote, () => { recoveries++; });
      for (const effect of effects.splice(0)) effect();
      return result;
    },
    async flush() {
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
    },
    get recoveries() { return recoveries; },
  };
}

const dashboard = () => ({ paged: true, dashboardId: 'connection|same-invoice-revision' });
const query = { view: 'followUps', paymentType: 'regular_credit', page: 1 };
const page = { total: 1, page: 1, pageCount: 1, paymentType: 'regular_credit', rows: [{ id: 'invoice', paymentCategory: 'regular_credit', narration: '' }] };

test('refresh retries an expired page even when its dashboard id and filter are unchanged', async () => {
  let granted = false, calls = 0;
  const h = harness(async () => { calls++; if (!granted) throw Error('These results have expired. Refresh to continue.'); return page; });
  const old = dashboard();
  h.render(old, query); await h.flush();
  assert.match(h.render(old, query).error, /expired/);
  assert.equal(h.recoveries, 1);
  granted = true;
  const refreshed = dashboard();
  h.render(refreshed, query); await h.flush();
  const result = h.render(refreshed, query);
  assert.equal(result.error, null);
  assert.deepEqual(result.page.rows, page.rows);
  assert.equal(calls, 2);
});

test('persistent expiry triggers one automatic recovery rather than a scan loop', async () => {
  const h = harness(async () => { throw Error('These results have expired. Refresh to continue.'); });
  h.render(dashboard(), query); await h.flush();
  const refreshed = dashboard();
  h.render(refreshed, query); await h.flush();
  assert.match(h.render(refreshed, query).error, /expired/);
  assert.equal(h.recoveries, 1);
});

test('a late failed request cannot erase a successful refreshed page', async () => {
  let rejectOld, calls = 0;
  const h = harness(() => ++calls === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve(page));
  h.render(dashboard(), query); await h.flush();
  const refreshed = dashboard();
  h.render(refreshed, query); await h.flush();
  rejectOld(Error('These results have expired. Refresh to continue.'));
  await h.flush();
  assert.equal(h.render(refreshed, query).error, null);
  assert.equal(h.recoveries, 0);
});

test('switching away from the list ignores its in-flight expired response', async () => {
  let rejectOld;
  const h = harness(() => new Promise((_, reject) => { rejectOld = reject; }));
  const held = dashboard();
  h.render(held, query); await h.flush();
  h.render(held, null);
  rejectOld(Error('These results have expired. Refresh to continue.')); await h.flush();
  assert.equal(h.render(held, null).error, null);
  assert.equal(h.recoveries, 0);
});
