import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = "1.0.0";
const GENERATOR_VERSION = "2026.08.23.5";
const SEED = 26_082_023;
const COMPANY_NAME = "Solution Nyx";
const PERIOD_START = "2026-04-01";
const PERIOD_END = "2026-08-23";
const HOLIDAYS = new Set(["2026-04-14", "2026-05-01", "2026-08-15"]);
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json",
);
const SUMMARY_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review-summary.json",
);

const BASELINE = Object.freeze({
  capturedAt: "2026-08-23T00:00:00+05:30",
  source: "read_only_live_tally_export",
  companyName: COMPANY_NAME,
  groups: 56,
  ledgers: 614,
  customerLedgers: 252,
  supplierLedgers: 258,
  otherLedgers: 104,
  stockGroups: 0,
  stockItems: 2,
  units: 2,
  godowns: 2,
  reusedAccountingLedgers: [
    "State Bank of India - 42861007319",
    "Bank of Baroda - 06120200014567",
    "Solution Sales Account",
    "Solution Purchase Account",
    "Input CGST 9%",
    "Input SGST 9%",
    "Input ITC IGST 18%",
    "Solution Interest Received",
    "Round Off",
    "Cash",
  ],
  existingNamesForCleanupReview: [
    "KALIKA-TEST-CD-260816 Direct Group Customer",
    "KALIKA-TEST-CD-260816 East Customer",
    "KALIKA-TEST-CD-260816 East Region Customer",
    "KALIKA-TEST-CD-260816 North Customer",
    "KALIKA-TEST-CD-260816 Sales",
    "KALIKA-TEST-CD-260816 South Customer",
    "KALIKA-TEST-CD-260816 Special Account Customer",
    "KALIKA-TEST-CD-260816 West Customer",
    "KALIKA-TEST-CD-260816 West Region Customer",
    "Meenakshi TOD Test Sales",
  ],
});

const TARGETS = Object.freeze({
  groups: 250,
  ledgers: 12_000,
  customerLedgers: 6_000,
  supplierLedgers: 3_000,
  otherLedgers: 3_000,
  stockGroups: 75,
  stockItems: 1_500,
  units: 2,
  godowns: 20,
  vouchers: Object.freeze({
    Sales: 9_000,
    Purchase: 5_000,
    Receipt: 7_000,
    Payment: 4_000,
    Journal: 2_000,
    Contra: 500,
  }),
  openReceivableBills: 2_000,
  openPayableBills: 1_000,
  cdCases: 4_000,
  todCustomers: 1_000,
  bankStatementRows: 5_000,
});

const ADDITIONS = Object.freeze({
  groups: TARGETS.groups - BASELINE.groups,
  ledgers: TARGETS.ledgers - BASELINE.ledgers,
  customerLedgers: TARGETS.customerLedgers - BASELINE.customerLedgers,
  supplierLedgers: TARGETS.supplierLedgers - BASELINE.supplierLedgers,
  otherLedgers: TARGETS.otherLedgers - BASELINE.otherLedgers,
  stockGroups: TARGETS.stockGroups - BASELINE.stockGroups,
  stockItems: TARGETS.stockItems - BASELINE.stockItems,
  units: TARGETS.units - BASELINE.units,
  godowns: TARGETS.godowns - BASELINE.godowns,
  vouchers: TARGETS.vouchers,
});

const BUILTIN_GROUPS = Object.freeze({
  customer: "Sundry Debtors",
  supplier: "Sundry Creditors",
  sales: "Sales Accounts",
  purchase: "Purchase Accounts",
  bank: "Bank Accounts",
  tax: "Duties & Taxes",
  expense: "Indirect Expenses",
  directExpense: "Direct Expenses",
  income: "Indirect Incomes",
  currentLiability: "Current Liabilities",
  currentAsset: "Current Assets",
  loan: "Loans (Liability)",
  capital: "Capital Account",
  fixedAsset: "Fixed Assets",
  cash: "Cash-in-Hand",
});

const REQUIRED_LEDGERS = Object.freeze({
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
  todExpense: "Turnover Discount Allowed",
  generalExpense: "Administrative Expenses",
  accruedExpense: "Accrued Expenses",
  generalIncome: "Solution Interest Received",
  rounding: "Round Off",
  cash: "Cash",
});

const REUSED_LEDGER_NAMES = new Set(BASELINE.reusedAccountingLedgers);

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(SEED);

function randomInt(min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function pad(value, length = 5) {
  return String(value).padStart(length, "0");
}

function toDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addCalendarDays(value, days) {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function isWorkingDate(value) {
  const date = typeof value === "string" ? toDate(value) : value;
  return date.getUTCDay() !== 0 && !HOLIDAYS.has(isoDate(date));
}

function addWorkingDays(value, workingDays) {
  const date = toDate(value);
  let remaining = workingDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isWorkingDate(date)) remaining -= 1;
  }
  return isoDate(date);
}

function clampDate(value) {
  let normalized = value < PERIOD_START ? PERIOD_START : (value > PERIOD_END ? PERIOD_END : value);
  if (!isWorkingDate(normalized)) {
    let nextDay = normalized;
    do nextDay = addCalendarDays(nextDay, 1); while (nextDay <= PERIOD_END && !isWorkingDate(nextDay));
    if (nextDay <= PERIOD_END) return nextDay;
    do normalized = addCalendarDays(normalized, -1); while (!isWorkingDate(normalized));
  }
  return normalized;
}

