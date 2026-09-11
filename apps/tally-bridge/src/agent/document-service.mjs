import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { uploadDocumentEnvelope } from './document-result-stream.mjs';
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "document-worker.mjs");

export class LocalDocumentService {
  constructor({ temporaryDirectory, browserUpload, timeoutMs = 120_000, resultTimeoutMs = 225_000, forkWorker = fork }) {
    this.browserUpload = browserUpload;
    this.forkWorker = forkWorker;
    this.temporaryDirectory = temporaryDirectory;
    this.timeoutMs = timeoutMs;
    this.resultTimeoutMs = resultTimeoutMs;
    this.parserTail = Promise.resolve();
  }

  async parse(payload) {
    // Paths may only come from our authenticated upload receiver, never a job.
    const localSourcePath = payload.browserUpload
      ? await this.browserUpload.waitForUpload({ ...payload.browserUpload, expectedSha256: payload.expectedSha256,
          pipelineVersion: payload.pipelineVersion, identity: payload.agentIdentity })
      : undefined;
    try {
      const result = payload.pipelineVersion === 2
        ? await this.parseV2(payload, localSourcePath)
        : await this.parseFresh({ ...payload, localSourcePath });
      if (payload.browserUpload) this.browserUpload.reportPhase(payload.browserUpload.tokenHash, "complete");
      return result;
    } catch (error) {
      if (payload.browserUpload) this.browserUpload.reportPhase(payload.browserUpload.tokenHash, "failed", error.message);
      throw error;
    } finally {
      if (localSourcePath) await fs.rm(localSourcePath, { force: true });
    }
  }

  async parseFresh(payload) {
    const previous = this.parserTail;
    let release;
    this.parserTail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      payload.signal?.throwIfAborted();
      if (payload.pipelineVersion === 2 && (!Number.isFinite(Number(payload.documentDeadlineAt)) || Date.now() >= Number(payload.documentDeadlineAt))) {
        throw Object.assign(new Error('The document expired while waiting for the parser.'), { code: 'JOB_DEADLINE_EXCEEDED' });
      }
      return await this.parseInWorker(payload);
    } finally { release(); }
  }

  async parseV2(payload, localSourcePath) {
    if (!localSourcePath || !payload.browserUpload || !payload.resultUploadUrl || !payload.resultStatusUrl) throw new Error('Incomplete v2 document session.');
    const tokenHash = payload.browserUpload.tokenHash;
    const signal = this.browserUpload.contextSignal(tokenHash);
    const contextPromise = this.browserUpload.waitForContext(tokenHash);
    contextPromise.catch(() => {});
    const parsed = await this.parseFresh({ ...payload, signal, localSourcePath, resultUploadUrl: undefined, resultUploadToken: undefined });
    this.browserUpload.reportPhase(tokenHash, 'preparing_document');
    const context = await contextPromise;
    signal?.throwIfAborted();
    const result = await uploadDocumentEnvelope({ url: payload.resultUploadUrl, statusUrl: payload.resultStatusUrl,
      token: payload.resultUploadToken, deadlineAt: Number(payload.documentDeadlineAt),
      envelope: { pipelineVersion: 2, jobId: payload.bankStatementJobId, commandId: payload.commandId,
        identity: payload.agentIdentity, markdown: parsed.markdown, ledgerNames: context.ledgerNames,
        bankAccountCandidates: context.bankAccountCandidates, contextHash: context.contextHash,
        sourceHash: payload.expectedSha256.toLowerCase(), measurements: { parseMs: parsed.parseMs, markdownBytes: parsed.markdownBytes } },
      onProgress: message => this.browserUpload.reportPhase(tokenHash, message.phase),
    });
    if (result.state !== 'completed') throw new Error(result.state === 'recovery'
      ? 'Analysis finished; saving will resume automatically. Check statement status.' : 'Document processing did not complete.');
    return { uploaded: true, pipelineVersion: 2, sha256: parsed.sha256, parseMs: parsed.parseMs, markdownBytes: parsed.markdownBytes, result };
  }

  async parseInWorker(payload) {
    const { signal, ...workerPayload } = payload;
    // Always parse the source afresh; the hash is for integrity, not cache reuse.
    const id = randomUUID();
    const child = this.forkWorker(WORKER_PATH, [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: ["--max-old-space-size=512"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
    });
    return await new Promise((resolve, reject) => {
      let settled = false;
      let awaitingResult = false;
      const abort = () => {
        if (settled) return;
        settled = true; clearTimeout(timer); child.kill(); reject(signal.reason || new Error('Document parsing cancelled.'));
      };
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const expire = () => {
        settled = true;
        cleanup();
        child.kill();
        const error = new Error(awaitingResult ? "Backend document analysis exceeded its time limit." : "Local document parsing exceeded two minutes.");
        error.code = awaitingResult ? "DOCUMENT_RESULT_TIMEOUT" : "DOCUMENT_PARSE_TIMEOUT";
        reject(error);
      };
      let timer = setTimeout(expire, this.timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      child.on("message", (message) => {
        if (message.id !== id || settled) return;
        if (message.phase) {
          if (message.phase === "analyzing_document" && !awaitingResult) {
            awaitingResult = true;
            clearTimeout(timer);
            timer = setTimeout(expire, this.resultTimeoutMs);
          }
          if (payload.browserUpload && ["parsing_document", "analyzing_document"].includes(message.phase)) {
            this.browserUpload.reportPhase(payload.browserUpload.tokenHash, message.phase);
          }
          return;
        }
        settled = true;
        cleanup();
        child.kill();
        if (message.error) {
          const error = new Error(message.error.message);
          error.code = message.error.code;
          reject(error);
          return;
        }
        const result = message.result;
        resolve({ ...result, cached: false });
      });
      child.on("error", (error) => { if (settled) return; settled = true; cleanup(); child.kill(); reject(error); });
      child.on("exit", () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Document parser stopped before completing."));
      });
      child.send({ id, ...workerPayload, temporaryDirectory: this.temporaryDirectory });
    });
  }
}
