/** Display the invoice's agreed terms separately from its overdue age. */
export function paymentTermsLabel(invoice: { paymentCategory?: string | null; narration?: string | null }) {
  const narration = String(invoice.narration ?? '').toUpperCase()
    .replace(/\bR[.\s]*T[.\s]*G[.\s]*S\b/g, 'RTGS').replace(/[.\s_-]+/g, ' ').trim();
  const advance = /\bADVANCE RTGS\b/.test(narration);
  const sameDay = /\bSAME DAY RTGS\b/.test(narration);
  const category = invoice.paymentCategory ?? (advance ? 'advance_rtgs' : sameDay ? 'same_day_rtgs' : null);
  if (advance && sameDay) return { name: 'Needs review', timing: 'Conflicting payment terms', label: 'Needs review · Conflicting payment terms' };
  if (category === 'advance_rtgs') return { name: 'Advance RTGS', timing: 'Before invoice date', label: 'Advance RTGS · Before invoice date' };
  if (category === 'same_day_rtgs') return { name: 'Same-day RTGS', timing: 'On invoice date', label: 'Same-day RTGS · On invoice date' };
  return { name: 'Regular credit', timing: 'Within 30 days', label: 'Regular credit · Within 30 days' };
}
