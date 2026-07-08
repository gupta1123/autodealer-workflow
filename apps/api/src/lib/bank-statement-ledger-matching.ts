import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractCounterpartyName,
  normalizeName,
  normalizeNarrationPattern,
  type ParsedBankTransaction,
} from "@/lib/bank-statements";
import { callOpenRouter, getQualityExtractionModel, getQualityExtractionReasoning } from "@/lib/processing/openrouter";
import { normalizeMasterKey, type TallyMappingRow, type TallyMasterRow } from "@/lib/tally/masters";

export type BankLedgerSuggestion = {
  counterpartyName: string | null;
  ledgerName: string | null;
  confidence: number;
  reason: string | null;
  mappingSource: "saved_narration" | "category" | "ledger_name" | "close_match" | "ai_match" | "none";
};

type MatchableTransaction = Pick<ParsedBankTransaction, "description" | "category" | "counterpartyName">;

function categoryLedgerCandidates(category?: string | null, description?: string | null) {
  const text = `${category ?? ""} ${description ?? ""}`.toLowerCase();
  if (/\batm\b|\bcash\s*withdrawal\b|\bcash\b/.test(text)) return ["Cash", "Cash in Hand", "Cash-in-Hand"];
  if (/\binterest\b/.test(text)) return ["Interest Income", "Interest Received"];
  if (/\bbank[_\s-]*charges\b|\bcharge|charges|fee\b/.test(text)) {
    if (/\bgst\b/.test(text)) return ["Bank Charges GST", "Bank Charges", "Duties & Taxes"];
    return ["Bank Charges", "Bank Charges GST"];
  }
  if (/\btax|tds|gst\b/.test(text)) return ["Duties & Taxes", "GST Payable", "TDS Payable"];
  if (/\bsalary|wages\b/.test(text)) return ["Salary Payable", "Salary"];
  return [];
}

function findLedgerByName(ledgers: TallyMasterRow[], candidates: string[]) {
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    const exact = ledgers.find((ledger) => normalizeName(ledger.tally_name) === normalizedCandidate);
    if (exact) return exact.tally_name;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate);
    const partial = ledgers.find((ledger) => {
      const normalizedLedger = normalizeName(ledger.tally_name);
      return normalizedLedger.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedLedger);
    });
    if (partial) return partial.tally_name;
  }

  return null;
}

function ledgerNameTokens(value?: string | null) {
  return normalizeName(value)
    .split(/\s+/)
    .map((token) => {
      if (!token) return "";
      if (["pvt", "private", "ltd", "limited", "llp", "inc"].includes(token)) return "";
      if (token === "shri") return "shree";
      if (["ind", "industry", "industries", "industires", "indutries", "indstries"].includes(token)) return "industry";
      if (token === "supply" || token === "supplies" || token === "supplier" || token === "suppliers") return "supply";
      if (token === "enterprise" || token === "enterprises") return "enterprise";
      if (["engr", "engrs", "engg", "engineer", "engineers", "engineering"].includes(token)) return "engineer";
      if (["mech", "mechanical"].includes(token)) return "mech";
      if (token === "co" || token === "company") return "company";
      return token;
    })
    .filter(Boolean);
}

function compactLedgerName(value?: string | null) {
  return ledgerNameTokens(value).join("");
}

const GENERIC_PARTY_SUFFIX_TOKENS = new Set([
  "company",
  "enterprise",
  "firm",
  "group",
  "trader",
  "traders",
  "trading",
]);

function coreLedgerNameTokens(value?: string | null) {
  return ledgerNameTokens(value).filter(
    (token) => token.length > 1 && !GENERIC_PARTY_SUFFIX_TOKENS.has(token)
  );
}

function compactCoreLedgerName(value?: string | null) {
  return coreLedgerNameTokens(value).join("");
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function ledgerNameSimilarity(left: string, right: string) {
  const leftCompact = compactLedgerName(left);
  const rightCompact = compactLedgerName(right);
  if (!leftCompact || !rightCompact) return 0;
  if (leftCompact === rightCompact) return 1;

  const maxLength = Math.max(leftCompact.length, rightCompact.length);
  if (maxLength < 5) return 0;

  const editScore = 1 - levenshteinDistance(leftCompact, rightCompact) / maxLength;
  const substringScore =
    leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)
      ? 0.82 + (Math.min(leftCompact.length, rightCompact.length) / maxLength) * 0.1
      : 0;
  const leftCoreCompact = compactCoreLedgerName(left);
  const rightCoreCompact = compactCoreLedgerName(right);
  const coreMaxLength = Math.max(leftCoreCompact.length, rightCoreCompact.length);
  const coreScore =
    coreMaxLength >= 5 && leftCoreCompact && rightCoreCompact
      ? leftCoreCompact === rightCoreCompact
        ? 0.96
        : leftCoreCompact.includes(rightCoreCompact) || rightCoreCompact.includes(leftCoreCompact)
          ? 0.88 + (Math.min(leftCoreCompact.length, rightCoreCompact.length) / coreMaxLength) * 0.08
          : 1 - levenshteinDistance(leftCoreCompact, rightCoreCompact) / coreMaxLength
      : 0;

  const leftTokens = new Set(ledgerNameTokens(left));
  const rightTokens = new Set(ledgerNameTokens(right));
  const sharedTokenCount = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const totalTokenCount = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = totalTokenCount > 0 ? sharedTokenCount / totalTokenCount : 0;

  return Math.max(editScore, substringScore, coreScore, tokenScore);
}

