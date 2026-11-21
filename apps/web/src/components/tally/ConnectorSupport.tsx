"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import { Button } from "@/components/ui/button";

type Statement = { id: string; originalFileName: string; status: string; connectionId: string; companyName: string; financialYear?: string };
type Row = { id: string; transactionDate: string; description: string; referenceNumber?: string; debitAmount: number | string; creditAmount: number | string; balanceAmount: number | null; confirmedLedgerName?: string; suggestedLedgerName?: string };
type Preview = { account: { tallyLedgerName?: string }; transactions: Row[]; transactionsTotal: number; transactionsPageSize: number };
type Check = { transactions: { verificationStatus: string }[]; queryDiagnostics: { retries: number; oversizedResponses: number; incomplete?: string } };

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await apiFetch(path, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load the saved statement.");
  return body;
}

export function ConnectorSupport({ connectionId, company, version, canReplay }: {
  connectionId: string; company: string; version: string; canReplay: boolean;
}) {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selected, select] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, report] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    if (canReplay) void readJson<{ imports: Statement[] }>("/api/bank-statements/imports?connectionId=" + encodeURIComponent(connectionId), controller.signal)
      .then(({ imports }) => {
        const saved = imports.filter(s => s.connectionId === connectionId && s.companyName === company && !["failed","processing"].includes(s.status));
        setStatements(saved);
        select(saved[0]?.id || "");
      }).catch(error => { if (!controller.signal.aborted) report(error.message); });
    return () => controller.abort();
  }, [connectionId, company, canReplay]);

  async function run(action: "connector_update" | "connector_diagnostics" | "replay") {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const signal = controller.signal;
    const request = { connectionId, companyName: company, signal };
    setBusy(true);
    report("Contacting the selected PC…");
    try {
      if (action === "connector_update") {
        const data = await runCashDiscountLiveRequest<{ message: string }>({ ...request, operation: action });
        report(data.message || "Update requested. The installed version refreshes when the PC reconnects.");
      } else if (action === "connector_diagnostics") {
        const d = await runCashDiscountLiveRequest<{version:string; reachable:boolean; company:string|null; responseMs:number; error?:string; lastLiveFailure?:{operation:string;error:string;at:string}}>({ ...request, operation: action });
        report(`Connector ${d.version} · Tally ${d.reachable ? "reachable" : "unreachable"} in ${d.responseMs} ms · ${d.company || "No company loaded"}. ${d.error || ""} ${d.lastLiveFailure ? "Last live failure: " + d.lastLiveFailure.operation + " · " + d.lastLiveFailure.at + " · " + d.lastLiveFailure.error : "No live failure recorded since connection."}`);
      } else {
        const statement = statements.find(s => s.id === selected && s.connectionId === connectionId && s.companyName === company);
        if (!statement) throw new Error("Select a saved statement for this PC and company.");
        const page = (n: number) => readJson<Preview>(`/api/bank-statements/imports/${statement.id}?transactionsPage=${n}&transactionsPageSize=500`, signal);
        const first = await page(1);
        const rows = [...first.transactions];
        for (let n = 2; rows.length < first.transactionsTotal; n++) {
          const next = await page(n);
          if (!next.transactions.length || next.transactionsTotal !== first.transactionsTotal) throw new Error("Statement rows changed. Run the replay again.");
          rows.push(...next.transactions);
        }
        if (rows.length !== first.transactionsTotal || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Incomplete saved statement.");
        const bankLedgerName = first.account?.tallyLedgerName;
        if (!bankLedgerName) throw new Error("Select a bank ledger in the statement first.");
        const transactions = rows.filter(r => r.transactionDate && r.description?.trim() && ((Number(r.creditAmount)>0) !== (Number(r.debitAmount)>0))).map(r => {
          const incoming = Number(r.creditAmount)>0;
          const ledger = r.confirmedLedgerName || r.suggestedLedgerName;
          return {transactionId:r.id, voucherDate:r.transactionDate, bankLedgerName, amount:Number(incoming?r.creditAmount:r.debitAmount),
            expectedDirection:incoming?"incoming":"outgoing", debitAmount:Number(r.debitAmount), creditAmount:Number(r.creditAmount), balanceAmount:r.balanceAmount,
            counterpartyLedgerName:ledger && !/suspense/i.test(ledger)?ledger:null, narration:r.description,
            referenceNumber:r.referenceNumber || "", bankReferenceNumber:r.referenceNumber || null, referenceSource:r.referenceNumber?"bank":"generated"};
        });
        if (!transactions.length) throw new Error("The statement has no eligible transactions.");
        const start = performance.now();
        const result = await runCashDiscountLiveRequest<Check>({ ...request, financialYear:statement.financialYear, operation:"verify_bank_transaction",
          payload:{supportReplay:true, companyName:company, bankLedgerName, transactions}, onProgress:report });
        if (result.transactions?.length !== transactions.length) throw new Error("Incomplete connector result. Rerun the check.");
        const counts: Record<string,number> = {};
        for (const row of result.transactions) counts[row.verificationStatus] = (counts[row.verificationStatus] || 0) + 1;
        const detail = result.queryDiagnostics;
        report(`${transactions.length} rows in ${((performance.now()-start)/1000).toFixed(1)} s · ${Object.entries(counts).map(([status,n])=>n+" "+status).join(", ")} · ${detail.retries} retries · ${detail.oversizedResponses} oversized responses. ${detail.incomplete || ""}`);
      }
    } catch (error) { if (!signal.aborted) report(error instanceof Error ? error.message : "Support request failed."); }
    finally { active.current = null; if (!signal.aborted) setBusy(false); }
  }
  const parts = version.split(".").map(Number);
  const supportsRemote = parts.length === 3 && (parts[0] > 1 || (parts[0] === 1 && (parts[1] > 2 || (parts[1] === 2 && parts[2] >= 47))));
  return <section className="mb-4 rounded-xl border bg-white p-4">
    <h2 className="mb-3 font-semibold">Remote support · Connector {version || "version unknown"}</h2>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={busy || !supportsRemote} onClick={() => void run("connector_diagnostics")}>Run diagnostics</Button>
      <Button variant="outline" disabled={busy || !supportsRemote} onClick={() => void run("connector_update")}>Update this PC</Button>
      {canReplay && statements.length > 0 && <>
        <select aria-label="Saved statement to replay" className="max-w-xs rounded border p-2" disabled={busy} value={selected} onChange={event=>select(event.target.value)}>
          {statements.map(s=><option key={s.id} value={s.id}>{s.originalFileName} · {s.id.slice(0,8)}</option>)}
        </select>
        <Button variant="outline" disabled={!selected || busy || !supportsRemote} onClick={() => void run("replay")}>Replay statement</Button>
      </>}
    </div>
    {!supportsRemote && <p className="mt-2 text-sm">On this PC, open the connector and choose Check for updates, then Restart &amp; update. Remote support starts with 1.2.47.</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
