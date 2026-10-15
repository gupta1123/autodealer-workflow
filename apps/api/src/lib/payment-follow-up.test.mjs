import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePaymentFollowUpTiming,
  isCollectionOnlyPaymentFollowUp,
  sortPaymentFollowUpsByPriority,
} from "../../../tally-bridge/src/collections-analysis/payment-follow-up.mjs";

test("regular invoices use 30 days from invoice date regardless of supplied credit terms", () => {
  assert.equal(
    derivePaymentFollowUpTiming({ dueDate: "2026-08-03", invoiceDate: "2026-07-01" }, "2026-08-10").eligible,
    true
  );
  assert.equal(
    derivePaymentFollowUpTiming({ dueDate: "2026-07-04", invoiceDate: "2026-07-11" }, "2026-08-10").eligible,
    false
  );
});

test('advance reminders start on invoice date, overriding Tally credit terms', () => {
  const bill={narration:'ADVANCE RTGS',invoiceDate:'2026-10-12',dueDate:'2026-11-12'};
  assert.equal(derivePaymentFollowUpTiming(bill,'2026-10-11').eligible,false);
  assert.equal(derivePaymentFollowUpTiming(bill,'2026-10-12').eligible,true);
});
test('same-day reminders wait until the following IST day with no grace week', () => {
  const bill={narration:'SAME DAY RTGS',invoiceDate:'2026-10-12',dueDate:'2026-11-12'};
  assert.equal(derivePaymentFollowUpTiming(bill,'2026-10-12').eligible,false);
  assert.equal(derivePaymentFollowUpTiming(bill,'2026-10-13').eligible,true);
});
test('RTGS CD recovery does not hide unpaid invoices from payment follow-ups', () => {
  assert.equal(isCollectionOnlyPaymentFollowUp({followUpStatus:'debit_note_required',paymentCategory:'advance_rtgs'}),true);
});

test("regular credit becomes overdue the day after the full 30-day window", () => {
  const bill = { narration: 'PAYMENT WITHIN 25 DAYS', invoiceDate: '2026-08-03' };
  assert.equal(derivePaymentFollowUpTiming(bill, '2026-08-10').eligible, false);
  assert.equal(derivePaymentFollowUpTiming(bill, '2026-09-02').eligible, false);
  const timing = derivePaymentFollowUpTiming(bill, "2026-09-03");
  assert.deepEqual(timing, {
    eligible: true,
    ageBasis: "due_date",
    ageDays: 1,
    ageLabel: "1 day overdue",
    dueDate: '2026-09-02',
    invoiceDate: "2026-08-03",
  });
});

test("keeps bills with no usable dates in review", () => {
  const timing = derivePaymentFollowUpTiming({}, "2026-08-10");
  assert.equal(timing.eligible, true);
  assert.equal(timing.ageBasis, "missing_dates");
  assert.equal(timing.ageDays, null);
});

test("CD status never removes a bill from collections", () => {
  const rows = [
    { partyLedgerName: "Debit note", followUpStatus: "debit_note_required", ageBasis: "invoice_date", ageDays: 10, outstandingAmount: 500 },
    { partyLedgerName: "Payment", followUpStatus: "needs_follow_up", ageBasis: "due_date", ageDays: 10, outstandingAmount: 500 },
  ].filter(isCollectionOnlyPaymentFollowUp);

  assert.deepEqual(rows.map((row) => row.partyLedgerName), ["Debit note", "Payment"]);
});

test("priority sorting orders overdue, invoice fallback, then missing-date review", () => {
  const rows = sortPaymentFollowUpsByPriority([
    { partyLedgerName: "Missing", followUpStatus: "needs_review", ageBasis: "missing_dates", ageDays: null, outstandingAmount: 500 },
    { partyLedgerName: "Invoice fallback", followUpStatus: "needs_follow_up", ageBasis: "invoice_date", ageDays: 60, outstandingAmount: 500 },
    { partyLedgerName: "Overdue", followUpStatus: "needs_follow_up", ageBasis: "due_date", ageDays: 20, outstandingAmount: 500 },
  ]);

  assert.deepEqual(rows.map((row) => row.partyLedgerName), [
    "Overdue",
    "Invoice fallback",
    "Missing",
  ]);
});