function dateRange(start, end, predicate = () => true) {
  const dates = [];
  const cursor = toDate(start);
  const last = toDate(end);
  while (cursor <= last) {
    if (predicate(cursor)) dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const ACTIVE_DATES = dateRange(PERIOD_START, PERIOD_END, isWorkingDate);
const SAFE_SETTLEMENT_INVOICE_DATES = dateRange("2026-04-01", "2026-08-10", isWorkingDate);
const SAFE_PAYMENT_INVOICE_DATES = dateRange("2026-04-01", "2026-08-10", isWorkingDate);
const Q1_DATES = dateRange("2026-04-01", "2026-06-20", isWorkingDate);
const TRACKING_DATES = dateRange("2026-07-01", "2026-07-20", isWorkingDate);
const PRE_AUGUST_DATES = dateRange("2026-04-01", "2026-07-31", isWorkingDate);
const AUGUST_DATES = dateRange("2026-08-01", "2026-08-22", isWorkingDate);
const INITIAL_STOCK_DATES = dateRange("2026-04-01", "2026-04-11", isWorkingDate);

function cycleDate(dates, index, multiplier = 37) {
  return dates[(index * multiplier + Math.floor(index / Math.max(1, dates.length))) % dates.length];
}

function moneyFromPaise(paise) {
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(paise));
  return `${sign}${Math.floor(absolute / 100)}.${pad(absolute % 100, 2)}`;
}

function moneyEntry(ledgerName, debitPaise, creditPaise, billAllocations = []) {
  return {
    ledgerName,
    debit: moneyFromPaise(debitPaise),
    credit: moneyFromPaise(creditPaise),
    billAllocations,
  };
}

function allocation(reference, type, amountPaise) {
  return {
    reference,
    type,
    amount: moneyFromPaise(amountPaise),
  };
}

function lineTotals(entries) {
  return entries.reduce(
    (result, entry) => {
      result.debitPaise += Math.round(Number(entry.debit) * 100);
      result.creditPaise += Math.round(Number(entry.credit) * 100);
      return result;
    },
    { debitPaise: 0, creditPaise: 0 },
  );
}

function voucherRecord({
  id,
  voucherType,
  date,
  reference,
  narration,
  partyLedger = null,
  entries,
  inventoryLines = [],
  status = "posted",
  scenario = null,
  sourceReference = null,
  expected = {},
}) {
  const totals = lineTotals(entries);
  return {
    id,
    voucherType,
    voucherNumber: id,
    date,
    reference,
    narration,
    partyLedger,
    status,
    scenario,
    sourceReference,
    entries,
    inventoryLines,
    totals: {
      debit: moneyFromPaise(totals.debitPaise),
      credit: moneyFromPaise(totals.creditPaise),
      balanced: totals.debitPaise === totals.creditPaise,
    },
    expected,
  };
}

function generatedBusinessName(index, kind, groupName = null) {
  const founders = [
    "Agrawal", "Ajmera", "Bafna", "Bajaj", "Bansal", "Bhandari", "Bhansali", "Chandak", "Chaudhary", "Chhabra",
    "Chopra", "Daga", "Dalal", "Damani", "Desai", "Dhoot", "Doshi", "Gandhi", "Garg", "Gokhale",
    "Goyal", "Gupta", "Jadhav", "Jain", "Jaju", "Joshi", "Kabra", "Kale", "Kankariya", "Kapadia",
    "Kasliwal", "Khandelwal", "Kulkarni", "Ladha", "Lakhotia", "Lodha", "Mahajan", "Malpani", "Mehta", "Mittal",
    "Mundhra", "Nahar", "Oswal", "Pansari", "Parekh", "Patel", "Patni", "Rathi", "Sarda", "Sethia",
    "Shah", "Sharma", "Somani", "Soni", "Taparia", "Tawari", "Thakkar", "Tibrewal", "Vora", "Wadhwa",
  ];
  const brands = [
    "Aakar", "Aarohan", "Abhinav", "Arihant", "Arnav", "Avani", "Chetak", "Dakshin", "Dhruv", "Ekam",
    "Gajanan", "Giriraj", "Horizon", "Indraneel", "Kaveri", "Keystone", "Konark", "Lakshya", "Magnus", "Meridian",
    "Navdurga", "Neelkanth", "Orchid", "Pragati", "Pratham", "Rajdeep", "Rudra", "Samarth", "Sankalp", "Sarathi",
    "Shivam", "Shreyas", "Siddhi", "Sterling", "Sudarshan", "Sumeet", "Sunrise", "Triveni", "Uday", "Vaibhav",
    "Vardhan", "Vasundhara", "Vedant", "Vijay", "Vishal", "Western", "Yash", "Zenith",
  ];
  const legalStyles = ["Private Limited", "Limited", "LLP", "Industries", "Enterprises", "Corporation", "Works", "Associates"];
  const groupParts = groupName?.split(" ") ?? [];
  const activity = groupParts[1] ?? (kind === "customer" ? "Engineering" : "Metals");
  const place = groupParts[0] ?? "Pune";
  // A coprime permutation scatters adjacent records while preserving unique visible word combinations.
  const combinationCount = founders.length * brands.length * legalStyles.length;
  const permuted = (index * 7_919) % combinationCount;
  const founder = founders[permuted % founders.length];
  const brand = brands[Math.floor(permuted / founders.length) % brands.length];
  const legal = legalStyles[Math.floor(permuted / (founders.length * brands.length)) % legalStyles.length];
  return kind === "customer"
    ? `${brand} ${founder} ${activity} ${legal}, ${place}`
    : `${founder} ${brand} ${activity} ${legal}, ${place}`;
}

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function gstinChecksum(input) {
  let factor = 1;
  let sum = 0;
  for (const character of input) {
    const codePoint = BASE36.indexOf(character);
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return BASE36[(36 - (sum % 36)) % 36];
}

function generatedGstin(index, stateCode = "27") {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = letters[index % letters.length];
  const b = letters[Math.floor(index / letters.length) % letters.length];
  const pan = `${a}${b}KLM${pad((index * 7919) % 10_000, 4)}${letters[(index * 7) % letters.length]}`;
  const body = `${stateCode}${pan}${(index % 9) + 1}Z`;
  return `${body}${gstinChecksum(body)}`;
}

function stateCodeForGroupName(groupName) {
  const region = groupName.split(" ")[0];
  return ({ Raipur: "22", Indore: "23", Surat: "24", Ahmedabad: "24" })[region] ?? "27";
}

function groupDefinitions() {
  const regions = ["Pune", "Mumbai", "Nashik", "Nagpur", "Aurangabad", "Kolhapur", "Raipur", "Indore", "Surat", "Ahmedabad"];
  const customerSegments = ["Infrastructure", "Fabrication", "Engineering", "Dealer", "Construction", "Industrial", "Projects", "Trading"];
  const supplierRegions = regions.slice(0, 9);
  const supplierSegments = ["Steel", "Scrap", "Mineral", "Transport", "Consumable"];
  const expenseDepartments = ["Plant", "Administration", "Sales", "Stores", "Logistics", "Quality", "Maintenance", "Finance", "Human Resources", "Information Technology"];
  const expenseFamilies = ["Operating Expenses", "Service Expenses", "Support Expenses"];
  const incomeNames = [
    "Freight Recovery", "Handling Recovery", "Interest Income", "Insurance Claim Income", "Sale of Scrap Income",
    "Quality Claim Recovery", "Packing Recovery", "Commission Income", "Exchange Difference Income", "Rental Income",
    "Incentive Income", "Job Work Income", "Transport Recovery", "Miscellaneous Recovery", "Rebate Received",
  ];
  const operationNames = [
    "Supplier Advances", "Employee Recoverable Advances", "Travel Advances", "Security Deposits", "Utility Deposits",
    "Prepaid Insurance", "Prepaid Rent", "Prepaid Maintenance", "Accrued Income", "Interest Receivable",
    "Freight Receivable", "Insurance Claims Receivable", "Input Credit Receivable", "Goods in Transit", "Stock in Process",
    "Contract Retention Receivable", "Recoverable Duties", "Vendor Claims Receivable", "Customer Claims Receivable", "Branch Transfers in Transit",
    "Capital Advances", "Project Advances", "Other Current Assets", "Export Incentive Receivable",
  ];
  const definitions = [
    ...regions.flatMap((region) => customerSegments.map((segment) => [`${region} ${segment} Customers`, BUILTIN_GROUPS.customer, "CUSTOMER"])),
    ...supplierRegions.flatMap((region) => supplierSegments.map((segment) => [`${region} ${segment} Suppliers`, BUILTIN_GROUPS.supplier, "SUPPLIER"])),
    ...expenseDepartments.flatMap((department) => expenseFamilies.map((family) => [`${department} ${family}`, BUILTIN_GROUPS.expense, "EXPENSE"])),
    ...incomeNames.map((name) => [name, BUILTIN_GROUPS.income, "INCOME"]),
    ...operationNames.map((name) => [name, BUILTIN_GROUPS.currentAsset, "OPERATIONS"]),
  ];
  const groups = definitions.map(([name, parent, kind], index) => ({
    id: `GROUP-${kind}-${pad(index + 1, 3)}`,
    name,
    parent,
    generatedForReview: true,
  }));
  if (groups.length !== ADDITIONS.groups) throw new Error(`Group plan produced ${groups.length}; expected ${ADDITIONS.groups}.`);
  return groups;
}

function fixedLedgerDefinitions() {
  return [
    [REQUIRED_LEDGERS.bank, BUILTIN_GROUPS.bank, "bank"],
    [REQUIRED_LEDGERS.bankSecondary, BUILTIN_GROUPS.bank, "bank"],
    [REQUIRED_LEDGERS.sales, BUILTIN_GROUPS.sales, "sales_account"],
    [REQUIRED_LEDGERS.purchase, BUILTIN_GROUPS.purchase, "purchase_account"],
    [REQUIRED_LEDGERS.outputCgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.outputSgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.outputIgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.inputCgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.inputSgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.inputIgst, BUILTIN_GROUPS.tax, "gst_ledger"],
    [REQUIRED_LEDGERS.cdExpense, BUILTIN_GROUPS.expense, "discount"],
    [REQUIRED_LEDGERS.todExpense, BUILTIN_GROUPS.expense, "discount"],
    [REQUIRED_LEDGERS.generalExpense, BUILTIN_GROUPS.expense, "expense"],
    [REQUIRED_LEDGERS.accruedExpense, BUILTIN_GROUPS.currentLiability, "statutory"],
    [REQUIRED_LEDGERS.generalIncome, BUILTIN_GROUPS.income, "income"],
    [REQUIRED_LEDGERS.rounding, BUILTIN_GROUPS.expense, "rounding"],
    [REQUIRED_LEDGERS.cash, BUILTIN_GROUPS.cash, "cash"],
  ].filter(([name]) => !REUSED_LEDGER_NAMES.has(name)).map(([name, parent, category], index) => ({
    id: `LEDGER-FIXED-${pad(index + 1, 3)}`,
    name,
    parent,
    category,
    billWise: false,
    gstRegistrationType: "Unregistered",
    gstin: null,
    generatedForReview: true,
    isActive: true,
  }));
}

function ledgerDefinitions(groups) {
  const customerGroups = groups.filter((group) => group.id.includes("-CUSTOMER-"));
  const supplierGroups = groups.filter((group) => group.id.includes("-SUPPLIER-"));
  const customers = Array.from({ length: ADDITIONS.customerLedgers }, (_, index) => {
    const parent = customerGroups[index % customerGroups.length].name;
    const gstStateCode = stateCodeForGroupName(parent);
    return ({
    id: `LEDGER-CUSTOMER-${pad(index + 1)}`,
    name: generatedBusinessName(index, "customer", customerGroups[index % customerGroups.length].name),
    parent,
    category: "customer",
    billWise: true,
    gstRegistrationType: index % 4 === 0 ? "Regular" : "Unregistered",
    gstin: index % 4 === 0 ? generatedGstin(index + 1, gstStateCode) : null,
    gstStateCode,
    generatedForReview: true,
    isActive: true,
    benchmarkAlias: index % 5 === 0
      ? generatedBusinessName(index, "customer", customerGroups[index % customerGroups.length].name).replaceAll("Private Limited", "Pvt Ltd").replaceAll("Industries", "Ind")
      : null,
    });
  });
  for (const ledger of customers) {
    ledger.usageClass = Number(ledger.id.slice(-5)) > ADDITIONS.customerLedgers - 100 ? "rare" : "normal";
  }

  const suppliers = Array.from({ length: ADDITIONS.supplierLedgers }, (_, index) => {
    const parent = supplierGroups[index % supplierGroups.length].name;
    const gstStateCode = stateCodeForGroupName(parent);
    return ({
    id: `LEDGER-SUPPLIER-${pad(index + 1)}`,
    name: generatedBusinessName(index + 7_000, "supplier", supplierGroups[index % supplierGroups.length].name),
    parent,
    category: "supplier",
    billWise: true,
    gstRegistrationType: index % 3 === 0 ? "Regular" : "Unregistered",
    gstin: index % 3 === 0 ? generatedGstin(index + 10_001, gstStateCode) : null,
    gstStateCode,
    generatedForReview: true,
    isActive: true,
    usageClass: index >= ADDITIONS.supplierLedgers - 100 ? "rare" : "normal",
    });
  });

  const categories = [
    ["bank", 20, BUILTIN_GROUPS.bank],
    ["sales_account", 100, BUILTIN_GROUPS.sales],
    ["purchase_account", 100, BUILTIN_GROUPS.purchase],
    ["tax", 100, BUILTIN_GROUPS.tax],
    ["expense", 1_096, BUILTIN_GROUPS.expense],
    ["income", 500, BUILTIN_GROUPS.income],
    ["discount", 100, BUILTIN_GROUPS.expense],
    ["freight", 200, BUILTIN_GROUPS.directExpense],
    ["statutory", 200, BUILTIN_GROUPS.currentLiability],
    ["rounding", 10, BUILTIN_GROUPS.expense],
    ["cash", 10, BUILTIN_GROUPS.cash],
    ["loan", 200, BUILTIN_GROUPS.loan],
    ["capital", 100, BUILTIN_GROUPS.capital],
    ["fixed_asset", 160, BUILTIN_GROUPS.fixedAsset],
  ];
  const fixed = fixedLedgerDefinitions();
  const others = [...fixed];
  let serial = 1;
  for (const [category, targetCount, parent] of categories) {
    const alreadyPresent = fixed.filter((ledger) => ledger.category === category || (
      category === "tax" && ledger.category === "gst_ledger"
    )).length;
    for (let index = alreadyPresent; index < targetCount; index += 1) {
      others.push({
        id: `LEDGER-OTHER-${pad(serial++)}`,
        name: otherLedgerName(category, index),
        parent,
        category,
        billWise: false,
        gstRegistrationType: "Unregistered",
        gstin: null,
        generatedForReview: true,
        isActive: true,
        usageClass: index >= targetCount - Math.max(1, Math.floor(targetCount * 0.03)) ? "rare" : "normal",
      });
    }
  }
  return { customers, suppliers, others, all: [...customers, ...suppliers, ...others] };
}

function otherLedgerName(category, index) {
  const labels = {
    bank: ["Collection Account", "Current Account", "Cash Credit Account", "Merchant Settlement Account"],
    sales_account: ["Domestic Steel Sales", "Institutional Sales", "Dealer Sales", "Project Sales", "Industrial Sales", "Retail Sales"],
    purchase_account: ["Primary Steel Purchase", "Billet Purchase", "Scrap Purchase", "Alloy Purchase", "Consumable Purchase", "Packing Material Purchase"],
    tax: ["GST Liability", "GST Input Credit", "Tax Deducted at Source", "Professional Tax", "Labour Welfare Fund"],
    expense: ["Repairs and Maintenance", "Power and Fuel", "Factory Consumables", "Office Administration", "Employee Welfare", "Professional Fees", "Plant Housekeeping", "Quality Inspection", "Security Services", "Communication Charges", "Insurance Expense", "Software Subscription", "Printing and Stationery", "Travel and Conveyance", "Warehouse Expense", "Material Handling", "Contract Labour", "Calibration Expense", "Safety Equipment", "Water Charges"],
    income: ["Freight Recovery", "Handling Recovery", "Job Work Income", "Insurance Claim Recovery", "Scrap Sale Income", "Commission Income", "Quality Claim Recovery", "Packing Recovery", "Interest Income", "Service Income"],
    discount: ["Cash Discount Allowed", "Trade Discount Allowed", "Volume Rebate", "Prompt Payment Discount", "Dealer Incentive"],
    freight: ["Inbound Freight", "Outbound Freight", "Local Cartage", "Loading and Unloading", "Transit Handling"],
    statutory: ["GST Payable", "TDS Payable", "Professional Tax Payable", "Provident Fund Payable", "ESIC Payable", "Contractor Retention Payable"],
    rounding: ["Invoice Rounding", "Purchase Rounding", "Receipt Rounding", "Payment Rounding", "Tax Rounding"],
    cash: ["Petty Cash", "Factory Cash", "Administrative Cash", "Site Cash", "Imprest Cash"],
    loan: ["Working Capital Loan", "Equipment Finance", "Vehicle Finance", "Term Loan", "Unsecured Business Loan"],
    capital: ["Partner Capital", "Partner Current Account", "Promoter Contribution", "Capital Reserve", "Share Application Money"],
    fixed_asset: ["Plant and Machinery", "Material Handling Equipment", "Electrical Installation", "Office Equipment", "Computer Hardware", "Factory Furniture", "Vehicles", "Laboratory Equipment"],
  };
  const locations = ["Pune", "Mumbai", "Nashik", "Nagpur", "Aurangabad", "Kolhapur", "Raipur", "Indore"];
  const departments = ["Plant", "Administration", "Stores", "Dispatch", "Sales", "Quality", "Maintenance", "Projects", "Corporate Office", "Warehouse"];
  const qualifiers = ["General", "Operations", "North Division", "South Division", "Central Division", "Unit One", "Unit Two", "Day Shift", "Night Shift", "Annual Contract", "Project Division", "Regional Office"];
  const nature = labels[category];
  const name = nature[index % nature.length];
  const location = locations[Math.floor(index / nature.length) % locations.length];
  const department = departments[Math.floor(index / (nature.length * locations.length)) % departments.length];
  const qualifier = qualifiers[Math.floor(index / (nature.length * locations.length * departments.length)) % qualifiers.length];
  return `${name} - ${department}, ${location} (${qualifier})`;
}

function inventoryDefinitions() {
  // All generated inventory uses Solution Nyx's existing MTS unit; no unused units are proposed.
  const units = [];
  const itemFamilies = ["TMT Bar", "MS Billet", "Sponge Iron", "Steel Scrap", "Wire Rod", "Ferro Manganese"];
  const familyGroupNames = {
    "TMT Bar": "TMT Bars",
    "MS Billet": "MS Billets",
    "Sponge Iron": "Sponge Iron",
    "Steel Scrap": "Steel Scrap",
    "Wire Rod": "Wire Rods",
    "Ferro Manganese": "Ferro Alloys",
  };
  const grades = ["Commercial", "Standard", "Premium", "IS Grade", "Prime", "Secondary", "Reprocessed", "Industrial", "Export", "Special", "Domestic", "Certified", "Selected"];
  const stockGroups = Array.from({ length: ADDITIONS.stockGroups }, (_, index) => {
    const productFamily = itemFamilies[index % itemFamilies.length];
    return {
      id: `STOCK-GROUP-${pad(index + 1, 3)}`,
      name: `${grades[Math.floor(index / itemFamilies.length) % grades.length]} ${familyGroupNames[productFamily]}`,
      parent: "Primary",
      productFamily,
      todEligible: true,
      generatedForReview: true,
    };
  });
  const gradesByItem = ["Fe 500D", "IS 2830", "Grade 80", "HMS 1", "SAE 1008", "HC 70"];
  const descriptors = [
    ["8 mm", "10 mm", "12 mm", "16 mm", "20 mm", "25 mm", "32 mm"],
    ["100 x 100 mm", "125 x 125 mm", "150 x 150 mm"],
    ["Lump 3-20 mm", "Fines 0-3 mm"],
    ["Heavy Melting", "Shredded", "Plate and Structural"],
    ["5.5 mm", "6 mm", "8 mm", "10 mm"],
    ["Low Carbon", "Medium Carbon", "High Carbon"],
  ];
  const hsnByFamily = ["72142090", "72071920", "72031000", "72044900", "72139190", "72029990"];
  const stockItems = Array.from({ length: ADDITIONS.stockItems }, (_, index) => {
    const familyIndex = index % itemFamilies.length;
    const family = itemFamilies[familyIndex];
    const eligibleGroups = stockGroups.filter((group) => group.productFamily === family);
    const familySerial = Math.floor(index / itemFamilies.length);
    const descriptor = descriptors[familyIndex][familySerial % descriptors[familyIndex].length];
    return {
      id: `STOCK-ITEM-${pad(index + 1)}`,
      name: `${family} ${gradesByItem[familyIndex]} ${descriptor} - M${pad(index + 1, 5)}`,
      parent: eligibleGroups[familySerial % eligibleGroups.length].name,
      productFamily: family,
      baseUnit: "MTS",
      hsnCode: hsnByFamily[familyIndex],
      gstRate: "18.00",
      todEligible: index < 300,
      generatedForReview: true,
      isActive: true,
    };
  });
  const godownNames = [
    "Raw Material Yard", "Finished Goods Warehouse", "Billet Storage Bay", "Scrap Sorting Yard", "Sponge Iron Shed",
    "Consumable Stores", "Packing Material Store", "Transit Warehouse", "Quality Hold Area", "Production Floor Store",
    "Pune Distribution Depot", "Mumbai Distribution Depot", "Nashik Distribution Depot", "Nagpur Distribution Depot",
    "Aurangabad Distribution Depot", "Raipur Distribution Depot", "Returned Goods Area",
    "Finished Goods Transit Depot",
  ];
  const godowns = Array.from({ length: ADDITIONS.godowns }, (_, index) => ({
    id: `GODOWN-${pad(index + 1, 2)}`,
    name: godownNames[index],
    parent: "Primary",
    generatedForReview: true,
  }));
  return { units, stockGroups, stockItems, todItems: stockItems.slice(0, 300), godowns };
}

function cdScenarioFor(index) {
  if (index < 800) return { code: "CD_FIRST_WINDOW", expectedOutcome: "eligible_first_slab", receiptWorkingDay: 4 };
  if (index < 1_050) return { code: "CD_EXACT_DEADLINE", expectedOutcome: "eligible_first_slab", receiptWorkingDay: 7 };
  if (index < 1_300) return { code: "CD_ONE_DAY_LATE", expectedOutcome: "eligible_second_slab", receiptWorkingDay: 8 };
  if (index < 1_800) return { code: "CD_LATER_SLAB", expectedOutcome: "eligible_second_slab", receiptWorkingDay: 9 };
  if (index < 2_400) return { code: "CD_PARTIAL", expectedOutcome: "partially_paid", receiptWorkingDay: 6 };
  if (index < 3_000) return { code: "CD_UNPAID", expectedOutcome: "unpaid", receiptWorkingDay: null };
  if (index < 3_400) return { code: "CD_MULTIPLE_RECEIPTS", expectedOutcome: "eligible_first_slab", receiptWorkingDay: 7 };
  if (index < 3_600) return { code: "CD_ON_ACCOUNT", expectedOutcome: "unpaid_bill_with_on_account_receipt", receiptWorkingDay: 5 };
  if (index < 3_800) return { code: "CD_DEDUCTED_IN_RECEIPT", expectedOutcome: "already_discounted_in_receipt", receiptWorkingDay: 4 };
  if (index < 3_900) return { code: "CD_OVERDUE_OPEN", expectedOutcome: "not_eligible_overdue", receiptWorkingDay: null };
  return { code: "CD_MANUAL_REVIEW", expectedOutcome: "needs_manual_review", receiptWorkingDay: 8 };
}

function todScenarioFor(customerIndex) {
  if (customerIndex < 250) return { code: "TOD_BELOW_TIER", grossTonnes: 80, expected: "not_qualified", unit: "MTS" };
  if (customerIndex < 450) return { code: "TOD_NEAR_TIER", grossTonnes: 95, expected: "near_next_tier", unit: "MTS" };
  if (customerIndex < 600) {
    const boundary = [100, 250, 500][customerIndex % 3];
    return { code: "TOD_EXACT_TIER", grossTonnes: boundary, expected: "eligible_exact_boundary", unit: "MTS" };
  }
  if (customerIndex < 850) return { code: "TOD_ABOVE_TIER", grossTonnes: 550, expected: "eligible_top_tier", unit: "MTS" };
  if (customerIndex < 925) return { code: "TOD_GROWTH_ACCOUNT", grossTonnes: 300, expected: "eligible_mid_tier", unit: "MTS" };
  if (customerIndex < 975) return { code: "TOD_HIGH_VOLUME", grossTonnes: 650, expected: "eligible_top_tier", unit: "MTS" };
  return { code: "TOD_NEW_ACCOUNT", grossTonnes: 120, expected: "eligible_first_tier", unit: "MTS" };
}

function initialSettlementMode(index) {
  if (index < 4_000) {
    const scenario = cdScenarioFor(index).code;
    if (["CD_FIRST_WINDOW", "CD_EXACT_DEADLINE", "CD_ONE_DAY_LATE", "CD_LATER_SLAB", "CD_MULTIPLE_RECEIPTS", "CD_DEDUCTED_IN_RECEIPT", "CD_MANUAL_REVIEW"].includes(scenario)) return "receipt_closed";
    return "open";
  }
  if (index < 8_500) return "receipt_closed";
  return "open";
}

function rateRangeForItem(item) {
  const ranges = {
    "TMT Bar": [45_000, 70_000],
    "MS Billet": [40_000, 65_000],
    "Sponge Iron": [25_000, 45_000],
    "Steel Scrap": [25_000, 55_000],
    "Wire Rod": [45_000, 70_000],
    "Ferro Manganese": [60_000, 120_000],
  };
  return ranges[item.productFamily];
}

function initialPurchaseDateForItem(item) {
  const serial = Number(item.id.split("-").at(-1)) - 1;
  return INITIAL_STOCK_DATES[serial % INITIAL_STOCK_DATES.length];
}

function salesDefinitions(ledgerBook, inventory) {
  const sales = [];
  for (let index = 0; index < TARGETS.vouchers.Sales; index += 1) {
    const cdScenario = index < TARGETS.cdCases ? cdScenarioFor(index) : null;
    const todSlot = index >= 4_000 && index < 7_000 ? index - 4_000 : null;
    const todCustomerIndex = todSlot === null ? null : Math.floor(todSlot / 3);
    const todPart = todSlot === null ? null : todSlot % 3;
    const todScenario = todCustomerIndex === null ? null : todScenarioFor(todCustomerIndex);
    const settlementMode = initialSettlementMode(index);

    const customerIndex = todCustomerIndex === null
      ? (index < 4_000 ? index % ledgerBook.customers.length : 1_000 + ((index * 13) % (ledgerBook.customers.length - 1_000)))
      : todCustomerIndex;
    const customer = ledgerBook.customers[customerIndex];
    const item = todScenario ? inventory.todItems[index % inventory.todItems.length] : inventory.stockItems[index % inventory.stockItems.length];
    let date;
    if (todCustomerIndex !== null) {
      date = todPart < 2
        ? cycleDate(Q1_DATES, todCustomerIndex * 3 + todPart, todPart === 0 ? 17 : 29)
        : cycleDate(TRACKING_DATES, todCustomerIndex, 19);
    } else if (
      settlementMode === "receipt_closed" ||
      cdScenario?.receiptWorkingDay
    ) {
      date = cycleDate(SAFE_SETTLEMENT_INVOICE_DATES, index, 31);
    } else {
      date = cycleDate(ACTIVE_DATES, index, 43);
    }
    const firstPermittedSaleDate = addWorkingDays(initialPurchaseDateForItem(item), 1);
    if (date < firstPermittedSaleDate) date = firstPermittedSaleDate;

    const billReference = `INV/26-27/${pad(index + 1)}`;
    let quantity = Number((randomInt(500, 25_000) / 1_000).toFixed(3));
    if (todScenario) {
      const proportions = [0.4, 0.6, 0.35];
      quantity = Number((todScenario.grossTonnes * proportions[todPart]).toFixed(3));
    }
    const [minimumRate, maximumRate] = rateRangeForItem(item);
    const ratePaise = randomInt(minimumRate, maximumRate) * 100;
    const basePaise = Math.round(quantity * ratePaise);
    const interstate = customer.gstStateCode !== "27";
    const cgstPaise = interstate ? 0 : Math.round(basePaise * 0.09);
    const sgstPaise = interstate ? 0 : Math.round(basePaise * 0.09);
    const igstPaise = interstate ? Math.round(basePaise * 0.18) : 0;
    const totalPaise = basePaise + cgstPaise + sgstPaise + igstPaise;
    const narration = cdScenario
      ? `Goods supplied against ${billReference}. Cash discount: 1.5% within 7 working days or 1.0% within 10 working days.`
      : `Goods supplied against ${billReference}.`;
    const entries = [
      moneyEntry(customer.name, totalPaise, 0, [allocation(billReference, "New Ref", totalPaise)]),
      moneyEntry(REQUIRED_LEDGERS.sales, 0, basePaise),
      ...(interstate
        ? [moneyEntry(REQUIRED_LEDGERS.outputIgst, 0, igstPaise)]
        : [moneyEntry(REQUIRED_LEDGERS.outputCgst, 0, cgstPaise), moneyEntry(REQUIRED_LEDGERS.outputSgst, 0, sgstPaise)]),
    ];
    const voucher = voucherRecord({
      id: `SI/26-27/${pad(index + 1)}`,
      voucherType: "Sales",
      date,
      reference: billReference,
      narration,
      partyLedger: customer.name,
      entries,
      inventoryLines: [{
        stockItem: item.name,
        godown: inventory.godowns[index % inventory.godowns.length].name,
        direction: "outward",
        quantity: quantity.toFixed(3),
        unit: item.baseUnit,
        rate: moneyFromPaise(ratePaise),
        taxableValue: moneyFromPaise(basePaise),
        gstRate: "18.00",
      }],
      status: "posted",
      scenario: cdScenario?.code ?? todScenario?.code ?? "STANDARD_SALE",
      expected: {
        settlementMode,
        createsBill: true,
        cdOutcome: cdScenario?.expectedOutcome ?? null,
        todScenario: todScenario?.code ?? null,
      },
    });
    sales.push({
      index,
      voucher,
      customer,
      billReference,
      basePaise,
      totalPaise,
      quantity,
      unit: item.baseUnit,
      settlementMode,
      cdScenario,
      todScenario,
      todCustomerIndex,
      todPart,
      openPaise: settlementMode === "open" ? totalPaise : 0,
    });
  }
  return sales;
}

function purchaseDefinitions(ledgerBook, inventory, sales) {
  const purchases = [];
  const salesQuantityByItem = new Map();
  for (const sale of sales) {
    const itemName = sale.voucher.inventoryLines[0].stockItem;
    salesQuantityByItem.set(itemName, (salesQuantityByItem.get(itemName) ?? 0) + sale.quantity);
  }
  for (let index = 0; index < TARGETS.vouchers.Purchase; index += 1) {
    const supplier = ledgerBook.suppliers[(index * 17) % ledgerBook.suppliers.length];
    const billReference = `PB/26-27/${pad(index + 1)}`;
    const item = inventory.stockItems[index % inventory.stockItems.length];
    const occurrence = Math.floor(index / inventory.stockItems.length);
    const date = occurrence === 0
      ? initialPurchaseDateForItem(item)
      : (index < 4_000
        ? cycleDate(SAFE_PAYMENT_INVOICE_DATES, index, 23)
        : cycleDate(ACTIVE_DATES, index, 23));
    const totalSalesQuantity = salesQuantityByItem.get(item.name) ?? 0;
    const quantity = occurrence === 0
      ? Number(((totalSalesQuantity * 1.05) + randomInt(10, 50)).toFixed(3))
      : Number((randomInt(5_000, 40_000) / 1_000).toFixed(3));
    const [minimumRate, maximumRate] = rateRangeForItem(item);
    const ratePaise = randomInt(minimumRate, maximumRate) * 100;
    const basePaise = Math.round(quantity * ratePaise);
    const interstate = supplier.gstStateCode !== "27";
    const cgstPaise = interstate ? 0 : Math.round(basePaise * 0.09);
    const sgstPaise = interstate ? 0 : Math.round(basePaise * 0.09);
    const igstPaise = interstate ? Math.round(basePaise * 0.18) : 0;
    const totalPaise = basePaise + cgstPaise + sgstPaise + igstPaise;
    const entries = [
      moneyEntry(REQUIRED_LEDGERS.purchase, basePaise, 0),
      ...(interstate
        ? [moneyEntry(REQUIRED_LEDGERS.inputIgst, igstPaise, 0)]
        : [moneyEntry(REQUIRED_LEDGERS.inputCgst, cgstPaise, 0), moneyEntry(REQUIRED_LEDGERS.inputSgst, sgstPaise, 0)]),
      moneyEntry(supplier.name, 0, totalPaise, [allocation(billReference, "New Ref", totalPaise)]),
    ];
    purchases.push({
      index,
      supplier,
      billReference,
      totalPaise,
      openPaise: index >= 4_000 ? totalPaise : 0,
      voucher: voucherRecord({
        id: `PI/26-27/${pad(index + 1)}`,
        voucherType: "Purchase",
        date,
        reference: billReference,
        narration: `Materials purchased against supplier bill ${billReference}.`,
        partyLedger: supplier.name,
        entries,
        inventoryLines: [{
          stockItem: item.name,
          godown: inventory.godowns[index % inventory.godowns.length].name,
          direction: "inward",
          quantity: quantity.toFixed(3),
          unit: item.baseUnit,
          rate: moneyFromPaise(ratePaise),
          taxableValue: moneyFromPaise(basePaise),
          gstRate: "18.00",
        }],
        scenario: index >= 4_000 ? "OPEN_PAYABLE" : "PAID_PURCHASE",
        expected: { settlementMode: index >= 4_000 ? "open" : "payment_closed", createsBill: true },
      }),
    });
  }
  return purchases;
}

function closingDateForSale(sale, fallbackOffset = 3) {
  const workingDay = sale.cdScenario?.receiptWorkingDay;
  const candidate = workingDay
    ? addWorkingDays(sale.voucher.date, workingDay)
    : addCalendarDays(sale.voucher.date, fallbackOffset + (sale.index % 6));
  return clampDate(candidate);
}

function receiptVoucher(id, date, customer, allocations, scenario, sourceReferences, discountPaise = 0) {
  const totalPaise = allocations.reduce((sum, item) => sum + item.amountPaise, 0);
  const customerAllocations = allocations.map((item) => allocation(item.reference, item.type, item.amountPaise));
  return voucherRecord({
    id,
    voucherType: "Receipt",
    date,
    reference: id,
    narration: `Amount received from ${customer.name}${sourceReferences.length ? ` against ${sourceReferences.join(", ")}` : ""}${discountPaise ? "; eligible cash discount adjusted in receipt" : ""}.`,
    partyLedger: customer.name,
    entries: [
      moneyEntry(REQUIRED_LEDGERS.bank, totalPaise - discountPaise, 0),
      ...(discountPaise ? [moneyEntry(REQUIRED_LEDGERS.cdExpense, discountPaise, 0)] : []),
      moneyEntry(customer.name, 0, totalPaise, customerAllocations),
    ],
    scenario,
    sourceReference: sourceReferences.join(","),
    expected: { affectsOpenBills: allocations.some((item) => item.type === "Agst Ref") },
  });
}

function buildReceipts(sales) {
  const receipts = [];
  const closedSales = sales.filter((sale) => sale.settlementMode === "receipt_closed");
  const multipleReceiptSales = sales.filter((sale) => sale.cdScenario?.code === "CD_MULTIPLE_RECEIPTS");
  const partialSales = sales.filter((sale) => sale.cdScenario?.code === "CD_PARTIAL");
  const onAccountSales = sales.filter((sale) => sale.cdScenario?.code === "CD_ON_ACCOUNT");
  const discountedSales = sales.filter((sale) => sale.cdScenario?.code === "CD_DEDUCTED_IN_RECEIPT");
  const used = new Set([...multipleReceiptSales, ...discountedSales].map((sale) => sale.index));
  let serial = 1;

  for (const sale of multipleReceiptSales) {
    const firstPaise = Math.floor(sale.totalPaise * 0.45);
    const secondPaise = sale.totalPaise - firstPaise;
    const firstDate = clampDate(addWorkingDays(sale.voucher.date, 3));
    const secondDate = closingDateForSale(sale);
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      firstDate,
      sale.customer,
      [{ reference: sale.billReference, type: "Agst Ref", amountPaise: firstPaise }],
      "CD_MULTIPLE_RECEIPTS_PART_1",
      [sale.billReference],
    ));
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      secondDate,
      sale.customer,
      [{ reference: sale.billReference, type: "Agst Ref", amountPaise: secondPaise }],
      "CD_MULTIPLE_RECEIPTS_PART_2",
      [sale.billReference],
    ));
  }

  for (const sale of discountedSales) {
    const discountPaise = Math.round(sale.totalPaise * 0.015);
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      closingDateForSale(sale),
      sale.customer,
      [{ reference: sale.billReference, type: "Agst Ref", amountPaise: sale.totalPaise }],
      "CD_DEDUCTED_IN_RECEIPT",
      [sale.billReference],
      discountPaise,
    ));
  }

  for (const sale of partialSales) {
    const paidPaise = Math.floor(sale.totalPaise * (0.35 + ((sale.index % 6) * 0.08)));
    sale.openPaise = sale.totalPaise - paidPaise;
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      closingDateForSale(sale, 6),
      sale.customer,
      [{ reference: sale.billReference, type: "Agst Ref", amountPaise: paidPaise }],
      "CD_PARTIAL_AGAINST_REFERENCE",
      [sale.billReference],
    ));
  }

  for (const sale of onAccountSales) {
    const paidPaise = Math.floor(sale.totalPaise * 0.5);
    sale.openPaise = sale.totalPaise;
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      closingDateForSale(sale, 5),
      sale.customer,
      [{ reference: `ADV/26-27/${pad(sale.index + 1)}`, type: "On Account", amountPaise: paidPaise }],
      "CD_ON_ACCOUNT_DOES_NOT_CLOSE_BILL",
      [sale.billReference],
    ));
  }

  const remaining = closedSales.filter((sale) => !used.has(sale.index));
  const eligibleForMulti = remaining.filter((sale) => !sale.cdScenario);
  const byCustomer = new Map();
  for (const sale of eligibleForMulti) {
    const group = byCustomer.get(sale.customer.name) ?? [];
    group.push(sale);
    byCustomer.set(sale.customer.name, group);
  }
  const selectedForMulti = new Set();
  const multiBillGroups = [];
  const groupsWithThree = [...byCustomer.values()].filter((group) => group.length >= 3);
  for (const group of groupsWithThree.slice(0, 300)) {
    const selected = group.slice(0, 3);
    selected.forEach((sale) => selectedForMulti.add(sale.index));
    multiBillGroups.push(selected);
  }
  const groupsWithTwo = [...byCustomer.values()].filter((group) => (
    group.filter((sale) => !selectedForMulti.has(sale.index)).length >= 2
  ));
  for (const group of groupsWithTwo.slice(0, 600)) {
    const selected = group.filter((sale) => !selectedForMulti.has(sale.index)).slice(0, 2);
    selected.forEach((sale) => selectedForMulti.add(sale.index));
    multiBillGroups.push(selected);
  }
  if (multiBillGroups.length !== 900) {
    throw new Error(`Could only construct ${multiBillGroups.length} same-party multi-bill receipts; expected 900.`);
  }
  for (const group of multiBillGroups) {
    const date = group.map((sale) => closingDateForSale(sale)).sort().at(-1);
    const first = group[0];
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      date,
      first.customer,
      group.map((sale) => ({ reference: sale.billReference, type: "Agst Ref", amountPaise: sale.totalPaise })),
      group.length === 3 ? "THREE_BILL_RECEIPT" : "TWO_BILL_RECEIPT",
      group.map((sale) => sale.billReference),
    ));
  }

  for (const sale of remaining.filter((item) => !selectedForMulti.has(item.index))) {
    receipts.push(receiptVoucher(
      `RV/26-27/${pad(serial++)}`,
      closingDateForSale(sale),
      sale.customer,
      [{ reference: sale.billReference, type: "Agst Ref", amountPaise: sale.totalPaise }],
      "SINGLE_BILL_RECEIPT",
      [sale.billReference],
    ));
  }

  if (receipts.length !== TARGETS.vouchers.Receipt) {
    throw new Error(`Receipt construction produced ${receipts.length}; expected ${TARGETS.vouchers.Receipt}.`);
  }
  return receipts;
}