function findCloseLedgerMatches(ledgers: TallyMasterRow[], candidateName?: string | null) {
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedCandidate || compactLedgerName(normalizedCandidate).length < 5) return [];

  const matches: Array<{ ledgerName: string; score: number }> = [];
  for (const ledger of ledgers) {
    const score = ledgerNameSimilarity(normalizedCandidate, ledger.tally_name);
    if (score < 0.84) continue;
    matches.push({ ledgerName: ledger.tally_name, score });
  }

  return matches.sort((left, right) => right.score - left.score || left.ledgerName.localeCompare(right.ledgerName));
}

function findUniqueCloseLedgerByName(ledgers: TallyMasterRow[], candidateName?: string | null) {
  const matches = findCloseLedgerMatches(ledgers, candidateName);
  return matches.length === 1 ? matches[0] : null;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return fallback;
    }
  }
}

function compactPromptJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function findLedgerByNormalizedName(ledgers: TallyMasterRow[], ledgerName?: string | null) {
  const normalized = normalizeName(ledgerName);
  if (!normalized) return null;
  return ledgers.find((ledger) => normalizeName(ledger.tally_name) === normalized) ?? null;
}

function ledgerShortlistScore(ledger: TallyMasterRow, transaction: MatchableTransaction, counterpartyName: string | null) {
  const candidates = [
    counterpartyName,
    transaction.counterpartyName,
    extractCounterpartyName(transaction.description),
    transaction.description,
  ].filter(Boolean) as string[];

  return Math.max(0, ...candidates.map((candidate) => ledgerNameSimilarity(candidate, ledger.tally_name)));
}

function shortlistLedgersForAi(ledgers: TallyMasterRow[], transaction: MatchableTransaction, counterpartyName: string | null) {
  if (ledgers.length <= 200) return ledgers;

  const scoredLedgers = ledgers
    .map((ledger) => ({
      ledger,
      score: ledgerShortlistScore(ledger, transaction, counterpartyName),
    }))
    .filter((entry) => entry.score >= 0.35)
    .sort((left, right) => right.score - left.score || left.ledger.tally_name.localeCompare(right.ledger.tally_name))
    .slice(0, 120)
    .map((entry) => entry.ledger);

  return scoredLedgers.length > 0 ? scoredLedgers : ledgers.slice(0, 200);
}

async function aiMatchLedgerForTransaction(input: {
  ledgers: TallyMasterRow[];
  transaction: MatchableTransaction;
  counterpartyName: string | null;
}) {
  const candidateLedgers = shortlistLedgersForAi(input.ledgers, input.transaction, input.counterpartyName);
  if (candidateLedgers.length === 0) return null;

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content:
          "You match one Indian bank statement transaction to one synced Tally ledger. Return only valid JSON. " +
          "You may choose only from the provided tallyLedgers list. Never invent a ledger name. " +
          "Match real party names even when bank narration has spelling mistakes, missing spaces, joined words, generic suffixes, trailing initials, legal suffixes, or abbreviations. " +
          "Examples: 'Raja Guru Enterprises' can match 'RAJAGURU R'; 'Quali Mech Engrs' can match 'QUALIMECH ENGINEERS'; 'Maharaj Industires' can match 'Maharaj Industries'; 'Office Supply CO' can match 'Office Supplies'. " +
          "If exactly one ledger is clearly the same party, return action use_existing_ledger with that exact ledgerName and confidence >= 0.90. " +
          "If there are multiple plausible ledgers, no clear ledger, a standard category instead of a party, or you are unsure, return action use_suspense with ledgerName null and confidence <= 0.60. " +
          "Return JSON shape: {\"action\":\"use_existing_ledger|use_suspense\",\"ledgerName\":\"...\",\"confidence\":0.0,\"reason\":\"short reason\"}.",
      },
      {
        role: "user",
        content: compactPromptJson({
          transaction: {
            description: input.transaction.description,
            category: input.transaction.category,
            counterpartyName: input.counterpartyName ?? input.transaction.counterpartyName ?? null,
          },
          tallyLedgers: candidateLedgers.map((ledger) => ({
            name: ledger.tally_name,
            group: ledger.parent_name ?? null,
          })),
        }),
      },
    ],
    {
      expectJson: true,
      jsonMode: true,
      model: getQualityExtractionModel(),
      reasoning: getQualityExtractionReasoning(),
      maxTokens: 1200,
    }
  );

  const parsed = safeJsonParse<{
    action?: unknown;
    ledgerName?: unknown;
    confidence?: unknown;
    reason?: unknown;
  }>(raw, {});
  if (String(parsed.action ?? "") !== "use_existing_ledger") return null;

  const ledgerName = String(parsed.ledgerName ?? "").trim();
  const matchedLedger = findLedgerByNormalizedName(candidateLedgers, ledgerName);
  const confidence = clampConfidence(parsed.confidence);
  if (!matchedLedger || confidence < 0.9) return null;

  return {
    ledgerName: matchedLedger.tally_name,
    confidence,
    reason: String(parsed.reason ?? "AI matched one synced Tally ledger.").trim() || "AI matched one synced Tally ledger.",
  };
}

