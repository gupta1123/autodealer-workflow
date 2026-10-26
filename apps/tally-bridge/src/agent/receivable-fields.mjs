// Customer dues as fields instead of Tally XML.
//
// Bills and vouchers are read into plain fields once, when they are stored,
// so Cash Discount, Payment Follow-ups and bank matching never parse XML.
// The helpers in the first part are copied verbatim from bridge.mjs, so each
// field holds exactly what the XML-based calculation reads; the tests compare
// both calculations on the same records.

function decodeXmlEntities(value) {
  let decoded = String(value ?? "");
  for (let index = 0; index < 3; index += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
        const parsed = Number.parseInt(code, 16);
        return Number.isFinite(parsed) && parsed >= 32 ? String.fromCodePoint(parsed) : " ";
      })
      .replace(/&#(\d+);/g, (_, code) => {
        const parsed = Number.parseInt(code, 10);
        return Number.isFinite(parsed) && parsed >= 32 ? String.fromCodePoint(parsed) : " ";
      })
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function cleanXmlText(value) {
  return decodeXmlEntities(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagText(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanXmlText(match[1]) : null;
}

function getAttribute(block, attributeName) {
  const match = block.match(new RegExp(`\\b${attributeName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? cleanXmlText(match[1]) : null;
}

function extractBlocks(xml, tagName) {
  const blocks = [];
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  let match = regex.exec(xml);

  while (match) {
    blocks.push(match[0]);
    match = regex.exec(xml);
  }

  return blocks;
}

function parseTallyAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s*(Dr|Cr)$/i, "")
    .trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-") || /^\(.*\)$/.test(cleaned);
  const normalized = cleaned.replace(/[()]/g, "").replace(/^-/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseTallyDate(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  if (match && months.includes(match[2].toLowerCase())) {
    const year = match[3].length === 2 ? "20" + match[3] : match[3];
    return year + "-" + String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2,"0") + "-" + match[1].padStart(2,"0");
  }
  return null;
}

function billReferenceType(block) {
  return (
    getTagText(block, "BILLTYPE") ||
    getTagText(block, "TYPEOFREF") ||
    getTagText(block, "REFERENCE_TYPE") ||
    ""
  ).trim();
}

function billDueDate(xml) {
  const explicit = parseTallyDate(getTagText(xml, 'DUEDATE'));
  if (explicit) return explicit;
  const period = getTagText(xml, 'BILLCREDITPERIOD');
  const date = parseTallyDate(period);
  if (date) return date;
  const days = String(period || '').match(/^(\d+)\s*Days?$/i);
  const invoiceDate = parseTallyDate(getTagText(xml, 'DATE') || getTagText(xml, 'BILLDATE'));
  if (!days || !invoiceDate) return null;
  return new Date(Date.parse(invoiceDate + 'T00:00:00Z') + Number(days[1]) * 86400000).toISOString().slice(0,10);
}

function billLedgerName(block) {
  return (
    getTagText(block, "LEDGERNAME") ||
    getTagText(block, "PARTYLEDGERNAME") ||
    getTagText(block, "PARENT") ||
    getTagText(block, "LEDGER") ||
    ""
  ).trim();
}

function normalizeLooseName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function emptyOpenBillBucket(ledgerName) {
  return {
    ledgerName,
    openBills: [],
    existingAdvances: [],
    settledBills: [],
    rawCount: 0,
  };
}

function classifyOpenBillReferenceKind({
  billType,
  sourceVoucherType,
  referenceName,
  knownInvoice = false,
  knownAdvance = false,
} = {}) {
  const type = String(billType || "").toLowerCase();
  if (type.includes("advance")) return "advance";
  if (knownInvoice) return "bill";
  if (knownAdvance) return "advance";

  // Some Tally Bill collection exports omit BillType for receipt advances.
  // ADV-prefixed references are a controlled fallback only when no Sales
  // invoice with that reference was found.
  const looksLikeAdvanceReference = /^(?:adv|advance)(?:[-/\s]|\d)/i.test(String(referenceName || "").trim());
  if (looksLikeAdvanceReference && (/receipt/i.test(String(sourceVoucherType || "")) || !sourceVoucherType)) {
    return "advance";
  }
  return "bill";
}

function openBillNarrationKey(ledgerName, referenceName) {
  return `${normalizeLooseName(ledgerName)}|${normalizeLooseName(referenceName)}`;
}

function voucherBillAllocations(entryBlock) {
  return extractBlocks(entryBlock, "BILLALLOCATIONS.LIST")
    .map((allocation) => {
      const referenceName = getTagText(allocation, "NAME");
      const amount = Math.abs(parseTallyAmount(getTagText(allocation, "AMOUNT")) ?? 0);
      return {
        referenceName,
        billType: getTagText(allocation, "BILLTYPE") || getTagText(allocation, "TYPEOFREF") || null,
        amount,
      };
    })
    .filter((allocation) => allocation.referenceName && allocation.amount > 0);
}

function voucherLedgerEntries(block) {
  return extractBlocks(block, "ALLLEDGERENTRIES.LIST")
    .map((entry) => {
      const rawAmount = parseTallyAmount(getTagText(entry, "AMOUNT")) ?? 0;
      const isDeemedPositive = /^yes$/i.test(getTagText(entry, "ISDEEMEDPOSITIVE"));
      return {
        ledgerName: getTagText(entry, "LEDGERNAME"),
        amount: Math.abs(rawAmount),
        // Tally marks debit entries as deemed-positive. The amount sign is a
        // useful fallback for companies whose export omits that flag.
        isDebit: isDeemedPositive || rawAmount < 0,
        billAllocations: voucherBillAllocations(entry),
      };
    })
    .filter((entry) => entry.ledgerName && entry.amount > 0);
}

function isLikelyTaxLedgerName(ledgerName) {
  return /(?:^|\s)(?:gst|cgst|sgst|igst|utgst|cess|tax)(?:\s|$)/i.test(String(ledgerName || ""));
}

// ---- Fields ----------------------------------------------------------------
// Everything below reads a record once, with the helpers above, into plain
// fields; the calculation then never touches XML again.

// One open bill (Tally <BILL>).
export function billFields(xml) {
  const text = (tag) => getTagText(xml, tag);
  return {
    ref: getAttribute(xml, "NAME") || text("NAME") || text("BILLREF"),
    ledger: billLedgerName(xml),
    billType: billReferenceType(xml),
    isAdvance: /^yes$/i.test(text("ISADVANCE")),
    closing: parseTallyAmount(text("CLOSINGBALANCE")),
    balance: parseTallyAmount(text("BALANCE")),
    pending: parseTallyAmount(text("PENDINGAMOUNT")),
    amount: parseTallyAmount(text("AMOUNT")),
    opening: parseTallyAmount(text("OPENINGBALANCE")),
    voucherType: text("VOUCHERTYPENAME") || text("VOUCHERTYPE") || null,
    voucherNumber: text("VOUCHERNUMBER"),
    date: parseTallyDate(text("DATE") || text("BILLDATE")),
    billDate: parseTallyDate(text("BILLDATE")),
    dueDate: billDueDate(xml),
    creditPeriod: text("BILLCREDITPERIOD"),
  };
}

// One invoice, receipt or other voucher touching a customer (Tally <VOUCHER>).
export function voucherFields(xml) {
  const text = (tag) => getTagText(xml, tag);
  return {
    type: text("VOUCHERTYPENAME") || getAttribute(xml, "VCHTYPE") || "",
    date: text("DATE"),
    effectiveDate: text("EFFECTIVEDATE"),
    number: text("VOUCHERNUMBER"),
    reference: text("REFERENCE"),
    narration: text("NARRATION"),
    party: text("PARTYLEDGERNAME"),
    masterId: text("MASTERID"),
    alterId: text("ALTERID"),
    guid: text("GUID"),
    cancelled: /^yes$/i.test(text("ISCANCELLED")),
    optional: /^yes$/i.test(text("ISOPTIONAL")),
    // Every ledger and bill-allocation name on the voucher, as the invoice
    // matching reads them (including zero-amount lines).
    entryLedgers: extractBlocks(xml, "ALLLEDGERENTRIES.LIST").map((entry) => getTagText(entry, "LEDGERNAME")).filter(Boolean),
    allocationNames: extractBlocks(xml, "BILLALLOCATIONS.LIST").map((allocation) => getTagText(allocation, "NAME")).filter(Boolean),
    // Ledger lines with amount, debit/credit and bill allocations.
    entries: voucherLedgerEntries(xml),
  };
}

// toOpenBill on fields.
export function openBillFromFields(bill, ledgerName, evidence = {}) {
  const referenceName = bill.ref;
  if (!referenceName) return null;
  if (bill.ledger && normalizeLooseName(bill.ledger) !== normalizeLooseName(ledgerName)) return null;
  const closing = bill.closing ?? bill.balance ?? bill.pending ?? bill.amount;
  const pendingAmount = Math.abs(closing ?? 0);
  if (pendingAmount <= 0) return null;
  const sourceVoucherType = bill.voucherType;
  const kind = classifyOpenBillReferenceKind({
    billType: bill.isAdvance ? "Advance" : bill.billType,
    sourceVoucherType,
    referenceName,
    knownInvoice: evidence.knownInvoice === true,
    knownAdvance: evidence.knownAdvance === true,
  });
  const common = {
    referenceName,
    voucherNumber: bill.voucherNumber || referenceName,
    invoiceDate: bill.date,
    dueDate: bill.dueDate,
    originalAmount: Math.abs(bill.opening ?? pendingAmount),
    settledAmount: null,
    pendingAmount,
    sourceVoucherType,
    status: "open",
  };
  if (kind === "advance") {
    return { kind: "advance", referenceName, receiptDate: common.invoiceDate, pendingAdvanceAmount: pendingAmount, status: "unadjusted" };
  }
  return { kind: "bill", ...common };
}

function isPartyInvoiceType(type) {
  const value = String(type || "").toLowerCase();
  return /sales|purchase|invoice/.test(value) && !/debit|credit|receipt|payment/.test(value);
}
function isPartySettlementType(type) {
  return /receipt|payment/.test(String(type || "").toLowerCase());
}

const MAX_RECEIPTS_PER_INVOICE = 20;

// indexInvoiceNarrations on fields.
// Resolve every bill to its Sales voucher before interpreting opening balances.
// A pre-invoice receipt may own the New Ref and Bill date in Tally.
function indexInvoiceEvidence(vouchers, requestedLedgerByKey) {
  const invoices = new Map();
  const canonicalInvoices = new Map();
  const settlements = new Map();
  const advanceReferenceKeys = new Set();
  const active = vouchers.filter(v => !v.cancelled && !v.optional);
  for (const voucher of active) {
    if (!isPartyInvoiceType(voucher.type) || /purchase/i.test(voucher.type)) continue;
    for (const entry of voucher.entries) {
      const ledgerName = requestedLedgerByKey.get(normalizeLooseName(entry.ledgerName));
      if (!ledgerName || !entry.isDebit) continue;
      const references = [...new Set(entry.billAllocations.map(a => a.referenceName).filter(Boolean))];
      const reference = references[0] || voucher.reference || voucher.number;
      if (!reference) continue;
      const key = openBillNarrationKey(ledgerName, reference);
      const invoice = {
        key, ledgerName, referenceName: reference, voucherNumber: voucher.number || reference,
        invoiceDate: parseTallyDate(voucher.date), originalAmount: entry.amount,
        sourceVoucherType: voucher.type, narration: voucher.narration || null,
        sourceSalesLedgerName: voucher.entries.find(e => !e.isDebit && normalizeLooseName(e.ledgerName) !== normalizeLooseName(ledgerName) && !isLikelyTaxLedgerName(e.ledgerName))?.ledgerName || null,
        identity: voucher.guid || voucher.masterId || [voucher.date, voucher.number, ledgerName].join('|'),
        invoiceEvidenceAmbiguous: references.length > 1,
      };
      const existing = canonicalInvoices.get(key);
      if (existing && existing.identity !== invoice.identity) {
        existing.invoiceEvidenceAmbiguous = true;
        continue;
      }
      canonicalInvoices.set(key, invoice);
      for (const alias of [...references, voucher.number, voucher.reference].filter(Boolean)) {
        const aliasKey = openBillNarrationKey(ledgerName, alias);
        const previous = invoices.get(aliasKey);
        if (previous && previous.identity !== invoice.identity) {
          previous.invoiceEvidenceAmbiguous = true;
          invoice.invoiceEvidenceAmbiguous = true;
        } else invoices.set(aliasKey, invoice);
      }
    }
  }
  for (const voucher of active) {
    if (isPartyInvoiceType(voucher.type)) continue;
    for (const entry of voucher.entries) {
      const ledgerName = requestedLedgerByKey.get(normalizeLooseName(entry.ledgerName));
      if (!ledgerName) continue;
      for (const allocation of entry.billAllocations) {
        const aliasKey = openBillNarrationKey(ledgerName, allocation.referenceName);
        const invoice = invoices.get(aliasKey);
        if (!invoice) { if (/advance|new ref/i.test(allocation.billType || '')) advanceReferenceKeys.add(aliasKey); continue; }
        const proof = settlements.get(invoice.key) || { adjustments: 0, receipts: 0, lastReceiptDate: null, ambiguous: false, receiptList: [] };
        const signedAmount = entry.isDebit ? -allocation.amount : allocation.amount;
        proof.adjustments += signedAmount;
        if (isPartySettlementType(voucher.type)) {
          proof.receipts += signedAmount;
          const date = parseTallyDate(voucher.effectiveDate || voucher.date);
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) proof.ambiguous = true;
          else if (!proof.lastReceiptDate || date > proof.lastReceiptDate) proof.lastReceiptDate = date;
          // Each receipt, for the invoice timeline in Kalika (bounded per invoice).
          if (proof.receiptList.length < MAX_RECEIPTS_PER_INVOICE) proof.receiptList.push({
            date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, amount: Math.round(signedAmount * 100) / 100,
            voucherNumber: voucher.number || null, voucherType: voucher.type || null,
          });
        }
        settlements.set(invoice.key, proof);
      }
    }
  }
  return { invoices, canonicalInvoices, settlements, advanceReferenceKeys };
}

export function openBillsByLedgerFromFields(ledgerNames, bills, vouchers) {
  const requestedLedgerByKey = new Map(ledgerNames.map(name => [normalizeLooseName(name), name]));
  const evidence = indexInvoiceEvidence(vouchers, requestedLedgerByKey);
  const byLedger = Object.fromEntries(ledgerNames.map(name => [name, emptyOpenBillBucket(name)]));
  const seen = new Set();
  let billCount = 0;
  function invoiceRow(invoice, bill = null) {
    const proof = evidence.settlements.get(invoice.key);
    const computed = Math.round((invoice.originalAmount - (proof?.adjustments || 0)) * 100) / 100;
    const native = bill ? Math.abs(bill.closing ?? bill.balance ?? bill.pending ?? bill.amount ?? computed) : null;
    // Some Tally versions return the opening balance as ClosingBalance. Other
    // disagreements need review; never replace a differing live balance blindly.
    const disagreement = native !== null && Math.abs(native - computed) > 0.01 && Math.abs(native - invoice.originalAmount) > 0.01;
    const pendingAmount = Math.max(0, disagreement ? native : computed);
    return {
      referenceName: invoice.referenceName, voucherNumber: invoice.voucherNumber,
      invoiceDate: invoice.invoiceDate, dueDate: bill?.dueDate || null,
      originalAmount: invoice.originalAmount, pendingAmount,
      settledAmount: Math.max(0, invoice.originalAmount - pendingAmount),
      sourceVoucherType: invoice.sourceVoucherType, sourceSalesLedgerName: invoice.sourceSalesLedgerName,
      narration: invoice.narration,
      receiptDate: proof?.lastReceiptDate || null,
      matchedReceiptAmount: proof ? Math.round(proof.receipts * 100) / 100 : null,
      receipts: [...(proof?.receiptList || [])].sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? ''))),
      invoiceEvidenceAmbiguous: invoice.invoiceEvidenceAmbiguous || Boolean(proof?.ambiguous) || disagreement || computed < -0.01,
      status: pendingAmount <= 0.005 ? 'settled' : 'open',
    };
  }
  function add(ledgerName, row) {
    const bucket = byLedger[ledgerName];
    (row.pendingAmount <= 0.005 ? bucket.settledBills : bucket.openBills).push(row);
    bucket.rawCount++;
  }
  for (const bill of bills) {
    const ledgerName = requestedLedgerByKey.get(normalizeLooseName(bill.ledger));
    if (!ledgerName) continue;
    billCount++;
    const key = openBillNarrationKey(ledgerName, bill.ref);
    const invoice = evidence.invoices.get(key);
    if (invoice) {
      if (seen.has(invoice.key)) continue;
      seen.add(invoice.key);
      add(ledgerName, invoiceRow(invoice, bill));
      continue;
    }
    const entry = openBillFromFields(bill, ledgerName, {knownAdvance: evidence.advanceReferenceKeys.has(key)});
    if (!entry) continue;
    const {kind, ...row} = entry;
    if (kind === 'advance') { byLedger[ledgerName].existingAdvances.push(row); byLedger[ledgerName].rawCount++; }
    else add(ledgerName, {...row, narration: null, sourceSalesLedgerName: null, receiptDate: null, matchedReceiptAmount: null});
  }
  // Settled invoices are absent from Tally's pending Bill collection. Retain
  // them separately for CD review, never in the collection/reminder list.
  for (const invoice of evidence.canonicalInvoices.values()) {
    if (seen.has(invoice.key)) continue;
    const proof = evidence.settlements.get(invoice.key);
    if (!proof) continue;
    const row = invoiceRow(invoice);
    // A missing bill alone is not settlement proof.
    if (row.pendingAmount > 0.005) continue;
    add(invoice.ledgerName, row);
  }
  return { byLedger, billCount };
}

// buildOpenBillAmountIndex on fields: open bills by amount in paise.
export function openBillAmountIndexFromFields(bills) {
  const byPaise = new Map();
  for (const bill of bills) {
    const ledgerName = bill.ledger;
    const open = ledgerName ? openBillFromFields(bill, ledgerName) : null;
    if (!open || open.kind !== "bill") continue;
    const closing = bill.closing ?? bill.pending ?? bill.amount;
    if (!closing) continue;
    const paise = Math.round(open.pendingAmount * 100);
    const entry = { ledgerName, referenceName: open.referenceName, invoiceDate: open.invoiceDate, pendingAmount: open.pendingAmount,
      direction: closing < 0 ? "receipt" : "payment" };
    byPaise.set(paise, [...(byPaise.get(paise) || []), entry]);
  }
  return byPaise;
}

export { normalizeLooseName as receivableNameKey, parseTallyDate as receivableTallyDate };
