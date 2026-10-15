// GENERATED from apps/api/src/lib/payment-follow-up.ts by scripts/build-connector-collections-analysis.mjs.
// Do not edit: change the source and run the script.
import { collectionPaymentRequirement } from './payment-terms.mjs';
export const PAYMENT_FOLLOW_UP_GRACE_DAYS = 0;
export function isCollectionOnlyPaymentFollowUp(row) {
    // CD review never prevents collection of an outstanding invoice.
    return Boolean(row);
}
function validDateText(value) {
    const dateText = String(value ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText))
        return null;
    const parsed = Date.parse(`${dateText}T00:00:00.000Z`);
    if (!Number.isFinite(parsed))
        return null;
    return new Date(parsed).toISOString().slice(0, 10) === dateText ? dateText : null;
}
function elapsedDays(fromDate, toDate) {
    return Math.floor((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) /
        86_400_000);
}
export function derivePaymentFollowUpTiming(bill, today) {
    const currentDate = validDateText(today);
    const dueDate = validDateText(bill.dueDate);
    const invoiceDate = validDateText(bill.invoiceDate);
    if (!currentDate) {
        return {
            eligible: false,
            ageBasis: "missing_dates",
            ageDays: null,
            ageLabel: "Current business date unavailable",
            dueDate,
            invoiceDate,
        };
    }
    const requirement = collectionPaymentRequirement(bill.narration, invoiceDate);
    if (requirement) {
        const ageDays = elapsedDays(requirement.deadline, currentDate);
        const shownDays = Math.max(ageDays, 0);
        return {
            eligible: ageDays > 0,
            ageBasis: "due_date",
            ageDays,
            ageLabel: `${shownDays} day${shownDays === 1 ? "" : "s"} overdue`,
            dueDate: requirement.deadline,
            invoiceDate,
        };
    }
    return {
        eligible: true,
        ageBasis: "missing_dates",
        ageDays: null,
        ageLabel: "Invoice date or payment terms need review",
        dueDate: null,
        invoiceDate,
    };
}
export function sortPaymentFollowUpsByPriority(rows) {
    const basisRank = {
        due_date: 1,
        invoice_date: 2,
        missing_dates: 3,
    };
    return [...rows].sort((left, right) => {
        const leftRank = basisRank[left.ageBasis];
        const rightRank = basisRank[right.ageBasis];
        if (leftRank !== rightRank)
            return leftRank - rightRank;
        const ageDifference = (right.ageDays ?? -1) - (left.ageDays ?? -1);
        if (ageDifference !== 0)
            return ageDifference;
        const amountDifference = right.outstandingAmount - left.outstandingAmount;
        if (amountDifference !== 0)
            return amountDifference;
        return left.partyLedgerName.localeCompare(right.partyLedgerName);
    });
}
