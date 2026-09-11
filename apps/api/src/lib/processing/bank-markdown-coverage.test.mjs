import test from "node:test";
import assert from "node:assert/strict";
import { inventoryBankMarkdown, verifyBankChunk } from "./bank-markdown-coverage.mjs";
import { matchBankMarkdown } from "./bank-markdown-ai.mjs";

const statement = (n = 150) => "Page 1 of 8\n|DATE|NARRATION|REFERENCE|DEBIT|CREDIT|BALANCE|\n|---|---|---|---|---|---|\n" +
  Array.from({ length: n }, (_, i) => `|01 Sep 2026|Test narration ${i+1}|REF${i+1}|10.00|-|${1000-(i+1)*10}.00|`).join("\n");
const output = rows => rows.map(source => ({ sourceRowId: source.id, transactionDate: "2026-09-01", description: `Test narration ${source.id}`,
  referenceNumber: `REF${source.id}`, debitAmount: 10, creditAmount: 0, balanceAmount: 1000-source.id*10 }));
const response = transactions => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ transactions }) } }] });
const logger = { info() {} };

test("SBI account metadata dates are context, not unresolved transactions", () => {
  const metadata = "|Account holder|Example Company|Statement date|08 Aug 2026|\n" +
    "|---|---|---|---|\n" +
    "|Account number|123456789|Statement period|08 Aug 2026 to 08 Aug 2026|\n" +
    "|Account type|Current Account|Branch / IFSC|Example / TEST0001|\n";
  const inventory = inventoryBankMarkdown(metadata + statement(10));
  assert.equal(inventory.verifiable, true);
  assert.equal(inventory.rows.length, 10);
  assert.ok(inventory.context.includes("Statement period|08 Aug 2026 to 08 Aug 2026"));
  assert.equal(verifyBankChunk(inventory.rows, output(inventory.rows)), true);
  assert.equal(verifyBankChunk(inventory.rows, output(inventory.rows).slice(1)), false);
  for (const extra of [
    "|Unknown field|08 Aug 2026|Amount|100.00|",
    "||08 Aug 2026|Unidentified receipt|100.00|",
  ]) {
    assert.equal(inventoryBankMarkdown(metadata + statement(10) + "\n" + extra).verifiable, false);
  }
});

test("source inventory keeps all 150 rows and real page boundaries", () => {
  const inventory = inventoryBankMarkdown(statement().replace("|01 Sep 2026|Test narration 20|", "Page 2 of 8\n|01 Sep 2026|Test narration 20|"));
  assert.equal(inventory.verifiable, true);
  assert.equal(inventory.rows.length, 150);
  assert.equal(inventory.rows[18].page, 1);
  assert.equal(inventory.rows[19].page, 2);
});

test("coverage rejects omissions, duplicate IDs, wrong references and fabricated amounts", () => {
  const rows = inventoryBankMarkdown(statement(3)).rows;
  assert.equal(verifyBankChunk(rows, output(rows)), true);
  assert.equal(verifyBankChunk(rows, output(rows).slice(0, 2)), false);
  for (const change of [{ sourceRowId: 1 }, { referenceNumber: "OTHER" }, { debitAmount: 20 }, { description: "" }, { transactionDate: "2026-09-02" }, { balanceAmount: null }]) {
    const result = output(rows); Object.assign(result[1], change);
    assert.equal(verifyBankChunk(rows, result), false);
  }
});

test("unsupported layouts and dated unparsed lines never claim full coverage", () => {
  assert.equal(inventoryBankMarkdown("unstructured text").verifiable, false);
  assert.equal(inventoryBankMarkdown(statement(1) + "\n02 Sep 2026 another transaction 20.00").verifiable, false);
});

test("normal JSON stop with only 40 rows is recovered in bounded smaller chunks", async (t) => {
  const old = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = "test";
  t.after(() => { if (old === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = old; });
  const sizes = [];
  let active = 0, peak = 0;
  const result = await matchBankMarkdown({ markdown: statement(), logger, fetchImpl: async (_, options) => {
    const rows = JSON.parse(JSON.parse(options.body).messages.at(-1).content).sourceRows;
    sizes.push(rows.length); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return response(output(rows.length === 50 ? rows.slice(0, 40) : rows).reverse());
  } });
  assert.equal(result.coverage.complete, true);
  assert.equal(result.data.transactions.length, 150);
  assert.deepEqual(result.data.transactions.map(r => r.sourceRowId), Array.from({ length: 150 }, (_, i) => i+1));
  assert.ok(peak <= 2);
  assert.equal(sizes.length, 9); // 3 original chunks + exactly 2 recovery requests each
});

test("persistent omission fails closed instead of returning partial results", async (t) => {
  const old = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = "test";
  t.after(() => { if (old === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = old; });
  let calls = 0;
  await assert.rejects(matchBankMarkdown({ markdown: statement(50), logger, fetchImpl: async (_, options) => {
    calls++;
    const rows = JSON.parse(JSON.parse(options.body).messages.at(-1).content).sourceRows;
    return response(output(rows.slice(0, -1)));
  } }), error => error.diagnosticCode === "AI_INCOMPLETE_COVERAGE");
  assert.equal(calls, 2);
});

test("a timed-out chunk is retried as two smaller requests", async (t) => {
  const old = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = "test";
  t.after(() => { if (old === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = old; });
  const sizes = [];
  const result = await matchBankMarkdown({ markdown: statement(50), logger, fetchImpl: async (_, options) => {
    const rows = JSON.parse(JSON.parse(options.body).messages.at(-1).content).sourceRows;
    sizes.push(rows.length);
    if (rows.length === 50) throw new DOMException("Timed out", "TimeoutError");
    return response(output(rows));
  } });
  assert.deepEqual(sizes, [50, 25, 25]);
  assert.equal(result.coverage.complete, true);
});

test("unsupported layouts are explicitly unverified, not automatically complete", async (t) => {
  const old = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = "test";
  t.after(() => { if (old === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = old; });
  const result = await matchBankMarkdown({ markdown: "Unknown layout", logger, fetchImpl: async () => response([]) });
  assert.equal(result.coverage.complete, false);
});
