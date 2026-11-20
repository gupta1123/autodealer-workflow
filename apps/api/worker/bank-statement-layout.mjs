// Read a bank statement from the positions of the words on each PDF page.
// Markdown conversion can drop rows it renders as prose, merge a totals line
// into the last row or move an amount into the wrong column. The page itself
// does not: every amount sits under its column heading and every row starts
// with a date in the date column. This reader works from that geometry for any
// bank's layout, and reports the account, period and balances it can see.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const IFSC_BANKS = {
  AUBL: "AU Small Finance Bank", BARB: "Bank of Baroda", BKID: "Bank of India", CBIN: "Central Bank of India",
  CIUB: "City Union Bank", CNRB: "Canara Bank", CSBK: "CSB Bank", DBSS: "DBS Bank", DCBL: "DCB Bank",
  ESFB: "Equitas Small Finance Bank", FDRL: "Federal Bank", HDFC: "HDFC Bank", ICIC: "ICICI Bank",
  IBKL: "IDBI Bank", IDFB: "IDFC First Bank", IDIB: "Indian Bank", INDB: "IndusInd Bank", IOBA: "Indian Overseas Bank",
  JAKA: "Jammu & Kashmir Bank", KARB: "Karnataka Bank", KKBK: "Kotak Mahindra Bank", KVBL: "Karur Vysya Bank",
  MAHB: "Bank of Maharashtra", PSIB: "Punjab & Sind Bank", PUNB: "Punjab National Bank", RATN: "RBL Bank",
  SBIN: "State Bank of India", SCBL: "Standard Chartered Bank", SIBL: "South Indian Bank", TMBL: "Tamilnad Mercantile Bank",
  UBIN: "Union Bank of India", UCBA: "UCO Bank", UTIB: "Axis Bank", YESB: "Yes Bank",
};

const BANK_NAMES = [
  [/\bstate bank of india\b|\bsbi\b/i, "State Bank of India"],
  [/\bpunjab national bank\b|\bpnb\b/i, "Punjab National Bank"],
  [/\bcentral bank of india\b/i, "Central Bank of India"],
  [/\bbank of baroda\b/i, "Bank of Baroda"],
  [/\bbank of maharashtra\b/i, "Bank of Maharashtra"],
  [/\bunion bank of india\b/i, "Union Bank of India"],
  [/\bkotak mahindra bank\b|\bkotak\b/i, "Kotak Mahindra Bank"],
  [/\bicici bank\b/i, "ICICI Bank"],
  [/\bhdfc bank\b/i, "HDFC Bank"],
  [/\baxis bank\b/i, "Axis Bank"],
  [/\byes bank\b/i, "Yes Bank"],
  [/\bidbi bank\b/i, "IDBI Bank"],
  [/\bindusind bank\b/i, "IndusInd Bank"],
  [/\bcanara bank\b/i, "Canara Bank"],
  [/\bidfc first bank\b/i, "IDFC First Bank"],
];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function center(item) {
  return item.x + item.w / 2;
}

function median(values, fallback) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : fallback;
}

