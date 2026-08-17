import {
  callOpenRouter,
  getBankLedgerMatchingMaxTokens,
  getBankLedgerMatchingModel,
  getBankLedgerMatchingReasoning,
  getBankLedgerMatchingTimeoutMs,
} from "@/lib/processing/openrouter";
import type { PurchasePostingMasterInput } from "@/lib/tally/purchase-posting";

export type PurchaseMasterSuggestion = {
  matchType: "direct_match" | "close_match" | "unresolved";
  masterName: string | null;
  candidateMasterNames: string[];
  confidence: number;
  reason: string;
};

export type PurchaseLineMasterSuggestion = {
  lineId: string;
  stockItem: PurchaseMasterSuggestion;
  purchaseLedger: PurchaseMasterSuggestion;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const object = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!object) return {};
    try { return JSON.parse(object) as Record<string, unknown>; } catch { return {}; }
  }
}

function unresolved(reason = "No live Tally master was uniquely supported."): PurchaseMasterSuggestion {
  return {
    matchType: "unresolved",
    masterName: null,
    candidateMasterNames: [],
    confidence: 0,
    reason,
  };
}

function validateSuggestion(
  value: unknown,
  allowedMasters: PurchasePostingMasterInput[]
): PurchaseMasterSuggestion {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!row) return unresolved();
  const byName = new Map(allowedMasters.map((master) => [normalize(master.tally_name), master.tally_name]));
  const reason = String(row.reason ?? "AI master matching completed.").trim().slice(0, 500);
  const confidence = Math.max(0, Math.min(1, Number(row.confidence) || 0));
  const selected = byName.get(normalize(row.masterName)) ?? null;
  if (row.matchType === "direct_match" && selected && confidence >= 0.9) {
    return {
      matchType: "direct_match",
      masterName: selected,
      candidateMasterNames: [],
      confidence,
      reason,
    };
  }
  const candidates = Array.isArray(row.candidateMasterNames)
    ? Array.from(new Set(row.candidateMasterNames.flatMap((name) => {
        const exact = byName.get(normalize(name));
        return exact ? [exact] : [];
      })))
    : [];
  if (row.matchType === "close_match" && candidates.length >= 2) {
    return {
      matchType: "close_match",
      masterName: null,
      candidateMasterNames: candidates.slice(0, 8),
      confidence: 0,
      reason,
    };
  }
  return unresolved(reason);
}

export async function suggestPurchaseLineMasters(input: {
  lines: Array<{
    lineId: string;
    description: string;
    hsn: string;
    unit: string;
    supplierStateCode: string | null;
    buyerStateCode: string | null;
    needsStockItem: boolean;
    needsPurchaseLedger: boolean;
  }>;
  stockItems: PurchasePostingMasterInput[];
  ledgers: PurchasePostingMasterInput[];
}): Promise<PurchaseLineMasterSuggestion[]> {
  if (input.lines.length === 0) return [];
  const stockItems = Array.from(new Map(
    input.stockItems.map((master) => [normalize(master.tally_name), master])
  ).values());
  const ledgers = Array.from(new Map(
    input.ledgers.map((master) => [normalize(master.tally_name), master])
  ).values());

  const raw = await callOpenRouter([
    {
      role: "system",
      content: `You match extracted Indian purchase-invoice lines to existing live Tally masters.
Return only JSON. Never invent or rename a master. The complete stockItems and tallyLedgers catalogues are shared once by all lines.

For stockItem, use HSN, invoice description, aliases implied by names, unit and stock group. A unique HSN match is strong evidence, but when several stock items share that HSN, use the description to distinguish them. Do not select a merely plausible item when multiple remain possible.

For purchaseLedger, identify the accounting ledger suitable for that goods/service line. Prefer a ledger under Purchase Accounts or an explicitly configured purchase/direct-expense ledger whose name and group fit the item. Supplier and buyer state codes may distinguish local from interstate purchase ledgers. Do not use a tax, party, bank, sales, round-off or withholding ledger as a purchase ledger.

Use direct_match only when exactly one existing master is uniquely supported; confidence must be at least 0.90. Use close_match with at least two exact candidate names when a human must choose. Otherwise use unresolved. Copy names exactly.

Output: {"lines":[{"index":0,"stockItem":{"matchType":"direct_match|close_match|unresolved","masterName":"Exact name or null","candidateMasterNames":[],"confidence":0.95,"reason":"Short reason"},"purchaseLedger":{same shape}}]}. Return exactly one entry for every supplied index.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        lines: input.lines.map((line, index) => ({ index, ...line })),
        stockItems: stockItems.map((master) => ({
          name: master.tally_name,
          group: master.group_path || master.parent_name || null,
          hsn: master.hsn_code,
          unit: master.unit_name,
        })),
        tallyLedgers: ledgers.map((master) => ({
          name: master.tally_name,
          group: master.group_path || master.parent_name || null,
        })),
      }),
    },
  ], {
    expectJson: true,
    jsonMode: true,
    model: process.env.OPENROUTER_PURCHASE_MASTER_MODEL || getBankLedgerMatchingModel(),
    reasoning: getBankLedgerMatchingReasoning(),
    maxTokens: getBankLedgerMatchingMaxTokens(),
    timeoutMs: getBankLedgerMatchingTimeoutMs(),
  });

  const parsed = parseJson(raw);
  const rows = Array.isArray(parsed.lines) ? parsed.lines : [];
  return input.lines.map((line, index) => {
    const row = rows.find((candidate) =>
      candidate && typeof candidate === "object" && Number((candidate as Record<string, unknown>).index) === index
    ) as Record<string, unknown> | undefined;
    return {
      lineId: line.lineId,
      stockItem: line.needsStockItem
        ? validateSuggestion(row?.stockItem, stockItems)
        : unresolved("A stock item is already selected."),
      purchaseLedger: line.needsPurchaseLedger
        ? validateSuggestion(row?.purchaseLedger, ledgers)
        : unresolved("A purchase ledger is already selected."),
    };
  });
}