function sourceKeyForNarration(accountId: string, description: string) {
  return `${accountId}:${normalizeNarrationPattern(description)}`.slice(0, 240);
}

export function buildBankAccountLedgerSourceKey(accountId: string) {
  return `bank_account:${accountId}`.slice(0, 240);
}

export function buildBankNarrationLedgerSourceKey(accountId: string, description: string) {
  return sourceKeyForNarration(accountId, description);
}

export async function suggestBankLedgerForTransaction(input: {
  supabase: SupabaseClient;
  ownerUserId: string;
  connectionId?: string | null;
  accountId: string;
  transaction: MatchableTransaction;
}): Promise<BankLedgerSuggestion> {
  const counterpartyName = input.transaction.counterpartyName ?? extractCounterpartyName(input.transaction.description);
  const sourceKey = sourceKeyForNarration(input.accountId, input.transaction.description);

  if (input.connectionId) {
    const { data: mappingRows, error: mappingError } = await input.supabase
      .from("tally_mapping_settings")
      .select("*")
      .eq("owner_user_id", input.ownerUserId)
      .eq("connection_id", input.connectionId)
      .eq("mapping_type", "bank_narration_ledger")
      .eq("source_key", sourceKey)
      .eq("status", "active")
      .limit(1);

    if (mappingError) throw mappingError;

    const savedMapping = ((mappingRows ?? []) as unknown as TallyMappingRow[])[0];
    if (savedMapping?.target_master_name) {
      return {
        counterpartyName,
        ledgerName: savedMapping.target_master_name,
        confidence: 0.99,
        reason: "Saved narration mapping",
        mappingSource: "saved_narration",
      };
    }
  }

  const { data: ledgerRows, error: ledgerError } = input.connectionId
    ? await input.supabase
        .from("tally_masters")
        .select("*")
        .eq("owner_user_id", input.ownerUserId)
        .eq("connection_id", input.connectionId)
        .eq("master_type", "ledger")
        .eq("is_active", true)
        .limit(5000)
    : { data: [], error: null };

  if (ledgerError) throw ledgerError;

  const ledgers = (ledgerRows ?? []) as unknown as TallyMasterRow[];
  const categoryCandidates = categoryLedgerCandidates(input.transaction.category, input.transaction.description);
  const categoryLedgerName = findLedgerByName(ledgers, categoryCandidates);
  if (categoryCandidates.length > 0) {
    return {
      counterpartyName,
      ledgerName: categoryLedgerName,
      confidence: categoryLedgerName ? 0.9 : 0.4,
      reason: categoryLedgerName
        ? "Matched standard bank transaction category"
        : "Category detected, but no matching Tally ledger was synced",
      mappingSource: categoryLedgerName ? "category" : "none",
    };
  }

  if (counterpartyName) {
    const normalizedCounterparty = normalizeName(counterpartyName);
    const matchedLedger = ledgers.find((ledger) => normalizeName(ledger.tally_name) === normalizedCounterparty);
    if (matchedLedger) {
      return {
        counterpartyName,
        ledgerName: matchedLedger.tally_name,
        confidence: 0.88,
        reason: "Counterparty matched synced Tally ledger name",
        mappingSource: "ledger_name",
      };
    }

    const closeLedger = findUniqueCloseLedgerByName(ledgers, counterpartyName);
    if (closeLedger) {
      return {
        counterpartyName,
        ledgerName: closeLedger.ledgerName,
        confidence: Math.min(0.95, Math.max(0.86, closeLedger.score)),
        reason: "One close Tally ledger match found",
        mappingSource: "close_match",
      };
    }
  }

  if (counterpartyName) {
    try {
      const aiLedger = await aiMatchLedgerForTransaction({
        ledgers,
        transaction: input.transaction,
        counterpartyName,
      });
      if (aiLedger) {
        return {
          counterpartyName,
          ledgerName: aiLedger.ledgerName,
          confidence: aiLedger.confidence,
          reason: aiLedger.reason,
          mappingSource: "ai_match",
        };
      }
    } catch (error) {
      console.warn("AI ledger match fallback failed:", error);
    }
  }

  return {
    counterpartyName,
    ledgerName: null,
    confidence: 0,
    reason: null,
    mappingSource: "none",
  };
}

export function buildLedgerMappingTarget(ledgerName: string) {
  return {
    target_master_type: "ledger",
    target_master_key: normalizeMasterKey({ masterType: "ledger", name: ledgerName }),
    target_master_name: ledgerName,
  };
}
