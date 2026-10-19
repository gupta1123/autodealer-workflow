// Unexpected errors are logged in full on the server, but the browser only gets a
// safe message: raw database messages, details and hints must not leave the API.
export function publicErrorMessage(
  error: unknown,
  fallback = "Something went wrong on the server. Please try again."
) {
  console.error("[api-error]", error);

  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const text = [
    error instanceof Error ? error.message : null,
    record.message,
    record.details,
    record.hint,
    record.error,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (/deleted_at|deleted_by_user_id/i.test(text)) {
    return "The recycle bin database migration has not been applied yet.";
  }
  if (/packet_cases_status_check|violates check constraint/i.test(text)) {
    return "The case draft database migration has not been applied yet.";
  }
  if (/resolution_status|resolved_at/i.test(text)) {
    return "The mismatch resolution database migration has not been applied yet.";
  }
  return fallback;
}
