import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractCounterpartyName,
  normalizeName,
  normalizeNarrationPattern,
  type ParsedBankTransaction,
} from "@/lib/bank-statements";
import {
  callOpenRouter,
  getBankLedgerMatchingMaxTokens,
  getBankLedgerMatchingModel,
  getBankLedgerMatchingTimeoutMs,
} from "@/lib/processing/openrouter";
import { normalizeMasterKey, type TallyMappingRow, type TallyMasterRow } from "@/lib/tally/masters";

export type BankLedgerSuggestion = {
  counterpartyName: string | null;
  ledgerName: string | null;
  confidence: number;
  reason: string | null;
  mappingSource: "saved_narration" | "category" | "ledger_name" | "close_match" | "ai_match" | "none";
  matchType?: "direct_match" | "close_match" | "suspense";
  candidateLedgerNames?: string[];
};

type MatchableTransaction = Pick<ParsedBankTransaction, "description" | "category" | "counterpartyName"> &
  Partial<ParsedBankTransaction>;

type AiLedgerMatch = {
  index: number;
  matchType: "direct_match" | "close_match" | "suspense";
  action: "use_existing_ledger" | "use_suspense";
  ledgerName: string | null;
  candidateLedgerNames: string[];
  confidence: number;
  reason: string;
  bankPartyRoot?: string | null;
  ledgerPartyRoot?: string | null;
  rootComparison?: string | null;
  savedMappingDecision?: "not_provided" | "used" | "rejected" | "ignored" | "unclear" | null;
};

