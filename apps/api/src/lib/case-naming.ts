import { callOpenRouter } from "@/lib/processing/openrouter";
import type { CaseSummary } from "@/lib/case-summary";
import type { CaseDoc, FieldKey } from "@/types/pipeline";

const SUBJECT_CANDIDATE_FIELDS: FieldKey[] = [
  "buyerName",
  "vendorName",
  "ownerName",
  "transporterName",
  "holderName",
  "driverName",
];

type SubjectCandidate = {
  name: string;
  field: FieldKey;
  documentType: string;
};

function normalizeValue(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeMatchKey(value: string) {
  return normalizeValue(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectSubjectCandidates(documents: CaseDoc[]) {
  const deduped = new Map<string, SubjectCandidate>();

  for (const document of documents) {
    for (const field of SUBJECT_CANDIDATE_FIELDS) {
      const value = normalizeValue(document.fields[field]);
      if (!value) {
        continue;
      }

      const key = normalizeMatchKey(value);
      if (!key || deduped.has(key)) {
        continue;
      }

      deduped.set(key, {
        name: value,
        field,
        documentType: document.type,
      });
    }
  }

  return Array.from(deduped.values());
}

function composeDisplayName(subjectName: string, summary: CaseSummary) {
  const reference = normalizeValue(summary.invoiceNumber || summary.poNumber || summary.primaryReference);
  return reference ? `${subjectName} / ${reference}` : subjectName;
}

function getInternalNameHints() {
  const configured = process.env.CASE_NAMING_INTERNAL_HINTS || process.env.INTERNAL_COMPANY_NAMES || "kalika";
  return configured
    .split(",")
    .map((value) => normalizeValue(value))
    .filter((value) => value.length > 0);
}

export async function resolveCaseDisplayNameWithAI(
  documents: CaseDoc[],
  summary: CaseSummary
) {
  const candidates = collectSubjectCandidates(documents);
  if (candidates.length === 0) {
    return summary.displayName;
  }

  try {
    const internalHints = getInternalNameHints();
    const response = await callOpenRouter(
      [
        {
          role: "system",
          content:
            "You choose the best company or party name for a procurement case title. " +
            "Return only JSON with a single key named selectedName. " +
            "Prefer the external counterparty or supplier name that best identifies the case. " +
            "Avoid internal buyer/operator names when another plausible external company name exists. " +
            "If no better name exists, choose the clearest valid candidate from the list.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Select the best subject name for this case title.",
            currentDeterministicDisplayName: summary.displayName,
            packetCategory: summary.packetCategory,
            primaryReference: summary.invoiceNumber || summary.poNumber || summary.primaryReference || null,
            internalNameHints: internalHints,
            candidates,
          }),
        },
      ],
      { expectJson: true }
    );

    const parsed = JSON.parse(response) as { selectedName?: unknown };
    const selectedName =
      typeof parsed.selectedName === "string" ? normalizeValue(parsed.selectedName) : "";

    if (!selectedName) {
      return summary.displayName;
    }

    const matchedCandidate = candidates.find(
      (candidate) => normalizeMatchKey(candidate.name) === normalizeMatchKey(selectedName)
    );

    if (!matchedCandidate) {
      return summary.displayName;
    }

    return composeDisplayName(matchedCandidate.name, summary);
  } catch {
    return summary.displayName;
  }
}
