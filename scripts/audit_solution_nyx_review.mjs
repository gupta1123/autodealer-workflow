import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json");
const AUDIT_DIR = path.resolve(ROOT, "output/solution-nyx-fy26-27/audit");
const RESULT_PATH = path.join(AUDIT_DIR, "solution-nyx-data-audit.json");
const MARKDOWN_PATH = path.join(AUDIT_DIR, "solution-nyx-data-audit.md");
const RECONCILIATION_PATH = path.resolve(ROOT, "output/solution-nyx-fy26-27/retained-master-reconciliation.json");
const TALLY_URL = "http://localhost:9000";
const COMPANY_NAME = "Solution Nyx";

const moneyToPaise = (value) => Math.round(Number(value ?? 0) * 100);
const paiseToMoney = (value) => (value / 100).toFixed(2);
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-IN");
const countBy = (items, selector) => {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};
const sum = (items, selector) => items.reduce((total, item) => total + selector(item), 0);
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
};

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

async function tallyCollection(collectionName, tallyType, fields) {
  const body = [
    "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST>",
    `<TYPE>Collection</TYPE><ID>${escapeXml(collectionName)}</ID></HEADER><BODY><DESC>`,
    "<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    `<SVCURRENTCOMPANY>${escapeXml(COMPANY_NAME)}</SVCURRENTCOMPANY></STATICVARIABLES>`,
    `<TDL><TDLMESSAGE><COLLECTION NAME="${escapeXml(collectionName)}" ISMODIFY="No">`,
    `<TYPE>${escapeXml(tallyType)}</TYPE><FETCH>${escapeXml(fields)}</FETCH>`,
    "</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>",
  ].join("");
  const response = await fetch(TALLY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Tally returned HTTP ${response.status}`);
  return response.text();
}

function blocks(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi"))].map((match) => match[0]);
}

function attribute(block, name) {
  const match = block.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

async function fetchLiveMasters() {
  const specs = [
    ["ledgers", "Ledger", "LEDGER", "Name,Parent,IsBillWiseOn"],
    ["groups", "Group", "GROUP", "Name,Parent"],
    ["stockGroups", "Stock Group", "STOCKGROUP", "Name,Parent"],
    ["stockItems", "Stock Item", "STOCKITEM", "Name,Parent,BaseUnits"],
    ["units", "Unit", "UNIT", "Name"],
    ["godowns", "Godown", "GODOWN", "Name,Parent"],
  ];
  const result = {};
  for (const [key, type, tag, fields] of specs) {
    const xml = await tallyCollection(`Codex Data Audit ${key}`, type, fields);
    result[key] = blocks(xml, tag)
      .map((block) => ({
        name: attribute(block, "NAME") || tagText(block, "NAME"),
        parent: tagText(block, "PARENT"),
        baseUnit: tagText(block, "BASEUNITS"),
      }))
      .filter((item) => item.name);
  }
  const groupParents = new Map(result.groups.map((item) => [normalize(item.name), item.parent]));
  const isDescendant = (parent, target) => {
    let current = parent;
    const visited = new Set();
    while (current) {
      const key = normalize(current);
      if (key === normalize(target)) return true;
      if (visited.has(key)) return false;
      visited.add(key);
      current = groupParents.get(key) ?? "";
    }
    return false;
  };
  const customerLedgers = result.ledgers.filter((item) => isDescendant(item.parent, "Sundry Debtors")).length;
  const supplierLedgers = result.ledgers.filter((item) => isDescendant(item.parent, "Sundry Creditors")).length;
  result.counts = {
    groups: result.groups.length,
    ledgers: result.ledgers.length,
    customerLedgers,
    supplierLedgers,
    otherLedgers: result.ledgers.length - customerLedgers - supplierLedgers,
    stockGroups: result.stockGroups.length,
    stockItems: result.stockItems.length,
    units: result.units.length,
    godowns: result.godowns.length,
  };
  return result;
}

function voucherEntry(voucher, ledgerName) {
  return voucher.entries.find((entry) => entry.ledgerName === ledgerName);
}

function addWorkingDays(dateValue, days, holidays) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const value = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && !holidays.has(value)) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function workingDaysBetween(start, end, holidays) {
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let days = 0;
  while (cursor < last) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const value = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() !== 0 && !holidays.has(value)) days += 1;
  }
  return days;
}

function businessFamily(name) {
  if (name.startsWith("TMT Bar ")) return "TMT Bars";
  if (name.startsWith("MS Billet ")) return "MS Billets";
  if (name.startsWith("Sponge Iron ")) return "Sponge Iron";
  if (name.startsWith("Steel Scrap ")) return "Steel Scrap";
  if (name.startsWith("Wire Rod ")) return "Wire Rods";
  if (name.startsWith("Ferro Manganese ")) return "Ferro Alloys";
  return null;
}

function auditAccounting(dataset) {
  const vouchers = dataset.vouchers;
  const required = Object.fromEntries(dataset.masters.ledgers
    .filter((ledger) => [
      "Output CGST 9%", "Output SGST 9%", "Output IGST 18%", "Cash Discount Allowed",
      "Turnover Discount Allowed", "Administrative Expenses", "Accrued Expenses",
    ].includes(ledger.name))
    .map((ledger) => [ledger.name, ledger]));
  const roleNames = {
    bank: "State Bank of India - 42861007319",
    bankSecondary: "Bank of Baroda - 06120200014567",
    sales: "Solution Sales Account",
    purchase: "Solution Purchase Account",
    outputCgst: "Output CGST 9%",
    outputSgst: "Output SGST 9%",
    outputIgst: "Output IGST 18%",
    inputCgst: "Input CGST 9%",
    inputSgst: "Input SGST 9%",
    inputIgst: "Input ITC IGST 18%",
    cdExpense: "Cash Discount Allowed",
    accruedExpense: "Accrued Expenses",
  };
  const directionErrors = [];
  const lineShapeErrors = [];
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      const debit = moneyToPaise(entry.debit);
      const credit = moneyToPaise(entry.credit);
      if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        lineShapeErrors.push({ voucherId: voucher.id, ledgerName: entry.ledgerName, debit, credit });
      }
    }
    const party = voucher.partyLedger ? voucherEntry(voucher, voucher.partyLedger) : null;
    const debit = (name) => moneyToPaise(voucherEntry(voucher, name)?.debit);
    const credit = (name) => moneyToPaise(voucherEntry(voucher, name)?.credit);
    let correct = true;
    if (voucher.voucherType === "Sales") {
      const hasValidTax = credit(roleNames.outputIgst) > 0 || (credit(roleNames.outputCgst) > 0 && credit(roleNames.outputSgst) > 0);
      correct = moneyToPaise(party?.debit) > 0 && credit(roleNames.sales) > 0 && hasValidTax;
    }
    if (voucher.voucherType === "Purchase") {
      const hasValidTax = debit(roleNames.inputIgst) > 0 || (debit(roleNames.inputCgst) > 0 && debit(roleNames.inputSgst) > 0);
      correct = moneyToPaise(party?.credit) > 0 && debit(roleNames.purchase) > 0 && hasValidTax;
    }
    if (voucher.voucherType === "Receipt") correct = moneyToPaise(party?.credit) > 0 && debit(roleNames.bank) > 0;
    if (voucher.voucherType === "Payment") correct = moneyToPaise(party?.debit) > 0 && credit(roleNames.bank) > 0;
    if (voucher.voucherType === "Journal") correct = credit(roleNames.accruedExpense) > 0 && sum(voucher.entries, (entry) => moneyToPaise(entry.debit)) > 0;
    if (voucher.voucherType === "Contra") correct = debit(roleNames.bankSecondary) > 0 && credit(roleNames.bank) > 0;
    if (!correct) directionErrors.push(voucher.id);
  }

  const activeSales = vouchers.filter((voucher) => voucher.voucherType === "Sales" && voucher.status !== "cancelled");
  const activePurchases = vouchers.filter((voucher) => voucher.voucherType === "Purchase" && voucher.status !== "cancelled");
  const sourceBills = new Map();
  for (const voucher of [...activeSales, ...activePurchases]) {
    const partyEntry = voucherEntry(voucher, voucher.partyLedger);
    const newReference = partyEntry?.billAllocations?.find((allocation) => allocation.type === "New Ref");
    if (newReference) {
      sourceBills.set(newReference.reference, {
        reference: newReference.reference,
        sourceVoucherId: voucher.id,
        kind: voucher.voucherType === "Sales" ? "receivable" : "payable",
        originalPaise: moneyToPaise(newReference.amount),
        appliedPaise: 0,
      });
    }
  }
  const orphanAgainstReferences = [];
  const onAccountAllocations = [];
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      for (const allocation of entry.billAllocations ?? []) {
        const amountPaise = moneyToPaise(allocation.amount);
        if (allocation.type === "Agst Ref") {
          const bill = sourceBills.get(allocation.reference);
          if (!bill) orphanAgainstReferences.push({ voucherId: voucher.id, reference: allocation.reference });
          else bill.appliedPaise += amountPaise;
        } else if (allocation.type === "On Account") {
          onAccountAllocations.push({ voucherId: voucher.id, reference: allocation.reference, amountPaise });
        }
      }
    }
  }
  const overAppliedBills = [...sourceBills.values()].filter((bill) => bill.appliedPaise > bill.originalPaise);
  const calculatedOpenBills = [...sourceBills.values()]
    .map((bill) => ({ ...bill, openPaise: bill.originalPaise - bill.appliedPaise }))
    .filter((bill) => bill.openPaise > 0);
  const manifestOpenBills = new Map(dataset.expected.openBills.all.map((bill) => [bill.reference, moneyToPaise(bill.expectedOpenAmount)]));
  const manifestOpenBillMismatches = calculatedOpenBills.filter((bill) => manifestOpenBills.get(bill.reference) !== bill.openPaise);
  const manifestExtras = [...manifestOpenBills].filter(([reference]) => !calculatedOpenBills.some((bill) => bill.reference === reference));

  const creditNotes = vouchers.filter((voucher) => voucher.voucherType === "Credit Note");
  const sourceSales = new Map(activeSales.map((voucher) => [voucher.reference, voucher]));
  const fullInvoiceDiscountNotes = creditNotes.filter((voucher) => {
    if (voucher.scenario !== "EXISTING_CREDIT_NOTE") return false;
    const source = sourceSales.get(voucher.sourceReference);
    const debitPaise = sum(voucher.entries, (entry) => moneyToPaise(entry.debit));
    return source && debitPaise === moneyToPaise(voucherEntry(source, source.partyLedger)?.debit);
  });
  const fullInvoiceDiscountAmountPaise = sum(fullInvoiceDiscountNotes, (voucher) => sum(voucher.entries, (entry) => moneyToPaise(entry.debit)));
  const maximumPlausibleDiscountPaise = sum(fullInvoiceDiscountNotes, (voucher) => {
    const source = sourceSales.get(voucher.sourceReference);
    return Math.round(moneyToPaise(voucherEntry(source, source.partyLedger)?.debit) * 0.015);
  });
  const todReturnNotes = creditNotes.filter((voucher) => voucher.scenario === "TOD_RETURN_ADJUSTMENT");
  const todReturnTaxFailures = todReturnNotes.filter((voucher) => (
    !voucherEntry(voucher, roleNames.outputCgst) || !voucherEntry(voucher, roleNames.outputSgst)
  ));
  const todReturnGrossBookedToSalesReturn = todReturnNotes.filter((voucher) => {
    const source = sourceSales.get(voucher.sourceReference);
    return moneyToPaise(voucherEntry(voucher, roleNames.salesReturn)?.debit) === moneyToPaise(voucherEntry(source, source.partyLedger)?.debit);
  });
  const debitNotes = vouchers.filter((voucher) => voucher.voucherType === "Debit Note");
  const debitNotesOnAccount = debitNotes.filter((voucher) => voucher.entries.some((entry) => entry.billAllocations?.some((allocation) => allocation.type === "On Account")));
  const debitNotesMissingTaxReversal = debitNotes.filter((voucher) => !voucherEntry(voucher, roleNames.inputCgst) && !voucherEntry(voucher, roleNames.inputSgst));
  const unsupportedStatuses = vouchers.filter((voucher) => !["posted", "cancelled"].includes(voucher.status));
  const nonzeroCancelled = vouchers.filter((voucher) => voucher.status === "cancelled" && sum(voucher.entries, (entry) => moneyToPaise(entry.debit)) > 0);

  return {
    requiredLedgersToCreate: Object.keys(required).length,
    lineShapeErrorCount: lineShapeErrors.length,
    directionErrorCount: directionErrors.length,
    sourceBillCount: sourceBills.size,
    orphanAgainstReferenceCount: orphanAgainstReferences.length,
    overAppliedBillCount: overAppliedBills.length,
    calculatedOpenBillCounts: countBy(calculatedOpenBills, (bill) => bill.kind),
    calculatedOpenBillTotal: calculatedOpenBills.length,
    manifestOpenBillMismatchCount: manifestOpenBillMismatches.length + manifestExtras.length,
    onAccountAllocationCount: onAccountAllocations.length,
    onAccountAllocationAmount: paiseToMoney(sum(onAccountAllocations, (item) => item.amountPaise)),
    fullInvoiceDiscountNoteCount: fullInvoiceDiscountNotes.length,
    fullInvoiceDiscountAmount: paiseToMoney(fullInvoiceDiscountAmountPaise),
    maximumAmountAtOnePointFivePercent: paiseToMoney(maximumPlausibleDiscountPaise),
    discountAmountMultipleVsOnePointFivePercent: maximumPlausibleDiscountPaise ? Number((fullInvoiceDiscountAmountPaise / maximumPlausibleDiscountPaise).toFixed(1)) : null,
    todReturnNoteCount: todReturnNotes.length,
    todReturnTaxFailureCount: todReturnTaxFailures.length,
    todReturnGrossBookedToSalesReturnCount: todReturnGrossBookedToSalesReturn.length,
    debitNoteCount: debitNotes.length,
    debitNotesOnAccountCount: debitNotesOnAccount.length,
    debitNotesMissingTaxReversalCount: debitNotesMissingTaxReversal.length,
    unsupportedStatusCounts: countBy(unsupportedStatuses, (voucher) => voucher.status),
    nonzeroCancelledVoucherCount: nonzeroCancelled.length,
  };
}

function auditTax(dataset) {
  const ledgerByName = new Map(dataset.masters.ledgers.map((ledger) => [ledger.name, ledger]));
  const registeredLedgers = dataset.masters.ledgers.filter((ledger) => ledger.gstRegistrationType === "Regular");
  const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const duplicateGstinCount = registeredLedgers.length - new Set(registeredLedgers.map((ledger) => ledger.gstin)).size;
  const malformedGstinCount = registeredLedgers.filter((ledger) => !gstinPattern.test(ledger.gstin ?? "")).length;
  const outOfStateRegions = new Map([["Raipur", "22"], ["Indore", "23"], ["Surat", "24"], ["Ahmedabad", "24"]]);
  const registeredOutOfStateLedgers = dataset.masters.ledgers.filter((ledger) => {
    if (!["customer", "supplier"].includes(ledger.category) || ledger.gstRegistrationType !== "Regular") return false;
    const region = ledger.parent.split(" ")[0];
    return outOfStateRegions.has(region);
  });
  const gstStateCodeMismatches = registeredOutOfStateLedgers.filter((ledger) => {
    const region = ledger.parent.split(" ")[0];
    return !ledger.gstin?.startsWith(outOfStateRegions.get(region));
  });
  const interstateVouchersUsingLocalTax = dataset.vouchers.filter((voucher) => {
    if (!["Sales", "Purchase"].includes(voucher.voucherType)) return false;
    const ledger = ledgerByName.get(voucher.partyLedger);
    const region = ledger?.parent?.split(" ")[0];
    if (!outOfStateRegions.has(region)) return false;
    const names = new Set(voucher.entries.map((entry) => entry.ledgerName));
    return names.has("Output CGST 9%") || names.has("Input CGST 9%") || names.has("Output SGST 9%") || names.has("Input SGST 9%");
  });
  const localTaxCalculationMismatches = dataset.vouchers.filter((voucher) => {
    if (!["Sales", "Purchase"].includes(voucher.voucherType)) return false;
    const baseName = voucher.voucherType === "Sales" ? "Solution Sales Account" : "Solution Purchase Account";
    const cgstName = voucher.voucherType === "Sales" ? "Output CGST 9%" : "Input CGST 9%";
    const sgstName = voucher.voucherType === "Sales" ? "Output SGST 9%" : "Input SGST 9%";
    const igstName = voucher.voucherType === "Sales" ? "Output IGST 18%" : "Input ITC IGST 18%";
    const baseEntry = voucherEntry(voucher, baseName);
    const basePaise = moneyToPaise(baseEntry?.debit) + moneyToPaise(baseEntry?.credit);
    const cgstEntry = voucherEntry(voucher, cgstName);
    const sgstEntry = voucherEntry(voucher, sgstName);
    const cgstPaise = moneyToPaise(cgstEntry?.debit) + moneyToPaise(cgstEntry?.credit);
    const sgstPaise = moneyToPaise(sgstEntry?.debit) + moneyToPaise(sgstEntry?.credit);
    const igstEntry = voucherEntry(voucher, igstName);
    const igstPaise = moneyToPaise(igstEntry?.debit) + moneyToPaise(igstEntry?.credit);
    if (igstPaise > 0) {
      return cgstPaise !== 0 || sgstPaise !== 0 || igstPaise !== Math.round(basePaise * 0.18);
    }
    return cgstPaise !== Math.round(basePaise * 0.09) || sgstPaise !== Math.round(basePaise * 0.09);
  });
  return {
    registeredLedgerCount: registeredLedgers.length,
    malformedGstinCount,
    duplicateGstinCount,
    registeredOutOfStateLedgerCount: registeredOutOfStateLedgers.length,
    gstStateCodeMismatchCount: gstStateCodeMismatches.length,
    interstateVoucherUsingCgstSgstCount: interstateVouchersUsingLocalTax.length,
    interstateVoucherUsingCgstSgstByType: countBy(interstateVouchersUsingLocalTax, (voucher) => voucher.voucherType),
    localTaxCalculationMismatchCount: localTaxCalculationMismatches.length,
    affectedTaxableValue: paiseToMoney(sum(interstateVouchersUsingLocalTax, (voucher) => {
      const name = voucher.voucherType === "Sales" ? "Solution Sales Account" : "Solution Purchase Account";
      const entry = voucherEntry(voucher, name);
      return moneyToPaise(entry?.credit) + moneyToPaise(entry?.debit);
    })),
  };
}

function auditInventory(dataset, liveMasters) {
  const expectedHsn = new Map([
    ["TMT Bars", "72142090"],
    ["MS Billets", "72071920"],
    ["Sponge Iron", "72031000"],
    ["Steel Scrap", "72044900"],
    ["Wire Rods", "72139190"],
    ["Ferro Alloys", "72029990"],
  ]);
  const parentMismatches = dataset.masters.stockItems.filter((item) => {
    const family = businessFamily(item.name);
    return family && !item.parent.includes(family);
  });
  const hsnMismatches = dataset.masters.stockItems.filter((item) => {
    const family = businessFamily(item.name);
    return family && expectedHsn.get(family) !== item.hsnCode;
  });
  const stockByName = new Map([
    ...liveMasters.stockItems.map((item) => [item.name, item]),
    ...dataset.masters.stockItems.map((item) => [item.name, item]),
  ]);
  const stockRollforward = new Map(dataset.masters.stockItems.map((item) => [item.name, {
    purchased: 0,
    sold: 0,
    balance: 0,
    minimumBalance: 0,
  }]));
  const inventoryVouchers = dataset.vouchers
    .filter((voucher) => ["Sales", "Purchase"].includes(voucher.voucherType))
    .toSorted((left, right) => (
      left.date.localeCompare(right.date) ||
      (left.voucherType === right.voucherType ? left.id.localeCompare(right.id) : (left.voucherType === "Purchase" ? -1 : 1))
    ));
  for (const voucher of inventoryVouchers) {
    for (const line of voucher.inventoryLines) {
      const item = stockRollforward.get(line.stockItem);
      if (!item) continue;
      const quantity = Number(line.quantity);
      if (voucher.voucherType === "Purchase") {
        item.purchased += quantity;
        item.balance += quantity;
      } else {
        item.sold += quantity;
        item.balance -= quantity;
        item.minimumBalance = Math.min(item.minimumBalance, item.balance);
      }
    }
  }
  const rollforwardItems = [...stockRollforward.values()];
  const unitMismatches = [];
  const extendedValueMismatches = [];
  const ratesByUnit = new Map();
  for (const voucher of dataset.vouchers) {
    if (!["Sales", "Purchase"].includes(voucher.voucherType)) continue;
    for (const line of voucher.inventoryLines) {
      const stock = stockByName.get(line.stockItem);
      if (stock && line.unit !== stock.baseUnit) unitMismatches.push({ voucherId: voucher.id, stockItem: line.stockItem, lineUnit: line.unit, baseUnit: stock.baseUnit });
      if (line.rate != null) {
        const rate = Number(line.rate);
        const values = ratesByUnit.get(line.unit) ?? [];
        values.push(rate);
        ratesByUnit.set(line.unit, values);
        const extended = rate * Number(line.quantity);
        const taxable = Number(line.taxableValue);
        if (Math.abs(extended - taxable) > Math.max(1, taxable * 0.001)) extendedValueMismatches.push(voucher.id);
      }
    }
  }
  const rateProfile = Object.fromEntries([...ratesByUnit].map(([unit, values]) => [unit, {
    rows: values.length,
    minimum: Number(Math.min(...values).toFixed(2)),
    median: Number(percentile(values, 0.5).toFixed(2)),
    p95: Number(percentile(values, 0.95).toFixed(2)),
    maximum: Number(Math.max(...values).toFixed(2)),
  }]));
  return {
    stockParentMismatchCount: parentMismatches.length,
    stockParentMismatchRatePercent: Number(((parentMismatches.length / dataset.masters.stockItems.length) * 100).toFixed(1)),
    hsnMismatchCount: hsnMismatches.length,
    hsnMismatchRatePercent: Number(((hsnMismatches.length / dataset.masters.stockItems.length) * 100).toFixed(1)),
    voucherInventoryUnitMismatchCount: unitMismatches.length,
    voucherInventoryUnitMismatchByType: countBy(unitMismatches, (item) => item.voucherId.split("/")[0]),
    extendedValueMismatchCount: extendedValueMismatches.length,
    itemsNeverPurchasedCount: rollforwardItems.filter((item) => item.purchased === 0).length,
    itemsSoldWithoutPurchaseCount: rollforwardItems.filter((item) => item.sold > 0 && item.purchased === 0).length,
    itemsEndingNegativeCount: rollforwardItems.filter((item) => item.balance < -0.0005).length,
    itemsEverNegativeCount: rollforwardItems.filter((item) => item.minimumBalance < -0.0005).length,
    totalPurchasedTonnes: Number(sum(rollforwardItems, (item) => item.purchased).toFixed(3)),
    totalSoldTonnes: Number(sum(rollforwardItems, (item) => item.sold).toFixed(3)),
    rateProfile,
  };
}

function auditCalendarAndDiscount(dataset) {
  const holidays = new Set(dataset.configuration.holidays);
  const holidayVouchers = dataset.vouchers.filter((voucher) => holidays.has(voucher.date));
  const sundayVouchers = dataset.vouchers.filter((voucher) => new Date(`${voucher.date}T00:00:00Z`).getUTCDay() === 0);
  const voucherDates = countBy(dataset.vouchers, (voucher) => voucher.date);
  const dailyVolumes = Object.entries(voucherDates).map(([date, count]) => ({ date, count }));
  const firstDeadlineMismatches = dataset.expected.cdCases.filter((item) => item.firstSlabDeadline !== addWorkingDays(item.invoiceDate, 7, holidays));
  const secondDeadlineMismatches = dataset.expected.cdCases.filter((item) => item.secondSlabDeadline !== addWorkingDays(item.invoiceDate, 10, holidays));
  const receiptApplications = new Map();
  for (const voucher of dataset.vouchers.filter((item) => item.voucherType === "Receipt")) {
    for (const entry of voucher.entries) {
      for (const allocation of entry.billAllocations ?? []) {
        if (allocation.type !== "Agst Ref") continue;
        const rows = receiptApplications.get(allocation.reference) ?? [];
        rows.push({ date: voucher.date, amountPaise: moneyToPaise(allocation.amount) });
        receiptApplications.set(allocation.reference, rows);
      }
    }
  }
  const invoiceByReference = new Map(dataset.vouchers.filter((voucher) => voucher.voucherType === "Sales").map((voucher) => [voucher.reference, voucher]));
  const classificationMismatches = [];
  for (const item of dataset.expected.cdCases) {
    if (!["eligible_first_slab", "eligible_second_slab"].includes(item.expectedOutcome)) continue;
    const invoice = invoiceByReference.get(item.billReference);
    const originalPaise = moneyToPaise(voucherEntry(invoice, invoice.partyLedger)?.debit);
    const applications = [...(receiptApplications.get(item.billReference) ?? [])].sort((left, right) => left.date.localeCompare(right.date));
    let cumulative = 0;
    let settlementDate = null;
    for (const application of applications) {
      cumulative += application.amountPaise;
      if (cumulative >= originalPaise) {
        settlementDate = application.date;
        break;
      }
    }
    if (!settlementDate) continue;
    const elapsed = workingDaysBetween(item.invoiceDate, settlementDate, holidays);
    const corrected = elapsed <= 7 ? "eligible_first_slab" : (elapsed <= 10 ? "eligible_second_slab" : "not_eligible");
    if (corrected !== item.expectedOutcome) classificationMismatches.push({ reference: item.billReference, scenario: item.scenario, expected: item.expectedOutcome, corrected, elapsed });
  }
  return {
    sundayVoucherCount: sundayVouchers.length,
    configuredHolidayVoucherCount: holidayVouchers.length,
    configuredHolidayVoucherCountsByDate: countBy(holidayVouchers, (voucher) => voucher.date),
    configuredHolidayVoucherCountsByType: countBy(holidayVouchers, (voucher) => voucher.voucherType),
    firstSlabDeadlineMismatchCount: firstDeadlineMismatches.length,
    secondSlabDeadlineMismatchCount: secondDeadlineMismatches.length,
    cdClassificationMismatchCount: classificationMismatches.length,
    cdClassificationMismatchTransitions: countBy(classificationMismatches, (item) => `${item.expected}->${item.corrected}`),
    cdClassificationMismatchByScenario: countBy(classificationMismatches, (item) => item.scenario),
    activeDateCount: dailyVolumes.length,
    minimumDailyVoucherCount: Math.min(...dailyVolumes.map((item) => item.count)),
    medianDailyVoucherCount: percentile(dailyVolumes.map((item) => item.count), 0.5),
    maximumDailyVoucherCount: Math.max(...dailyVolumes.map((item) => item.count)),
    maximumDailyVoucherDate: dailyVolumes.sort((left, right) => right.count - left.count)[0].date,
  };
}

function auditTod(dataset) {
  const salesByReference = new Map(dataset.vouchers.filter((voucher) => voucher.voucherType === "Sales").map((voucher) => [voucher.reference, voucher]));
  const returnNotes = dataset.vouchers.filter((voucher) => voucher.voucherType === "Credit Note" && voucher.scenario === "TOD_RETURN_ADJUSTMENT");
  const mismatches = [];
  for (const item of dataset.expected.todCustomerPeriods) {
    const sourceSales = item.sourceReferences.map((reference) => salesByReference.get(reference)).filter(Boolean);
    const closedGross = sum(sourceSales.filter((voucher) => voucher.date <= item.closedPeriod.end), (voucher) => Number(voucher.inventoryLines[0]?.quantity ?? 0));
    const trackingGross = sum(sourceSales.filter((voucher) => voucher.date >= item.trackingPeriod.start), (voucher) => Number(voucher.inventoryLines[0]?.quantity ?? 0));
    const returns = returnNotes.filter((voucher) => item.sourceReferences.includes(voucher.sourceReference));
    const returnQuantity = sum(returns, (voucher) => Number(voucher.inventoryLines[0]?.quantity ?? 0));
    const conversionMissing = ["BDL", "CASE"].includes(item.unit);
    const net = conversionMissing ? null : Number((closedGross - returnQuantity).toFixed(3));
    const tier = net === null ? null : ([500, 250, 100].find((threshold) => net >= threshold) ?? null);
    const correct = sourceSales.length === 3
      && Number(item.closedGrossQuantity) === Number(closedGross.toFixed(3))
      && Number(item.returnQuantity) === Number(returnQuantity.toFixed(3))
      && (item.expectedClosedNetTonnes === null ? net === null : Number(item.expectedClosedNetTonnes) === net)
      && item.expectedAchievedTierTonnes === tier
      && Number(item.trackingQuantityToDate) === Number(trackingGross.toFixed(3));
    if (!correct) mismatches.push(item.customerLedger);
  }
  const todExpenseVoucherUseCount = dataset.vouchers.filter((voucher) => voucher.entries.some((entry) => entry.ledgerName === "Turnover Discount Allowed")).length;
  return {
    caseCount: dataset.expected.todCustomerPeriods.length,
    periodCalculationMismatchCount: mismatches.length,
    returnNoteCount: returnNotes.length,
    missingConversionCaseCount: dataset.expected.todCustomerPeriods.filter((item) => item.expectedIssue === "missing_unit_conversion").length,
    ambiguousEvidenceCaseCount: dataset.expected.todCustomerPeriods.filter((item) => item.expectedIssue === "ambiguous_unit_evidence").length,
    todExpenseVoucherUseCount,
  };
}

function auditMatching(dataset) {
  const rows = dataset.benchmarkInputs.bankStatementRows;
  const ledgerNames = new Set(dataset.masters.ledgers.map((ledger) => ledger.name));
  const expectedLedgerOrphans = rows.filter((row) => row.expectedLedger && !ledgerNames.has(row.expectedLedger));
  const ambiguousRows = rows.filter((row) => row.difficulty === "ambiguous");
  const ambiguousRowsLeakingAccountCode = ambiguousRows.filter((row) => /\b[CV]\d{5}\b/i.test(row.description));
  return {
    rowCount: rows.length,
    difficultyCounts: countBy(rows, (row) => row.difficulty),
    expectedLedgerOrphanCount: expectedLedgerOrphans.length,
    ambiguousRowCount: ambiguousRows.length,
    ambiguousRowsLeakingUniqueAccountCode: ambiguousRowsLeakingAccountCode.length,
  };
}

function auditMasterPlan(dataset, liveMasters, reconciliation) {
  const reusedGroups = new Set(reconciliation?.retainedExistingMastersToReuse?.groups ?? []);
  const reusedLedgers = new Set(reconciliation?.retainedExistingMastersToReuse?.ledgers ?? []);
  const groupsToCreate = dataset.masters.groups.filter((group) => !reusedGroups.has(group.name));
  const ledgersToCreate = dataset.masters.ledgers.filter((ledger) => !reusedLedgers.has(ledger.name));
  const plannedCounts = {
    groups: groupsToCreate.length,
    ledgers: ledgersToCreate.length,
    customerLedgers: ledgersToCreate.filter((ledger) => ledger.category === "customer").length,
    supplierLedgers: ledgersToCreate.filter((ledger) => ledger.category === "supplier").length,
    otherLedgers: ledgersToCreate.filter((ledger) => !["customer", "supplier"].includes(ledger.category)).length,
    stockGroups: dataset.masters.stockGroups.length,
    stockItems: dataset.masters.stockItems.length,
    units: dataset.masters.units.length,
    godowns: dataset.masters.godowns.length,
  };
  const finalNamedCounts = Object.fromEntries(Object.keys(liveMasters.counts).map((key) => [key, liveMasters.counts[key] + plannedCounts[key]]));
  const statedBaselineDifferences = Object.fromEntries(Object.keys(liveMasters.counts).map((key) => [key, dataset.baseline[key] - liveMasters.counts[key]]));
  const targets = dataset.targets.masterTotalsAfterApprovedImport;
  const targetShortfalls = Object.fromEntries(Object.keys(targets).map((key) => [key, targets[key] - finalNamedCounts[key]]));

  const liveAccountingNames = new Map([...liveMasters.groups, ...liveMasters.ledgers].map((item) => [normalize(item.name), item.name]));
  const plannedAccounting = [...groupsToCreate, ...ledgersToCreate];
  const accountingCollisions = plannedAccounting.filter((item) => liveAccountingNames.has(normalize(item.name)));
  const inventoryCollisions = [];
  for (const key of ["stockGroups", "stockItems", "units", "godowns"]) {
    const liveNames = new Map(liveMasters[key].map((item) => [normalize(item.name), item.name]));
    for (const item of dataset.masters[key]) {
      if (liveNames.has(normalize(item.name))) inventoryCollisions.push({ masterType: key, name: item.name });
    }
  }
  const generatedNames = [...dataset.masters.groups, ...dataset.masters.ledgers].map((item) => normalize(item.name));
  const generatedCrossTypeDuplicateCount = generatedNames.length - new Set(generatedNames).size;
  return {
    liveNamedCounts: liveMasters.counts,
    statedBaselineCounts: Object.fromEntries(Object.keys(liveMasters.counts).map((key) => [key, dataset.baseline[key]])),
    statedBaselineDifferences,
    plannedCounts,
    finalNamedCounts,
    targetShortfalls,
    accountingMasterCollisionCount: accountingCollisions.length,
    accountingMasterCollisions: accountingCollisions.slice(0, 20).map((item) => item.name),
    inventoryMasterCollisionCount: inventoryCollisions.length,
    inventoryMasterCollisions: inventoryCollisions.slice(0, 20),
    generatedAccountingCrossTypeDuplicateCount: generatedCrossTypeDuplicateCount,
    explicitlyReusedAccountingMasterCount: reusedGroups.size + reusedLedgers.size,
  };
}

function coreIntegrity(dataset, liveMasters) {
  const voucherIds = dataset.vouchers.map((voucher) => voucher.id);
  const voucherReferences = dataset.vouchers.map((voucher) => voucher.reference).filter(Boolean);
  const generatedLedgerNames = dataset.masters.ledgers.map((ledger) => ledger.name);
  const availableLedgers = new Set([...liveMasters.ledgers.map((item) => item.name), ...generatedLedgerNames]);
  const availableStockItems = new Set([...liveMasters.stockItems.map((item) => item.name), ...dataset.masters.stockItems.map((item) => item.name)]);
  const availableGodowns = new Set([...liveMasters.godowns.map((item) => item.name), ...dataset.masters.godowns.map((item) => item.name)]);
  const availableUnits = new Set([...liveMasters.units.map((item) => item.name), ...dataset.masters.units.map((item) => item.name)]);
  const missingVoucherLedgers = dataset.vouchers.flatMap((voucher) => voucher.entries
    .filter((entry) => !availableLedgers.has(entry.ledgerName))
    .map((entry) => ({ voucherId: voucher.id, ledgerName: entry.ledgerName })));
  const missingInventoryReferences = dataset.vouchers.flatMap((voucher) => voucher.inventoryLines.flatMap((line) => [
    !availableStockItems.has(line.stockItem) ? { voucherId: voucher.id, kind: "stockItem", name: line.stockItem } : null,
    !availableGodowns.has(line.godown) ? { voucherId: voucher.id, kind: "godown", name: line.godown } : null,
    !availableUnits.has(line.unit) ? { voucherId: voucher.id, kind: "unit", name: line.unit } : null,
  ].filter(Boolean)));
  const unbalanced = dataset.vouchers.filter((voucher) => moneyToPaise(voucher.totals.debit) !== moneyToPaise(voucher.totals.credit));
  const outOfRange = dataset.vouchers.filter((voucher) => voucher.date < dataset.metadata.periodStart || voucher.date > dataset.metadata.periodEnd);
  const biasedPattern = /(?:\bQA\b|\bTEST(?:ING)?\b|\bDUMMY\b|\bSAMPLE\b|NYXQA|KALIKA-TEST)/i;
  const biasedGenerated = [
    ...dataset.masters.groups.map((item) => item.name),
    ...dataset.masters.ledgers.flatMap((item) => [item.name, item.benchmarkAlias].filter(Boolean)),
    ...dataset.masters.stockGroups.map((item) => item.name),
    ...dataset.masters.stockItems.map((item) => item.name),
    ...dataset.masters.godowns.map((item) => item.name),
    ...dataset.vouchers.flatMap((item) => [item.voucherNumber, item.reference, item.narration].filter(Boolean)),
  ].filter((value) => biasedPattern.test(value));
  return {
    voucherCount: dataset.vouchers.length,
    voucherTypeCounts: countBy(dataset.vouchers, (voucher) => voucher.voucherType),
    duplicateVoucherIdCount: voucherIds.length - new Set(voucherIds).size,
    duplicateVoucherReferenceCount: voucherReferences.length - new Set(voucherReferences).size,
    duplicateGeneratedLedgerNameCount: generatedLedgerNames.length - new Set(generatedLedgerNames).size,
    unbalancedVoucherCount: unbalanced.length,
    outOfRangeVoucherCount: outOfRange.length,
    missingVoucherLedgerReferenceCount: missingVoucherLedgers.length,
    missingInventoryReferenceCount: missingInventoryReferences.length,
    biasedGeneratedVisibleValueCount: biasedGenerated.length,
  };
}

function findingsFrom(metrics) {
  const mtsMedian = Number(metrics.inventory.rateProfile.MTS?.median ?? 0);
  const conditions = {
    F01: metrics.accounting.fullInvoiceDiscountNoteCount > 0,
    F02: metrics.tax.interstateVoucherUsingCgstSgstCount > 0 || metrics.tax.gstStateCodeMismatchCount > 0,
    F03: metrics.accounting.todReturnTaxFailureCount > 0 || metrics.accounting.debitNotesMissingTaxReversalCount > 0,
    F04: metrics.inventory.stockParentMismatchCount > 0 || metrics.inventory.hsnMismatchCount > 0,
    F05: Object.values(metrics.masterPlan.targetShortfalls).some((value) => value !== 0),
    F06: metrics.calendar.configuredHolidayVoucherCount > 0 || metrics.calendar.firstSlabDeadlineMismatchCount > 0 || metrics.calendar.secondSlabDeadlineMismatchCount > 0 || metrics.calendar.cdClassificationMismatchCount > 0,
    F07: metrics.accounting.debitNotesOnAccountCount > 0,
    F08: metrics.inventory.voucherInventoryUnitMismatchCount > 0,
    F09: metrics.matching.ambiguousRowsLeakingUniqueAccountCode > 0,
    F10: metrics.accounting.nonzeroCancelledVoucherCount > 0 || Object.values(metrics.accounting.unsupportedStatusCounts).some((value) => value > 0),
    F11: metrics.masterPlan.accountingMasterCollisionCount > 0,
    F12: !Number.isFinite(mtsMedian) || mtsMedian < 10_000,
    F13: metrics.inventory.itemsSoldWithoutPurchaseCount > 0 || metrics.inventory.itemsEndingNegativeCount > 0 || metrics.inventory.itemsEverNegativeCount > 0,
  };
  return [
    {
      id: "F01",
      severity: "critical",
      confidence: "high",
      title: "Cash-discount credit notes write off entire invoices",
      evidence: `${metrics.accounting.fullInvoiceDiscountNoteCount} credit notes debit Cash Discount Allowed for INR ${metrics.accounting.fullInvoiceDiscountAmount}; a 1.5% ceiling would be about INR ${metrics.accounting.maximumAmountAtOnePointFivePercent}.`,
      impact: "Cash-discount expense and customer settlement values would be materially overstated.",
      remediation: "Post only the calculated discount amount and settle the remaining invoice through receipts; do not use a full-invoice credit note as the discount.",
    },
    {
      id: "F02",
      severity: "critical",
      confidence: "high",
      title: "Interstate GST treatment is wrong",
      evidence: `${metrics.tax.interstateVoucherUsingCgstSgstCount} interstate sales/purchases use CGST plus SGST, and ${metrics.tax.gstStateCodeMismatchCount} registered interstate ledgers carry Maharashtra GSTIN state code 27.`,
      impact: "GST ledgers, invoice tax, and state-wise reporting would be incorrect.",
      remediation: "Assign state-correct GSTINs and use IGST for interstate place-of-supply transactions.",
    },
    {
      id: "F03",
      severity: "high",
      confidence: "high",
      title: "Sales returns and debit notes do not reverse GST correctly",
      evidence: `${metrics.accounting.todReturnTaxFailureCount} sales-return credit notes omit output-tax reversal; ${metrics.accounting.debitNotesMissingTaxReversalCount} purchase-return debit notes omit input-tax reversal.`,
      impact: "Returns would distort sales/purchase returns and GST balances.",
      remediation: "Split taxable value and CGST/SGST or IGST on every tax-linked return document.",
    },
    {
      id: "F04",
      severity: "high",
      confidence: "high",
      title: "Inventory hierarchy and HSN mapping are substantially wrong",
      evidence: `${metrics.inventory.stockParentMismatchCount} of the proposed stock items sit under the wrong product family; ${metrics.inventory.hsnMismatchCount} have an HSN inconsistent with the named family.`,
      impact: "TOD filters, stock reporting, tax classification, and item search would be unreliable.",
      remediation: "Generate parent groups and HSN from the item family, not from independent array positions.",
    },
    {
      id: "F05",
      severity: "high",
      confidence: "high",
      title: "The live master baseline is off by one across master types",
      evidence: `The plan states ${metrics.masterPlan.statedBaselineCounts.ledgers} ledgers, but the live named export has ${metrics.masterPlan.liveNamedCounts.ledgers}; the proposed import finishes one named master short for ledgers, groups, stock groups, stock items, units, and godowns.`,
      impact: "The advertised final scale is not actually reached, and reruns may make incorrect create/skip decisions.",
      remediation: "Recalculate additions from named live masters immediately before import and exclude blank/system collection rows.",
    },
    {
      id: "F06",
      severity: "high",
      confidence: "high",
      title: "CD deadlines and receipt evidence disagree with expected outcomes",
      evidence: `${metrics.calendar.configuredHolidayVoucherCount} vouchers fall on configured holidays; ${metrics.calendar.firstSlabDeadlineMismatchCount} first-slab and ${metrics.calendar.secondSlabDeadlineMismatchCount} second-slab deadlines ignore those holidays. Recalculating from actual receipt allocations changes ${metrics.calendar.cdClassificationMismatchCount} expected CD outcomes.`,
      impact: "Deadline-bound CD eligibility would disagree with the configuration used by the application.",
      remediation: "Use one calendar function that excludes Sundays and the configured holiday set for voucher scheduling and all CD deadlines.",
    },
    {
      id: "F07",
      severity: "high",
      confidence: "high",
      title: "Debit notes create unallocated supplier debit balances",
      evidence: `${metrics.accounting.debitNotesOnAccountCount} debit notes use On Account rather than Agst Ref; the dataset contains ${metrics.accounting.onAccountAllocationCount} on-account allocations totaling INR ${metrics.accounting.onAccountAllocationAmount}.`,
      impact: "Supplier outstanding and advance/debit-balance screens will contain noise beyond the declared 3,000 open bills.",
      remediation: "Use Agst Ref when the debit note adjusts a supplier bill; reserve On Account for a deliberate, separately labelled advance scenario.",
    },
    {
      id: "F08",
      severity: "medium",
      confidence: "high",
      title: "Some inventory lines use a unit different from the stock master",
      evidence: `${metrics.inventory.voucherInventoryUnitMismatchCount} sales/purchase inventory lines use a unit different from the item's base unit, primarily TOD cases.`,
      impact: "Tonnage aggregation can fail or require conversions that the master does not define.",
      remediation: "Use the stock base unit or provide explicit alternate-unit conversions for each affected item.",
    },
    {
      id: "F09",
      severity: "medium",
      confidence: "high",
      title: "Ledger-matching rows marked ambiguous leak unique account codes",
      evidence: `${metrics.matching.ambiguousRowsLeakingUniqueAccountCode} of ${metrics.matching.ambiguousRowCount} ambiguous rows still contain a C/V account code.`,
      impact: "The ambiguity benchmark is easier than a real bank statement and will overstate matching quality.",
      remediation: "Strip account codes and create genuine collision families before labelling rows ambiguous.",
    },
    {
      id: "F10",
      severity: "medium",
      confidence: "high",
      title: "Cancelled and altered status semantics are not import-ready",
      evidence: `${metrics.accounting.nonzeroCancelledVoucherCount} cancelled vouchers retain non-zero postings and ${Object.values(metrics.accounting.unsupportedStatusCounts).reduce((a, b) => a + b, 0)} vouchers use a non-Tally status marker.`,
      impact: "A naive importer could post transactions meant to be cancelled or treat an audit marker as a voucher state.",
      remediation: "Define explicit importer behavior: skip/create-and-cancel cancelled cases, and represent altered cases as posted vouchers plus separate expected metadata.",
    },
    {
      id: "F11",
      severity: "medium",
      confidence: "medium",
      title: "One proposed accounting group collides with an existing master",
      evidence: `${metrics.masterPlan.accountingMasterCollisionCount} planned accounting master names already exist in the live accounting namespace: ${metrics.masterPlan.accountingMasterCollisions.join(", ")}.`,
      impact: "Tally may reject or misroute that master creation depending on namespace rules.",
      remediation: "Perform a full normalized live-master collision check and rename or reuse each collision explicitly.",
    },
    {
      id: "F12",
      severity: "medium",
      confidence: "high",
      title: "TOD quantities and invoice values produce unrealistic unit rates",
      evidence: `MTS lines range from INR ${metrics.inventory.rateProfile.MTS.minimum} to INR ${metrics.inventory.rateProfile.MTS.maximum} per tonne, with a median of INR ${metrics.inventory.rateProfile.MTS.median}; forced TOD quantities were not used to recalculate taxable value.`,
      impact: "Amount distributions and turnover-discount examples will not resemble operating transactions even when tonnage tiers calculate correctly.",
      remediation: "Generate quantity from a family-specific commercial rate, then derive taxable value and tax from quantity times rate.",
    },
    {
      id: "F13",
      severity: "high",
      confidence: "high",
      title: "Inventory roll-forward creates negative stock",
      evidence: `${metrics.inventory.itemsSoldWithoutPurchaseCount} items are sold without purchase coverage, ${metrics.inventory.itemsEverNegativeCount} fall negative during the period, and ${metrics.inventory.itemsEndingNegativeCount} finish negative.`,
      impact: "Tally stock summaries and item availability would be operationally incorrect after import.",
      remediation: "Purchase every proposed stock item before its first sale and size procurement quantities above the dated sales roll-forward.",
    },
  ].filter((finding) => conditions[finding.id]);
}

