import type { CaseDoc, FieldKey, Mismatch, MismatchValue } from "@/types/pipeline";
import { shouldConsiderFieldKey } from "@/lib/document-schema";
import {
  DEFAULT_COMPARISON_OPTIONS,
  getComparableFieldValue,
  normalizeComparableValue,
  PRIMARY_COMPARISON_FIELDS,
} from "@/lib/comparison";
import type { ComparisonOptions } from "@/types/pipeline";

type ComparableValue = {
  docId: string;
  value: string | number | null | undefined;
};

function buildMismatch(
  field: string,
  values: ComparableValue[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): Omit<Mismatch, "analysis" | "fixPlan"> | null {
  const populated = values.filter((entry) => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== "");
  if (populated.length < 2) return null;
  const unique = new Set(
    populated
      .map((entry) => normalizeComparableValue(entry.value, comparisonOptions))
      .filter(Boolean)
  );
  if (unique.size <= 1) return null;

  return {
    id: `mismatch-${field}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field,
    values: populated as MismatchValue[],
  };
}

function pickFieldValues(docs: CaseDoc[], field: FieldKey) {
  return docs.map((doc) => ({
    docId: doc.id,
    value: getComparableFieldValue(doc, field),
  }));
}

export function verifyCaseDocuments(
  docs: CaseDoc[],
  comparisonOptions: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS
): Omit<Mismatch, "analysis" | "fixPlan">[] {
  const mismatches: Omit<Mismatch, "analysis" | "fixPlan">[] = [];

  for (const field of PRIMARY_COMPARISON_FIELDS.filter(shouldConsiderFieldKey)) {
    const mismatch = buildMismatch(field, pickFieldValues(docs, field), comparisonOptions);
    if (mismatch) mismatches.push(mismatch);
  }

  return mismatches;
}
