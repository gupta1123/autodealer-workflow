const REQUEST_BUDGET_MS = 21_000;
const ATTEMPT_TIMEOUT_MS = 6_000;

/** Keep queue admission below the gateway deadline. Only reads may be replayed:
 * an interrupted RPC may already have committed commands. */
export function createBankQueueFetch(options: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  budgetMs?: number;
  attemptTimeoutMs?: number;
  warn?: (message: string) => void;
} = {}): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? REQUEST_BUDGET_MS);
  const attemptTimeoutMs = options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const warn = options.warn ?? console.warn;
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
    const readOnly = method === 'GET' || method === 'HEAD';
    const callerSignal = init?.signal ?? request?.signal;
    const endpoint = new URL(request?.url ?? String(input)).pathname.split('/').at(-1);
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('Bank posting preparation timed out. Please try again.');
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(attemptTimeoutMs, remaining)));
      const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
      const started = now();
      try {
        const response = await fetchImpl(input, {...init, signal});
        // Include body transfer in the deadline, rather than stopping at headers.
        const body = [204, 205, 304].includes(response.status) ? null : await response.text();
        if (readOnly && attempt === 0 && [502, 503, 504].includes(response.status) && deadline - now() > 500) {
          warn(`[bank-queue] retrying read ${endpoint} after HTTP ${response.status}`);
          continue;
        }
        warn(`[bank-queue] ${method} ${endpoint}: HTTP ${response.status}, ${now() - started}ms`);
        return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
      } catch (error) {
        if (readOnly && attempt === 0 && !callerSignal?.aborted && deadline - now() > 500) {
          warn(`[bank-queue] retrying interrupted read ${endpoint}`);
          continue;
        }
        warn(`[bank-queue] ${method} ${endpoint} interrupted after ${now() - started}ms; no write retry`);
        throw error;
      }
    }
  };
}
