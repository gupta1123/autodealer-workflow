import { AsyncLocalStorage } from "node:async_hooks";

export const cashDiscountReadContext = new AsyncLocalStorage();
export const CASH_DISCOUNT_READ_MS = 20_000;
export const CASH_DISCOUNT_SCAN_MS = 90_000;
export const CASH_DISCOUNT_XML_BYTES = 8 * 1024 * 1024;
export const CASH_DISCOUNT_RESULT_BYTES = 4 * 1024 * 1024;

// Used only for explicit continuation of a partial scan, never for posting or
// a full Refresh. Fresh bill fingerprints and verified company GUIDs form keys.
export function createCashDiscountResultCache({ maxBytes = CASH_DISCOUNT_RESULT_BYTES, ttlMs = 300_000, now = Date.now } = {}) {
  const entries = new Map();
  let bytes = 0;
  const remove = (key) => { const entry = entries.get(key); if (entry) bytes -= entry.bytes; entries.delete(key); };
  return {
    clear() { entries.clear(); bytes = 0; },
    get(key) {
      const entry = entries.get(key);
      if (!entry || now() - entry.at > ttlMs) { remove(key); return null; }
      return structuredClone(entry.value);
    },
    set(key, value) {
      const size = Buffer.byteLength(JSON.stringify(value));
      if (!key || size > maxBytes) return;
      remove(key);
      while (bytes + size > maxBytes) remove(entries.keys().next().value);
      entries.set(key, { bytes: size, at: now(), value: structuredClone(value) });
      bytes += size;
    },
  };
}

export function checkReadBudget(context = cashDiscountReadContext.getStore()) {
  context?.signal?.throwIfAborted();
  if (context?.deadlineAt <= Date.now()) throw new Error("Cash Discount scan reached its time budget. Remaining customers need review.");
}

// Bound bytes while streaming, BEFORE building a large string or parsing XML.
export async function readBoundedXml(response, limit = CASH_DISCOUNT_XML_BYTES) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("Tally response exceeded the safe Cash Discount size limit.");
  }
  if (!response.body) throw new Error("Tally returned an empty response.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Tally response exceeded the safe Cash Discount size limit.");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// One FIFO for Tally HTTP work. Waiting jobs are cancellable and expire before
// executing, so retrying in the browser cannot leave orphaned scans behind.
export function createTallyScheduler() {
  let tail = Promise.resolve();
  let active = false;
  let stopped = false;
  let queued = 0;
  return {
    get busy() { return active || queued > 0; },
    stop() { stopped = true; },
    run(task, { signal, deadlineAt = Infinity } = {}) {
      queued += 1;
      const result = tail.then(async () => {
        queued -= 1;
        if (stopped) throw new Error("The connector has stopped.");
        checkReadBudget({ signal, deadlineAt });
        active = true;
        try { return await task(); }
        finally { active = false; }
      });
      tail = result.catch(() => {});
      return result;
    },
  };
}