const BANK_LEDGER_MATCHING_SYSTEM_PROMPT = `You match Indian bank statement transactions to synced Tally ledgers.
Your task is to recommend the correct existing Tally ledger for each bank transaction.
This is ledger assignment only. Do not attempt invoice matching, voucher matching, invoice settlement, split allocation, or full bank reconciliation.
Return only valid JSON. Do not return markdown, explanations outside JSON, or code fences.

Allowed ledgers:
Choose only from the provided tallyLedgers list. Copy every selected ledger name exactly as provided.
Never invent, modify, shorten, merge, or create a ledger.
Never create a new party, expense, tax, bank, transfer, or suspense ledger.
If no existing ledger is clearly correct, use suspense.
Every transaction must produce exactly one result using its original index.

Output format:
{
  "matches": [
    {
      "index": 0,
      "matchType": "direct_match",
      "action": "use_existing_ledger",
      "ledgerName": "Exact Ledger Name From tallyLedgers",
      "candidateLedgerNames": [],
      "confidence": 0.95,
      "bankPartyRoot": "party root extracted from narration",
      "ledgerPartyRoot": "party root from selected ledger or null",
      "rootComparison": "same_root | different_root | unclear",
      "savedMappingDecision": "not_provided",
      "reason": "Short reason"
    }
  ]
}

Allowed matchType values: direct_match, close_match, suspense.

Direct match:
Use direct_match only when exactly one existing ledger is clearly the best match.
For direct_match, action must be "use_existing_ledger", ledgerName must be one exact name from tallyLedgers, candidateLedgerNames must be [], and confidence must be at least 0.90.

Close match:
Use close_match when two or more existing ledgers are genuinely plausible and no single ledger can be selected safely.
For close_match, action must be "use_suspense", ledgerName must be null, candidateLedgerNames must contain at least two exact competing ledger names from tallyLedgers, and confidence must be 0.0.

Suspense:
Use suspense when there is no clear existing ledger, the narration is too generic, or matching would require guessing.
For suspense, action must be "use_suspense", ledgerName must be null, candidateLedgerNames must be [], and confidence must be 0.0.

Core rule:
A shortened, OCR-damaged, misspelled, or incomplete party name can still be a direct match when it uniquely identifies one existing ledger.
Do not call something a close match only because the bank narration does not exactly equal the ledger name.
Use close_match only when there is a real collision.

Generic party-root and descriptor rule:
Split the narration and ledger names into party-root tokens and meaningful descriptor tokens.
Party-root tokens identify the person/business name.
Descriptor tokens distinguish similar ledgers under the same root, such as trading, traders, steel, metal, transport, logistics, suppliers, enterprise, engineering, fabrication, construction, services, chemicals, hardware, fuel, bank, charges, interest, cash, and similar business/category words.
Do not ignore descriptors when more than one ledger has the same party root.
Use direct_match only if exactly one ledger matches the party root and all meaningful descriptor evidence visible in the narration.
Use close_match if two or more ledgers share the same party root and remain plausible because the narration has a shortened, incomplete, OCR-damaged, abbreviated, or ambiguous descriptor.
Use close_match, not suspense, when the narration has a distinctive party root and two or more current ledgers share that root but the narration has no descriptor to choose between them.
Use suspense only when the narration does not contain enough party-root or category evidence to identify any current ledgers safely.

Collision check before direct_match:
Before selecting any direct_match, find all ledgers that share the narration's party root.
Compare the narration's meaningful descriptor tokens with those ledgers.
Visible descriptor evidence narrows candidates. If the narration has a descriptor token that matches one descriptor family, include only ledgers under the same party root whose descriptors match that visible family. Do not include unrelated same-root descriptors only because they might be OCR mistakes.
If exactly one ledger remains, return direct_match.
If two or more ledgers remain, return close_match and include all plausible exact ledger names in candidateLedgerNames.
If no ledger remains, return suspense.
Never choose a ledger only because it has the highest similarity score when another ledger with the same root could also fit the shortened narration.
When returning close_match, candidateLedgerNames should include all ledgers that share the same descriptor family and have the same party root or a likely OCR/spelling variant of that root. Do not include only exact-root candidates if near-root spelling variants are also plausible.

OCR and spelling collision rule:
Even when one ledger name exactly matches the extracted text, check whether another ledger has the same descriptor and a very similar party root that could be an OCR/spelling variant.
If two ledgers differ only by likely OCR/spelling changes, missing letters, swapped adjacent letters, or small edit distance, return close_match with both exact ledger names.
Do not direct_match the exact text if the extracted party name could reasonably be an OCR variant of another existing ledger.
Exact text is not enough to direct_match when another current ledger has the same descriptor family and a party root differing only by one or two characters, inserted/missing letters, vowel changes, or swapped adjacent letters.
In that case, return close_match with the exact-text ledger and the near-duplicate ledger.

Partial and abbreviated token rule:
Shortened tokens are evidence, not exact proof.
A narration token can be a prefix of a ledger token, for example TRA can match traders, trading, transport, transporter, or travel; STE can match steel or steels; ENG can match engineering or engineers; SUP can match suppliers or supply; ENT can match enterprise or enterprises; FAB can match fabrication or fabricators.
For descriptor tokens, prefix matching must follow the actual token prefix after normalization. Do not treat a partial descriptor as matching an unrelated descriptor family. For example, STE can match Steel but must not match Transport; SUP can match Supplier/Supply but must not match Transport.
OCR/spelling collision checks apply mainly to party-root tokens. Do not use loose OCR assumptions to turn one business descriptor into an unrelated descriptor.
If a partial token matches multiple descriptor families or multiple ledgers under the same party root, return close_match.

Bank account ambiguity rule:
For bank, loan, OD, WCDL, CC, cash-credit, and account-number ledgers, the bank name alone is not enough for direct_match when more than one ledger shares that bank root.
Use direct_match for these ledgers only when the narration visibly includes the unique account subtype or account number, such as WCDL, OD, CC, or the account number itself.
If the narration says only "Axis Bank" and ledgers include "Axis Bank WCDL A/c 92108044607205" and "Axis Bank OD Account", use close_match with both ledgers.
If the narration says "Axis Bank WCDL A/c 92108044607205", use direct_match for "Axis Bank WCDL A/c 92108044607205".

Remove bank-system noise before comparing names:
Ignore NEFT, RTGS, IMPS, UPI, UPIREF, NACH, ACH, ECS, CMS, CR, DR, transfer, fund transfer, payment, receipt, UTR, RRN, TXN, REF, beneficiary, to, from, by, account words, IFSC, bank, branch, mobile/account/reference numbers, M/S, MS, M S, dates, and similar bank references.
Do not treat these words or numbers as party names.
Use transaction direction, amount, and date only as supporting context. Do not use them alone to guess a ledger.

Normalize carefully:
Ignore case, extra spaces, missing spaces, punctuation, dots, commas, brackets, hyphens, slashes, separators, and legal-form suffixes such as Pvt Ltd, Private Limited, Ltd, Limited, LLP, Co, Company, Inc.
Treat spelling variants as possible normal variants only when the full party root remains clearly the same.
Examples: Bharat/Bharath/Bharth, Shree/Shri/Sri, Steel/Steels, Enterprise/Enterprises, Engg/Engineering, Transport/Transports, Logistics/Logistic, Roadline/Roadlines, Electrical/Electricals, Fabrication/Fabricators.
Do not use phonetic similarity alone as proof. It can support a direct match only when one ledger remains clearly unique after collision checking.

Preserve meaningful business descriptors:
Do not remove descriptors such as Steel, Metals, Alloys, Traders, Transport, Logistics, Roadlines, Engineering, Fabrication, Electricals, Chemicals, Hardware, Fuel, Power, Construction, Enterprises, Industries, Agencies, Services, Works.
These may differentiate different parties. Prefer the ledger with the closest matching full root and descriptor.
Treat Trader, Traders, Trading, and Trade as the same trading descriptor when the party root is otherwise the same.
If the narration says "Kamal Trading" and ledgers include "Kamal Traders" and "Kamal Steel", prefer "Kamal Traders" because the root and trading descriptor align.
If the narration says only "Kamal" and ledgers include "Kamal Traders" and "Kamal Steel", use close_match because the descriptor is missing and both ledgers share the root.
If the narration says "Kamal TRAD" and ledgers include "Kamal Traders", "Kamla Traders", "Kamaal Traders", "Kamal Trading Co", and "Kamal Steel", use close_match with the trading-related exact-root and near-root ledgers, not "Kamal Steel".
If the narration says "Kamla Traders" and ledgers include "Kamla Traders" and "Kamal Traders", use close_match with both ledgers even though "Kamla Traders" is an exact text match, because "Kamla" and "Kamal" are near OCR/spelling variants with the same descriptor.
If the narration says "Sahil TRA" or "Sahil TRANSP" and ledgers include "Sahil Transport", "Sahil Transport And Suppliers", and "Sahil Steel Suppliers", use close_match with the transport-related ledgers, not "Sahil Steel Suppliers".
If the narration says "Ambika" and ledgers include "Ambika Steel" and "Ambika Trading Co", use close_match because the descriptor is missing.
If the narration says "Ambika TRAD" and ledgers include "Ambika Traders Malegaon Baramati Pune", "Ambika Trading Co", and "Ambika Steel", use close_match with the trading-related ledgers only, not "Ambika Steel".
If the narration says "Sargvny Traders" and ledgers include "Sargvny Traders" and "Sarvagny Traders", use close_match because they are OCR/spelling variants with the same trading descriptor.
If the narration says "Manibhadra Steel Cement" and ledgers include "Manibhadra Steel Cement Co" and "Manibhaddar Steel And Cement Company", use close_match with both ledgers because the party roots are near OCR/spelling variants and the descriptors align.
If the narration says "Kamal STE" and ledgers include "Kamal Traders" and "Kamal Steel", use direct_match for "Kamal Steel" because the descriptor uniquely identifies it.
If the narration contains only bank reference numbers, UTRs, RRN, account codes, or a generic payment mode, use suspense with no candidates.
A named party ledger is preferred over a generic expense-category ledger when both are available.
Never confuse different party roots based only on one shared word, partial string, or loose phonetic resemblance.

Party-root validation:
For every row, extract the bankPartyRoot from the narration after removing bank-system noise and legal suffixes.
For any selected ledger, extract ledgerPartyRoot from the ledger name.
Use direct_match only when bankPartyRoot and ledgerPartyRoot are the same party root or a safe spelling/OCR variant of the same party root.
Generic business words such as traders, trading, steel, metal, transport, enterprise, company, industries, services, supplier, customer, payment, receipt, and private limited are not party roots by themselves.
Names with different roots must not be matched even when one descriptor or one generic word overlaps.

Saved mapping hint:
The user input may include savedMapping. This is historical context only, not an automatic match.
First evaluate the bank narration against current tallyLedgers using the direct_match, close_match, and suspense rules above.
Use savedMapping only when no safer current-ledger match exists, the saved mapping ledger exists in tallyLedgers, and the saved mapping passes the same party-root validation.
If savedMapping points to a different party root, set savedMappingDecision to "rejected" and do not select it.
If savedMapping is selected after validation, set savedMappingDecision to "used".
If savedMapping is absent, set savedMappingDecision to "not_provided".
If savedMapping is present but not needed, set savedMappingDecision to "ignored".
If savedMapping cannot be validated, set savedMappingDecision to "unclear" and use close_match or suspense.

Transaction types to consider:
The statement may include customer receipts, supplier payments, raw-material purchases, transport/freight/logistics, contractor/fabrication/repair/machinery/electrical payments, fuel/toll/travel/hotel/food/staff welfare, salaries/wages/incentives/advances/reimbursements, utilities, GST/TDS/PF/ESIC/professional tax/income tax/customs duty, bank charges/interest/cheque return/loan interest/OD interest, insurance/loan/EMI/fixed deposit, cash deposits/withdrawals, payment-gateway/card settlements, reversals, and transfers between company accounts.
Do not assume every transaction is a customer or vendor payment.

Category and expense-ledger matching:
You may select an expense, statutory, payroll, or bank-related ledger only when the narration explicitly supports that category and exactly one existing ledger clearly fits.
Do not infer an expense category from a merchant name alone.
If a merchant/category could belong to multiple expense ledgers, use suspense.

Employee, salary, and reimbursement transactions:
Match an employee-name ledger only when one existing employee ledger clearly matches the person.
Do not map a person's name to Salary Expenses, Travelling Expenses, Staff Welfare Expenses, or Wages Expenses merely because the transaction may be related to that category.
If narration says salary but both Salary Expenses and Wages Expenses are plausible, use close_match or suspense.

Transfers, reversals, and company-own transactions:
Do not select the company's own ledger merely because the company name appears in narration.
Use suspense unless one existing transfer, loan, bank, or finance ledger is explicitly and uniquely supported by the narration.

Cases that must go to suspense:
No identifiable party/category; only UTR/RRN/account/bank code/reference; multiple possible expense categories; merchant name does not reveal purpose; self-transfer/reversal without explicit matching ledger; best possible match below 0.90; selecting requires guessing; transaction may need split allocation or voucher-level reconciliation.

Final decision rules:
Use direct_match when exactly one ledger is clearly best.
A unique shortened party name is a direct match when no competing ledger shares that root.
A typo, OCR issue, joined word, missing space, or phonetic variation can still be a direct match when one ledger clearly fits.
Use close_match only when two or more existing ledgers are genuinely plausible.
Use suspense when no clear ledger exists or matching requires guessing.
Never select a ledger when confidence is below 0.90.
Never invent, alter, or create a ledger.
Never guess between similar ledgers.`;

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
  "and",
  "company",
  "enterprise",
  "firm",
  "group",
  "trader",
  "traders",
  "trading",
]);