function buildPayments(purchases) {
  return purchases.slice(0, 4_000).map((purchase, index) => {
    const date = clampDate(addCalendarDays(purchase.voucher.date, 2 + (index % 7)));
    return voucherRecord({
      id: `PV/26-27/${pad(index + 1)}`,
      voucherType: "Payment",
      date,
      reference: `PAYREF/26-27/${pad(index + 1)}`,
      narration: `Payment made against supplier bill ${purchase.billReference}.`,
      partyLedger: purchase.supplier.name,
      entries: [
        moneyEntry(purchase.supplier.name, purchase.totalPaise, 0, [allocation(purchase.billReference, "Agst Ref", purchase.totalPaise)]),
        moneyEntry(REQUIRED_LEDGERS.bank, 0, purchase.totalPaise),
      ],
      scenario: "FULL_PAYABLE_SETTLEMENT",
      sourceReference: purchase.billReference,
      expected: { closesBill: true },
    });
  });
}


function buildJournals(ledgerBook) {
  const expenseLedgers = ledgerBook.others.filter((ledger) => ledger.category === "expense");
  return Array.from({ length: TARGETS.vouchers.Journal }, (_, index) => {
    const amountPaise = randomInt(500, 100_000) * 100;
    const expense = expenseLedgers[index % expenseLedgers.length]?.name ?? REQUIRED_LEDGERS.generalExpense;
    return voucherRecord({
      id: `JV/26-27/${pad(index + 1)}`,
      voucherType: "Journal",
      date: index < 1_200
        ? cycleDate(AUGUST_DATES, index, 7)
        : cycleDate(PRE_AUGUST_DATES, index - 1_200, 47),
      reference: `ACR/26-27/${pad(index + 1)}`,
      narration: "Monthly operating expense provision.",
      entries: [
        moneyEntry(expense, amountPaise, 0),
        moneyEntry(REQUIRED_LEDGERS.accruedExpense, 0, amountPaise),
      ],
      scenario: "BALANCED_ACCRUAL",
      expected: { balanced: true },
    });
  });
}

