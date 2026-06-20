import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractCounterpartyName,
  normalizeName,
  normalizeNarrationPattern,
  type ParsedBankTransaction,
} from "@/lib/bank-statements";
import { normalizeMasterKey, type TallyMappingRow, type TallyMasterRow } from "@/lib/tally/masters";

export type BankLedgerSuggestion = {
  counterpartyName: string | null;
  ledgerName: string | null;
  confidence: number;
  reason: string | null;
  mappingSource: "saved_narration" | "category" | "ledger_name" | "close_match" | "none";
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
      if (token === "ind" || token === "industry" || token === "industries") return "industry";
      if (token === "supply" || token === "supplies" || token === "supplier" || token === "suppliers") return "supply";
      if (token === "enterprise" || token === "enterprises") return "enterprise";
      if (token === "co" || token === "company") return "company";
      return token;
    })
    .filter(Boolean);
}

function compactLedgerName(value?: string | null) {
  return ledgerNameTokens(value).join("");
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
  if (maxLength < 8) return 0;

  const editScore = 1 - levenshteinDistance(leftCompact, rightCompact) / maxLength;
  const substringScore =
    leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)
      ? 0.82 + (Math.min(leftCompact.length, rightCompact.length) / maxLength) * 0.1
      : 0;

  const leftTokens = new Set(ledgerNameTokens(left));
  const rightTokens = new Set(ledgerNameTokens(right));
  const sharedTokenCount = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const totalTokenCount = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = totalTokenCount > 0 ? sharedTokenCount / totalTokenCount : 0;

  return Math.max(editScore, substringScore, tokenScore);
}

function findClosestLedgerByName(ledgers: TallyMasterRow[], candidateName?: string | null) {
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedCandidate || compactLedgerName(normalizedCandidate).length < 8) return null;

  let bestMatch: { ledgerName: string; score: number } | null = null;
  for (const ledger of ledgers) {
    const score = ledgerNameSimilarity(normalizedCandidate, ledger.tally_name);
    if (score < 0.84) continue;
    if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && ledger.tally_name < bestMatch.ledgerName)) {
      bestMatch = { ledgerName: ledger.tally_name, score };
    }
  }

  return bestMatch;
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

    const closeLedger = findClosestLedgerByName(ledgers, counterpartyName);
    if (closeLedger) {
      return {
        counterpartyName,
        ledgerName: closeLedger.ledgerName,
        confidence: Math.min(0.84, Math.max(0.7, closeLedger.score)),
        reason: "Close Tally ledger match found; review before creating a new ledger",
        mappingSource: "close_match",
      };
    }
  }

  const categoryCandidates = categoryLedgerCandidates(input.transaction.category, input.transaction.description);
  const categoryLedgerName = findLedgerByName(ledgers, categoryCandidates);
  if (categoryCandidates.length > 0) {
    return {
      counterpartyName,
      ledgerName: categoryLedgerName,
      confidence: categoryLedgerName ? 0.82 : 0.4,
      reason: categoryLedgerName
        ? "Matched bank transaction category"
        : "Category detected, but no matching Tally ledger was synced",
      mappingSource: categoryLedgerName ? "category" : "none",
    };
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
