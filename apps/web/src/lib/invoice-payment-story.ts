import { paymentTermsLabel } from './payment-terms-label';

/** What happened to one invoice, in the words an accountant uses: how much was
 * paid, when, whether that met the RTGS deadline, and what discount is lost.
 * Built only from fields the scan already returns; nothing is recalculated
 * that the server decides (the debit note amount is passed in when known). */
export type InvoiceReceipt = { date: string | null; amount: number; voucherNumber?: string | null; voucherType?: string | null };

export type InvoicePaymentInput = {
  invoiceDate: string | null;
  invoiceAmount: number | null;
  outstandingAmount: number | null;
  amountReceived?: number | null;
  lastReceiptDate?: string | null;
  /** Each receipt allocated to the invoice, when the Local Agent sends them. */
  receipts?: InvoiceReceipt[] | null;
  deadline?: string | null;
  paymentCategory?: string | null;
  narration?: string | null;
  grossInvoiceAmount?: number | null;
  debitNoteAmount?: number | null;
  today?: string;
};

export type TimelineEvent = {
  kind: 'invoice' | 'deadline' | 'payment' | 'today';
  date: string | null;
  title: string;
  detail: string;
  amount: number | null;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
};

export type InvoicePaymentStory = {
  state: 'unpaid' | 'part_paid' | 'paid';
  /** Short row label, e.g. "Part-paid 45% · 5 Oct · 3 days late". */
  summary: string;
  /** One sentence for the panel, e.g. "Paid 3 days late · 1.5% discount lost". */
  verdict: string;
  percentPaid: number;
  received: number;
  outstanding: number;
  daysLate: number | null;
  terms: { name: string; rule: string | null; ratePercent: number | null };
  /** kept: paid in full by the deadline; open: deadline not passed yet. */
  discount: { ratePercent: number; grossAmount: number; lostAmount: number; status: 'lost' | 'kept' | 'open' } | null;
  timeline: TimelineEvent[];
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

function days(count: number) {
  return `${count} day${count === 1 ? '' : 's'}`;
}

function rupees(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
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

function lateness(date: number | null, deadline: number | null) {
  if (date === null || deadline === null) return { daysLate: null, text: '' };
  const daysLate = Math.round((date - deadline) / DAY_MS);
  return { daysLate, text: daysLate > 0 ? `${days(daysLate)} late` : daysLate === 0 ? 'on the deadline' : `${days(-daysLate)} early` };
}

export function invoicePaymentStory(input: InvoicePaymentInput): InvoicePaymentStory {
  const invoice = money(input.invoiceAmount);
  const outstanding = Math.max(0, money(input.outstandingAmount));
  const received = input.amountReceived !== null && input.amountReceived !== undefined
    ? Math.max(0, money(input.amountReceived))
    : Math.max(0, money(invoice - outstanding));
  const state = outstanding <= 0.005 ? 'paid' : received <= 0.005 ? 'unpaid' : 'part_paid';
  const percentPaid = invoice > 0 ? Math.min(100, Math.round((received / invoice) * 100)) : 0;

  const receipts = (input.receipts ?? []).filter((receipt) => money(receipt.amount) > 0)
    .sort((left, right) => (day(left.date) ?? Infinity) - (day(right.date) ?? Infinity));
  const lastReceiptDate = input.lastReceiptDate || [...receipts].reverse().find((receipt) => day(receipt.date) !== null)?.date || null;
  const deadline = day(input.deadline);
  const { daysLate } = lateness(day(lastReceiptDate), deadline);
  const timing = day(lastReceiptDate) === null ? '' : ` · ${shortDate(lastReceiptDate)}${daysLate === null ? '' : daysLate > 0 ? ` · ${days(daysLate)} late` : ' · on time'}`;
  const summary = state === 'unpaid' ? 'Unpaid'
    : state === 'paid' ? `Paid in full${timing}`
    : `Part-paid ${percentPaid}%${timing}`;

  const label = paymentTermsLabel({ paymentCategory: input.paymentCategory, narration: input.narration });
  const ratePercent = label.name === 'Advance RTGS' ? 1.5 : label.name === 'Same-day RTGS' ? 1 : null;
  const rule = ratePercent === null ? null : rtgsRuleText(ratePercent, ratePercent === 1.5 ? -1 : 0);
  const today = day(input.today ?? new Date().toISOString());
  const todayText = new Date(today ?? Date.now()).toISOString().slice(0, 10);

  // The Tally invoice is recorded net of the RTGS discount; the gross basis and
  // the debit note come from the server analysis when it has them.
  let discount: InvoicePaymentStory['discount'] = null;
  if (ratePercent !== null && invoice > 0) {
    const grossAmount = money(input.grossInvoiceAmount) || money(invoice / (1 - ratePercent / 100));
    const lostAmount = input.debitNoteAmount !== null && input.debitNoteAmount !== undefined
      ? money(input.debitNoteAmount) : money(grossAmount - invoice);
    const status = state === 'paid' && daysLate !== null && daysLate <= 0 ? 'kept'
      : deadline !== null && today !== null && today <= deadline ? 'open' : 'lost';
    discount = { ratePercent, grossAmount, lostAmount, status };
  }

  const paidText = state === 'unpaid' ? 'Nothing paid yet'
    : state === 'paid' ? (daysLate === null ? 'Paid in full' : daysLate > 0 ? `Paid in full, ${days(daysLate)} late` : 'Paid in full on time')
    : `${percentPaid}% paid${daysLate !== null && daysLate > 0 ? `, ${days(daysLate)} late` : ''}`;
  const verdict = discount
    ? `${paidText} · ${discount.status === 'lost' ? `${discount.ratePercent}% discount lost` : discount.status === 'kept' ? 'discount earned' : `discount still available until ${shortDate(input.deadline)}`}`
    : paidText;

  const timeline: TimelineEvent[] = [];
  timeline.push({ kind: 'invoice', date: input.invoiceDate, title: 'Invoice raised', amount: invoice, tone: 'neutral',
    detail: ratePercent === null ? label.name : `${label.name} · ${rule}` });
  if (deadline !== null) {
    const met = state === 'paid' && daysLate !== null && daysLate <= 0;
    const upcoming = today !== null && today <= deadline && !met;
    timeline.push({ kind: 'deadline', date: input.deadline ?? null, amount: invoice,
      title: ratePercent === null ? 'Payment due' : 'Pay in full to keep the discount',
      detail: met ? 'Met' : upcoming ? 'Upcoming' : 'Missed', tone: met ? 'good' : upcoming ? 'neutral' : 'bad' });
  }
  if (receipts.length) {
    for (const receipt of receipts) {
      const late = lateness(day(receipt.date), deadline);
      timeline.push({ kind: 'payment', date: receipt.date, amount: money(receipt.amount), title: 'Payment received',
        detail: [receipt.voucherNumber ? `${receipt.voucherType || 'Receipt'} ${receipt.voucherNumber}` : '', late.text].filter(Boolean).join(' · '),
        tone: late.daysLate !== null && late.daysLate > 0 ? 'warn' : 'good' });
    }
  } else if (received > 0.005) {
    const late = lateness(day(lastReceiptDate), deadline);
    timeline.push({ kind: 'payment', date: lastReceiptDate, amount: received,
      title: day(lastReceiptDate) === null ? 'Received so far' : 'Payment received',
      detail: [late.text, day(lastReceiptDate) === null ? 'payment dates are in Tally' : ''].filter(Boolean).join(' · '),
      tone: late.daysLate !== null && late.daysLate > 0 ? 'warn' : 'good' });
  }
  if (state !== 'paid') {
    const overdue = today !== null && deadline !== null && today > deadline ? Math.round((today - deadline) / DAY_MS) : null;
    timeline.push({ kind: 'today', date: todayText, amount: outstanding, title: 'Today: balance due',
      detail: overdue ? `${days(overdue)} past the ${ratePercent === null ? 'due date' : 'deadline'}` : `${rupees(outstanding)} outstanding`,
      tone: overdue ? 'bad' : 'neutral' });
  }

  // Date order, so Advance RTGS shows its pay-by date before the invoice. An
  // undated payment total sits just before today; ties keep the order above.
  const order = (event: TimelineEvent) => event.kind === 'today' ? Infinity : day(event.date) ?? (today ?? Infinity) - 0.5;
  const sorted = timeline.map((event, index) => ({ event, index }))
    .sort((left, right) => order(left.event) - order(right.event) || left.index - right.index).map(({ event }) => event);

  return { state, summary, verdict, percentPaid, received, outstanding, daysLate,
    terms: { name: label.name, rule, ratePercent }, discount, timeline: sorted };
}