function buildContra() {
  return Array.from({ length: TARGETS.vouchers.Contra }, (_, index) => {
    const amountPaise = randomInt(1_000, 250_000) * 100;
    return voucherRecord({
      id: `CV/26-27/${pad(index + 1)}`,
      voucherType: "Contra",
      date: index < 300
        ? cycleDate(AUGUST_DATES, index, 11)
        : cycleDate(PRE_AUGUST_DATES, index - 300, 53),
      reference: `TRF/26-27/${pad(index + 1)}`,
      narration: "Funds transferred between company bank accounts.",
      entries: [
        moneyEntry(REQUIRED_LEDGERS.bankSecondary, amountPaise, 0),
        moneyEntry(REQUIRED_LEDGERS.bank, 0, amountPaise),
      ],
      scenario: "INTER_BANK_TRANSFER",
      expected: { balanced: true },
    });
  });
}

function buildOpenBills(sales, purchases) {
  const receivables = sales
    .filter((sale) => sale.voucher.status !== "cancelled" && sale.openPaise > 0)
    .map((sale) => ({
      type: "receivable",
      reference: sale.billReference,
      sourceVoucherId: sale.voucher.id,
      partyLedger: sale.customer.name,
      billDate: sale.voucher.date,
      originalAmount: moneyFromPaise(sale.totalPaise),
      expectedOpenAmount: moneyFromPaise(sale.openPaise),
      scenario: sale.cdScenario?.code ?? "STANDARD_OPEN_RECEIVABLE",
    }));
  const payables = purchases
    .filter((purchase) => purchase.openPaise > 0)
    .map((purchase) => ({
      type: "payable",
      reference: purchase.billReference,
      sourceVoucherId: purchase.voucher.id,
      partyLedger: purchase.supplier.name,
      billDate: purchase.voucher.date,
      originalAmount: moneyFromPaise(purchase.totalPaise),
      expectedOpenAmount: moneyFromPaise(purchase.openPaise),
      scenario: "STANDARD_OPEN_PAYABLE",
    }));
  return { receivables, payables, all: [...receivables, ...payables] };
}

