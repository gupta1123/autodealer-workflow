import assert from "node:assert/strict";
import test from "node:test";
import { cashDiscountReadContext, checkReadBudget, readBoundedXml, createTallyScheduler, createCashDiscountResultCache } from "./cash-discount-runtime.mjs";
import { collectCashDiscountCustomerEvidence, fetchCustomerOpenBillsFromTally } from "./bridge.mjs";

test("XML byte limit applies to chunked bodies without Content-Length", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(11)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readBoundedXml(response, 10), /size limit/);
  assert.equal(cancelled, true);
});

test("XML size guard rejects declared oversize before reading", async () => {
  await assert.rejects(readBoundedXml(new Response("small", { headers: { "content-length": "100" } }), 10), /size limit/);
  assert.equal(await readBoundedXml(new Response("<XML/>"), 10), "<XML/>");
});

test("cancelled and expired queued work never touches Tally", async () => {
  const queue = createTallyScheduler();
  let release;
  const first = queue.run(() => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const controller = new AbortController();
  const cancelled = queue.run(() => assert.fail("cancelled task ran"), { signal: controller.signal });
  const expired = queue.run(() => assert.fail("expired task ran"), { deadlineAt: Date.now() - 1 });
  const cancelledCheck = assert.rejects(cancelled);
  const expiredCheck = assert.rejects(expired, /time budget/);
  controller.abort();
  release();
  await Promise.all([first, cancelledCheck, expiredCheck]);
  assert.equal(queue.busy, false);
  assert.equal(await queue.run(() => 7), 7);
});

test("scan budget and abort propagate through async context", async () => {
  await assert.rejects(cashDiscountReadContext.run({ deadlineAt: Date.now() - 1 }, async () => checkReadBudget()), /time budget/);
});

test("failed customer stops further requests, preserving complete buckets", async () => {
  const calls = [];
  const result = await collectCashDiscountCustomerEvidence({}, {
    companyName: "Company A", ledgers: ["A", "B", "C"].map((name) => ({ name })),
    billExport: { xml: "", queryMode: "open_bills_first", batchCount: 1 },
    dateRange: { dateFrom: "2026-04-01", dateTo: "2026-08-31" },
  }, { readCustomer: async (_config, payload) => {
    const name = payload.ledgerNames[0];
    calls.push(name);
    if (name === "B") throw new Error("Tally timed out");
    return { result: { byLedger: { [name]: { openBills: [{ referenceName: "INV1", pendingAmount: 10 }], existingAdvances: [], rawCount: 1 } } } };
  } });
  assert.deepEqual(calls, ["A", "B"]);
  assert.equal(result.byLedger.A.complete, true);
  assert.equal(result.byLedger.B.complete, false);
  assert.equal(result.byLedger.C.complete, false);
  assert.equal(result.completedCount, 1);
  assert.equal(result.failures.length, 2);
});

test("carry-forward invoice evidence extends before the selected financial year", async () => {
  const calls = [];
  await fetchCustomerOpenBillsFromTally({ tallyUrl: "unused" }, {
    companyName: "Company A", ledgerNames: ["A"], dateFrom: "2026-04-01", asOfDate: "2026-08-31",
  }, { forceVoucherEvidence: true, billExport: { xml: '<BILL NAME="OLD"><LEDGERNAME>A</LEDGERNAME><BILLDATE>20250101</BILLDATE><BILLTYPE>New Ref</BILLTYPE><CLOSINGBALANCE>10</CLOSINGBALANCE></BILL>' },
    exportCollection: async (_url, options) => { calls.push(options); return "<ENVELOPE/>"; } });
  assert.equal(calls[0].dateFrom, "2025-01-01");
  assert.equal(calls[0].childOf, '"A"');
});

test("continuation cache is bounded, expires, returns copies, and isolates keys", () => {
  let now = 10;
  const cache = createCashDiscountResultCache({ maxBytes: 20, ttlMs: 100, now: () => now });
  cache.set("installation-A/company-GUID-A", { amount: 1 });
  assert.equal(cache.get("installation-B/company-GUID-A"), null);
  const copy = cache.get("installation-A/company-GUID-A");
  copy.amount = 99;
  assert.equal(cache.get("installation-A/company-GUID-A").amount, 1);
  cache.set("other-company", { amount: 2 });
  assert.equal(cache.get("installation-A/company-GUID-A"), null);
  now = 111;
  assert.equal(cache.get("other-company"), null);
  cache.set("key", { amount: 1 }); cache.clear();
  assert.equal(cache.get("key"), null);
});
