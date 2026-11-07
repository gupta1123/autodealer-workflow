import assert from "node:assert/strict";
import test from "node:test";
import {
  PAUSED_STAGE,
  classifyProcessingError,
  friendlyProcessingError,
  friendlyProcessingMessage,
  isProviderPauseCode,
  sanitizeProcessingMeta,
} from "./processing-errors.ts";

const FORBIDDEN = /openrouter|credit|billing|quota|402|429|in-flight|api key|balance|gemini|anthropic|openai/i;

test("credit refusals are classified as billing and pause the work", () => {
  const raw =
    "This request would exceed your available credits given your current in-flight requests. Add more at https://openrouter.ai/settings/credits";
  const code = classifyProcessingError(raw);
  assert.equal(code, "provider_billing");
  assert.equal(isProviderPauseCode(code), true);
});

test("rate limits and provider outages also pause the work", () => {
  assert.equal(classifyProcessingError("OpenRouter request failed (429)"), "provider_rate_limit");
  assert.equal(classifyProcessingError("Provider returned error"), "provider_capacity");
  assert.equal(isProviderPauseCode("provider_rate_limit"), true);
  assert.equal(isProviderPauseCode("provider_capacity"), true);
});

test("timeouts, large images and cancelled runs are not provider pauses", () => {
  assert.equal(classifyProcessingError("OpenRouter request timed out after 90s for model x."), "timeout");
  assert.equal(classifyProcessingError("Processing job was stale for more than 20 minutes."), "timeout");
  assert.equal(classifyProcessingError("Request entity too large (413)"), "image_too_large");
  assert.equal(classifyProcessingError("Case was moved to the recycle bin."), "cancelled");
  assert.equal(isProviderPauseCode("timeout"), false);
  assert.equal(isProviderPauseCode("unknown"), false);
});

test("customer text never contains vendor or billing words", () => {
  const samples = [
    "This request would exceed your available credits given your current in-flight requests.",
    "OpenRouter request failed (429)",
    "OpenRouter API key invalid",
    "insufficient credits",
    "Something totally unexpected: TypeError at pipeline.ts:123",
    '{"error":"OpenRouter returned an error payload"}',
    "Provider returned error",
  ];
  for (const sample of samples) {
    const friendly = friendlyProcessingError(sample);
    assert.ok(friendly.length > 0, sample);
    assert.doesNotMatch(friendly, FORBIDDEN, sample);
  }
  assert.doesNotMatch(PAUSED_STAGE, FORBIDDEN);
});

test("friendly text is stable when sanitized twice and empty stays empty", () => {
  const once = friendlyProcessingError("insufficient credits");
  assert.equal(friendlyProcessingError(once), once);
  assert.equal(friendlyProcessingError(""), "");
  assert.equal(friendlyProcessingError(null), "");
  assert.equal(friendlyProcessingMessage("unknown"), friendlyProcessingError("weird internal failure"));
});

test("processing meta keeps other fields and cleans the last error", () => {
  const meta = sanitizeProcessingMeta({ keep: 1, lastProcessingError: "insufficient credits" });
  assert.equal(meta.keep, 1);
  assert.doesNotMatch(meta.lastProcessingError, FORBIDDEN);
  assert.deepEqual(sanitizeProcessingMeta({ lastProcessingError: null }), { lastProcessingError: null });
  assert.equal(sanitizeProcessingMeta(null), null);
});