function buildCdExpectedCases(sales) {
  return sales.slice(0, TARGETS.cdCases).map((sale) => ({
    sourceVoucherId: sale.voucher.id,
    billReference: sale.billReference,
    customerLedger: sale.customer.name,
    invoiceDate: sale.voucher.date,
    scenario: sale.cdScenario.code,
    expectedOutcome: sale.cdScenario.expectedOutcome,
    expectedOpenAmount: moneyFromPaise(sale.openPaise),
    firstSlabDeadline: addWorkingDays(sale.voucher.date, 7),
    secondSlabDeadline: addWorkingDays(sale.voucher.date, 10),
  }));
}

function buildTodExpectedCases(sales, ledgerBook) {
  const cases = [];
  for (let customerIndex = 0; customerIndex < TARGETS.todCustomers; customerIndex += 1) {
    const customer = ledgerBook.customers[customerIndex];
    const scenario = todScenarioFor(customerIndex);
    const customerSales = sales.filter((sale) => sale.todCustomerIndex === customerIndex);
    const sourceReferences = customerSales.map((sale) => sale.billReference);
    const closedGross = customerSales
      .filter((sale) => sale.voucher.date <= "2026-06-30")
      .reduce((sum, sale) => sum + sale.quantity, 0);
    const returnQuantity = 0;
    const trackingGross = customerSales
      .filter((sale) => sale.voucher.date >= "2026-07-01")
      .reduce((sum, sale) => sum + sale.quantity, 0);
    const netClosedTonnes = Number((closedGross - returnQuantity).toFixed(3));
    const achievedTier = [500, 250, 100].find((threshold) => netClosedTonnes >= threshold) ?? null;
    cases.push({
      customerLedger: customer.name,
      scenario: scenario.code,
      expectedOutcome: scenario.expected,
      unit: scenario.unit,
      closedPeriod: { start: "2026-04-01", end: "2026-06-30" },
      trackingPeriod: { start: "2026-07-01", end: PERIOD_END },
      closedGrossQuantity: closedGross.toFixed(3),
      returnQuantity: returnQuantity.toFixed(3),
      expectedClosedNetTonnes: netClosedTonnes.toFixed(3),
      expectedAchievedTierTonnes: achievedTier,
      trackingQuantityToDate: trackingGross.toFixed(3),
      sourceReferences,
      expectedIssue: null,
    });
  }
  return cases;
}

