import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseLiveCashDiscountSnapshot } from '../../../tally-bridge/src/collections-analysis/cash-discount-live-analysis.mjs';
import { summarizeCollections } from '../../../tally-bridge/src/collections-analysis/collections-query.mjs';
const build=(openBills=[],settledBills=[],createdProposals=[])=>analyseLiveCashDiscountSnapshot({connectionId:'connection',companyName:'Company',financialYear:'2026-27',ledgers:[{tally_name:'Customer',parent_name:'Sundry Debtors',gstin:null,raw_payload:{}}],createdProposals,openBillsResult:{result:{byLedger:{Customer:{complete:true,openBills,settledBills}}}}});
const invoice=(values={})=>({referenceName:'INV1',voucherNumber:'1',invoiceDate:'2020-01-01',originalAmount:98500,pendingAmount:48500,sourceVoucherType:'Sales',sourceSalesLedgerName:'Domestic Sales',narration:'ADVANCE RTGS',receiptDate:'2019-12-31',matchedReceiptAmount:50000,...values});

test('partial receipt leaves collection of the remainder independent of CD recovery',()=>{
  const dashboard=build([invoice()]);
  const row=dashboard.tabs.paymentFollowUps[0];
  assert.equal(row.outstandingAmount,48500);
  assert.equal(row.totalPayableAmount,48500);
  assert.equal(row.paymentAmountIfPaidToday,48500);
  assert.equal(row.followUpStatus,'escalate');
  assert.equal(dashboard.tabs.debitNoteQueue[0].recoverableAmount,1500);
  assert.equal(summarizeCollections(dashboard).followUps.escalated,1);
});

test('late full settlement creates CD review without an outstanding payment row',()=>{
  const dashboard=build([],[invoice({pendingAmount:0,matchedReceiptAmount:98500,receiptDate:'2020-01-02'})]);
  assert.equal(dashboard.tabs.paymentFollowUps.length,0);
  assert.equal(dashboard.tabs.debitNoteQueue.length,1);
  assert.equal(dashboard.tabs.debitNoteQueue[0].recoverableAmount,1500);
  assert.equal(dashboard.tabs.debitNoteQueue[0].canCreateDebitNote,true);
});

test('timely full settlement has neither collection nor CD recovery',()=>{
  const dashboard=build([],[invoice({pendingAmount:0,matchedReceiptAmount:98500})]);
  assert.equal(dashboard.tabs.paymentFollowUps.length,0);
  assert.equal(dashboard.tabs.debitNoteQueue.length,0);
});

test('confirmed recovery suppresses a second debit note without hiding collection',()=>{
  const dashboard=build([invoice()],[],[{reason_code:'cash_discount_unpaid_tier_reversal',party_ledger_name:'Customer',linked_invoice_number:'INV1',recoverable_amount:1500,status:'created_in_tally'}]);
  assert.equal(dashboard.tabs.paymentFollowUps.length,1);
  assert.equal(dashboard.tabs.debitNoteQueue.filter(row=>row.status==='pending_approval').length,0);
});

test('ambiguous invoice evidence enters review and cannot authorize CD',()=>{
  const dashboard=build([invoice({invoiceEvidenceAmbiguous:true})]);
  assert.equal(dashboard.tabs.paymentFollowUps[0].followUpStatus,'needs_review');
  assert.equal(dashboard.tabs.debitNoteQueue.length,0);
});
