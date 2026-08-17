import {
  collectCashDiscountLiveSnapshot,
  readConfig,
} from "../apps/tally-bridge/src/bridge.mjs";
import { analyseCashDiscountNarration } from "../apps/api/src/lib/cash-discount-narration.ts";

const COMPANY_NAME = process.env.KALIKA_TEST_COMPANY || "Solution Nyx";
const TEST_TAG = process.env.KALIKA_CD_UI_TEST_TAG || "KALIKA-TEST-CD-260816";
const TODAY = new Date().toISOString().slice(0, 10);

const config = readConfig() || { tallyUrl: process.env.TALLY_URL || "http://localhost:9000" };
const customerScope = {
  mode: "custom",
  selectedGroupNames: ["Sundry Debtors"],
  includeNestedGroups: true,
  detectSalesLinkedExceptions: true,
  excludedGroupNames: [],
  excludedLedgerNames: [],
};

const snapshot = await collectCashDiscountLiveSnapshot(
  config,
  "cash_discount_scan",
  COMPANY_NAME,
  null,
  undefined,
  "2026-27",
  customerScope,
);

const openBills = Object.values(snapshot.openBillsResult.result.byLedger || {})
  .flatMap((bucket) => bucket.openBills || []);

const testBills = openBills.filter((bill) =>
  [bill.reference, bill.name, bill.billName, bill.voucherNumber, bill.partyLedgerName, bill.ledgerName]
    .some((value) => String(value || "").includes(TEST_TAG)),
);

const verified = testBills.map((bill) => {
  const originalAmount = Math.abs(Number(bill.originalAmount ?? bill.openingBalance ?? bill.amount ?? 0));
  const pendingAmount = Math.abs(Number(bill.pendingAmount ?? bill.closingBalance ?? bill.balance ?? 0));
  const analysis = analyseCashDiscountNarration({
    narration: bill.narration,
    invoiceDate: bill.invoiceDate || bill.billDate || bill.date,
    originalAmount,
    pendingAmount,
    receiptDate: bill.receiptDate,
    matchedReceiptAmount: bill.matchedReceiptAmount,
    today: TODAY,
  });

  return {
    customer: bill.partyLedgerName || bill.ledgerName,
    invoiceNumber: bill.reference || bill.name || bill.billName || bill.voucherNumber,
    invoiceDate: bill.invoiceDate || bill.billDate || bill.date,
    narration: bill.narration,
    originalAmount,
    pendingAmount,
    sourceSalesLedgerName: bill.sourceSalesLedgerName || null,
    status: analysis.deterministicStatus,
    debitNoteAmount: analysis.reversalPlan?.totalReversalRequired || 0,
    eligible: analysis.deterministicStatus === "unpaid_discount_tier_expired"
      && Boolean(String(bill.sourceSalesLedgerName || "").trim())
      && Number(analysis.reversalPlan?.totalReversalRequired || 0) > 0.01,
  };
});

console.log(JSON.stringify({
  companyName: snapshot.companyName,
  liveScanDate: TODAY,
  testBillsFound: verified.length,
  eligibleCandidates: verified.filter((item) => item.eligible).length,
  candidates: verified,
}, null, 2));

if (verified.length !== 8 || verified.some((item) => !item.eligible)) {
  process.exitCode = 1;
}