function aliasForLedger(name, difficulty, index) {
  if (difficulty === "manual_review") return `UNIDENTIFIED TRANSFER ${pad(index + 1)}`;
  if (difficulty === "ambiguous") {
    return name
      .replace(/\s*-\s*[CV]\d{5}$/i, "")
      .replace(/\s+(Pvt Ltd|& Co|Works|India)\s+/i, " ");
  }
  if (difficulty === "abbreviated") {
    return name
      .replaceAll("INDUSTRIES", "IND")
      .replaceAll("ENTERPRISES", "ENT")
      .replaceAll("PRIVATE LIMITED", "PVT LTD")
      .replaceAll("TRADING", "TRDG")
      .slice(0, 38)
      .toUpperCase();
  }
  return name.toUpperCase();
}

function buildBankStatementRows(ledgerBook) {
  const candidates = [...ledgerBook.customers, ...ledgerBook.suppliers, ...ledgerBook.others]
    .filter((ledger) => ![REQUIRED_LEDGERS.bank, REQUIRED_LEDGERS.bankSecondary].includes(ledger.name));
  return Array.from({ length: TARGETS.bankStatementRows }, (_, index) => {
    const difficulty = index < 3_500
      ? "strong"
      : index < 4_250
        ? "abbreviated"
        : index < 4_750
          ? "ambiguous"
          : "manual_review";
    const ledger = candidates[(index * 97) % candidates.length];
    const amountPaise = randomInt(100, 500_000) * 100;
    return {
      rowNumber: index + 1,
      date: cycleDate(ACTIVE_DATES, index, 61),
      reference: `${index % 2 === 0 ? "N" : "R"}${String(26_040_100_000_000 + index + 1)}`,
      description: `${index % 2 === 0 ? "NEFT" : "RTGS"} ${aliasForLedger(ledger.name, difficulty, index)}`,
      direction: index % 3 === 0 ? "debit" : "credit",
      amount: moneyFromPaise(amountPaise),
      difficulty,
      expectedLedger: difficulty === "manual_review" ? null : ledger.name,
      expectedDecision: difficulty === "manual_review" ? "manual_review" : (difficulty === "ambiguous" ? "review_collision_family" : "matched"),
    };
  });
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function validateDataset(dataset) {
  const errors = [];
  const { masters, vouchers, expected, benchmarkInputs } = dataset;
  const assertEqual = (actual, target, label) => {
    if (actual !== target) errors.push(`${label}: expected ${target}, received ${actual}`);
  };
  assertEqual(masters.groups.length, ADDITIONS.groups, "groupsToCreate");
  assertEqual(masters.ledgers.length, ADDITIONS.ledgers, "ledgersToCreate");
  assertEqual(masters.stockGroups.length, ADDITIONS.stockGroups, "stockGroupsToCreate");
  assertEqual(masters.stockItems.length, ADDITIONS.stockItems, "stockItemsToCreate");
  assertEqual(masters.units.length, ADDITIONS.units, "unitsToCreate");
  assertEqual(masters.godowns.length, ADDITIONS.godowns, "godownsToCreate");
  assertEqual(BASELINE.groups + masters.groups.length, TARGETS.groups, "finalGroupTotal");
  assertEqual(BASELINE.ledgers + masters.ledgers.length, TARGETS.ledgers, "finalLedgerTotal");
  assertEqual(BASELINE.customerLedgers + masters.ledgers.filter((ledger) => ledger.category === "customer").length, TARGETS.customerLedgers, "finalCustomerLedgerTotal");
  assertEqual(BASELINE.supplierLedgers + masters.ledgers.filter((ledger) => ledger.category === "supplier").length, TARGETS.supplierLedgers, "finalSupplierLedgerTotal");
  assertEqual(BASELINE.otherLedgers + masters.ledgers.filter((ledger) => !["customer", "supplier"].includes(ledger.category)).length, TARGETS.otherLedgers, "finalOtherLedgerTotal");
  assertEqual(vouchers.length, Object.values(TARGETS.vouchers).reduce((sum, value) => sum + value, 0), "vouchers");
  const voucherCounts = countBy(vouchers, (voucher) => voucher.voucherType);
  for (const [type, target] of Object.entries(TARGETS.vouchers)) {
    assertEqual(voucherCounts[type] ?? 0, target, `voucher.${type}`);
  }
  assertEqual(expected.openBills.receivables.length, TARGETS.openReceivableBills, "openReceivableBills");
  assertEqual(expected.openBills.payables.length, TARGETS.openPayableBills, "openPayableBills");
  assertEqual(expected.cdCases.length, TARGETS.cdCases, "cdCases");
  assertEqual(expected.todCustomerPeriods.length, TARGETS.todCustomers, "todCustomers");
  assertEqual(benchmarkInputs.bankStatementRows.length, TARGETS.bankStatementRows, "bankStatementRows");

  const ids = new Set();
  for (const voucher of vouchers) {
    if (ids.has(voucher.id)) errors.push(`Duplicate voucher id ${voucher.id}`);
    ids.add(voucher.id);
    if (voucher.date < PERIOD_START || voucher.date > PERIOD_END) errors.push(`Voucher ${voucher.id} outside date range: ${voucher.date}`);
    if (!voucher.totals.balanced) errors.push(`Voucher ${voucher.id} is not balanced`);
  }
  const generatedLedgerNames = new Set(masters.ledgers.map((ledger) => ledger.name));
  if (generatedLedgerNames.size !== masters.ledgers.length) {
    const counts = countBy(masters.ledgers, (ledger) => ledger.name);
    const examples = Object.entries(counts).filter(([, count]) => count > 1).slice(0, 10).map(([name, count]) => `${name} (${count})`);
    errors.push(`Ledger names to create are not unique: ${examples.join("; ")}`);
  }
  const ledgerNames = new Set([...generatedLedgerNames, ...BASELINE.reusedAccountingLedgers]);
  if (ledgerNames.size !== generatedLedgerNames.size + BASELINE.reusedAccountingLedgers.length) errors.push("A ledger to create collides with a reused Solution Nyx ledger");
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      if (!ledgerNames.has(entry.ledgerName)) errors.push(`Voucher ${voucher.id} uses missing ledger ${entry.ledgerName}`);
    }
  }
  const billReferences = new Set([
    ...vouchers.filter((voucher) => ["Sales", "Purchase"].includes(voucher.voucherType) && voucher.status !== "cancelled").map((voucher) => voucher.reference),
  ]);
  for (const bill of expected.openBills.all) {
    if (!billReferences.has(bill.reference)) errors.push(`Open bill ${bill.reference} has no active source voucher`);
  }
  const monthly = countBy(vouchers, (voucher) => voucher.date.slice(0, 7));
  if (Object.keys(monthly).length !== 5) errors.push(`Expected five active months, received ${Object.keys(monthly).length}`);

  const biasedNamePattern = /(?:\bQA\b|\bTEST(?:ING)?\b|\bDUMMY\b|\bSAMPLE\b|NYXQA|KALIKA-TEST)/i;
  const visibleGeneratedStrings = [
    ...masters.groups.map((item) => item.name),
    ...masters.ledgers.flatMap((item) => [item.name, item.benchmarkAlias].filter(Boolean)),
    ...masters.stockGroups.map((item) => item.name),
    ...masters.stockItems.map((item) => item.name),
    ...masters.units.map((item) => item.name),
    ...masters.godowns.map((item) => item.name),
    ...vouchers.flatMap((item) => [item.voucherNumber, item.reference, item.narration].filter(Boolean)),
    ...benchmarkInputs.bankStatementRows.flatMap((item) => [item.reference, item.description].filter(Boolean)),
  ];
  const biasedGeneratedStrings = visibleGeneratedStrings.filter((value) => biasedNamePattern.test(value));
  if (biasedGeneratedStrings.length) errors.push(`Generated visible values contain biased markers: ${biasedGeneratedStrings.slice(0, 10).join(", ")}`);
  const codedLedgerNames = masters.ledgers.map((ledger) => ledger.name).filter((name) => /\s-\s(?:[CV]\d{5}|[A-Z]\d{4})$/i.test(name));
  if (codedLedgerNames.length) errors.push(`Ledger names expose generated serial codes: ${codedLedgerNames.slice(0, 10).join(", ")}`);

  return {
    passed: errors.length === 0,
    errors,
    checks: {
      uniqueVoucherIds: ids.size,
      uniqueNewLedgerNames: generatedLedgerNames.size,
      voucherLedgerNamesAvailable: ledgerNames.size,
      biasedGeneratedVisibleValueCount: biasedGeneratedStrings.length,
      codedGeneratedLedgerNameCount: codedLedgerNames.length,
      balancedVoucherCount: vouchers.filter((voucher) => voucher.totals.balanced).length,
      dateRange: { minimum: vouchers.map((voucher) => voucher.date).sort()[0], maximum: vouchers.map((voucher) => voucher.date).sort().at(-1) },
      monthlyVoucherCounts: monthly,
      voucherTypeCounts: voucherCounts,
      openBillCounts: {
        receivable: expected.openBills.receivables.length,
        payable: expected.openBills.payables.length,
        total: expected.openBills.all.length,
      },
    },
  };
}

