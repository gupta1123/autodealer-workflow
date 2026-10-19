import type { AnalysisProgressDetail } from "@/lib/case-persistence";

export function formatEta(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds < 20) return "less than 20 sec left";
  if (seconds < 90) return `about ${Math.round(seconds / 10) * 10} sec left`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} min left`;
}

/** One plain-language line for what the analysis is doing right now. */
export function describeAnalysisStep(params: {
  status?: string | null;
  stage: string | null;
  detail: AnalysisProgressDetail | null | undefined;
  queuePosition?: number | null;
}) {
  const { status, stage, detail, queuePosition } = params;
  if (status === "queued") {
    return queuePosition && queuePosition > 1
      ? `Waiting for a free slot (${queuePosition - 1} ahead)`
      : "Starting analysis...";
  }
  const normalized = (stage ?? "").toLowerCase();
  if (normalized.includes("retry")) return "Retrying analysis...";

  if (detail) {
    const multiFile = (detail.fileCount ?? 1) > 1 ? ` (file ${detail.fileIndex} of ${detail.fileCount})` : "";
    if (detail.step === "render") return `Preparing PDF pages${multiFile}`;
    if (detail.step === "group") {
      const pages = detail.pages ? `${detail.pages} pages` : "pages";
      return `Finding documents in ${pages}${multiFile}`;
    }
    if (detail.step === "extract" && detail.total) {
      return `Extracting documents: ${detail.done ?? 0} of ${detail.total} done${multiFile}`;
    }
  }

  if (normalized.includes("compar")) return "Comparing documents...";
  if (normalized.includes("final") || normalized.includes("saving") || normalized.includes("preparing extracted")) {
    return "Finalizing results...";
  }
  if (normalized.includes("review")) return "Reviewing extraction accuracy...";
  if (normalized.includes("queue") || normalized.includes("preparing files")) return "Preparing analysis...";
  return stage || "Analyzing documents...";
}
