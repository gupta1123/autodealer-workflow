// Turns raw analysis errors (AI provider, worker, database) into a short internal code and a
// customer-safe sentence. Customers must never see vendor names, billing or credit wording, or raw
// provider text. The real error is only written to server logs.

export type ProcessingErrorCode =
  | "provider_billing"
  | "provider_capacity"
  | "provider_rate_limit"
  | "timeout"
  | "image_too_large"
  | "cancelled"
  | "unknown";

/** Job stage used while an analysis is waiting for the AI service to become available again. */
export const PAUSED_STAGE = "Waiting to continue";

/** A paused analysis that has not recovered after this long is failed so it does not wait forever. */
export const PAUSE_GIVE_UP_MS = 24 * 60 * 60 * 1000;

const PAUSED_MESSAGE =
  "Processing is paused for now. Your documents are saved and will continue automatically. No need to upload again.";
const TIMEOUT_MESSAGE = "This is taking longer than usual. We'll retry automatically.";
const IMAGE_MESSAGE = "This document is too large to read. Try a smaller or lower-resolution file.";
const CANCELLED_MESSAGE = "Processing was cancelled because the case was moved to the recycle bin.";
const FAILED_MESSAGE = "We couldn't read this document. Please try again, or contact support.";

function text(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  } catch {
    return "";
  }
}

export function classifyProcessingError(error: unknown): ProcessingErrorCode {
  const raw = text(error);
  if (!raw.trim()) return "unknown";
  const lower = raw.toLowerCase();

  if (/recycle bin/.test(lower)) return "cancelled";
  if (/credit|billing|payment required|\b402\b|quota exceeded|limit: 0|can only afford|spend limit|key limit/.test(lower)) {
    return "provider_billing";
  }
  if (/\b429\b|rate limit|too many requests/.test(lower)) return "provider_rate_limit";
  if (/in-flight|in flight|overloaded|capacity|no endpoints|provider returned error|\b50[023]\b|temporarily unavailable|service unavailable/.test(lower)) {
    return "provider_capacity";
  }
  if (/image.*(too large|size|exceed)|payload too large|\b413\b|request entity too large/.test(lower)) {
    return "image_too_large";
  }
  if (/timed out|timeout|aborted|etimedout|\b504\b|stale|superseded/.test(lower)) return "timeout";
  return "unknown";
}

/** True when the AI service is the problem and the work should wait and resume, not fail. */
export function isProviderPauseCode(code: ProcessingErrorCode) {
  return code === "provider_billing" || code === "provider_capacity" || code === "provider_rate_limit";
}

export function friendlyProcessingMessage(code: ProcessingErrorCode) {
  switch (code) {
    case "provider_billing":
    case "provider_capacity":
    case "provider_rate_limit":
      return PAUSED_MESSAGE;
    case "timeout":
      return TIMEOUT_MESSAGE;
    case "image_too_large":
      return IMAGE_MESSAGE;
    case "cancelled":
      return CANCELLED_MESSAGE;
    default:
      return FAILED_MESSAGE;
  }
}

const FRIENDLY_MESSAGES = new Set([
  PAUSED_MESSAGE,
  TIMEOUT_MESSAGE,
  IMAGE_MESSAGE,
  CANCELLED_MESSAGE,
  FAILED_MESSAGE,
]);

/** Customer-safe text for any raw error. Empty input stays empty; already-friendly text is kept. */
export function friendlyProcessingError(error: unknown) {
  const raw = text(error).trim();
  if (!raw) return "";
  if (FRIENDLY_MESSAGES.has(raw)) return raw;
  return friendlyProcessingMessage(classifyProcessingError(raw));
}

/** Copy of processing_meta that is safe to send to the browser. */
export function sanitizeProcessingMeta(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;
  const record = { ...(meta as Record<string, unknown>) };
  if (typeof record.lastProcessingError === "string" && record.lastProcessingError.trim()) {
    record.lastProcessingError = friendlyProcessingError(record.lastProcessingError);
  }
  return record;
}