function main() {
  const groups = groupDefinitions();
  const ledgerBook = ledgerDefinitions(groups);
  const inventory = inventoryDefinitions();
  const sales = salesDefinitions(ledgerBook, inventory);
  const purchases = purchaseDefinitions(ledgerBook, inventory, sales);
  const receipts = buildReceipts(sales);
  const payments = buildPayments(purchases);
  const journals = buildJournals(ledgerBook);
  const contra = buildContra();
  const vouchers = [
    ...sales.map((item) => item.voucher),
    ...purchases.map((item) => item.voucher),
    ...receipts,
    ...payments,
    ...journals,
    ...contra,
  ].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const openBills = buildOpenBills(sales, purchases);
  const cdCases = buildCdExpectedCases(sales);
  const todCustomerPeriods = buildTodExpectedCases(sales, ledgerBook);
  const bankStatementRows = buildBankStatementRows(ledgerBook);

  const dataset = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    status: "review_only_not_imported",
    metadata: {
      title: "Solution Nyx FY26-27 operational-scale data expansion plan",
      companyName: COMPANY_NAME,
      financialYear: "2026-27",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      timezone: "Asia/Kolkata",
      currency: "INR",
      deterministicSeed: SEED,
      generatedAt: new Date().toISOString(),
      scope: "augment_existing_company_only",
      containsExistingSolutionNyxMasterNames: true,
      generatedTransactionsContainClientData: false,
      importAuthorized: false,
      purpose: ["ledger_matching", "bank_statement_matching", "cash_discount", "turnover_discount", "open_bill_performance", "purchase_posting", "tally_sync"],
    },
    reviewInstructions: {
      warning: "This JSON is a review plan only. It has not been imported into Tally.",
      approvalRequiredBeforeImport: true,
      proposedTallyCompany: COMPANY_NAME,
      companyAction: "augment_existing_company; do_not_create_a_separate_company",
      importBatchSizes: { masters: 250, vouchers: 150 },
      idempotencyPrefix: "SNX/26-27/",
      prohibitedActions: ["Do not import into any company other than Solution Nyx", "Do not replace existing masters", "Do not import future-dated vouchers"],
    },
    configuration: {
      workingWeek: "Monday-Saturday",
      nonWorkingWeekdays: ["Sunday"],
      holidays: [...HOLIDAYS],
      cashDiscountSlabs: [
        { maximumWorkingDays: 7, ratePercent: "1.50" },
        { maximumWorkingDays: 10, ratePercent: "1.00" },
      ],
      turnoverDiscountTiers: [
        { minimumTonnes: "100.000", ratePercent: "0.50" },
        { minimumTonnes: "250.000", ratePercent: "0.75" },
        { minimumTonnes: "500.000", ratePercent: "1.00" },
      ],
      turnoverDiscountPeriods: [
        { kind: "closed", start: "2026-04-01", end: "2026-06-30" },
        { kind: "tracking", start: "2026-07-01", end: PERIOD_END },
      ],
      amountRepresentation: "decimal strings; generator calculations use integer paise",
    },
    baseline: {
      ...BASELINE,
      cleanupReviewNote: "These biased names already exist in Solution Nyx. They are listed only for a separate rename decision and are not altered by this plan.",
    },
    targets: {
      masterTotalsAfterApprovedImport: {
        groups: TARGETS.groups,
        ledgers: TARGETS.ledgers,
        customerLedgers: TARGETS.customerLedgers,
        supplierLedgers: TARGETS.supplierLedgers,
        otherLedgers: TARGETS.otherLedgers,
        stockGroups: TARGETS.stockGroups,
        stockItems: TARGETS.stockItems,
        units: TARGETS.units,
        godowns: TARGETS.godowns,
      },
      masterRecordsToCreate: {
        groups: ADDITIONS.groups,
        ledgers: ADDITIONS.ledgers,
        customerLedgers: ADDITIONS.customerLedgers,
        supplierLedgers: ADDITIONS.supplierLedgers,
        otherLedgers: ADDITIONS.otherLedgers,
        stockGroups: ADDITIONS.stockGroups,
        stockItems: ADDITIONS.stockItems,
        units: ADDITIONS.units,
        godowns: ADDITIONS.godowns,
      },
      workloadRecordsToCreate: {
        vouchers: TARGETS.vouchers,
        openReceivableBills: TARGETS.openReceivableBills,
        openPayableBills: TARGETS.openPayableBills,
        cdCases: TARGETS.cdCases,
        todCustomers: TARGETS.todCustomers,
        bankStatementRows: TARGETS.bankStatementRows,
      },
    },
    masters: {
      disposition: "create_in_existing_solution_nyx_after_explicit_approval",
      groups,
      ledgers: ledgerBook.all,
      stockGroups: inventory.stockGroups,
      stockItems: inventory.stockItems,
      units: inventory.units,
      godowns: inventory.godowns,
    },
    vouchers,
    expected: {
      openBills,
      cdCases,
      todCustomerPeriods,
    },
    benchmarkInputs: {
      bankStatementRows,
    },
    validation: null,
  };

  dataset.validation = validateDataset(dataset);
  if (!dataset.validation.passed) {
    throw new Error(`Dataset validation failed:\n${dataset.validation.errors.slice(0, 50).join("\n")}`);
  }
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
  writeFileSync(OUTPUT_PATH, serialized, "utf8");
  const sha256 = createHash("sha256").update(serialized).digest("hex");
  const cdScenarioCounts = countBy(cdCases, (item) => item.scenario);
  const todScenarioCounts = countBy(todCustomerPeriods, (item) => item.scenario);
  const matchingDifficultyCounts = countBy(bankStatementRows, (item) => item.difficulty);
  const reviewSummary = {
    schemaVersion: SCHEMA_VERSION,
    status: dataset.status,
    fullDataset: {
      path: OUTPUT_PATH,
      bytes: Buffer.byteLength(serialized),
      sha256,
    },
    metadata: dataset.metadata,
    baseline: dataset.baseline,
    targets: dataset.targets,
    validation: dataset.validation,
    scenarioCounts: {
      cashDiscount: cdScenarioCounts,
      turnoverDiscount: todScenarioCounts,
      ledgerMatching: matchingDifficultyCounts,
    },
    samples: {
      groups: groups.slice(0, 5),
      customerLedgers: ledgerBook.customers.slice(0, 5),
      supplierLedgers: ledgerBook.suppliers.slice(0, 5),
      requiredAccountingLedgers: Object.entries(REQUIRED_LEDGERS).map(([role, name]) => ({
        role,
        name,
        disposition: REUSED_LEDGER_NAMES.has(name) ? "reuse_existing" : "create_after_approval",
      })),
      stockItems: inventory.stockItems.slice(0, 5),
      vouchersByType: Object.fromEntries(Object.keys(TARGETS.vouchers).map((type) => [
        type,
        vouchers.filter((voucher) => voucher.voucherType === type).slice(0, 2),
      ])),
      openBills: openBills.all.slice(0, 10),
      cashDiscountCases: cdCases.filter((item, index) => index === 0 || cdCases[index - 1]?.scenario !== item.scenario),
      turnoverDiscountCases: todCustomerPeriods.filter((item, index) => index === 0 || todCustomerPeriods[index - 1]?.scenario !== item.scenario),
      bankStatementRows: bankStatementRows.filter((item, index) => index === 0 || bankStatementRows[index - 1]?.difficulty !== item.difficulty),
    },
    reviewChecklist: [
      "Confirm the target is the existing Solution Nyx company and the FY26-27 date boundary.",
      "Re-capture live master counts immediately before import and recalculate additions if they changed.",
      "Review required accounting-ledger names and group hierarchy.",
      "Decide separately whether the ten pre-existing biased names should be renamed; this plan does not alter them.",
      "Review CD slabs, TOD tiers, holidays, units, and expected scenario counts.",
      "Review voucher samples and open-bill examples.",
      "Approve explicitly before any Tally XML importer is created or run.",
    ],
  };
  writeFileSync(SUMMARY_OUTPUT_PATH, `${JSON.stringify(reviewSummary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    summaryOutputPath: SUMMARY_OUTPUT_PATH,
    sha256,
    fileStatus: dataset.status,
    validation: dataset.validation,
  }, null, 2));
}

main();
