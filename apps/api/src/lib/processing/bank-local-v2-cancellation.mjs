// Adds transport cancellation without editing AI prompts, retries or chunking.
export function cancellableFetch(fetchImpl, signal) {
  return (url, options = {}) => {
    signal.throwIfAborted();
    return fetchImpl(url, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal });
  };
}

export function watchBankAnalysis({ identity, jobId, subscribe, subscribeAccess, readStatus, pollMs = 15000 }) {
  const controller = new AbortController();
  let stopped = false, online = false, accessOnline = !subscribeAccess, checking = false;
  const check = async () => {
    if (stopped || checking || controller.signal.aborted) return;
    checking = true;
    try {
      const status = await readStatus();
      if (!stopped && ['cancelled','failed'].includes(status?.state)) controller.abort(new DOMException('Document job ended.', 'AbortError'));
    } catch (error) {
      // Explicit revocation is not a transient network failure. Stop further AI
      // requests; finalization independently checks the same current authority.
      if(error?.code==='42501'&&!stopped)controller.abort(new DOMException('Document access was revoked.','AbortError'));
    }
    finally { checking = false; }
  };
  const unsubscribe = subscribe(identity.ownerUserId, identity.connectionId, event => {
    if (event.jobId === jobId && ['bank_job_cancelled','bank_job_failed'].includes(event.type)) void check();
  }, value => { online = value; });
  const stopAccess=subscribeAccess?.(identity.organizationId,()=>void check(),value=>{accessOnline=value;});
  const timer = setInterval(() => { if (!online||!accessOnline) void check(); }, pollMs);
  timer.unref?.();
  return { signal: controller.signal, stop() { stopped = true; clearInterval(timer); void unsubscribe(); void stopAccess?.(); } };
}
