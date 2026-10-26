"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { invoicePaymentStory, shortDate, type InvoicePaymentInput } from "@/lib/invoice-payment-story";

export type InvoiceStory = InvoicePaymentInput & {
  customer: string;
  invoiceNumber: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function Line({ label, children, tone }: { label: string; children: ReactNode; tone?: "warn" | "good" }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-[#eee7dc] py-3 last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7f72]">{label}</dt>
      <dd className={`text-[13px] leading-5 ${tone === "warn" ? "text-amber-900" : tone === "good" ? "text-emerald-800" : "text-[#332c26]"}`}>{children}</dd>
    </div>
  );
}

/** One invoice's payment story from the latest Tally scan, so nobody has to
 * open Tally to see what was paid, when, and what discount it cost. */
export function InvoiceStoryPanel({ invoice, onClose, actions }: { invoice: InvoiceStory | null; onClose: () => void; actions?: ReactNode }) {
  const story = invoice ? invoicePaymentStory(invoice) : null;
  const deadline = shortDate(invoice?.deadline);
  return (
    <Drawer direction="right" open={Boolean(invoice)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="bg-white data-[vaul-drawer-direction=right]:sm:max-w-md">
        {invoice && story ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-[#e8e2db] bg-[#fcfbfa] px-5 py-4">
              <div className="min-w-0">
                <DrawerTitle className="truncate text-base font-semibold text-[#1a1a1a]">{invoice.invoiceNumber || "Invoice"}</DrawerTitle>
                <DrawerDescription className="mt-0.5 truncate text-xs text-[#756b60]">{invoice.customer}</DrawerDescription>
              </div>
              <DrawerClose aria-label="Close invoice details" className="rounded-lg p-1.5 text-[#8a7f72] hover:bg-white hover:text-[#1a1a1a]"><X className="h-4 w-4" /></DrawerClose>
            </div>
            <dl className="flex-1 overflow-y-auto px-5 py-2">
              <Line label="Invoice">{shortDate(invoice.invoiceDate) || "Date missing"} · {money(Number(invoice.invoiceAmount) || 0)}</Line>
              <Line label="Terms">
                {story.terms.name}
                {story.terms.rule ? <span className="block text-xs text-[#756b60]">{story.terms.rule}{deadline ? ` (by ${deadline})` : ""}</span> : null}
              </Line>
              <Line label="Received" tone={story.state === "paid" && (story.daysLate ?? 0) <= 0 ? "good" : undefined}>
                {story.state === "unpaid" ? "Nothing received yet" : `${money(story.received)} (${story.percentPaid}%)`}
                {invoice.lastReceiptDate ? <span className="block text-xs text-[#756b60]">Last payment {shortDate(invoice.lastReceiptDate)}{story.daysLate === null ? "" : story.daysLate > 0 ? ` · ${story.daysLate} day${story.daysLate === 1 ? "" : "s"} after the deadline` : " · on time"}</span> : null}
              </Line>
              <Line label="Balance" tone={story.outstanding > 0 ? "warn" : "good"}>{story.outstanding > 0 ? money(story.outstanding) : "Fully paid"}</Line>
              {story.discount ? (
                <Line label="Discount" tone={story.discount.status === "lost" ? "warn" : story.discount.status === "kept" ? "good" : undefined}>
                  {story.discount.status === "lost" ? <>Lost: {money(story.discount.lostAmount)}<span className="block text-xs text-[#756b60]">{story.discount.ratePercent}% of {money(story.discount.grossAmount)}, the amount before the discount already in this invoice</span></>
                    : story.discount.status === "kept" ? `Kept: paid in full by ${deadline || "the deadline"}`
                    : `Still available until ${deadline || "the deadline"}`}
                </Line>
              ) : null}
              {invoice.narration ? <Line label="Tally note"><span className="text-xs text-[#5f554b]">{invoice.narration}</span></Line> : null}
              {deadline && story.outstanding > 0 ? <p className="py-3 text-[11px] leading-4 text-[#8a7f72]">Days overdue are counted from the payment deadline ({deadline}), so they can differ from the Tally ageing, which counts from the bill date.</p> : null}
            </dl>
            {actions ? <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8e2db] px-5 py-3">{actions}</div> : null}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
