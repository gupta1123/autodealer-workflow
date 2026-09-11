import assert from "node:assert/strict";
import { test } from "node:test";
import { matchBankMarkdown } from "./bank-markdown-ai.mjs";

async function run(fetchImpl) {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "secret-test-key";
  const events = [];
  try {
    let error;
    let result;
    try {
      result = await matchBankMarkdown({ markdown: "private-statement-content", ledgerNames: ["private-ledger-name"],
        traceId: "test-job", fetchImpl, logger: { info: (_, json) => events.push(JSON.parse(json)) } });
    } catch (caught) { error = caught; }
    const logged = JSON.stringify(events);
    for (const secret of ["private-statement-content", "private-ledger-name", "secret-test-key"]) assert.ok(!logged.includes(secret));
    return { events, error, result };
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
}

test("logs successful phases and counts without document data", async () => {
  const { events, error, result } = await run(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"transactions":[]}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }));
  assert.equal(error, undefined);
  assert.equal(result.data.transactions.length, 0);
  assert.deepEqual(events.map(e => e.event), ["started", "headers_received", "body_received", "completed"]);
  assert.equal(events[2].promptTokens, 100);
});
test("identifies a timeout before headers and preserves original exception", async () => {
  const original = new DOMException("private-statement-content", "TimeoutError");
  const { events, error } = await run(async () => { throw original; });
  assert.equal(error, original);
  assert.equal(events.at(-1).kind, "AI_TIMEOUT");
  assert.equal(events.at(-1).phase, "waiting_for_ai_headers");
});
test("distinguishes response JSON failure from transport timeout", async () => {
  const { events } = await run(async () => new Response("private-statement-content"));
  assert.equal(events.at(-1).kind, "AI_INVALID_JSON");
  assert.equal(events.at(-1).phase, "reading_ai_body");
});
test("logs provider HTTP status without provider error message", async () => {
  const { events } = await run(async () => Response.json({ error: { message: "private-statement-content", code: 429 } }, { status: 429 }));
  assert.equal(events.at(-1).kind, "AI_HTTP_ERROR");
  assert.equal(events.at(-1).httpStatus, 429);
});
