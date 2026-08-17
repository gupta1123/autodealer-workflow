import {
  collectCashDiscountLiveSnapshot,
  readConfig,
} from "../apps/tally-bridge/src/bridge.mjs";

const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Solution Nyx";
const TEST_TAG = process.env.KALIKA_CD_UI_TEST_TAG || "KALIKA-TEST-CD-260816";
const config = readConfig() || { tallyUrl: process.env.TALLY_URL || "http://localhost:9000" };

const testCases = [
  {
    name: "Direct group only",
    selectedGroupNames: ["TEST CD Direct Receivables"],
    includeNestedGroups: true,
    detectSalesLinkedExceptions: false,
    expected: [`${TEST_TAG}-GROUP-DIRECT`],
  },
  {
    name: "Regional parent with nested groups",
    selectedGroupNames: ["TEST CD Regional Receivables"],
    includeNestedGroups: true,
    detectSalesLinkedExceptions: false,
    expected: [`${TEST_TAG}-GROUP-EAST-NESTED`, `${TEST_TAG}-GROUP-WEST-NESTED`],
  },
  {
    name: "Regional parent without nested groups",
    selectedGroupNames: ["TEST CD Regional Receivables"],
    includeNestedGroups: false,
    detectSalesLinkedExceptions: false,
    expected: [],
  },
  {
    name: "West child group only",
    selectedGroupNames: ["TEST CD West Receivables"],
    includeNestedGroups: true,
    detectSalesLinkedExceptions: false,
    expected: [`${TEST_TAG}-GROUP-WEST-NESTED`],
  },
  {
    name: "Special group only",
    selectedGroupNames: ["TEST CD Special Accounts"],
    includeNestedGroups: true,
    detectSalesLinkedExceptions: false,
    expected: [`${TEST_TAG}-GROUP-SPECIAL-OUTSIDE`],
  },
  {
    name: "Direct group plus verified outside customers",
    selectedGroupNames: ["TEST CD Direct Receivables"],
    includeNestedGroups: true,
    detectSalesLinkedExceptions: true,
    expectedCount: 8,
  },
];

function invoiceNumber(bill) {
  return String(bill.reference || bill.name || bill.billName || bill.voucherNumber || "");
}

const results = [];
for (const testCase of testCases) {
  const snapshot = await collectCashDiscountLiveSnapshot(
    config,
    "cash_discount_scan",
    COMPANY_NAME,
    null,
    undefined,
    "2026-27",
    {
      mode: testCase.detectSalesLinkedExceptions ? "custom" : "strict",
      selectedGroupNames: testCase.selectedGroupNames,
      includeNestedGroups: testCase.includeNestedGroups,
      detectSalesLinkedExceptions: testCase.detectSalesLinkedExceptions,
      excludedGroupNames: [],
      excludedLedgerNames: [],
    },
  );
  const found = Object.values(snapshot.openBillsResult.result.byLedger || {})
    .flatMap((bucket) => bucket.openBills || [])
    .map(invoiceNumber)
    .filter((reference) => reference.startsWith(TEST_TAG))
    .sort();
  const expected = testCase.expected?.slice().sort();
  const passed = expected
    ? JSON.stringify(found) === JSON.stringify(expected)
    : found.length === testCase.expectedCount;
  results.push({ name: testCase.name, passed, found });
}

console.log(JSON.stringify({ companyName: COMPANY_NAME, results }, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