// Dates printed without a year ("20 Aug") take the statement's year.
export function parseStatementDate(value, fallbackYear = null) {
  const text = clean(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  let year; let month; let day;
  const monthNumber = (name) => MONTHS[name.toLowerCase().slice(0, name.toLowerCase().startsWith("sept") ? 4 : 3)];
  if (match) [, year, month, day] = match.map(Number);
  else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?![\d/.-])/))) {
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})\b/))) {
    day = Number(match[1]); month = monthNumber(match[2]); year = Number(match[3]);
  } else if (fallbackYear && (match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})$/))) {
    day = Number(match[1]); month = monthNumber(match[2]); year = Number(fallbackYear);
  } else return null;
  if (year < 100) year += 2000;
  if (!month || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// One amount written in a cell, possibly with Cr/Dr. Returns null when the text
// is not exactly one amount (so a reference number is never read as money).
export function parseCellMoney(value) {
  const text = clean(value).replace(/^(?:INR|Rs\.?|₹)\s*/i, "").replace(/\s+/g, "");
  if (!text || /^[-–—]+$/.test(text)) return null;
  const match = text.match(/^(\()?(-)?(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d{1,2})(\))?\(?(Cr|Dr|CR|DR|cr|dr)?\.?\)?$/);
  if (!match) return null;
  const amount = Number(`${match[3].replace(/,/g, "")}${match[4]}`);
  const negative = Boolean(match[1] && match[5]) || Boolean(match[2]) || /dr/i.test(match[6] || "");
  return { amount: negative ? -amount : amount, suffix: match[6] ? match[6].toUpperCase() : null };
}

function headerKind(label) {
  const text = label.toLowerCase().replace(/[^a-z/#. ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/\bbalance\b/.test(text)) return "balance";
  if (/(?:^|\s)(?:dr\s*\/\s*cr|cr\s*\/\s*dr)(?:\s|$)/.test(text)) return "drcr";
  if (/withdraw|\bdebit|\bdr\.? amount|\bpaid out|^dr\.?$|\(dr\.?\)/.test(text)) return "debit";
  if (/deposit|\bcredit|\bcr\.? amount|\bpaid in|^cr\.?$|\(cr\.?\)/.test(text)) return "credit";
  if (/\bvalue\b/.test(text)) return "value_date";
  if (/\bdate\b|^dt\.?$/.test(text)) return "date";
  if (/narration|description|particular|\bdetails\b/.test(text)) return "description";
  if (/remark/.test(text)) return "remarks";
  if (/\bref\b|ref\.|reference|cheque|chq|\butr\b|txn no|tran(?:saction)? (?:no|id)|instrument/.test(text)) return "reference";
  if (/^amount\b|^amt\.?$|transaction amount/.test(text)) return "amount";
  return null;
}

function toItems(page) {
  return (page.items || [])
    .filter((item) => clean(item.str))
    .map((item) => ({ text: clean(item.str), x: Number(item.transform[4]), y: Number(item.transform[5]), w: Math.max(0, Number(item.width) || 0) }));
}

function groupLines(items) {
  const lines = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 2.5);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

function lineText(line) {
  return line.items.map((item) => item.text).join(" ");
}

// A header is the band of lines (labels often wrap onto two or three lines)
// that names a date, a balance and the debit/credit or amount columns.
// Words of one heading printed side by side ("Debit" "Amount") are one label.
function joinWords(line) {
  const joined = [];
  for (const item of line.items) {
    const last = joined.at(-1);
    if (last && item.x - (last.x + last.w) <= 7) {
      joined[joined.length - 1] = { ...last, text: `${last.text} ${item.text}`, w: item.x + item.w - last.x };
    } else joined.push({ ...item });
  }
  return joined;
}

function findHeader(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const band = lines.filter((line) => Math.abs(line.y - lines[index].y) <= 13 &&
      (line === lines[index] || !line.items.some((item) => parseStatementDate(item.text) || parseCellMoney(item.text))));
    const items = band.flatMap(joinWords);
    // Words of one heading that sit on top of each other form one column label.
    const clusters = [];
    for (const item of [...items].sort((a, b) => b.y - a.y)) {
      const cluster = clusters.find((entry) => item.x < entry.right + 1 && item.x + item.w > entry.left - 1 &&
        Math.abs(center(item) - entry.center) < Math.max(18, Math.min(entry.right - entry.left, item.w) / 2 + 6));
      if (cluster) {
        cluster.parts.push(item);
        cluster.left = Math.min(cluster.left, item.x);
        cluster.right = Math.max(cluster.right, item.x + item.w);
      } else clusters.push({ parts: [item], left: item.x, right: item.x + item.w, center: center(item) });
    }
    const columns = clusters.map((cluster) => {
      const label = cluster.parts.sort((a, b) => b.y - a.y || a.x - b.x).map((part) => part.text).join(" ");
      return { label, kind: headerKind(label) || "other", left: cluster.left, right: cluster.right, center: (cluster.left + cluster.right) / 2 };
    });
    const kinds = new Set(columns.map((column) => column.kind));
    const amounts = (kinds.has("debit") && kinds.has("credit")) || kinds.has("amount");
    if (kinds.has("date") && amounts && (kinds.has("description") || kinds.has("balance"))) {
      // Keep the first column of each kind except descriptions/references.
      const chosen = [];
      for (const column of columns.sort((a, b) => a.center - b.center)) {
        if (["description", "reference", "remarks", "other"].includes(column.kind) || !chosen.some((other) => other.kind === column.kind)) chosen.push(column);
        else chosen.push({ ...column, kind: "other" });
      }
      return { columns: chosen, top: Math.max(...band.map((line) => line.y)), bottom: Math.min(...band.map((line) => line.y)) };
    }
  }
  return null;
}

// A value under a heading overlaps it. Otherwise headings mark where their
// columns begin (left-aligned labels over right-aligned amounts), so the value
// belongs to the last heading starting at or before its middle.
function columnFor(item, columns) {
  let best = null;
  for (const column of columns) {
    const overlap = Math.min(item.x + item.w, column.right) - Math.max(item.x, column.left);
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { column, overlap };
  }
  if (best) return best.column;
  const middle = center(item);
  const sorted = [...columns].sort((a, b) => a.left - b.left);
  let chosen = null;
  for (const column of sorted) if (column.left <= middle) chosen = column;
  return chosen ?? sorted[0] ?? null;
}

const MONEY_FRAGMENT = /^(?:\d{1,2}\s*)?(?:\(?(?:Cr|Dr|CR|DR)\.?\)?)$|^\d{1,2}$/;

// The amount in one column of one row: the value nearest the row's date line,
// joined with a fragment wrapped onto the next line ("4,77,57,934.3" + "7 Dr.").
function columnMoney(tokens, anchorY) {
  if (!tokens.length) return { value: null, uncertain: false };
  // A wrapped fragment ("7 Dr.") is never the value itself.
  const ordered = [...tokens].sort((a, b) => Number(MONEY_FRAGMENT.test(a.text)) - Number(MONEY_FRAGMENT.test(b.text)) ||
    Math.abs(a.y - anchorY) - Math.abs(b.y - anchorY));
  const nearest = ordered[0];
  const below = tokens.filter((token) => token !== nearest && token.y < nearest.y && nearest.y - token.y <= 20 && MONEY_FRAGMENT.test(token.text))
    .sort((a, b) => b.y - a.y);
  if (below.length) {
    const joined = parseCellMoney(`${nearest.text}${below[0].text}`.replace(/\s+/g, ""));
    if (joined) return { value: joined, uncertain: false };
  }
  const single = parseCellMoney(nearest.text);
  if (single) return { value: single, uncertain: false };
  if (/^[-–—]+$/.test(nearest.text)) return { value: null, uncertain: false };
  return { value: null, uncertain: /\d/.test(nearest.text) };
}

// A line that ends the transaction table (totals, summary, footer).
const STOP_LINE = /^\W*(?:(?:transaction |page |grand )?totals?\b|closing balance|balance c\/?f|carried forward|end of statement|statement summary|summary\b|this is a computer|computer generated|\*{1,2}\s*end)/i;
const OPENING_ROW = /\b(?:opening balance|balance b\/?f|brought forward|balance forward|b\/f)\b/i;

function rowsFromPage(lines, columns, headerBottom, pageNumber, state) {
  const dateColumn = columns.find((column) => column.kind === "date");
  const below = lines.filter((line) => headerBottom === null || line.y < headerBottom - 1);
  const stopIndex = below.findIndex((line) => STOP_LINE.test(lineText(line)));
  const body = stopIndex >= 0 ? below.slice(0, stopIndex) : below;
  const anchors = [];
  for (const line of body) {
    for (const item of line.items) {
      if (columnFor(item, columns) !== dateColumn) continue;
      const date = parseStatementDate(item.text, state.year);
      if (date) { anchors.push({ y: line.y, date, item }); break; }
    }
  }
  if (!anchors.length && state.lastDate === undefined) return [];
  const datedGaps = anchors.slice(1).map((anchor, index) => anchors[index].y - anchor.y);
  // Some banks print the date only on the first transaction of a day. A line
  // with an amount and a balance, away from any dated line, starts a row too.
  const near = Math.max(12, median(datedGaps, 30) / 4);
  const moneyKinds = (line, kinds) => line.items.some((item) => kinds.includes(columnFor(item, columns)?.kind) && parseCellMoney(item.text));
  const datedLines = new Map(body.map((line) => [line.y, line]));
  for (const line of body) {
    // A dated row whose amounts sit beside its date line (PNB) owns them.
    if (anchors.some((anchor) => anchor.date && Math.abs(anchor.y - line.y) <= near &&
      (anchor.y === line.y || !moneyKinds(datedLines.get(anchor.y), ["debit", "credit", "amount", "balance"])))) continue;
    if (!moneyKinds(line, ["balance"]) || !moneyKinds(line, ["debit", "credit", "amount"])) continue;
    if (!line.items.some((item) => columnFor(item, columns)?.kind === "description")) continue;
    anchors.push({ y: line.y, date: null, item: null });
  }
  if (!anchors.length) return [];
  anchors.sort((a, b) => b.y - a.y);
  for (const anchor of anchors) {
    if (!anchor.date) anchor.date = state.lastDate ?? null;
    state.lastDate = anchor.date;
  }
  const gaps = anchors.slice(1).map((anchor, index) => anchors[index].y - anchor.y);
  const typical = median(gaps, 30);
  // Do wrapped narration lines sit around the date line (centred cells) or
  // only below it? Lines above the first date that belong to it tell us.
  const firstY = anchors[0].y;
  const aboveFirst = body.filter((line) => line.y > firstY + 3 && line.y - firstY < typical &&
    line.items.every((item) => ["description", "reference", "remarks", "other"].includes(columnFor(item, columns)?.kind)));
  const centred = state.centred ?? (aboveFirst.length > 0);
  state.centred = centred;

  const rows = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    let top; let bottom;
    if (centred) {
      top = previous ? (previous.y + anchor.y) / 2 : (headerBottom ?? anchor.y + typical / 2);
      bottom = next ? (anchor.y + next.y) / 2 : anchor.y - typical / 2;
    } else {
      top = anchor.y + 3;
      bottom = next ? next.y + 3 : anchor.y - typical;
    }
    const regionLines = [];
    for (const line of body) {
      if (line.y > top || line.y <= bottom) continue;
      // A totals or footer line ends the table even inside the last row.
      if (!next && line.y < anchor.y - 3 && !centred) {
        const outside = line.items.some((item) => !["description", "reference", "remarks", "other"].includes(columnFor(item, columns)?.kind) &&
          !MONEY_FRAGMENT.test(item.text));
        if (outside) break;
      }
      regionLines.push(line);
    }
    const byKind = {};
    for (const line of regionLines) {
      for (const item of line.items) {
        if (item === anchor.item) continue;
        const kind = columnFor(item, columns)?.kind;
        if (!kind) continue;
        (byKind[kind] ||= []).push(item);
      }
    }
    const text = (kind) => (byKind[kind] || []).sort((a, b) => b.y - a.y || a.x - b.x).map((item) => item.text).join(" ");
    const debit = columnMoney(byKind.debit || [], anchor.y);
    const credit = columnMoney(byKind.credit || [], anchor.y);
    const amount = columnMoney(byKind.amount || [], anchor.y);
    const balance = columnMoney(byKind.balance || [], anchor.y);
    const drcr = text("drcr").toUpperCase();
    let debitAmount = debit.value && Math.abs(debit.value.amount) > 0 ? Math.abs(debit.value.amount) : null;
    let creditAmount = credit.value && Math.abs(credit.value.amount) > 0 ? Math.abs(credit.value.amount) : null;
    let needsDirection = false;
    if (!debitAmount && !creditAmount && amount.value) {
      const isCredit = /\bCR\b|CREDIT/.test(drcr) || amount.value.suffix === "CR";
      const isDebit = /\bDR\b|DEBIT/.test(drcr) || amount.value.suffix === "DR";
      if (isCredit && !isDebit) creditAmount = Math.abs(amount.value.amount);
      else {
        debitAmount = Math.abs(amount.value.amount);
        needsDirection = !isDebit;
      }
    }
    const narration = clean([text("description"), text("remarks")].filter(Boolean).join(" "));
    const reference = clean(text("reference"));
    const valueDateText = text("value_date");
    const issues = [debit, credit, amount, balance].some((cell) => cell.uncertain) ? ["uncertain_amount"] : [];
    if (OPENING_ROW.test(narration) && !debitAmount && !creditAmount) {
      // Only the first one opens the statement; later pages carry a balance forward.
      if (balance.value && state.openingBalance === null && state.offset + rows.length === 0) state.openingBalance = balance.value.amount;
      continue;
    }
    // A date with no amount, balance or narration is a footer, not a row.
    if (!debitAmount && !creditAmount && !balance.value && !narration && !issues.length) continue;
    if (needsDirection) state.pendingDirection.push(state.offset + rows.length);
    if (!anchor.date) continue;
    rows.push({
      sourceDate: anchor.item?.text ?? anchor.date,
      transactionDate: anchor.date,
      valueDate: parseStatementDate(valueDateText, state.year) || anchor.date,
      narration,
      reference,
      debitAmount,
      creditAmount,
      balanceAmount: balance.value ? balance.value.amount : null,
      page: pageNumber,
      issues,
    });
    state.lastRow = { page: pageNumber, y: anchor.y };
  }
  // Opening-balance rows without a date sit between the header and the first
  // row of the statement (on later pages they carry a balance forward).
  if (state.openingBalance === null && state.offset === 0) {
    for (const line of body) {
      if (line.y <= anchors[0].y + 2) break;
      if (!OPENING_ROW.test(lineText(line))) continue;
      const balanceItems = line.items.filter((item) => columnFor(item, columns)?.kind === "balance");
      const value = balanceItems.map((item) => parseCellMoney(item.text)).find(Boolean);
      if (value) state.openingBalance = value.amount;
    }
  }
  return rows;
}

// The opening balance is the first one printed; a closing balance printed on
// every page is final only on the last.
function labelledMoney(lines, labelPattern, { last = false } = {}) {
  const order = lines.map((_line, index) => index);
  if (last) order.reverse();
  for (const index of order) {
    const line = { ...lines[index], items: joinWords(lines[index]) };
    const labelItem = line.items.find((item) => labelPattern.test(item.text));
    if (!labelItem) continue;
    // Same item ("Opening Balance : 1,234.00") or an item to its right.
    const sameText = labelItem.text.replace(labelPattern, " ").replace(/as on\s+\S+(?:\s+\S+){0,2}/i, " ");
    const inline = sameText.split(/[:\s]+(?=[\d(₹-]|INR|Rs)/).map((part) => parseCellMoney(part.replace(/^[:\s]+/, ""))).find(Boolean);
    if (inline) return inline.amount;
    const right = line.items.filter((item) => item.x > labelItem.x).map((item) => parseCellMoney(item.text.replace(/^:\s*/, ""))).find(Boolean);
    if (right) return right.amount;
    // Summary boxes print the value on the next line, under its label.
    const below = lines[index + 1];
    if (below && line.page === below.page && line.y - below.y <= 24) {
      const candidates = below.items.map((item) => ({ item, value: parseCellMoney(item.text) })).filter((entry) => entry.value)
        .sort((a, b) => Math.abs(center(a.item) - center(labelItem)) - Math.abs(center(b.item) - center(labelItem)));
      if (candidates.length) return candidates[0].value.amount;
    }
  }
  return null;
}

function statementPeriod(text) {
  const date = String.raw`(\d{1,2}[\s/.-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/.,-]+\d{2,4})`;
  const patterns = [
    new RegExp(String.raw`(?:statement\s+)?period\s*(?:from)?\s*:?\s*${date}\s*(?:\d{1,2}:\d{2}\s*)?(?:to|-|–|till)\s*${date}`, "i"),
    new RegExp(String.raw`from\s*:?\s*${date}\s*(?:\d{1,2}:\d{2}\s*)?(?:to|-|–|till)\s*:?\s*${date}`, "i"),
    new RegExp(String.raw`(?:for the period|between)\s*${date}\s*(?:to|and|-|–)\s*${date}`, "i"),
    new RegExp(String.raw`^\s*${date}\s*(?:to|-|–)\s*${date}\s*$`, "im"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const start = match && parseStatementDate(match[1]);
    const end = match && parseStatementDate(match[2]);
    if (start && end && start <= end) return { start, end };
  }
  return { start: null, end: null };
}

function accountIdentity(headerLines, allText, pageWidth) {
  const text = headerLines.map(lineText).join("\n");
  const identity = { bankName: null, accountNumber: null, accountHolderName: null, ifscCode: null };
  const fields = labelledFields(headerLines);
  const accountValue = (value) => {
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(value))) return null;
    const match = clean(value).match(/([0-9Xx*][0-9Xx* -]{4,30}[0-9])\s*$/) || clean(value).match(/\b([0-9Xx*]{6,34})\b/);
    return match && /\d{3}/.test(match[1]) ? match[1].replace(/[\s-]/g, "").toUpperCase() : null;
  };
  identity.accountNumber = accountValue(fields.number || "") || accountValue(fields.statementAccount || "");
  if (!identity.accountNumber) {
    const accountMatch = text.match(/(?:account\s*(?:number|no\.?|#)|a\/c\s*(?:no\.?|number)?|acct\.?\s*no\.?)\s*:?\s*([0-9Xx*][0-9Xx* -]{5,30}[0-9])/i);
    if (accountMatch) identity.accountNumber = accountMatch[1].replace(/[\s-]/g, "").toUpperCase();
  }
  const ifsc = (clean(fields.ifsc).match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/) || text.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/) ||
    allText.match(/\bIFSC[^A-Z]{0,20}([A-Z]{4}0[A-Z0-9]{6})\b/))?.[1] || null;
  identity.ifscCode = ifsc;
  const statementBank = clean(fields.statementAccount).replace(/\s*[-:]\s*[0-9Xx*][0-9Xx* -]*$/, "");
  for (const [pattern, name] of BANK_NAMES) {
    if (pattern.test(statementBank) || pattern.test(text)) { identity.bankName = name; break; }
  }
  if (!identity.bankName && ifsc) identity.bankName = IFSC_BANKS[ifsc.slice(0, 4)] || null;
  if (!identity.bankName) {
    for (const [pattern, name] of BANK_NAMES) if (pattern.test(allText)) { identity.bankName = name; break; }
  }
  const holder = clean(fields.holder).replace(/\s*\|\s*$/, "");
  if (holder && /[A-Za-z]{3}/.test(holder) && !fieldKind(holder)) identity.accountHolderName = holder;
  if (!identity.accountHolderName) {
    const named = text.match(/\bM\/S\.?\s+([A-Z][A-Z0-9&.,' -]{2,80})/);
    if (named) identity.accountHolderName = clean(named[1]);
  }
  // Many statements print the customer's name, unlabelled, as the first line of
  // the address block on the left.
  if (!identity.accountHolderName) {
    for (const [lineIndex, line] of headerLines.entries()) {
      // Only the leftmost run of words: a branch address may share the line.
      const left = [];
      for (const item of line.items) {
        const last = left.at(-1);
        if (!last ? item.x < pageWidth * 0.45 : item.x - (last.x + last.w) <= 15) left.push(item);
        else break;
      }
      if (!left.length) continue;
      const value = clean(left.map((item) => item.text).join(" "));
      if (/[:\d@]/.test(value) || value.split(" ").length < 2 || value.length > 60) continue;
      if (/\b(?:bank|statement|account|branch|page|period|currency|customer|address|transactions?|details|summary|india|maharashtra|limited liability)\b/i.test(value) &&
        !/\b(?:pvt|private|ltd|limited|llp|corporation|traders|steel|alloys|industries|enterprises)\b/i.test(value)) continue;
      // A company name can wrap its "LIMITED" onto the next line.
      const nextLeft = headerLines[lineIndex + 1]?.items.find((item) => Math.abs(item.x - left[0].x) <= 3);
      const suffix = nextLeft && /^(?:private limited|pvt\.? ltd\.?|limited|ltd\.?|llp)$/i.test(clean(nextLeft.text)) ? ` ${clean(nextLeft.text)}` : "";
      identity.accountHolderName = `${value}${suffix}`;
      break;
    }
  }
  return identity;
}

function fieldKind(label) {
  const text = clean(label).toLowerCase().replace(/[:.]+$/, "").trim();
  if (/^(?:account holder(?: name)?|account name|customer(?: name)?|name of (?:the )?(?:customer|account holder)|name)$/.test(text)) return "holder";
  if (/^(?:account (?:number|no\.?|#)|a\/c (?:no\.?|number)|acct\.? no\.?|account)$/.test(text)) return "number";
  if (/^(?:ifsc(?: code)?|rtgs\/neft ifsc|branch \/ ifsc|ifsc \/ micr)$/.test(text)) return "ifsc";
  if (/^(?:statement account|statement ledger|bank \/ tally ledger|statement for account)$/.test(text)) return "statementAccount";
  return null;
}

// Any heading-like text ("ACCOUNT TYPE", "Statement date") is a label, not a value.
function looksLikeLabel(text) {
  const value = clean(text).replace(/:$/, "");
  return Boolean(fieldKind(value)) || (/^(?:account|statement|branch|currency|customer|opening|closing|ifsc|nominee|product|a\/c|period)\b/i.test(value) && !/\d/.test(value));
}

// "Label : value" on one line (several may share a line), or a label with its
// value printed beneath it.
export function labelledFields(lines) {
  const fields = {};
  const joined = lines.map((line) => ({ ...line, items: joinWords(line) }));
  for (let index = 0; index < joined.length; index += 1) {
    const items = joined[index].items;
    for (let position = 0; position < items.length; position += 1) {
      const item = items[position];
      // "Account holder: X Account: Y IFSC: Z" printed as one run of text.
      const segments = item.text.includes(":")
        ? item.text.split(/\s+(?=(?:account holder(?: name)?|account name|account number|account no\.?|account|a\/c no\.?|customer(?: name| id)?|cust id|ifsc(?: code)?|statement \w+|branch(?: name| code)?|currency|period|page)\s*:)/i)
          .map((segment) => segment.match(/^([^:]{2,40}?)\s*:\s*(.*)$/)).filter(Boolean)
        : [];
      for (const [, label, value] of segments) {
        const kind = fieldKind(label);
        if (kind && !fields[kind] && clean(value)) fields[kind] = clean(value);
      }
      if (segments.length) {
        const [, label, value] = segments[0];
        const kind = fieldKind(label);
        const right = items[position + 1];
        if (kind && !fields[kind] && !clean(value) && right && !looksLikeLabel(right.text)) fields[kind] = clean(right.text.replace(/^:\s*/, ""));
        continue;
      }
      // A bare "Account" is a label only with a colon ("ACCOUNT STATEMENT" is a title).
      const kind = /^account$/i.test(clean(item.text)) ? null : fieldKind(item.text);
      if (!kind || fields[kind]) continue;
      let right = items[position + 1];
      let value = "";
      if (right && clean(right.text) === ":") right = items[position + 2];
      else if (right && /^:/.test(right.text)) value = right.text.replace(/^:\s*/, "");
      if (!value && right && items[position + 1] !== right && !looksLikeLabel(right.text)) value = right.text;
      if (!value) {
        // Stacked: the value sits under the label on the next line.
        const overlaps = (other) => Math.min(other.x + other.w, item.x + item.w) - Math.max(other.x, item.x) > 0;
        const below = joined.slice(index + 1).find((line) => joined[index].y - line.y <= 24 && line.items.some(overlaps));
        const under = below?.items.find(overlaps);
        if (under && !looksLikeLabel(under.text)) value = under.text;
      }
      if (!value && right && right.x - (item.x + item.w) <= 60 && !looksLikeLabel(right.text)) value = right.text;
      if (clean(value)) fields[kind] = clean(value);
    }
  }
  return fields;
}

/**
 * pages: [{ pageNumber, width, items: pdf.js text items }]
 * Returns rows in the order printed plus the statement's account, period and
 * opening/closing balances. `detected` is false when no transaction header was found.
 */
export function extractBankStatementLayout(pages) {
  const pageLines = pages.map((page) => ({ page, lines: groupLines(toItems(page)).map((line) => ({ ...line, page: page.pageNumber })) }));
  let header = null;
  let headerPageIndex = -1;
  for (let index = 0; index < pageLines.length && !header; index += 1) {
    header = findHeader(pageLines[index].lines);
    if (header) headerPageIndex = index;
  }
  if (!header) return { detected: false, rows: [], issues: ["no_transaction_header"] };
  header.page = pageLines[headerPageIndex].page.pageNumber;
  const firstPageLines = pageLines[headerPageIndex].lines;
  const headerLines = firstPageLines.filter((line) => line.y > header.top + 1);
  const headerText = headerLines.map(lineText).join("\n");
  const period = statementPeriod(headerText);
  const yearSource = period.start || headerText.match(/\b\d{1,2}[\s/.-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/.,-]+(20\d{2})\b/)?.[1] ||
    headerText.match(/\b(20\d{2})-\d{2}-\d{2}\b/)?.[1] || null;
  const state = { centred: null, openingBalance: null, pendingDirection: [], offset: 0, year: yearSource ? Number(String(yearSource).slice(0, 4)) : null };
  const rows = [];
  const bands = [];
  let columns = header.columns;
  for (let index = headerPageIndex; index < pageLines.length; index += 1) {
    const { page, lines } = pageLines[index];
    const pageHeader = index === headerPageIndex ? header : findHeader(lines);
    if (pageHeader) {
      columns = pageHeader.columns;
      bands.push({ page: page.pageNumber, top: pageHeader.top + 1, bottom: pageHeader.bottom - 1 });
    }
    state.offset = rows.length;
    rows.push(...rowsFromPage(lines, columns, pageHeader ? pageHeader.bottom : null, page.pageNumber, state));
  }
  // A single amount column without Dr/Cr: the balance movement gives the direction.
  for (const index of state.pendingDirection) {
    const row = rows[index];
    const previous = rows[index - 1];
    if (!row || row.balanceAmount === null) continue;
    const before = previous?.balanceAmount ?? state.openingBalance;
    if (before === null || before === undefined) continue;
    const delta = Number((row.balanceAmount - before).toFixed(2));
    if (Math.abs(Math.abs(delta) - row.debitAmount) < 0.01 && delta > 0) {
      row.creditAmount = row.debitAmount;
      row.debitAmount = null;
    }
  }
  // The same row printed twice in a row, with the balance unchanged, is a
  // duplicate print: a real second payment would move the balance.
  const duplicatesRemoved = [];
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const row = rows[index];
    const previous = rows[index - 1];
    const same = ["transactionDate", "narration", "reference", "debitAmount", "creditAmount", "balanceAmount"]
      .every((field) => row[field] === previous[field]);
    if (same && row.balanceAmount !== null) duplicatesRemoved.push(rows.splice(index, 1)[0]);
  }
  const allLines = pageLines.flatMap((entry) => entry.lines);
  const allText = allLines.map(lineText).join("\n");
  // Column headings ("Closing Balance") are labels of the table, not values.
  const labelLines = allLines.filter((line) => !bands.some((band) => band.page === line.page && line.y <= band.top && line.y >= band.bottom));
  // The opening balance is printed above the table or in a summary after it.
  const lastRow = state.lastRow;
  const openingLines = labelLines.filter((line) =>
    (line.page === header.page && line.y > header.top + 1) ||
    (lastRow && (line.page > lastRow.page || (line.page === lastRow.page && line.y < lastRow.y - 3))));
  const opening = state.openingBalance ?? labelledMoney(openingLines, /\b(?:opening balance|balance b\/?f|brought forward)\b.*$/i);
  const closing = labelledMoney(labelLines, /\b(?:closing balance|closing bal|balance c\/?f|carried forward)\b.*$/i, { last: true });
  // Without a balance column, the printed opening and closing balances still
  // prove the rows when they add up; then each row gets its running balance.
  let derivedBalances = false;
  if (rows.length && rows.every((row) => row.balanceAmount === null) && opening !== null && closing !== null) {
    const total = rows.reduce((sum, row) => sum + (row.creditAmount || 0) - (row.debitAmount || 0), 0);
    if (Math.abs(opening + total - closing) < 0.01) {
      let running = opening;
      for (const row of rows) {
        running = Number((running + (row.creditAmount || 0) - (row.debitAmount || 0)).toFixed(2));
        row.balanceAmount = running;
        row.derivedBalance = true;
      }
      derivedBalances = true;
    }
  }
  const dates = rows.map((row) => row.transactionDate).filter(Boolean).sort();
  return {
    detected: true,
    layout: "page_layout",
    rows,
    openingBalance: opening,
    closingBalance: closing,
    derivedBalances,
    statementPeriodStart: period.start || dates[0] || null,
    statementPeriodEnd: period.end || dates.at(-1) || null,
    account: accountIdentity(headerLines.length ? headerLines : firstPageLines.slice(0, 30), allText, Number(pageLines[headerPageIndex].page.width) || 600),
    columns: header.columns.map((column) => ({ kind: column.kind, label: column.label })),
    duplicatesRemoved: duplicatesRemoved.length,
    issues: [
      ...(rows.some((row) => row.issues.length) ? ["uncertain_amount"] : []),
      ...(duplicatesRemoved.length ? ["duplicate_rows_removed"] : []),
    ],
  };
}
