// GENERATED from apps/api/src/lib/payment-terms.ts by scripts/build-connector-collections-analysis.mjs.
// Do not edit: change the source and run the script.
/** Only the client's two agreed phrases establish a CD category. */
export function classifyPaymentNarration(value) {
    const text = String(value ?? '').toUpperCase().replace(/\bR[.\s]*T[.\s]*G[.\s]*S\b/g, 'RTGS').replace(/[.\s_-]+/g, ' ').trim();
    // Our recovery voucher quotes the source narration; that quote must never
    // turn the recovery itself into another discounted invoice.
    if (text.startsWith('CASH DISCOUNT RECOVERY AGAINST INVOICE'))
        return { category: null, ambiguous: false };
    const advance = /\bADVANCE RTGS\b/.test(text);
    const sameDay = /\bSAME DAY RTGS\b/.test(text);
    if (advance && sameDay)
        return { category: null, ambiguous: true };
    return { category: advance ? 'advance_rtgs' : sameDay ? 'same_day_rtgs' : null, ambiguous: false };
}
export function isNonSalesVoucher(type) {
    return ['debitnote', 'creditnote', 'receipt', 'payment', 'journal', 'purchase', 'contra'].includes(String(type ?? '').toLowerCase().replace(/[\s_-]+/g, ''));
}
export function validPaymentDate(value) {
    const text = String(value ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
        return null;
    const time = Date.parse(`${text}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
}
export function collectionPaymentRequirement(narration, invoiceDate) {
    const parsed = classifyPaymentNarration(narration);
    return parsed.ambiguous ? null : paymentRequirement(parsed.category ?? 'regular_credit', invoiceDate);
}
export function paymentRequirement(category, invoiceDate) {
    const date = validPaymentDate(invoiceDate);
    if (!date)
        return null;
    const eligibilityDays = category === 'regular_credit' ? 30 : category === 'advance_rtgs' ? -1 : 0;
    const deadline = new Date(Date.parse(`${date}T00:00:00Z`) + eligibilityDays * 86_400_000).toISOString().slice(0, 10);
    return {
        category,
        ratePercent: category === 'regular_credit' ? 0 : category === 'advance_rtgs' ? 1.5 : 1,
        eligibilityDays,
        deadline,
        label: category === 'regular_credit' ? 'Payment within 30 days' : category === 'advance_rtgs' ? '1.5% — payment before invoice date' : '1% — payment on invoice date',
        // Midnight in IST after the last qualifying payment date.
        followUpStartsAt: new Date(Date.parse(`${deadline}T00:00:00+05:30`) + 86_400_000).toISOString(),
    };
}
