import { decodeLocalBankEnvelope, processLocalBankV2 } from './bank-local-v2.mjs';

export const BANK_LOCAL_V2_CONTENT_TYPE = 'application/vnd.kalika.bank-document-v2+json';

async function boundedBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Envelope too large');
  if (!request.body) throw new Error('Missing envelope');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Envelope too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { await reader.cancel().catch(() => {}); }
}

// Transport helper has no database or credentials of its own. Route-injected
// token verification and the transactional store remain the authorities.
export async function handleLocalBankV2(request, { verifyToken, store, notify = async (_type, _value, _identity) => {}, analyze = undefined, keepaliveMs = 10000, diagnostic = (_metrics) => {},
  watchAnalysis = (_envelope) => /** @type {{signal: AbortSignal, stop: () => void} | undefined} */ (undefined) }) {
  const receivedAt = performance.now();
  let claims;
  try { claims = verifyToken(request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || ''); }
  catch { claims = null; }
  if (!claims) return Response.json({ error: 'Invalid or expired document job token.' }, { status: 401 });
  let envelope, compressedBytes;
  try { const bytes = await boundedBody(request, 25 * 1024 * 1024); compressedBytes = bytes.length; envelope = decodeLocalBankEnvelope(bytes); }
  catch { return Response.json({ error: 'Invalid compressed document envelope.' }, { status: 400 }); }
  if (envelope.commandId !== claims.jobId || envelope.identity.ownerUserId !== claims.ownerUserId
    || envelope.identity.connectionId !== claims.connectionId) return Response.json({ error: 'Document token scope mismatch.' }, { status: 403 });

  let disconnected = false;
  // Subscribe before claim so a cancellation immediately after acceptance is
  // not missed. Only durable status, not a socket payload, authorizes abort.
  const control = watchAnalysis?.(envelope);
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = message => { if (!disconnected) { try { controller.enqueue(encoder.encode(JSON.stringify(message) + '\n')); } catch { disconnected = true; } } };
      const timer = setInterval(() => send({ type: 'keepalive' }), keepaliveMs);
      timer.unref?.();
      send({ type: 'ack', jobId: envelope.jobId }); // Received, NOT an AI claim acknowledgement.
      // A closed response must not discard an already-running paid analysis.
      // Explicit cancellation wins through the same DB job lock as finalization.
      void processLocalBankV2({ envelope, store, notify: (type, value) => notify(type, value, envelope.identity), ...(analyze ? { analyze } : {}),
        signal: control?.signal,
        progress: value => send({ type: 'progress', ...value }),
      }).then(result => {
        send({ type: 'result', ...result });
        // Counts/timings only. Never pass the envelope, context or AI response
        // to a logger, including when a diagnostic callback throws.
        try { diagnostic({ jobId: envelope.jobId, commandId: envelope.commandId, state: result.state,
          compressedBytes, markdownBytes: Buffer.byteLength(envelope.markdown),
          contextBytes: Buffer.byteLength(JSON.stringify({ ledgerNames: envelope.ledgerNames, bankAccountCandidates: envelope.bankAccountCandidates })),
          ledgerCount: envelope.ledgerNames.length, backendElapsedMs: performance.now() - receivedAt,
          timings: result.timings || {} }); } catch { /* diagnostics are not job authority */ }
      }).catch(error => {
        const conflict = ['42501','55000','23505'].includes(error?.code);
        send({ type: 'error', code: conflict ? 'JOB_STATE_CONFLICT' : 'DOCUMENT_RESULT_FAILED',
          error: conflict ? 'This document job is no longer available for this attempt.' : 'Document analysis could not complete. Check statement status before retrying.' });
      }).finally(() => {
        clearInterval(timer);
        control?.stop();
        if (!disconnected) { try { controller.close(); } catch { /* disconnected */ } }
      });
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
