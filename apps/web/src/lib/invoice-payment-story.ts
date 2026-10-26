import { paymentTermsLabel } from './payment-terms-label';

/** What happened to one invoice, in the words an accountant uses: how much was
 * paid, when, whether that met the RTGS deadline, and what discount is lost.
 * Built only from fields the scan already returns; nothing is recalculated
 * that the server decides (the debit note amount is passed in when known). */
export type InvoicePaymentInput = {
  invoiceDate: string | null;
  invoiceAmount: number | null;
  outstandingAmount: number | null;
  amountReceived?: number | null;
  lastReceiptDate?: string | null;
  deadline?: string | null;
  paymentCategory?: string | null;
  narration?: string | null;
  grossInvoiceAmount?: number | null;
  debitNoteAmount?: number | null;
  today?: string;
};

export type InvoicePaymentStory = {
  state: 'unpaid' | 'part_paid' | 'paid';
  /** Short row label, e.g. "Part-paid 45% · 5 Oct · 3 days late". */
  summary: string;
  percentPaid: number;
  received: number;
  outstanding: number;
  daysLate: number | null;
  terms: { name: string; rule: string | null; ratePercent: number | null };
  /** kept: paid in full by the deadline; open: deadline not passed yet. */
  discount: { ratePercent: number; grossAmount: number; lostAmount: number; status: 'lost' | 'kept' | 'open' } | null;
};

const DAY_MS = 86_400_000;

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function day(value?: string | null) {
  const text = String(value ?? '').slice(0, 10);
  const time = Date.parse(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(time) ? time : null;
}

export function shortDate(value?: string | null) {
  const time = day(value);
  return time === null ? '' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(time));
}

/** "1.5% · pay before invoice date" instead of the internal "-1 days". */
export function rtgsRuleText(ratePercent: number, eligibilityDays: number) {
  const timing = eligibilityDays < 0 ? 'pay before invoice date'
    : eligibilityDays === 0 ? 'pay on invoice date'
    : `pay within ${eligibilityDays} days`;
  return `${Number(ratePercent).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% · ${timing}`;
}

export function invoicePaymentStory(input: InvoicePaymentInput): InvoicePaymentStory {
  const invoice = money(input.invoiceAmount);
  const outstanding = Math.max(0, money(input.outstandingAmount));
  const received = input.amountReceived !== null && input.amountReceived !== undefined
    ? Math.max(0, money(input.amountReceived))
    : Math.max(0, money(invoice - outstanding));
  const state = outstanding <= 0.005 ? 'paid' : received <= 0.005 ? 'unpaid' : 'part_paid';
  const percentPaid = invoice > 0 ? Math.min(100, Math.round((received / invoice) * 100)) : 0;

  const paid = day(input.lastReceiptDate), deadline = day(input.deadline);
  const daysLate = paid !== null && deadline !== null ? Math.round((paid - deadline) / DAY_MS) : null;
  const timing = paid === null ? '' : ` · ${shortDate(input.lastReceiptDate)}${daysLate === null ? '' : daysLate > 0 ? ` · ${daysLate} day${daysLate === 1 ? '' : 's'} late` : ' · on time'}`;
  const summary = state === 'unpaid' ? 'Unpaid'
    : state === 'paid' ? `Paid in full${timing}`
    : `Part-paid ${percentPaid}%${timing}`;

  const label = paymentTermsLabel({ paymentCategory: input.paymentCategory, narration: input.narration });
  const ratePercent = label.name === 'Advance RTGS' ? 1.5 : label.name === 'Same-day RTGS' ? 1 : null;
  const rule = ratePercent === null ? null : rtgsRuleText(ratePercent, ratePercent === 1.5 ? -1 : 0);

  // The Tally invoice is recorded net of the RTGS discount; the gross basis and
  // the debit note come from the server analysis when it has them.
  let discount: InvoicePaymentStory['discount'] = null;
  if (ratePercent !== null && invoice > 0) {
    const grossAmount = money(input.grossInvoiceAmount) || money(invoice / (1 - ratePercent / 100));
    const lostAmount = input.debitNoteAmount !== null && input.debitNoteAmount !== undefined
      ? money(input.debitNoteAmount) : money(grossAmount - invoice);
    const today = day(input.today ?? new Date().toISOString());
    const status = state === 'paid' && daysLate !== null && daysLate <= 0 ? 'kept'
      : deadline !== null && today !== null && today <= deadline ? 'open' : 'lost';
    discount = { ratePercent, grossAmount, lostAmount, status };
  }
  return { state, summary, percentPaid, received, outstanding, daysLate,
    terms: { name: label.name, rule, ratePercent }, discount };
}
