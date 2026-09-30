// Narrows the Tally ledger list sent with each bank statement AI request to the
// ledgers a statement row can plausibly refer to. Sending every ledger (often
// 5,000-12,000 names) with every 50-row request made prompts large and slow.
// Rows that find no candidate here still get the connector's vector and
// open-bill suggestions after extraction.

const BANK_WORDS = new Set([
  "neft", "rtgs", "imps", "upi", "ach", "nach", "ecs", "inb", "ib", "mb", "mob", "net", "ref", "refno", "utr",
  "to", "from", "by", "for", "trf", "tfr", "transfer", "fund", "funds", "chq", "cheque", "clg", "clearing",
  "dr", "cr", "debit", "credit", "a", "c", "ac", "acct", "account", "no", "txn", "payment", "paid", "pay",
  "received", "rec", "recd", "being", "the", "of", "and", "in", "on", "at", "via", "sent", "self", "bank",
  "ltd", "limited", "pvt", "private", "p", "co", "company", "m", "s", "ms", "mr", "mrs", "shri", "smt",
  "india", "branch", "yesb", "sbin", "hdfc", "icic", "utib", "kkbk", "punb", "barb", "cnrb", "ubin", "idib",
]);

// Ledgers many rows map to regardless of the narration's party name.
const GENERIC_LEDGER = /\b(bank|charges?|commission|interest|int|tds|tcs|gst|cgst|sgst|igst|cess|cash|suspense|salary|salaries|wages|rent|electricity|round\s*off|discount|penalty|insurance|loan|drawings?|capital)\b/i;

function words(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Spaced initials ("J B D ENTERPRISES", "M S E D C L") become one token.
function mergeInitials(list) {
  const merged = [];
  let run = "";
  for (const word of list) {
    if (/^\p{L}$/u.test(word)) { run += word; continue; }
    if (run) { merged.push(run); run = ""; }
    merged.push(word);
  }
  if (run) merged.push(run);
  return merged;
}

function tokens(value) {
  return mergeInitials(words(value))
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !BANK_WORDS.has(token));
}

function compact(value) {
  return words(value).join("");
}

export function createLedgerShortlister(ledgerNames = []) {
  const ledgers = [];
  const documentFrequency = new Map();
  for (const name of ledgerNames) {
    if (typeof name !== "string" || !name.trim()) continue;
    const ledgerTokens = [...new Set(tokens(name))];
    // "Laxmi Steel Patra Depot, Satara" -> "laxmisteelpatradepot", matched
    // inside narrations written without spaces.
    const coreWords = words(name.split(",")[0]);
    while (coreWords.length > 1 && /^(ltd|limited|pvt|private|co|company|llp)$/.test(coreWords.at(-1))) coreWords.pop();
    const joined = coreWords.join("");
    // "Maharastra State Electricity Distribution Co Ltd" -> "msedcl".
    const acronym = words(name.split(",")[0]).length >= 3 ? words(name.split(",")[0]).map((word) => word[0]).join("") : "";
    ledgers.push({ name, tokens: ledgerTokens, joined: joined.length >= 8 ? joined : "", acronym: acronym.length >= 4 ? acronym : "",
      generic: GENERIC_LEDGER.test(name) });
    for (const token of ledgerTokens) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  }
  const total = Math.max(1, ledgers.length);
  const idf = (token) => Math.log(1 + total / (documentFrequency.get(token) || 1));
  const byToken = new Map();
  ledgers.forEach((ledger, index) => {
    for (const token of ledger.tokens) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(index);
    }
  });
  // Narrations are often truncated ("KALIKA STE"), so a 4+ letter row token
  // also matches ledger tokens it is a prefix of (and the reverse).
  const vocabulary = [...byToken.keys()];
  const prefixCache = new Map();
  const relatedTokens = (token) => {
    if (prefixCache.has(token)) return prefixCache.get(token);
    const related = token.length < 4 ? [] : vocabulary.filter((candidate) =>
      candidate !== token && candidate.length >= 4 && (candidate.startsWith(token) || token.startsWith(candidate)));
    prefixCache.set(token, related);
    return related;
  };
  const generic = ledgers.filter((ledger) => ledger.generic).map((ledger) => ledger.name);
  const byAcronym = new Map();
  ledgers.forEach((ledger, index) => {
    if (!ledger.acronym) return;
    if (!byAcronym.has(ledger.acronym)) byAcronym.set(ledger.acronym, []);
    byAcronym.get(ledger.acronym).push(index);
  });
  const joinedLedgers = ledgers.map((ledger, index) => [ledger.joined, index]).filter(([joined]) => joined);

  function candidatesFor(text, limit = 8) {
    const scores = new Map();
    const rowTokens = new Set(tokens(text));
    const rowCompact = compact(text);
    const boost = (index, amount) => scores.set(index, (scores.get(index) || 0) + amount);
    for (const [joined, index] of joinedLedgers) if (rowCompact.includes(joined)) boost(index, 20);
    for (const token of rowTokens) for (const index of byAcronym.get(token) || []) boost(index, 12);
    // A generic ledger sharing a word with the row ("interest") competes with
    // many similar names; give it a small lift so it is not crowded out.
    for (const token of rowTokens) for (const index of byToken.get(token) || []) if (ledgers[index].generic) boost(index, 3);
    for (const token of rowTokens) {
      const add = (ledgerToken, weight) => {
        for (const index of byToken.get(ledgerToken) || []) {
          scores.set(index, (scores.get(index) || 0) + idf(ledgerToken) * weight);
        }
      };
      add(token, 1);
      for (const related of relatedTokens(token)) add(related, 0.7);
    }
    return [...scores.entries()]
      .map(([index, score]) => {
        const ledger = ledgers[index];
        // Prefer ledgers whose own name is mostly covered by the row.
        const coverage = ledger.tokens.reduce((sum, token) => sum + idf(token), 0) || 1;
        return { name: ledger.name, score: score + score / coverage };
      })
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .slice(0, limit)
      .map((entry) => entry.name);
  }

  return { size: ledgers.length, generic, candidatesFor };
}

// The ledger names to send with one AI request covering `texts` (one entry per
// statement row). Small catalogues are sent unchanged.
export function shortlistLedgerNames(shortlister, texts, { perRow = 8, maxGeneric = 150, sendAllBelow = 600 } = {}) {
  if (!shortlister || shortlister.size <= sendAllBelow) return null;
  const names = new Set(shortlister.generic.slice(0, maxGeneric));
  for (const text of texts) for (const name of shortlister.candidatesFor(text, perRow)) names.add(name);
  return [...names];
}

export function ledgerShortlistEnabled() {
  return String(process.env.BANK_LEDGER_SHORTLIST || "on").toLowerCase() !== "off";
}
