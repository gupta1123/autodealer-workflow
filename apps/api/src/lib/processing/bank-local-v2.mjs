import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { matchBankMarkdown } from './bank-markdown-ai.mjs';
import { prepareLocalPreview } from './bank-local-preview.mjs';
import { cancellableFetch } from './bank-local-v2-cancellation.mjs';

export const BANK_LOCAL_V2_CAPABILITY = 'bank-local-pipeline-v2';
export const contextDigest = context => createHash('sha256').update(JSON.stringify({
  ledgerNames: context.ledgerNames, bankAccountCandidates: context.bankAccountCandidates,
})).digest('hex');

export function decodeLocalBankEnvelope(bytes) {
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('Invalid document envelope size.');
  const envelope = JSON.parse(gunzipSync(bytes, { maxOutputLength: 100 * 1024 * 1024 }).toString('utf8'));
  if (envelope.pipelineVersion !== 2 || typeof envelope.markdown !== 'string' || !envelope.markdown.trim()
    || !Array.isArray(envelope.ledgerNames) || envelope.ledgerNames.length < 1 || envelope.ledgerNames.length > 20000
    || envelope.ledgerNames.some(name => typeof name !== 'string') || !Array.isArray(envelope.bankAccountCandidates)
    || !/^[a-f0-9]{64}$/i.test(envelope.sourceHash || '') || !envelope.identity || !envelope.jobId || !envelope.commandId
    || contextDigest(envelope) !== envelope.contextHash) throw new Error('Invalid document envelope or context hash.');
  return envelope;
}

export function transientPersistenceError(error) {
  return ['40001','40P01','53300','57P01','08000','08003','08006','ECONNRESET','ETIMEDOUT','PGRST000','PGRST001','PGRST002'].includes(error?.code)
    || [502,503,504].includes(error?.status);
}

// No retry of analyze(): a lost result is not evidence that a paid call failed.
// The store must implement transactional claims/finalization and owner isolation.
export async function processLocalBankV2({ envelope, store, analyze = (input, control) => matchBankMarkdown({ ...input,
    ...(control?.signal ? { fetchImpl: cancellableFetch(fetch, control.signal) } : {}) }),
  notify = async () => {}, progress = () => {}, clock = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), signal }) {
  const timings = { databaseCalls: 0 };
  const databaseCall = fn => { timings.databaseCalls++; return fn(); };
  const measured = async (phase, fn) => { const started = clock(); try { return await fn(); } finally { timings[phase] = (timings[phase] || 0) + clock() - started; } };
  const event = async (type, state) => { try { await notify(type, state); } catch { /* committed state is authoritative */ } };
  const report = async value => { try { await progress(value); } catch { /* transport is not the job authority */ } };
  signal?.throwIfAborted();
  const claim = await measured('claimMs', () => databaseCall(() => store.claim(envelope)));
  if (claim.state !== 'accepted') return claim;
  void event('bank_job_progress', { jobId: envelope.jobId, importId: claim.importId, revision: claim.revision, state: 'analyzing' });
  await report({ phase: 'analyzing_document' });
  let prepared, digest;
  try {
    signal?.throwIfAborted();
    // These are the exact complete inputs of the existing v1 invocation. There
    // is deliberately no filtering, new prompt or second matching pass here.
    const extraction = await measured('aiMs', () => analyze({ markdown: envelope.markdown,
      ledgerNames: envelope.ledgerNames, bankAccountCandidates: envelope.bankAccountCandidates,
      traceId: envelope.commandId }, { signal }));
    signal?.throwIfAborted();
    prepared = await measured('validationMs', () => prepareLocalPreview({ data: extraction.data,
      diagnostics: { source: 'local_agent', sourceRetention: 'local_only', installationId: envelope.identity.installationId,
        auditHash: createHash('sha256').update(envelope.markdown).digest('hex'), markdownChars: envelope.markdown.length,
        aiMs: extraction.aiMs, coverage: extraction.coverage } }, envelope.ledgerNames));
    digest = createHash('sha256').update(JSON.stringify(prepared)).digest('hex');
    await report({ phase: 'saving_preview' });
  } catch (error) {
    try {
      const failed = await databaseCall(() => store.fail(envelope, signal?.aborted ? 'CANCELLED' : 'ANALYSIS_FAILED'));
      void event(signal?.aborted ? 'bank_job_cancelled' : 'bank_job_failed', { jobId: envelope.jobId, ...failed });
    } catch { /* Preserve the original error; recovery consults durable status. */ }
    throw error;
  }
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    signal?.throwIfAborted();
    try {
      const completed = await measured('finalizationMs', () => databaseCall(() => store.finalize(envelope, digest, prepared, timings)));
      void event('bank_job_completed', { jobId: envelope.jobId, importId: completed.importId, revision: completed.revision, state: 'completed' });
      await report({ phase: 'complete', jobId: envelope.jobId, importId: completed.importId });
      return { ...completed, timings };
    } catch (error) {
      lastError = error;
      if (!transientPersistenceError(error)) throw error;
      if (attempt < 3) await sleep([250, 750, 1500][attempt]);
    }
  }
  // Checkpoint contains final structured rows/validation only; no source inputs.
  // If this also fails, make the uncertainty explicit. Do not rerun AI.
  try {
    await databaseCall(() => store.checkpoint(envelope, digest, prepared));
    await report({ phase: 'recovery_pending' });
    return { state: 'recovery', jobId: envelope.jobId, timings };
  } catch {
    const error = new Error('Analysis finished but its result could not be saved. Check job status before explicitly retrying.');
    error.code = 'RESULT_NOT_DURABLE';
    error.cause = lastError;
    throw error;
  }
}
