"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { PurchasePostingDefaultsSettings } from "@/components/settings/PurchasePostingDefaultsSettings";
import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import { apiFetch } from "@/lib/api-client";

type Severity = "block" | "warn" | "off";

const CARD = "rounded-xl border border-[#ded8d0] bg-white shadow-[0_1px_2px_rgba(52,42,32,0.04)]";

const RULE_GROUPS = [
  {
    title: "GST identity",
    rules: [
      ["companyGstinMissing", "Company GSTIN missing in Tally", "The open Tally company has no GSTIN to compare the buyer against."],
      ["companyGstinInvalid", "Company GSTIN invalid in Tally", "The Tally company's GSTIN is not a valid GSTIN."],
      ["buyerGstinMissing", "Buyer GSTIN missing", "Allows unregistered purchases."],
      ["buyerCompanyGstinMismatch", "Invoice buyer is a different company", "The invoice's buyer GSTIN differs from the open Tally company."],
      ["supplierGstinMissing", "Supplier GSTIN missing", "Allows unregistered suppliers."],
      ["supplierLedgerGstinMismatch", "Supplier and ledger GSTIN differ", "Protects against selecting the wrong supplier ledger."],
    ],
  },
  {
    title: "Item mapping",
    rules: [
      ["hsnMissing", "HSN missing", "Skipped when the Tally item already supplies it."],
      ["stockItemHsnMismatch", "Stock-item HSN differs", "Ask for review when invoice and Tally classification differ."],
      ["stockItemUnitMismatch", "Stock-item unit differs", "Tally may support an alternate unit or conversion."],
    ],
  },
  {
    title: "Workflow",
    rules: [
      ["sourceDocumentMissing", "Source invoice missing", "Controls the invoice attachment, not voucher balancing."],
      ["caseNotAccepted", "Packet approval pending", "Keeps packet approval separate from accounting approval."],
      ["staleTallyMasters", "Tally ledgers still loading", "Kalika is still reading ledgers and items live from the open Tally company."],
      ["possibleDuplicate", "Possible duplicate invoice", "Protects against sending the same invoice twice."],
    ],
  },
] as const;

type RuleKey = (typeof RULE_GROUPS)[number]["rules"][number][0];

type Settings = {
  purchaseGoodsTdsEnabled: boolean;
  transporterTdsEnabled: boolean;
  gstTdsEnabled: boolean;
  validationPolicy: Record<RuleKey, Severity>;
};

const DEDUCTIONS = [
  {
    key: "purchaseGoodsTdsEnabled",
    label: "Purchase TDS on goods (194Q)",
    description: "0.1% on the goods value. Turn it on for each voucher from suppliers past the yearly limit; one invoice cannot prove eligibility.",
  },
  {
    key: "transporterTdsEnabled",
    label: "TDS on goods transport",
    description: "On freight billed on the invoice, before GST: 1% when the transporter's PAN is an individual or HUF, otherwise 2%, rounded down to the rupee.",
  },
  {
    key: "gstTdsEnabled",
    label: "GST TDS, including metal scrap",
    description: "1% CGST + 1% SGST, or 2% IGST, on qualifying MS scrap purchases (from 10 Oct 2024). Other cases follow the invoice.",
  },
] as const;

