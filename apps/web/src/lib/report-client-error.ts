import { apiFetch } from "@/lib/api-client";

export type CrashBoundary = "page" | "app";

const reported = new Set<string>();

// Best effort: a failed report must never make the error screen itself fail.
export function reportClientError(error: Error & { digest?: string }, boundary: CrashBoundary) {
  // Pathname only: query strings can hold search text and other personal data.
  const path = window.location.pathname;
  const key = `${boundary}|${path}|${error.name}|${error.message}`;
  if (reported.has(key)) return;
  reported.add(key);
  void apiFetch("/api/access/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      boundary,
      path,
      errorName: error.name,
      message: String(error.message || "Unknown error").slice(0, 2_000),
      stack: error.stack?.slice(0, 8_000),
      digest: error.digest,
    }),
  }).catch(() => {});
}
