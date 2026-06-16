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
  mappingSource: "saved_narration" | "category" | "ledger_name" | "none";
};

type MatchableTransaction = Pick<ParsedBankTransaction, "description" | "category" | "counterpartyName">;

function categoryLedgerCandidates(category?: string | null, description?: string | null) {
  const text = `${category ?? ""} ${description ?? ""}`.toLowerCase();
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
        .limit(500)
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
