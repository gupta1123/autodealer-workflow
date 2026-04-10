import type {
  CaseDoc,
  DocType,
  Mismatch,
  PipelineStageId,
  QueuedUpload,
} from "@/types/pipeline";
import { pdfToImagePages } from "@/services/pdf";
import {
  classifyDocumentFromImage,
  extractDataFromImages,
  generateMismatchAnalysis,
} from "@/services/ai";
import { verifyCaseDocuments } from "@/services/verification";
import { matchSampleByIndex } from "@/services/templates";

export type StagePayload = {
  fileName?: string;
  documentType?: DocType;
  document?: CaseDoc;
  extractedDocuments?: Array<{ documentType: DocType; fields: Record<string, unknown> }>;
  pageCount?: number;
};

type StageUpdate = (uploadId: string, stage: PipelineStageId, payload?: StagePayload) => void;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PipelineResult {
  documents: CaseDoc[];
  mismatches: Mismatch[];
}

export async function orchestrateUploads(
  uploads: QueuedUpload[],
  onStageUpdate: StageUpdate
): Promise<PipelineResult> {
  const documents: CaseDoc[] = [];

  for (let index = 0; index < uploads.length; index++) {
    const upload = uploads[index];
    const file = upload.file;

    const fallbackTemplate = matchSampleByIndex(index);

    onStageUpdate(upload.id, "upload_received", { fileName: upload.name });
    await delay(200);

    let pageImages: string[] = [];
    if (file) {
      try {
        pageImages = await pdfToImagePages(file);
      } catch (error) {
        console.error("Failed to convert PDF to images", error);
      }
    }

    const documentType = await classifyDocumentFromImage(pageImages[0], upload.name);
    onStageUpdate(upload.id, "classifying", { documentType });

    onStageUpdate(upload.id, "ocr", { pageCount: pageImages.length });

    const { doc, extractedDocuments } = await extractDataFromImages({
      fileName: upload.name,
      pageImages,
      documentType,
      fallbackIndex: index,
    });

    const finalizedDoc: CaseDoc = {
      ...doc,
      sourceHint: upload.name,
      pages: doc.pages || pageImages.length || fallbackTemplate.pages,
    };

    onStageUpdate(upload.id, "extracting", { document: finalizedDoc, extractedDocuments });
    await delay(200);

    documents.push(finalizedDoc);
    onStageUpdate(upload.id, "validating", { document: finalizedDoc });
    await delay(150);

    onStageUpdate(upload.id, "complete", { document: finalizedDoc });
  }

  const rawMismatches = verifyCaseDocuments(documents);
  const mismatches = rawMismatches.length
    ? await generateMismatchAnalysis(rawMismatches as Mismatch[], documents)
    : [];

  return { documents, mismatches };
}