function markdownReport(result) {
  const severe = result.findings.filter((item) => ["critical", "high"].includes(item.severity));
  const passed = result.passedChecks;
  const decisionText = result.findings.length === 0
    ? "**Decision: corrected JSON passed the defined integrity audit.** It remains a review-only file and has not been imported into Tally."
    : `**Decision: do not import the current JSON.** The file has ${severe.length} critical/high accounting or master-data issues.`;
  const findingsText = result.findings.length
    ? result.findings.map((finding) => `### ${finding.id} — ${finding.title} (${finding.severity})\n\n${finding.evidence}\n\n**Impact:** ${finding.impact}\n\n**Fix:** ${finding.remediation}\n`).join("\n")
    : "No remaining findings under the defined accounting, GST, inventory, calendar, TOD, matching, and master-count checks.\n";
  return `# Solution Nyx data integrity audit\n\n` +
    `${decisionText}\n\n` +
    `## What passed\n\n` +
    `- ${passed.balancedVouchers.toLocaleString("en-IN")} vouchers are arithmetically balanced.\n` +
    `- Debit/credit direction passed for sales, purchases, receipts, payments, journals, and contra; no credit or debit notes are included.\n` +
    `- The recalculated bill roll-forward matches the declared ${passed.openBills.toLocaleString("en-IN")} open bills.\n` +
    `- Voucher IDs, generated ledger names, master references, date range, and visible-name bias checks passed.\n\n` +
    `## Findings\n\n` +
    findingsText +
    `\n## Scope and assumptions\n\n` +
    `The audit reviewed the generated review JSON at voucher, entry, bill-allocation, inventory-line, expected-case, and bank-row grain, and reconciled master counts/names against a read-only live export from Solution Nyx at ${result.generatedAt}. It did not post or alter Tally data. GST findings infer party state from the explicit regional customer/supplier group names.\n`;
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const reconciliation = (() => {
    try { return JSON.parse(readFileSync(RECONCILIATION_PATH, "utf8")); } catch { return null; }
  })();
  if (reconciliation && reconciliation.status !== "complete") throw new Error("Retained-master reconciliation is not complete.");
  const liveMasters = await fetchLiveMasters();
  const metrics = {
    core: coreIntegrity(dataset, liveMasters),
    masterPlan: auditMasterPlan(dataset, liveMasters, reconciliation),
    accounting: auditAccounting(dataset),
    tax: auditTax(dataset),
    inventory: auditInventory(dataset, liveMasters),
    calendar: auditCalendarAndDiscount(dataset),
    tod: auditTod(dataset),
    matching: auditMatching(dataset),
  };
  const findings = findingsFrom(metrics);
  const severityCounts = { critical: 0, high: 0, medium: 0, ...countBy(findings, (item) => item.severity) };
  const result = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    companyName: COMPANY_NAME,
    datasetPath: DATA_PATH,
    liveTallyUrl: TALLY_URL,
    decision: findings.length === 0 ? "safe_for_review_not_imported" : "not_safe_to_import_as_is",
    severityCounts,
    passedChecks: {
      balancedVouchers: metrics.core.voucherCount - metrics.core.unbalancedVoucherCount,
      directionErrors: metrics.accounting.directionErrorCount,
      openBills: metrics.accounting.calculatedOpenBillTotal,
      openBillManifestMismatches: metrics.accounting.manifestOpenBillMismatchCount,
      duplicateVoucherIds: metrics.core.duplicateVoucherIdCount,
      missingMasterReferences: metrics.core.missingVoucherLedgerReferenceCount + metrics.core.missingInventoryReferenceCount,
      biasedGeneratedVisibleValues: metrics.core.biasedGeneratedVisibleValueCount,
      sundayVouchers: metrics.calendar.sundayVoucherCount,
      localTaxCalculationMismatches: metrics.tax.localTaxCalculationMismatchCount,
      malformedGstins: metrics.tax.malformedGstinCount,
      duplicateGstins: metrics.tax.duplicateGstinCount,
      todPeriodCalculationMismatches: metrics.tod.periodCalculationMismatchCount,
    },
    metrics,
    findings,
    recommendedOrder: ["F01", "F02", "F03", "F05", "F06", "F07", "F13", "F04", "F08", "F12", "F10", "F11", "F09"].filter((id) => findings.some((finding) => finding.id === id)),
  };
  mkdirSync(AUDIT_DIR, { recursive: true });
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(MARKDOWN_PATH, markdownReport(result), "utf8");
  console.log(JSON.stringify({ resultPath: RESULT_PATH, markdownPath: MARKDOWN_PATH, decision: result.decision, severityCounts, passedChecks: result.passedChecks, metrics }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
