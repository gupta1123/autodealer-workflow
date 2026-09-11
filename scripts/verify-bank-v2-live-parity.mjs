// One controlled existing-AI call; replay captured responses through v2 in RAM.
// Read-only Supabase context lookup. No imports, commands or Tally writes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { LocalDocumentService } from '../apps/tally-bridge/src/agent/document-service.mjs';
import { matchBankMarkdown } from '../apps/api/src/lib/processing/bank-markdown-ai.mjs';
import { processLocalBankV2, contextDigest } from '../apps/api/src/lib/processing/bank-local-v2.mjs';
import { prepareLocalPreview } from '../apps/api/src/lib/processing/bank-local-preview.mjs';

const [importId, pdfPath] = process.argv.slice(2);
assert.ok(importId && pdfPath, 'Provide an existing import ID and its local PDF');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
assert.equal(new URL(url).hostname, 'ktpaupxmlbtpjgvigmpb.supabase.co');
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing, error } = await db.from('bank_statement_imports').select('content_sha256,processing_meta').eq('id', importId).single();
if (error) throw new Error(`Cannot load test context (${error.code})`);
const original = await fs.readFile(pdfPath), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHash = sha(original); assert.equal(sourceHash, existing.content_sha256.toLowerCase());
const ctx = existing.processing_meta.selectedContext;
assert.ok(ctx.liveTallyLedgerNames?.length, 'Complete original ledger context is required');
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kalika-v2-live-parity-'));
const copy = path.join(temporaryDirectory, 'statement.pdf');
await fs.copyFile(pdfPath, copy);
const started = performance.now();
const heartbeat = setInterval(() => console.log(JSON.stringify({ stage: 'verification_running', elapsedMs: Math.round(performance.now()-started) })), 15000);
try {
  const parseStart = performance.now();
  const parsed = await new LocalDocumentService({ temporaryDirectory }).parseFresh({ localSourcePath: copy, expectedSha256: sourceHash });
  const parserWallMs = performance.now()-parseStart;
  const input = { markdown: parsed.markdown, ledgerNames: ctx.liveTallyLedgerNames, bankAccountCandidates: ctx.liveTallyBankAccountCandidates || [], traceId: 'v2-live-parity' };
  const recorded = new Map(); let liveRequests = 0, replayRequests = 0;
  const logger = { info() {} };
  const live = await matchBankMarkdown({ ...input, logger, fetchImpl: async (target, options) => {
    liveRequests++;
    const response = await fetch(target, options);
    const body = await response.json();
    const queue = recorded.get(options.body) || [];
    queue.push({ status: response.status, body }); recorded.set(options.body, queue);
    return Response.json(body, { status: response.status });
  } });
  const identity = { installationId: 'parity-fixture' };
  const envelope = { ...input, pipelineVersion: 2, jobId: 'fixture-job', commandId: input.traceId, identity, sourceHash };
  envelope.contextHash = contextDigest(envelope);
  const expected = prepareLocalPreview({ data: structuredClone(live.data), diagnostics: {
    source: 'local_agent', sourceRetention: 'local_only', installationId: identity.installationId,
    auditHash: sha(parsed.markdown), markdownChars: parsed.markdown.length, aiMs: live.aiMs, coverage: live.coverage,
  } }, input.ledgerNames);
  let saved;
  const result = await processLocalBankV2({ envelope,
    analyze: async args => {
      assert.deepEqual(args, input);
      const replay = await matchBankMarkdown({ ...args, logger, fetchImpl: async (_target, options) => {
        replayRequests++;
        const queue = recorded.get(options.body);
        assert.ok(queue?.length, 'V2 changed an AI request body');
        const item = queue.shift(); return Response.json(item.body, { status: item.status });
      } });
      assert.deepEqual(replay.data, live.data); assert.deepEqual(replay.coverage, live.coverage);
      return { ...replay, aiMs: live.aiMs };
    },
    store: {
      claim: async () => ({ state: 'accepted', revision: 2 }),
      finalize: async (_e, _digest, prepared) => { saved = prepared; return { state: 'completed', importId: 'fixture', revision: 3 }; },
      fail: async () => ({}),
    },
  });
  assert.deepEqual(saved, expected);
  assert.equal(liveRequests, replayRequests);
  assert.equal(sha(await fs.readFile(pdfPath)), sourceHash);
  console.log(JSON.stringify({ stage: 'verified', state: result.state, transactionCount: saved.rows.length,
    extractionIncomplete: saved.extractionIncomplete, coverage: live.coverage, ledgerCount: input.ledgerNames.length,
    liveRequests, replayRequests, identicalAiRequestBodies: true, identicalPreparedPreview: true,
    parserWallMs: Math.round(parserWallMs), parseMs: parsed.parseMs, liveAiMs: live.aiMs,
    replayTimings: result.timings, originalUnchanged: true, cloudWrites: 0 }));
} catch (error) {
  console.log(JSON.stringify({ stage: 'verification_failed', type: error.name, code: error.diagnosticCode || error.code || null }));
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  assert.equal(path.dirname(temporaryDirectory), os.tmpdir());
  assert.ok(path.basename(temporaryDirectory).startsWith('kalika-v2-live-parity-'));
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
