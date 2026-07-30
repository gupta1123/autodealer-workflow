import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { POST as runTallyQueue } from "../../../queue/route";

const QUEUE_JOB_BATCH_SIZE = Number(process.env.BANK_STATEMENT_TALLY_QUEUE_JOB_BATCH_SIZE ?? 20);
const QUEUE_JOB_LOCK_STALE_MS = Number(process.env.BANK_STATEMENT_TALLY_QUEUE_JOB_LOCK_STALE_MS ?? 2 * 60_000);
const QUEUE_JOB_RUNNER_ID = `queue-runner-${process.pid}-${Math.random().toString(36).slice(2)}`;

type QueueJobPayload = {
  connectionId?: string;
  transactionIds?: string[];
  transactions?: Array<{ transactionId?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

type QueueJobResult = {
  queuedCount?: number;
  verificationCount?: number;
  commandCount?: number;
  commands?: unknown[];
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPayload(value: unknown): QueueJobPayload {
  return readRecord(value) as QueueJobPayload;
}

function readResult(value: unknown): QueueJobResult {
  return readRecord(value) as QueueJobResult;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
  }
  return String(error ?? "").trim();
}

function queueJobErrorPayload(error: unknown) {
  const message = errorText(error);
  if (/bank_statement_tally_queue_jobs|bank_transaction_posting_log|tally_mapping_settings|relation .*does not exist|schema cache/i.test(message)) {
    return {
      error: "Bank Statement posting setup is not ready.",
      userAction: "Run the latest database migration, then try again.",
    };
  }
  if (/on conflict|unique or exclusion constraint|duplicate key/i.test(message)) {
    return {
      error: "Some selected rows are already queued or saved.",
      userAction: "Refresh the statement status, then send again.",
    };
  }
  return {
    error: message || "Could not prepare the statement for Tally.",
    userAction: "Refresh the page and try again.",
  };
}

function serializeQueueJob(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    totalCount: row.total_count,
    processedCount: row.processed_count,
    result: row.result ?? {},
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

function queueJobIsLocked(row: Record<string, unknown>) {
  const lockedAt = typeof row.locked_at === "string" ? row.locked_at : "";
  if (!lockedAt) return false;
  const lockedAtMs = new Date(lockedAt).getTime();
  return Number.isFinite(lockedAtMs) && Date.now() - lockedAtMs < QUEUE_JOB_LOCK_STALE_MS;
}

function transactionIdsFromPayload(payload: QueueJobPayload) {
  return Array.isArray(payload.transactionIds)
    ? payload.transactionIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function transactionsForBatch(payload: QueueJobPayload, batchIds: string[]) {
  if (!Array.isArray(payload.transactions)) return [];
  const ids = new Set(batchIds);
  return payload.transactions.filter((transaction) => {
    const transactionId = transaction?.transactionId;
    return typeof transactionId === "string" && ids.has(transactionId);
  });
}

function mergeQueueResults(current: QueueJobResult, next: QueueJobResult) {
  const currentCommands = Array.isArray(current.commands) ? current.commands : [];
  const nextCommands = Array.isArray(next.commands) ? next.commands : [];
  return {
    queuedCount: Number(current.queuedCount ?? 0) + Number(next.queuedCount ?? 0),
    verificationCount: Number(current.verificationCount ?? 0) + Number(next.verificationCount ?? 0),
    commandCount: Number(current.commandCount ?? 0) + Number(next.commandCount ?? nextCommands.length),
    commands: [...currentCommands, ...nextCommands],
  };
}

function terminal(status: unknown) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function buildInternalQueueHeaders(request: Request) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("Authorization", authorization);
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data: job, error: jobError } = await supabase
      .from("bank_statement_tally_queue_jobs")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (jobError) throw jobError;
    if (!job) {
      return jsonWithCors(request, { error: "Tally queue job not found." }, { status: 404 });
    }
    if (terminal(job.status)) {
      return jsonWithCors(request, {
        job: serializeQueueJob(job as Record<string, unknown>),
        result: job.status === "succeeded" ? job.result ?? null : null,
      });
    }

    if (queueJobIsLocked(job as Record<string, unknown>)) {
      return jsonWithCors(request, {
        job: serializeQueueJob(job as Record<string, unknown>),
        result: null,
      });
    }

    const lockCutoff = new Date(Date.now() - QUEUE_JOB_LOCK_STALE_MS).toISOString();
    const lockStartedAt = new Date().toISOString();
    const { data: lockedJob, error: lockError } = await supabase
      .from("bank_statement_tally_queue_jobs")
      .update({
        status: "running",
        started_at: job.started_at ?? lockStartedAt,
        locked_at: lockStartedAt,
        locked_by: QUEUE_JOB_RUNNER_ID,
        updated_at: lockStartedAt,
      })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .or(`locked_at.is.null,locked_at.lt.${lockCutoff}`)
      .select("*")
      .maybeSingle();

    if (lockError) throw lockError;
    if (!lockedJob) {
      const { data: currentJob, error: currentJobError } = await supabase
        .from("bank_statement_tally_queue_jobs")
        .select("*")
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (currentJobError) throw currentJobError;
      return jsonWithCors(request, {
        job: currentJob
          ? serializeQueueJob(currentJob as Record<string, unknown>)
          : serializeQueueJob(job as Record<string, unknown>),
        result: null,
      });
    }

    const workingJob = lockedJob as Record<string, unknown>;
    const payload = readPayload(workingJob.request_payload);
    const allTransactionIds = transactionIdsFromPayload(payload);
    const processedCount = Math.max(0, Number(workingJob.processed_count ?? 0));
    const totalCount = allTransactionIds.length || Number(workingJob.total_count ?? 1) || 1;
    const batchIds = allTransactionIds.length
      ? allTransactionIds.slice(processedCount, processedCount + QUEUE_JOB_BATCH_SIZE)
      : [];
    const batchPayload = allTransactionIds.length
      ? {
          ...payload,
          async: false,
          transactionIds: batchIds,
          transactions: transactionsForBatch(payload, batchIds),
        }
      : {
          ...payload,
          async: false,
        };

    if (allTransactionIds.length && batchIds.length === 0) {
      const completedAt = new Date().toISOString();
      const { data: completedJob, error: completeError } = await supabase
        .from("bank_statement_tally_queue_jobs")
        .update({
          status: "succeeded",
          processed_count: totalCount,
          locked_at: null,
          locked_by: null,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .select("*")
        .single();

      if (completeError) throw completeError;
      return jsonWithCors(request, {
        job: serializeQueueJob(completedJob as Record<string, unknown>),
        result: completedJob.result ?? null,
      });
    }

    const queueRequest = new Request(request.url, {
      method: "POST",
      headers: buildInternalQueueHeaders(request),
      body: JSON.stringify(batchPayload),
    });
    const queueResponse = await runTallyQueue(queueRequest);
    const queueBody = await queueResponse.json().catch(() => ({}));
    if (!queueResponse.ok) {
      const failedAt = new Date().toISOString();
      const error = String(queueBody?.error ?? `Queue job failed with status ${queueResponse.status}`);
      const detail = typeof queueBody?.detail === "string" ? queueBody.detail : "";
      const userAction = typeof queueBody?.userAction === "string" ? queueBody.userAction : "";
      const combinedError = [error, detail, userAction].filter(Boolean).join(" ");
      const { data: failedJob, error: failedUpdateError } = await supabase
        .from("bank_statement_tally_queue_jobs")
        .update({
          status: "failed",
          error: combinedError,
          locked_at: null,
          locked_by: null,
          updated_at: failedAt,
          completed_at: failedAt,
        })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .select("*")
        .single();

      if (failedUpdateError) throw failedUpdateError;
      return jsonWithCors(request, {
        error,
        detail: detail || undefined,
        userAction: userAction || undefined,
        job: serializeQueueJob(failedJob as Record<string, unknown>),
      }, { status: 400 });
    }

    const nextResult = mergeQueueResults(readResult(workingJob.result), readResult(queueBody));
    const nextProcessedCount = allTransactionIds.length
      ? Math.min(totalCount, processedCount + batchIds.length)
      : totalCount;
    const done = nextProcessedCount >= totalCount;
    const updatedAt = new Date().toISOString();
    const { data: updatedJob, error: updateError } = await supabase
      .from("bank_statement_tally_queue_jobs")
      .update({
        status: done ? "succeeded" : "running",
        processed_count: nextProcessedCount,
        result: nextResult,
        error: null,
        locked_at: null,
        locked_by: null,
        updated_at: updatedAt,
        completed_at: done ? updatedAt : null,
      })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return jsonWithCors(request, {
      job: serializeQueueJob(updatedJob as Record<string, unknown>),
      result: done ? nextResult : null,
    });
  } catch (error) {
    console.error("Error in POST /api/bank-statements/tally/queue-jobs/[id]/run:", error);
    return jsonWithCors(
      request,
      queueJobErrorPayload(error),
      { status: 500 }
    );
  }
}
