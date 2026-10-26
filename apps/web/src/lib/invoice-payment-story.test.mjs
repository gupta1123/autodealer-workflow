import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(name, imports = {}) {
  const source = await readFile(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (path) => imports[path], Intl, Date, Math, Number, String });
  return exports;
}
const terms = await load('payment-terms-label');
const { invoicePaymentStory, rtgsRuleText } = await load('invoice-payment-story', { './payment-terms-label': terms });

// Anant Fabrication Works, SN/26-27/10867: ₹2,73,337.50 on 3 Oct, ADVANCE RTGS
// (deadline 2 Oct), ₹1,23,001.87 received on 5 Oct.
const anant = { invoiceDate: '2026-10-03', invoiceAmount: 273337.5, outstandingAmount: 150335.63, amountReceived: 123001.87,
  lastReceiptDate: '2026-10-05', deadline: '2026-10-02', narration: 'MH20-EF-5683 ADVANCE RTGS | Scenario batch 20261017', today: '2026-10-26' };

test('a late part payment reads as it does in Tally', () => {
  const story = invoicePaymentStory(anant);
  assert.equal(story.state, 'part_paid');
  assert.equal(story.summary, 'Part-paid 45% · 5 Oct · 3 days late');
  assert.equal(story.daysLate, 3);
  assert.equal(story.terms.name, 'Advance RTGS');
  assert.equal(story.terms.rule, '1.5% · pay before invoice date');
});

test('the lost discount is 1.5% of the gross amount behind the net Tally invoice', () => {
  const { discount } = invoicePaymentStory(anant);
  assert.deepEqual({ ...discount }, { ratePercent: 1.5, grossAmount: 277500, lostAmount: 4162.5, status: 'lost' });
  const sameDay = invoicePaymentStory({ ...anant, invoiceAmount: 282150, outstandingAmount: 155182.5, amountReceived: 126967.5,
    deadline: '2026-10-03', narration: 'MH14-KY-5720 SAME DAY RTGS' });
  assert.deepEqual({ ...sameDay.discount }, { ratePercent: 1, grossAmount: 285000, lostAmount: 2850, status: 'lost' });
});

test('the server amounts win over the local estimate when they are known', () => {
  const { discount } = invoicePaymentStory({ ...anant, grossInvoiceAmount: 277500, debitNoteAmount: 4000 });
  assert.equal(discount.lostAmount, 4000);
});

test('unpaid, paid on time and regular credit invoices', () => {
  assert.equal(invoicePaymentStory({ ...anant, amountReceived: 0, outstandingAmount: 273337.5, lastReceiptDate: null }).summary, 'Unpaid');
  const onTime = invoicePaymentStory({ ...anant, outstandingAmount: 0, amountReceived: 273337.5, lastReceiptDate: '2026-10-01' });
  assert.equal(onTime.summary, 'Paid in full · 1 Oct · on time');
  assert.equal(onTime.discount.status, 'kept');
  const regular = invoicePaymentStory({ ...anant, narration: 'Goods supplied', paymentCategory: null });
  assert.equal(regular.terms.name, 'Regular credit');
  assert.equal(regular.discount, null);
});

test('before the deadline the discount is still open', () => {
  assert.equal(invoicePaymentStory({ ...anant, deadline: '2026-10-30' }).discount.status, 'open');
});

test('RTGS rules are written for people, not as day offsets', () => {
  assert.equal(rtgsRuleText(1.5, -1), '1.5% · pay before invoice date');
  assert.equal(rtgsRuleText(1, 0), '1% · pay on invoice date');
  assert.equal(rtgsRuleText(1, 30), '1% · pay within 30 days');
});
