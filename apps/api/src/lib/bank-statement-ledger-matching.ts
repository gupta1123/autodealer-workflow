import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractCounterpartyName,
  normalizeName,
  normalizeNarrationPattern,
  type ParsedBankTransaction,
} from "@/lib/bank-statements";
import { callOpenRouter, getLedgerMatchingModel, getQualityExtractionReasoning } from "@/lib/processing/openrouter";
import { normalizeMasterKey, type TallyMasterRow } from "@/lib/tally/masters";

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
    .replace(/\bmaha\s+raja\b/g, "maharaja")
    .replace(/\bmaha\s+raj\b/g, "maharaj")
    .replace(/\braja\s+guru\b/g, "rajaguru")
    .replace(/\braaj\s+guru\b/g, "rajaguru")
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
      if (token === "raajguru") return "rajaguru";
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

const LEDGER_MATCHING_SYSTEM_PROMPT = `
You match Indian bank statement transactions to synced Tally ledgers.
Your task is to recommend the correct existing Tally ledger for each bank transaction.
This is ledger assignment only. Do not attempt invoice matching, voucher matching, invoice settlement, split allocation, or full bank reconciliation.
Return only valid JSON. Do not return markdown, explanations outside JSON, or code fences.

Allowed ledgers:
- Choose only from the provided tallyLedgers list.
- Copy every selected ledger name exactly as provided.
- Never invent, modify, shorten, merge, or create a ledger.
- Never create a new party, expense, tax, bank, transfer, or suspense ledger.
- If no existing ledger is clearly correct, use suspense.
- Every transaction must produce exactly one result using its original index.

Output format:
Return this exact structure:
{"matches":[{"index":0,"matchType":"direct_match","action":"use_existing_ledger","ledgerName":"Exact Ledger Name From tallyLedgers","candidateLedgerNames":[],"confidence":0.95,"reason":"Short reason"}]}

Allowed matchType values: direct_match, close_match, suspense.

Direct match:
- Use direct_match only when exactly one existing ledger is clearly the best match.
- action must be "use_existing_ledger".
- ledgerName must be one exact name from tallyLedgers.
- candidateLedgerNames must be [].
- confidence must be at least 0.90.

Close match:
- Use close_match when two or more existing ledgers are genuinely plausible and no single ledger can be selected safely.
- action must be "use_suspense".
- ledgerName must be null.
- candidateLedgerNames must contain the exact competing ledger names from tallyLedgers.
- candidateLedgerNames must contain at least two names.
- Do not select one ledger merely because it appears first or looks slightly more similar.

Suspense:
- Use suspense when there is no clear existing ledger, the narration is too generic, or matching would require guessing.
- action must be "use_suspense".
- ledgerName must be null.
- candidateLedgerNames must be [].
- confidence must be 0.0.

Core rule:
A shortened, OCR-damaged, misspelled, or incomplete party name can still be a direct match when it uniquely identifies one existing ledger.
Do not call something a close match only because the bank narration does not exactly equal the ledger name.
Use close_match only when there is a real collision.

Step 1: Remove bank-system noise.
Before comparing names, ignore bank payment-rail and system words that do not identify the actual party or category, including NEFT, RTGS, IMPS, UPI, UPIREF, NACH, ACH, ECS, CMS, CR, DR, TRANSFER, FUND TRANSFER, PAYMENT, RECEIPT, UTR, RRN, TXN, REF, BENEFICIARY, TO, FROM, BY, A/C, ACCT, ACCOUNT, IFSC, BANK, BRANCH, MOBILE NUMBER, MASKED ACCOUNT NUMBER, REFERENCE NUMBER, M/S, MS, M S, transaction IDs, UTR numbers, RRN numbers, account numbers, dates, and similar bank references.
Do not treat these words or numbers as party names.
Use transaction direction, amount, and date only as supporting context when they are provided. Do not use them alone to guess a ledger.

Step 2: Normalize names carefully.
Ignore case, extra spaces, missing spaces, punctuation, dots, commas, brackets, hyphens, slashes, common separators, and legal-form suffixes such as Pvt Ltd, Private Limited, Ltd, Limited, LLP, Co, Company, and Inc.
Treat these as possible normal variants only when the full party root remains clearly the same: Bharat/Bharath/Bharth; Rajaguru/Raajguru/Raja Guru; Maharaja/Maharaj/Maha Raja/Maha Raaja; Shree/Shri/Sri; Steel/Steels; Enterprise/Enterprises/Enterprizes; Engg/Engineer/Engineers/Engineering; Transport/Transports/Transporter; Logistics/Logistic; Roadline/Roadlines; Electrical/Electricals; Fabrication/Fabricators.
Do not use phonetic similarity alone as proof. It can support a direct match only when one ledger remains clearly unique after collision checking.

Step 3: Preserve meaningful business descriptors.
Do not remove meaningful descriptors merely because they are common business words. These may differentiate completely different parties and must be considered: Steel, Metals, Alloys, Traders, Transport, Logistics, Roadlines, Engineering, Fabrication, Electricals, Chemicals, Hardware, Fuel, Power, Construction, Enterprises, Industries, Agencies, Services, Works.
Prefer the ledger with the closest matching full root and descriptor.
A named party ledger is preferred over a generic expense-category ledger when both are available.

Never confuse different party roots.
Do not match based only on one shared word, partial string, or loose phonetic resemblance. The following are different unless the narration provides clear additional evidence: Maharaja and Rajaguru; Maharaja and Mahavir; Bharat and Bharati; Rajaguru and Raja Traders; Sai Steel and Shree Sai Transport; Ganesh Enterprises and Ganesh Steel; Krishna Engineering and Krishna Transport; Vaishnavi Traders and Vaishnavi Steel Traders.
Examples: "MAHA RAJA ENGG" -> "Maharaja Engg"; "RAJAGURU" with ["Rajaguru Enterprises", "Raja Traders"] -> "Rajaguru Enterprises"; "RAJA" with ["Rajaguru Enterprises", "Raja Traders"] -> close_match or suspense.

Transaction types to consider include customer receipts, supplier payments, raw-material purchases, transport/freight/loading/unloading/logistics, contractor/fabrication/repair/machinery/maintenance/electrical, fuel/toll/travel/hotel/food/staff welfare, salaries/wages/incentives/advances/reimbursements/employee payments, utilities/rent/security/office expenses, GST/TDS/PF/ESIC/professional tax/income tax/customs duty/statutory payments, bank charges/interest/cheque return/cash-management charges/loan interest/CC interest/OD interest, insurance/loan/EMI/fixed-deposit/finance transactions, cash deposits/withdrawals/payment-gateway settlements/card settlements/reversals/transfers between company accounts.
Do not assume that every transaction is a customer or vendor payment.

Category and expense-ledger matching:
Select an expense, statutory, payroll, or bank-related ledger only when the narration explicitly supports that category and exactly one existing ledger clearly fits. Do not infer an expense category from a merchant name alone.

Employee, salary, and reimbursement transactions:
Match an employee-name ledger only when one existing employee ledger clearly matches the person. Do not map a person's name to Salary Expenses, Travelling Expenses, Staff Welfare Expenses, or Wages Expenses merely because the transaction may be related to that category. If narration says SALARY and names one employee, select that employee ledger only if it exists and is uniquely identifiable. If narration contains only a person's name and there is no uniquely matching employee ledger, use suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration. Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.

Cases that must go to suspense:
Use suspense when there is no identifiable party or category; narration contains only a UTR, RRN, account number, bank code, or reference number; the transaction could belong to multiple expense categories; a merchant name does not clearly reveal the expense purpose; the transaction appears to be a self-transfer or reversal but no explicit matching ledger exists; the best possible match is below 0.90; selecting a ledger would require guessing; or the transaction may need split allocation or voucher-level reconciliation.

Final decision rules:
1. Use direct_match when exactly one ledger is clearly best.
2. A unique shortened party name is a direct match when no competing ledger shares that root.
3. A typo, OCR issue, joined word, missing space, or phonetic variation can still be a direct match when one ledger clearly fits.
4. Use close_match only when two or more existing ledgers are genuinely plausible.
5. Use suspense when no clear ledger exists or matching requires guessing.
6. Never select a ledger when confidence is below 0.90.
7. Never invent, alter, or create a ledger.
8. Never guess between similar ledgers.
`.trim();

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
        content: LEDGER_MATCHING_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: compactPromptJson({
          transactions: [
            {
              index: 0,
              description: input.transaction.description,
              category: input.transaction.category,
              counterpartyName: input.counterpartyName ?? input.transaction.counterpartyName ?? null,
            },
          ],
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
      model: getLedgerMatchingModel(),
      reasoning: getQualityExtractionReasoning(),
      maxTokens: 4000,
    }
  );

  const parsed = safeJsonParse<{
    matches?: Array<Record<string, unknown>>;
    action?: unknown;
    ledgerName?: unknown;
    confidence?: unknown;
    reason?: unknown;
  }>(raw, {});
  const match = Array.isArray(parsed.matches) ? parsed.matches[0] ?? {} : parsed;
  if (String(match.action ?? "") !== "use_existing_ledger") return null;

  const ledgerName = String(match.ledgerName ?? "").trim();
  const matchedLedger = findLedgerByNormalizedName(candidateLedgers, ledgerName);
  const confidence = clampConfidence(match.confidence);
  if (!matchedLedger || confidence < 0.9) return null;

  return {
    ledgerName: matchedLedger.tally_name,
    confidence,
    reason: String(match.reason ?? "AI matched one synced Tally ledger.").trim() || "AI matched one synced Tally ledger.",
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
  if (ledgers.length > 0 && (counterpartyName || input.transaction.description || input.transaction.category)) {
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
