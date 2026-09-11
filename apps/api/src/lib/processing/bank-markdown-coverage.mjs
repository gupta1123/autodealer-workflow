// Source evidence, not an AI-reported count. Keep repeated transactions: identity
// is the source position, never a deduplication by amount/reference/narration.
const DATE = /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s,-]+\d{2,4})(?:\s|$)/;
const money = value => {
  const cleaned = String(value ?? "").replace(/[,₹\s]/g, "").replace(/(?:CR|DR)$/i, "");
  return /^-?\d+\.\d{2}$/.test(cleaned) ? Math.round(Number(cleaned) * 100) : null;
};
const cellsOf = line => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(s => s.trim());
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
// Account-details tables contain dates too. Only explicit label/value pairs
// qualify as metadata; an arbitrary undated row must still fail closed.
const ACCOUNT_FIELD = /^(?:account (?:holder|holder name|name|number|no\.?|type)|statement (?:date|period)|branch(?:\s*\/\s*ifsc)?|ifsc(?: code)?)$/i;
function isAccountMetadata(cells) {
  return cells.length >= 2 && cells.length % 2 === 0 &&
    cells.every((cell, index) => index % 2 === 1 || ACCOUNT_FIELD.test(clean(cell)));
}
function isoDate(value) {
  const parts = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  let year, month, day;
  if (parts) {
    [year, month, day] = parts[1].length === 4 ? parts.slice(1).map(Number) : [Number(parts[3]), Number(parts[2]), Number(parts[1])];
    if (year < 100) year += 2000;
  } else {
    const words = value.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})/);
    if (!words) return null;
    day = Number(words[1]); year = Number(words[3]); if (year < 100) year += 2000;
    month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(words[2].slice(0, 3).toLowerCase()) + 1;
  }
  if (!month || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function inventoryBankMarkdown(markdown) {
  const rows = [];
  const context = [];
  let page = 1;
  let referenceColumn = -1;
  let narrationColumn = -1;
  let ambiguousRows = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const pageMatch = line.match(/\bPage\s+(\d+)\s+(?:of|\/)\s*\d+/i);
    if (pageMatch) page = Number(pageMatch[1]);
    if (!line.trim().startsWith("|")) {
      // A dated line outside a table may be a transaction omitted by the parser.
      if (DATE.test(line.trim())) ambiguousRows++;
      context.push(line);
      continue;
    }
    const cells = cellsOf(line);
    if (isAccountMetadata(cells)) {
      context.push(line);
      continue;
    }
    if (/date/i.test(cells[0] || "") && !DATE.test(cells[0])) {
      referenceColumn = cells.findIndex(c => /reference|ref\.?\s*(?:no|number)|utr|cheque/i.test(c));
      narrationColumn = cells.findIndex(c => /narration|description|particulars|details/i.test(c));
      context.push(line);
      continue;
    }
    if (cells.every(c => /^:?-*:?$/.test(c))) { context.push(line); continue; }
    const dated = DATE.test(cells[0] || "");
    if (!dated) {
      // Continuation rows cannot be safely counted as separate transactions.
      // Keep them with their preceding source row, including full narration.
      if (rows.length && !cells[0] && cells.some(Boolean)) {
        if (cells.some(c => money(c) !== null)) ambiguousRows++;
        rows.at(-1).markdown += "\n" + line;
      }
      else if (cells.some(c => DATE.test(c) || money(c) !== null)) ambiguousRows++;
      else context.push(line);
      continue;
    }
    const amounts = cells.map(money).filter(n => n !== null);
    if (!amounts.length || !isoDate(cells[0])) ambiguousRows++;
    const reference = referenceColumn >= 0 ? cells[referenceColumn] : null;
    rows.push({ id: rows.length + 1, page, markdown: line, date: isoDate(cells[0]),
      narration: narrationColumn >= 0 ? cells[narrationColumn] : null,
      reference: reference && !/^[-–—]+$/.test(reference) ? reference : null, amounts });
  }
  return { rows, context: context.join("\n"), verifiable: rows.length > 0 && ambiguousRows === 0, ambiguousRows };
}

export function verifyBankChunk(sourceRows, transactions) {
  if (!Array.isArray(transactions) || transactions.length !== sourceRows.length) return false;
  const byId = new Map();
  for (const row of transactions) {
    if (!Number.isInteger(row.sourceRowId) || byId.has(row.sourceRowId)) return false;
    byId.set(row.sourceRowId, row);
  }
  return sourceRows.every(source => {
    const row = byId.get(source.id);
    if (!row || row.transactionDate !== source.date || !String(row.description || "").trim()) return false;
    if (source.narration && !clean(row.description).includes(clean(source.narration))) return false;
    if (source.reference && String(row.referenceNumber || "").trim() !== source.reference) return false;
    const debit = Number(row.debitAmount ?? 0), credit = Number(row.creditAmount ?? 0);
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (!debit && !credit)) return false;
    if (source.amounts.length >= 2 && (row.balanceAmount == null || !Number.isFinite(Number(row.balanceAmount)))) return false;
    // Every nonzero amount must be present in that source row, not another row.
    const available = [...source.amounts];
    for (const amount of [debit, credit, row.balanceAmount].filter(v => v != null && Number(v) !== 0)) {
      const i = available.indexOf(Math.round(Number(amount) * 100));
      if (i < 0) return false;
      available.splice(i, 1);
    }
    return true;
  });
}
