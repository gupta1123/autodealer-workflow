import { useCallback, useMemo, useState } from "react";

import { persistProcessedCase, type SavedCaseRecord } from "@/lib/case-persistence";
import type {
  CaseDoc,
  Mismatch,
  PipelineStageId,
  PipelineStageProgress,
  QueuedUpload,
} from "@/types/pipeline";
import { orchestrateUploads, StagePayload } from "@/services/orchestration";

type PipelineStatus = "idle" | "processing" | "ready" | "error";
type PersistenceStatus = "idle" | "saving" | "saved" | "error";

const STAGE_SEQUENCE: PipelineStageId[] = [
  "upload_received",
  "classifying",
  "ocr",
  "extracting",
  "validating",
  "complete",
];

function buildInitialStages(): PipelineStageProgress[] {
  return STAGE_SEQUENCE.map((stage, index) => ({
    stage,
    status: index === 0 ? "active" : "pending",
    startedAt: index === 0 ? Date.now() : undefined,
  }));
}

function progressForStages(stages: PipelineStageProgress[]): number {
  const completed = stages.filter((stage) => stage.status === "done" || stage.status === "complete").length;
  return completed / stages.length;
}

function advanceStages(
  stages: PipelineStageProgress[],
  nextStage: PipelineStageId
): PipelineStageProgress[] {
  const timestamp = Date.now();
  return stages.map((entry) => {
    if (entry.stage === nextStage) {
      return {
        ...entry,
        status: entry.status === "done" ? "done" : "active",
        startedAt: entry.startedAt ?? timestamp,
      };
    }
    if (entry.status === "active" && entry.stage !== nextStage) {
      return { ...entry, status: "done", finishedAt: timestamp };
    }
    if (entry.stage === "complete" && nextStage === "complete") {
      return { ...entry, status: "done", finishedAt: timestamp };
    }
    return entry;
  });
}

export function useDocumentPipeline() {
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [documents, setDocuments] = useState<CaseDoc[]>([]);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [savedCase, setSavedCase] = useState<SavedCaseRecord | null>(null);

  const queueFiles = useCallback((files?: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming: QueuedUpload[] = Array.from(files).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      file,
      stages: buildInitialStages(),
    }));
    setQueuedUploads((prev) => [...prev, ...incoming]);
  }, []);

  const removeUpload = useCallback((id: string) => {
    setQueuedUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const reset = useCallback(() => {
    setQueuedUploads([]);
    setDocuments([]);
    setMismatches([]);
    setStatus("idle");
    setError(null);
    setActiveUploadId(null);
    setPersistenceStatus("idle");
    setPersistenceError(null);
    setSavedCase(null);
  }, []);

  const startProcessing = useCallback(async () => {
    if (queuedUploads.length === 0) return;
    setStatus("processing");
    setDocuments([]);
    setMismatches([]);
    setError(null);
    setPersistenceStatus("idle");
    setPersistenceError(null);
    setSavedCase(null);

    const uploadsSnapshot = queuedUploads.map((upload) => ({ ...upload }));

    try {
      const result = await orchestrateUploads(uploadsSnapshot, (uploadId, stage, payload?: StagePayload) => {
        setActiveUploadId(uploadId);
        setQueuedUploads((prev) =>
          prev.map((upload) => {
            if (upload.id !== uploadId) return upload;
            const stages = advanceStages(upload.stages, stage);
            const updates: Partial<QueuedUpload> = { stages };
            if (stage === "classifying" && payload?.documentType) {
              updates.classifiedType = payload.documentType;
            }
            if (stage === "complete" && payload?.document) {
              updates.resultDoc = payload.document;
            }
            return { ...upload, ...updates };
          })
        );
      });

      setDocuments(result.documents);
      setMismatches(result.mismatches);
      setStatus("ready");
      setActiveUploadId(null);

      setPersistenceStatus("saving");
      try {
        const persisted = await persistProcessedCase({
          uploads: uploadsSnapshot,
          documents: result.documents,
          mismatches: result.mismatches,
        });
        setSavedCase(persisted.case);
        setPersistenceStatus("saved");
      } catch (persistError) {
        console.error("Failed to persist processed case", persistError);
        setPersistenceError(
          persistError instanceof Error ? persistError.message : "Unable to save case to Supabase."
        );
        setPersistenceStatus("error");
      }
    } catch (err) {
      console.error("Pipeline failed", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
      setActiveUploadId(null);
    }
  }, [queuedUploads]);

  const overallProgress = useMemo(() => {
    if (queuedUploads.length === 0) return 0;
    const progressSum = queuedUploads.reduce((acc, upload) => acc + progressForStages(upload.stages), 0);
    return progressSum / queuedUploads.length;
  }, [queuedUploads]);

  return {
    status,
    queuedUploads,
    documents,
    mismatches,
    error,
    activeUploadId,
    persistence: {
      status: persistenceStatus,
      error: persistenceError,
      savedCase,
    },
    progress: overallProgress,
    queueFiles,
    removeUpload,
    startProcessing,
    reset,
  } as const;
}
