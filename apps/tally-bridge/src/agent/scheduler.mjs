import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { JOB_PRIORITY, jobClassForCommand, serializeAgentError } from "./protocol.mjs";
import { resourceSnapshot, shouldPauseBackgroundWork } from "./resource-policy.mjs";

const BACKGROUND_CLASSES = new Set(["incremental_sync", "document_parse", "vector_index", "reconciliation", "maintenance"]);

export class AgentJobScheduler {
  #storage;
  #handlers = new Map();
  #running = false;
  #stopped = false;
  #wakes = new Map();
  #active = new Map();
  #listeners = new Set();

  constructor({ storage }) {
    this.#storage = storage;
  }

  get activeJob() { return this.#active.get('tally') || this.#active.get('document') || null; }
  get activeJobs() { return [...this.#active.values()]; }
  get busy() { return this.#active.size > 0; }

  onProgress(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  register(type, handler) {
    this.#handlers.set(type, handler);
  }

  async enqueue({ id = randomUUID(), commandId = null, type, identity, payload = {}, idempotencyKey = null, jobClass = jobClassForCommand(type), priority, deadlineAt = null }) {
    const job = await this.#storage.call("enqueueJob", { job: {
      id, commandId, type, identity, payload: { ...payload, __agentJobType: type }, idempotencyKey,
      jobClass, priority: Number(priority ?? JOB_PRIORITY[jobClass] ?? 0), deadlineAt,
    } });
    for (const wake of this.#wakes.values()) wake();
    return job;
  }

  async start() {
    if (this.#running) return;
    this.#running = true;
    await this.#storage.call("recoverJobs");
    try {
      await Promise.all([this.#runLane('tally'), this.#runLane('document')]);
    } finally { this.#running = false; }
  }

  async #runLane(lane) {
    while (!this.#stopped) {
      const job = await this.#storage.call("claimNextJob", { lane });
      if (!job) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1_000);
          this.#wakes.set(lane, () => { clearTimeout(timer); resolve(); });
        });
        this.#wakes.delete(lane);
        continue;
      }
      this.#active.set(lane, job);
      const type = job.payload?.__agentJobType;
      const handler = this.#handlers.get(type);
      try {
        if (job.deadline_at && Date.now() > job.deadline_at) throw Object.assign(new Error("The Local Agent job expired before it could run."), { code: "JOB_DEADLINE_EXCEEDED" });
        if (BACKGROUND_CLASSES.has(job.job_class) && shouldPauseBackgroundWork(resourceSnapshot())) {
          await this.#storage.call("updateJob", { id: job.id, status: "queued", progress: { phase: "paused_low_memory", message: "Waiting for at least 750 MB of free memory." } });
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          continue;
        }
        if (!handler) throw Object.assign(new Error(`No Local Agent handler is registered for ${type}.`), { code: "UNSUPPORTED_AGENT_JOB" });
        const progress = async (update) => {
          const next = { ...update, elapsedMs: Date.now() - new Date(job.created_at).getTime(), updatedAt: new Date().toISOString() };
          await this.#storage.call("updateJob", { id: job.id, status: "running", progress: next });
          for (const listener of this.#listeners) listener({ jobId: job.id, commandId: job.command_id, ...next });
        };
        const result = await handler(job, progress);
        const completed = { phase: "complete", elapsedMs: Date.now() - new Date(job.created_at).getTime(), completedAt: new Date().toISOString() };
        await this.#storage.call("updateJob", { id: job.id, status: "succeeded", result, progress: completed });
        for (const listener of this.#listeners) listener({ jobId: job.id, commandId: job.command_id, ...completed });
      } catch (error) {
        await this.#storage.call("updateJob", { id: job.id, status: "failed", error: serializeAgentError(error, error?.code) });
      } finally {
        this.#active.delete(lane);
      }
    }
  }

  stop() {
    this.#stopped = true;
    for (const wake of this.#wakes.values()) wake();
  }
}

// One lane to Tally: Tally answers one request at a time. Interactive work is a read
// someone is waiting for on screen; everything else (voucher writes, background sync)
// may hand the lane to the interactive reads waiting at that moment between its steps.
export function createInlinePriorityScheduler() {
  const queue = [];
  let active = null;
  let stopped = false;
  let sequence = 0;
  const executionContext = new AsyncLocalStorage();
  const schedulerToken = Symbol("kalika-tally-lane");

  const execute = async (entry) => {
    try {
      entry.signal?.throwIfAborted?.();
      if (Date.now() > entry.deadlineAt) throw new Error("The connector job expired before it could run.");
      entry.resolve(await executionContext.run(schedulerToken, entry.task));
    } catch (error) {
      entry.reject(error);
    }
  };

  const drain = async () => {
    if (active || stopped) return;
    const next = queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence).shift();
    if (!next) return;
    active = next;
    try {
      await execute(next);
    } finally {
      active = null;
      queueMicrotask(drain);
    }
  };

  return {
    get busy() { return Boolean(active) || queue.length > 0; },
    get queued() { return queue.length; },
    // True while the lane runs non-interactive work, such as a voucher save.
    get backgroundBusy() { return Boolean(active && !active.interactive); },
    stop() {
      stopped = true;
      while (queue.length) queue.shift().reject(new Error("The connector has stopped."));
    },
    // Called by lane-holding work between its own steps (never inside one): runs the
    // interactive reads waiting right now, oldest first, then returns so the caller
    // continues. Reads arriving meanwhile wait for the next step boundary, so the caller
    // keeps its place and cannot be starved.
    async yieldToInteractive() {
      if (executionContext.getStore() !== schedulerToken || !active || active.interactive) return 0;
      const waiting = queue.filter((entry) => entry.interactive).sort((left, right) => left.sequence - right.sequence);
      if (waiting.length === 0) return 0;
      for (const entry of waiting) queue.splice(queue.indexOf(entry), 1);
      const owner = active;
      try {
        for (const entry of waiting) {
          active = entry;
          await execute(entry);
        }
      } finally {
        active = owner;
      }
      return waiting.length;
    },
    run(task, { signal, deadlineAt = Infinity, priority = 50, interactive = false } = {}) {
      if (stopped) return Promise.reject(new Error("The connector has stopped."));
      if (executionContext.getStore() === schedulerToken) {
        signal?.throwIfAborted?.();
        if (Date.now() > deadlineAt) return Promise.reject(new Error("The connector job expired before it could run."));
        return Promise.resolve().then(task);
      }
      return new Promise((resolve, reject) => {
        queue.push({ task, signal, deadlineAt, priority: Number(priority), interactive: Boolean(interactive), sequence: sequence++, resolve, reject });
        void drain();
      });
    },
  };
}
