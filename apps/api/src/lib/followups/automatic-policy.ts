import { classifyPaymentNarration, paymentRequirement, validPaymentDate, isNonSalesVoucher } from '@/lib/payment-terms';
import { businessDateText } from '@/lib/business-date';

export function automaticReminderBill(bill: { narration?: string | null; invoiceDate?: string | null; referenceName?: string | null; voucherNumber?: string | null; pendingAmount?: number | string | null; originalAmount?: number | string | null; kind?: string | null; sourceVoucherType?: string | null }, now = new Date()) {
  const category = classifyPaymentNarration(bill.narration).category;
  const invoiceDate = validPaymentDate(bill.invoiceDate);
  const requirement = category ? paymentRequirement(category, invoiceDate) : null;
  const invoice = bill.referenceName || bill.voucherNumber;
  const outstanding = Number(bill.pendingAmount);
  const original = Number(bill.originalAmount);
  if (!requirement || !invoice || bill.kind === 'advance' || isNonSalesVoucher(bill.sourceVoucherType) || !Number.isFinite(outstanding) || !Number.isFinite(original) || original <= 0 || outstanding <= 0.005 || outstanding > original + 1 || businessDateText(now) <= requirement.deadline) return null;
  return { category: requirement.category, invoice, invoiceDate: invoiceDate!, outstanding: Math.round(outstanding * 100) / 100, startsAt: requirement.followUpStartsAt };
}