const GENERIC_PARTY_TOKENS = new Set([
  ...GENERIC_PARTY_SUFFIX_TOKENS,
  "supplier",
  "suppliers",
  "supply",
  "service",
  "services",
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

function meaningfulPartyTokens(value?: string | null) {
  return ledgerNameTokens(value).filter(
    (token) => token.length >= 3 && !GENERIC_PARTY_TOKENS.has(token)
  );
}

function tokenMatchesLedgerToken(inputToken: string, ledgerToken: string) {
  if (inputToken === ledgerToken) return true;
  return inputToken.length >= 3 && ledgerToken.startsWith(inputToken);
}

function ledgerMatchesAllMeaningfulTokens(ledger: TallyMasterRow, tokens: string[]) {
  const ledgerTokens = ledgerNameTokens(ledger.tally_name);
  return tokens.every((token) =>
    ledgerTokens.some((ledgerToken) => tokenMatchesLedgerToken(token, ledgerToken))
  );
}

function findTokenCollisionLedgers(input: {
  ledgers: TallyMasterRow[];
  transaction: MatchableTransaction;
  counterpartyName: string | null;
}) {
  const candidateTexts = [
    input.counterpartyName,
    input.transaction.counterpartyName,
    extractCounterpartyName(input.transaction.description),
  ];
  const matchesByName = new Map<string, TallyMasterRow>();

  for (const text of candidateTexts) {
    const tokens = meaningfulPartyTokens(text);
    if (tokens.length === 0) continue;

    for (const ledger of input.ledgers) {
      if (!ledgerMatchesAllMeaningfulTokens(ledger, tokens)) continue;
      matchesByName.set(normalizeName(ledger.tally_name), ledger);
    }
  }

  return Array.from(matchesByName.values()).sort((left, right) =>
    left.tally_name.localeCompare(right.tally_name)
  );
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

function readSavedMappingDecision(value: unknown): AiLedgerMatch["savedMappingDecision"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["not_provided", "used", "rejected", "ignored", "unclear"].includes(normalized)) {
    return normalized as AiLedgerMatch["savedMappingDecision"];
  }
  return null;
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
  savedMapping?: TallyMappingRow | null;
}) {
  const candidateLedgers = shortlistLedgersForAi(input.ledgers, input.transaction, input.counterpartyName);
  if (candidateLedgers.length === 0) return null;

  const raw = await callOpenRouter(
    [
      {
        role: "system",
        content: BANK_LEDGER_MATCHING_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: compactPromptJson({
          transactions: [
            {
              index: 0,
              transactionDate: input.transaction.transactionDate ?? null,
              description: input.transaction.description,
              referenceNumber: input.transaction.referenceNumber ?? null,
              debitAmount: input.transaction.debitAmount ?? null,
              creditAmount: input.transaction.creditAmount ?? null,
              transactionType: input.transaction.transactionType ?? null,
              category: input.transaction.category,
              counterpartyName: input.counterpartyName ?? input.transaction.counterpartyName ?? null,
            },
          ],
          tallyLedgers: candidateLedgers.map((ledger) => ({
            name: ledger.tally_name,
            group: ledger.parent_name ?? null,
          })),
          savedMapping: input.savedMapping?.target_master_name
            ? {
                ledgerName: input.savedMapping.target_master_name,
                sourceLabel: input.savedMapping.source_label,
                notes: input.savedMapping.notes ?? null,
              }
            : null,
        }),
      },
    ],
    {
      expectJson: true,
      jsonMode: true,
      model: getBankLedgerMatchingModel(),
      maxTokens: getBankLedgerMatchingMaxTokens(),
      timeoutMs: getBankLedgerMatchingTimeoutMs(),
    }
  );

  const parsed = safeJsonParse<{
    matches?: Array<Partial<AiLedgerMatch>>;
  }>(raw, {});
  const match = parsed.matches?.find((entry) => Number(entry?.index) === 0);
  if (!match) return null;

  const reason = String(match.reason ?? "").trim() || "AI ledger matching completed.";
  const savedMappingDecision = readSavedMappingDecision(match.savedMappingDecision);
  const candidateLedgerNames = Array.isArray(match.candidateLedgerNames)
    ? match.candidateLedgerNames
        .map((name) => String(name ?? "").trim())
        .filter((name) => Boolean(findLedgerByNormalizedName(candidateLedgers, name)))
    : [];
  const tokenCollisionLedgers = findTokenCollisionLedgers({
    ledgers: candidateLedgers,
    transaction: input.transaction,
    counterpartyName: input.counterpartyName,
  });

  if (match.matchType === "direct_match" && match.action === "use_existing_ledger") {
    const matchedLedger = findLedgerByNormalizedName(candidateLedgers, String(match.ledgerName ?? ""));
    const confidence = clampConfidence(match.confidence);

    if (tokenCollisionLedgers.length >= 2) {
      return {
        ledgerName: null,
        confidence: 0,
        reason: "Multiple close Tally ledger matches were found, so the row needs review.",
        matchType: "close_match" as const,
        candidateLedgerNames: tokenCollisionLedgers.map((ledger) => ledger.tally_name),
        savedMappingDecision,
      };
    }

    if (!matchedLedger || confidence < 0.9) {
      return {
        ledgerName: null,
        confidence: 0,
        reason: "AI returned an unsafe ledger match, so the row was kept in suspense.",
        matchType: "suspense" as const,
        candidateLedgerNames: [],
        savedMappingDecision,
      };
    }

    return {
      ledgerName: matchedLedger.tally_name,
      confidence,
      reason,
      matchType: "direct_match" as const,
      candidateLedgerNames: [],
      savedMappingDecision,
    };
  }

  if (match.matchType === "close_match" && candidateLedgerNames.length >= 2) {
    return {
      ledgerName: null,
      confidence: 0,
      reason,
      matchType: "close_match" as const,
      candidateLedgerNames,
      savedMappingDecision,
    };
  }

  if (tokenCollisionLedgers.length >= 2) {
    return {
      ledgerName: null,
      confidence: 0,
      reason: "Multiple close Tally ledger matches were found, so the row needs review.",
      matchType: "close_match" as const,
      candidateLedgerNames: tokenCollisionLedgers.map((ledger) => ledger.tally_name),
      savedMappingDecision,
    };
  }

  return {
    ledgerName: null,
    confidence: 0,
    reason,
    matchType: "suspense" as const,
    candidateLedgerNames: [],
    savedMappingDecision,
  };
}

async function deactivateRejectedSavedMapping(input: {
  supabase: SupabaseClient;
  ownerUserId: string;
  savedMapping: TallyMappingRow;
  reason: string | null;
}) {
  const note = `AI rejected saved bank narration mapping. ${input.reason ?? ""}`.trim().slice(0, 1000);
  const { error } = await input.supabase
    .from("tally_mapping_settings")
    .update({
      status: "inactive",
      notes: note,
    })
    .eq("id", input.savedMapping.id)
    .eq("owner_user_id", input.ownerUserId);

  if (error) {
    console.warn("Failed to deactivate rejected saved bank narration mapping:", error);
  }
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

export async function loadActiveTallyLedgerRows(input: {
  supabase: SupabaseClient;
  ownerUserId: string;
  connectionId?: string | null;
}) {
  if (!input.connectionId) return [];

  const rows: TallyMasterRow[] = [];
  const pageSize = 1000;
  const maxRows = 5000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await input.supabase
      .from("tally_masters")
      .select("*")
      .eq("owner_user_id", input.ownerUserId)
      .eq("connection_id", input.connectionId)
      .eq("master_type", "ledger")
      .eq("is_active", true)
      .order("tally_name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as unknown as TallyMasterRow[]));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

export async function suggestBankLedgerForTransaction(input: {
  supabase: SupabaseClient;
  ownerUserId: string;
  connectionId?: string | null;
  accountId: string;
  transaction: MatchableTransaction;
  ledgerRows?: TallyMasterRow[];
}): Promise<BankLedgerSuggestion> {
  const counterpartyName = input.transaction.counterpartyName ?? extractCounterpartyName(input.transaction.description);
  const sourceKey = sourceKeyForNarration(input.accountId, input.transaction.description);
  let savedMapping: TallyMappingRow | null = null;

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

    savedMapping = ((mappingRows ?? []) as unknown as TallyMappingRow[])[0] ?? null;
  }

  const ledgers = input.ledgerRows ?? await loadActiveTallyLedgerRows({
    supabase: input.supabase,
    ownerUserId: input.ownerUserId,
    connectionId: input.connectionId,
  });
  if (ledgers.length === 0) {
    return {
      counterpartyName,
      ledgerName: null,
      confidence: 0,
      reason: "No synced active Tally ledgers were available for AI ledger matching.",
      mappingSource: "none",
      matchType: "suspense",
      candidateLedgerNames: [],
    };
  }

  try {
    const aiLedger = await aiMatchLedgerForTransaction({
      ledgers,
      transaction: input.transaction,
      counterpartyName,
      savedMapping,
    });

    if (aiLedger) {
      if (savedMapping && aiLedger.savedMappingDecision === "rejected") {
        await deactivateRejectedSavedMapping({
          supabase: input.supabase,
          ownerUserId: input.ownerUserId,
          savedMapping,
          reason: aiLedger.reason,
        });
      }

      const normalizedSavedLedger = normalizeName(savedMapping?.target_master_name);
      const normalizedAiLedger = normalizeName(aiLedger.ledgerName);
      const mappingSource =
        aiLedger.ledgerName && aiLedger.savedMappingDecision === "used" && normalizedAiLedger === normalizedSavedLedger
          ? "saved_narration"
          : aiLedger.ledgerName
            ? "ai_match"
            : "none";

      return {
        counterpartyName,
        ledgerName: aiLedger.ledgerName,
        confidence: aiLedger.confidence,
        reason: aiLedger.reason,
        mappingSource,
        matchType: aiLedger.matchType,
        candidateLedgerNames: aiLedger.candidateLedgerNames,
      };
    }
  } catch (error) {
    console.warn("AI ledger match failed; keeping transaction in suspense:", error);
  }

  return {
    counterpartyName,
    ledgerName: null,
    confidence: 0,
    reason: "AI ledger matching did not return a safe match, so the row was kept in suspense.",
    mappingSource: "none",
    matchType: "suspense",
    candidateLedgerNames: [],
  };
}

export function buildLedgerMappingTarget(ledgerName: string) {
  return {
    target_master_type: "ledger",
    target_master_key: normalizeMasterKey({ masterType: "ledger", name: ledgerName }),
    target_master_name: ledgerName,
  };
}
