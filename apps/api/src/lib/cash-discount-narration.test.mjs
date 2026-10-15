import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseCashDiscountNarration, parseCashDiscountTerms } from '../../../tally-bridge/src/collections-analysis/cash-discount-narration.mjs';
import { classifyPaymentNarration, paymentRequirement } from '../../../tally-bridge/src/collections-analysis/payment-terms.mjs';
const analyse = (values = {}) => analyseCashDiscountNarration({ narration:'MH14-KY-5700 ADVANCE RTGS', invoiceDate:'2026-10-12', originalAmount:98500, pendingAmount:98500, today:'2026-10-12', ...values });

test('client narration patterns establish the two rates without percentages', () => {
  assert.equal(parseCashDiscountTerms('MH14-KY-5700 ADVANCE RTGS')[0].ratePercent,1.5);
  assert.equal(parseCashDiscountTerms('MH43-U-3463 SAME DAY RTGS')[0].ratePercent,1);
  assert.equal(classifyPaymentNarration('same-day r.t.g.s.').category,'same_day_rtgs');
  assert.equal(classifyPaymentNarration('same day rtgs').category,'same_day_rtgs');
});
test('regular credit and percentage-only legacy terms cannot invent a CD category', () => {
  for(const narration of ['PAYMENT WITHIN 25 DAYS','Cash discount 1.5% and 1%','GST 1%','ADVANCE PAYMENT','NOTADVANCE RTGS']) assert.deepEqual(parseCashDiscountTerms(narration),[]);
});
test('conflicting category phrases require review', () => {
  assert.equal(classifyPaymentNarration('ADVANCE RTGS / SAME DAY RTGS').ambiguous,true);
  assert.equal(analyse({narration:'ADVANCE RTGS SAME DAY RTGS'}).reversalPlan,null);
});
test('advance expires at the beginning of invoice date in IST', () => {
  const rule=paymentRequirement('advance_rtgs','2026-10-12');
  assert.equal(rule.deadline,'2026-10-11');
  assert.equal(rule.followUpStartsAt,'2026-10-11T18:30:00.000Z');
  assert.equal(analyse({today:'2026-10-11'}).reversalPlan.totalReversalRequired,0);
  assert.equal(analyse().reversalPlan.totalReversalRequired,1500);
});
test('same-day remains available all invoice day and expires next IST day', () => {
  const same = {narration:'SAME DAY RTGS',originalAmount:99000,pendingAmount:99000};
  assert.equal(paymentRequirement('same_day_rtgs','2026-10-12').followUpStartsAt,'2026-10-12T18:30:00.000Z');
  assert.equal(analyse(same).reversalPlan.totalReversalRequired,0);
  assert.equal(analyse({...same,today:'2026-10-13'}).reversalPlan.totalReversalRequired,1000);
});
test('missing and invalid invoice dates do not authorize CD', () => {
  for(const invoiceDate of [null,'','2026-02-30','not-a-date']) assert.equal(analyse({invoiceDate}).deterministicStatus,'missing_invoice_date');
});
test('partial payment misses the full-payment condition and reverses the full category CD', () => {
  const result=analyse({pendingAmount:48500,receiptDate:'2026-10-10',matchedReceiptAmount:50000});
  assert.equal(result.deterministicStatus,'unpaid_discount_tier_expired');
  assert.equal(result.reversalPlan.totalReversalRequired,1500);
});
test('advance paid on invoice day never downgrades to 1% eligibility', () => {
  const result=analyse({pendingAmount:1000,receiptDate:'2026-10-12',matchedReceiptAmount:97500});
  assert.equal(result.reversalPlan.activeDiscount,null);
  assert.equal(result.reversalPlan.totalReversalRequired,1500);
});
test('a remaining balance resembling another discount does not prove timely full payment', () => {
  assert.equal(analyse({pendingAmount:1477.5,receiptDate:'2026-10-10',matchedReceiptAmount:97022.5}).deterministicStatus,'unpaid_discount_tier_expired');
});
test('verified full advance before invoice qualifies', () => {
  assert.equal(analyse({pendingAmount:0,receiptDate:'2026-10-11',matchedReceiptAmount:98500}).deterministicStatus,'discount_taken_within_window');
  assert.equal(analyse({pendingAmount:0,receiptDate:'2026-10-11',matchedReceiptAmount:98500}).reversalPlan.totalReversalRequired,0);
});
test('generated recovery narration cannot recursively qualify for another CD recovery',()=>{
  assert.deepEqual(parseCashDiscountTerms('Cash discount recovery against invoice INV. Source narration: ADVANCE RTGS'),[]);
});
test('full advance on invoice day fails and unverified receipts require review', () => {
  assert.equal(analyse({pendingAmount:0,receiptDate:'2026-10-12',matchedReceiptAmount:98500}).deterministicStatus,'late_payment_discount_expired');
  assert.equal(analyse({pendingAmount:0,receiptDate:'2026-10-11',matchedReceiptAmount:100}).deterministicStatus,'receipt_amount_unverified');
});

test('display and recovery preserve the agreed net-of-CD gross-up basis', () => {
  const result = analyse({originalAmount:100000,pendingAmount:100000});
  assert.equal(result.expectedDiscounts[0].amount, 1522.84);
  assert.equal(result.reversalPlan.totalReversalRequired, 1522.84);
});

test('ambiguous invoice evidence cannot authorize a recovery', () => {
  assert.equal(analyse({invoiceEvidenceAmbiguous:true}).deterministicStatus,'receipt_amount_unverified');
});
test('invalid balances never authorize recovery', () => {
  for(const pendingAmount of [-1,NaN,100000]) assert.equal(analyse({pendingAmount}).deterministicStatus,'receipt_amount_unverified');
});
