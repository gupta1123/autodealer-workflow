"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { invoicePaymentStory, shortDate, type InvoicePaymentInput, type TimelineEvent } from "@/lib/invoice-payment-story";

export type InvoiceStory = InvoicePaymentInput & {
  customer: string;
  invoiceNumber: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

const DOT: Record<TimelineEvent["tone"], string> = {
  neutral: "border-[#b9ad9f] bg-white",
  good: "border-emerald-600 bg-emerald-600",
  warn: "border-amber-500 bg-amber-500",
  bad: "border-red-500 bg-white",
};
const DETAIL: Record<TimelineEvent["tone"], string> = {
  neutral: "text-[#756b60]",
  good: "text-emerald-700",
  warn: "text-amber-800",
  bad: "text-red-700",
};

const STATE_CHIP = {
  unpaid: "border-red-200 bg-red-50 text-red-800",
  part_paid: "border-amber-200 bg-amber-50 text-amber-900",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
} as const;

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative">
      {events.map((event, index) => (
        <li key={`${event.kind}-${index}`} className="relative grid grid-cols-[48px_20px_minmax(0,1fr)] pb-5 last:pb-0">
          <time className="pt-0.5 text-right text-[11px] font-semibold tabular-nums text-[#5f554b]">
            {event.kind === "today" ? "Today" : shortDate(event.date) || "—"}
          </time>
          <span className="relative flex justify-center">
            {index < events.length - 1 ? <span aria-hidden className="absolute top-3 h-[calc(100%+8px)] w-px bg-[#e3dbcf]" /> : null}
            <span aria-hidden className={`relative mt-1 h-2.5 w-2.5 rounded-full border-2 ${DOT[event.tone]} ${event.kind === "today" ? "ring-4 ring-[#f1ebe2]" : ""}`} />
          </span>
          <div className="min-w-0 pl-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-[#1a1a1a]">{event.title}</span>
              {event.amount !== null ? <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1a1a1a]">{money(event.amount)}</span> : null}
            </div>
            {event.detail ? <p className={`mt-0.5 text-xs leading-4 ${DETAIL[event.tone]}`}>{event.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One invoice's payment story from the latest Tally scan, so nobody has to
 * open Tally to see what was paid, when, and what discount it cost. */
export function InvoiceStoryPanel({ invoice, onClose, actions }: { invoice: InvoiceStory | null; onClose: () => void; actions?: ReactNode }) {
  const story = invoice ? invoicePaymentStory(invoice) : null;
  const deadline = shortDate(invoice?.deadline);
  const paidWidth = story ? Math.max(story.state === "unpaid" ? 0 : 2, story.percentPaid) : 0;
  return (
    <Drawer direction="right" open={Boolean(invoice)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="bg-[#fdfcfa] data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:max-w-[440px]">
        {invoice && story ? (
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7f72]">Invoice</p>
                <DrawerTitle className="mt-1 truncate text-lg font-semibold text-[#1a1a1a]">{invoice.invoiceNumber || "No invoice number"}</DrawerTitle>
                <DrawerDescription className="mt-0.5 truncate text-xs text-[#756b60]">{invoice.customer}</DrawerDescription>
              </div>
              <DrawerClose aria-label="Close invoice details" className="rounded-lg p-1.5 text-[#8a7f72] hover:bg-[#f1ebe2] hover:text-[#1a1a1a]"><X className="h-4 w-4" /></DrawerClose>
            </header>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <section aria-label="Balance" className="rounded-xl border border-[#e8e2db] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-[#8a7f72]">{story.state === "paid" ? "Settled" : "Balance due"}</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#1a1a1a]">{money(story.outstanding)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATE_CHIP[story.state]}`}>
                    {story.state === "unpaid" ? "Unpaid" : story.state === "paid" ? "Paid" : `Part-paid ${story.percentPaid}%`}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#5f554b]">{story.verdict}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efe8de]" role="img" aria-label={`${story.percentPaid}% paid`}>
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${paidWidth}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#8a7f72]">
                  <span>{money(story.received)} paid</span>
                  <span>of {money(Number(invoice.invoiceAmount) || 0)}</span>
                </div>
              </section>

              <section aria-label="Timeline" className="mt-6">
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7f72]">Timeline</h3>
                <Timeline events={story.timeline} />
              </section>

              {story.discount ? (
                <section aria-label="Cash discount" className={`mt-6 rounded-xl border p-4 ${story.discount.status === "lost" ? "border-amber-200 bg-amber-50/70" : story.discount.status === "kept" ? "border-emerald-200 bg-emerald-50/60" : "border-[#e8e2db] bg-white"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-[#1a1a1a]">
                      {story.discount.status === "lost" ? "Discount to recover" : story.discount.status === "kept" ? "Discount earned" : "Discount still available"}
                    </h3>
                    <span className="text-[15px] font-semibold tabular-nums text-[#1a1a1a]">{money(story.discount.lostAmount)}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-[#5f554b]">
                    {story.discount.status === "open"
                      ? `Pay ${money(Number(invoice.invoiceAmount) || 0)} in full by ${deadline} to keep ${story.discount.ratePercent}% off.`
                      : <>{story.discount.ratePercent}% of {money(story.discount.grossAmount)}. The invoice in Tally already has this discount taken off{story.discount.status === "lost" ? ", so it is recovered with a debit note." : "."}</>}
                  </p>
                </section>
              ) : null}

              {invoice.narration ? (
                <p className="mt-6 border-t border-[#ece6dc] pt-3 text-[11px] leading-4 text-[#8a7f72]"><span className="font-semibold text-[#5f554b]">Tally narration:</span> {invoice.narration}</p>
              ) : null}
              {deadline && story.outstanding > 0 ? (
                <p className="mt-2 text-[11px] leading-4 text-[#a1968a]">Days overdue count from the payment deadline ({deadline}). The Tally ageing counts from the bill date, so the numbers can differ.</p>
              ) : null}
            </div>

            {actions ? <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e8e2db] bg-white px-6 py-3">{actions}</footer> : null}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