async function errorText(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

export function PurchaseAccountingSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const saveSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/settings/purchase-accounting", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response));
        const payload = await response.json() as { settings?: Settings };
        if (!cancelled && payload.settings) setSettings(payload.settings);
      })
      .catch((loadError) => !cancelled && setError(loadError instanceof Error ? loadError.message : "Could not load purchase accounting settings."));
    return () => { cancelled = true; };
  }, []);

  // Every change saves immediately; a failed save restores the last saved settings.
  async function update(next: Settings) {
    const previous = settings;
    const sequence = ++saveSequence.current;
    setSettings(next);
    setStatus("saving");
    setError("");
    try {
      const response = await apiFetch("/api/settings/purchase-accounting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      if (sequence === saveSequence.current) setStatus("saved");
    } catch (saveError) {
      if (sequence !== saveSequence.current) return;
      setSettings(previous);
      setStatus("");
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    }
  }

  return (
    <main className="w-full space-y-4">
      <section className={CARD}>
        <header className="flex items-start justify-between gap-3 border-b border-[#e8e2db] px-5 py-4">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111827]">Deductions</h2>
            <p className="mt-1 text-xs text-[#5b4b3d]">Which deductions Kalika handles. Switched-off deductions are hidden on Purchase vouchers and never posted.</p>
          </div>
          <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[#ded8d0] bg-[#faf8f5] px-2.5 text-[11px] font-medium text-[#675d54]">
            {status === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</> : <><Check className="h-3 w-3 text-emerald-600" />Saved automatically</>}
          </span>
        </header>
        {error ? <p className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        {settings ? (
          <div className="divide-y divide-[#f3efe9] px-5">
            {DEDUCTIONS.map((rule) => {
              const enabled = settings[rule.key];
              return (
                <button
                  aria-pressed={enabled}
                  className="flex w-full items-center justify-between gap-6 py-3.5 text-left"
                  key={rule.key}
                  onClick={() => void update({ ...settings, [rule.key]: !enabled })}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#111827]">{rule.label}</span>
                    <span className="mt-0.5 block max-w-3xl text-[11px] leading-5 text-[#8a7f72]">{rule.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span className={`w-6 text-right text-[11px] font-semibold ${enabled ? "text-[#047857]" : "text-[#a89e92]"}`}>{enabled ? "On" : "Off"}</span>
                    <SettingsSwitch checked={enabled} />
                  </span>
                </button>
              );
            })}
          </div>
        ) : !error ? (
          <div className="space-y-2 px-5 py-4">
            {Array.from({ length: 3 }).map((_, index) => <div className="h-10 animate-pulse rounded-lg bg-[#ede6d9]/50" key={index} />)}
          </div>
        ) : null}
      </section>

      <PurchasePostingDefaultsSettings deductions={settings} />

      {settings ? (
        <details className={`group ${CARD}`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span>
              <span className="block text-base font-bold tracking-tight text-[#111827]">Checks before posting</span>
              <span className="mt-1 block text-xs text-[#5b4b3d]">Which problems stop a voucher, only warn, or are ignored. Balanced totals, valid dates and required ledgers always stop it.</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#8a7f72] transition group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-[#f0ece4] border-t border-[#f0ece4]">
            {RULE_GROUPS.map((group) => (
              <div className="grid gap-2 px-5 py-3.5 lg:grid-cols-[160px_1fr]" key={group.title}>
                <h3 className="pt-2 text-xs font-bold text-[#5b4b3d]">{group.title}</h3>
                <div className="divide-y divide-[#f5f1eb]">
                  {group.rules.map(([key, label, description]) => {
                    const selected = settings.validationPolicy[key];
                    return (
                      <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between" key={key}>
                        <div className="min-w-0 pr-3">
                          <p className="text-xs font-semibold text-[#111827]">{label}</p>
                          <p className="mt-0.5 text-xs text-[#8a7f72]">{description}</p>
                        </div>
                        <div className="grid shrink-0 grid-cols-3 rounded-lg border border-[#e0d8cc] bg-[#ede6d9]/60 p-0.5" role="group" aria-label={`${label} severity`}>
                          {(["block", "warn", "off"] as const).map((severity) => (
                            <button
                              aria-pressed={selected === severity}
                              className={`min-w-[56px] rounded-md px-2 py-1 text-xs font-semibold capitalize transition ${
                                selected === severity
                                  ? severity === "block"
                                    ? "bg-white text-rose-700 shadow-2xs"
                                    : severity === "warn"
                                      ? "bg-white text-amber-700 shadow-2xs"
                                      : "bg-white text-slate-700 shadow-2xs"
                                  : "text-[#8a7f72] hover:text-[#111827]"
                              }`}
                              key={severity}
                              onClick={() => void update({ ...settings, validationPolicy: { ...settings.validationPolicy, [key]: severity } })}
                              type="button"
                            >
                              {severity}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
