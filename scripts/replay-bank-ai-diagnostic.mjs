// Read-only workflow diagnostic. Makes one paid AI call, no database/Tally writes.
// Reuses the production prompt; only the transport deadline is overridden.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import * as anydoc from "@firecrawl/anydoc";
import { matchBankMarkdown } from "../apps/api/src/lib/processing/bank-markdown-ai.mjs";
import { validateRunningBalanceContinuity } from "../apps/api/worker/bank-statement-balance-validation.mjs";

const [importId, pdfPath] = process.argv.slice(2);
if (!importId || !pdfPath) throw new Error("Usage: replay-bank-ai-diagnostic.mjs <import-id> <local-pdf>");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: statement, error } = await supabase.from("bank_statement_imports")
  .select("content_sha256,processing_meta").eq("id", importId).single();
if (error) throw new Error(`Cannot load original context (${error.code}).`);
const bytes = fs.readFileSync(pdfPath);
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== String(statement.content_sha256).toLowerCase()) throw new Error("PDF does not match the failed import hash.");
const parseStart = performance.now();
const markdown = String(await anydoc.toMarkdown(pdfPath));
const ctx = statement.processing_meta?.selectedContext || {};
console.log(JSON.stringify({ event: "replay_input", identicalPdfHash: true,
  parseMs: Math.round(performance.now() - parseStart), markdownChars: markdown.length,
  ledgerCount: ctx.liveTallyLedgerNames?.length || 0,
  effectiveTimeoutMs: 180000, productionTimeoutMs: 180000 }));
let providerSummary;
const started = Date.now();
const heartbeat = setInterval(() => console.log(JSON.stringify({ event: "replay_waiting", elapsedMs: Date.now() - started })), 15000);
try {
  const result = await matchBankMarkdown({ markdown, ledgerNames: ctx.liveTallyLedgerNames || [],
    bankAccountCandidates: ctx.liveTallyBankAccountCandidates || [], traceId: `manual-${importId}`,
    fetchImpl: async (url, options) => {
      console.log(JSON.stringify({ event: "request_fingerprint", sha256: createHash("sha256").update(options.body).digest("hex"), requestBytes: Buffer.byteLength(options.body) }));
      const response = await fetch(url, options);
      return { status: response.status, ok: response.ok, json: async () => {
        const body = await response.json();
        providerSummary = { providerElapsedMs: Date.now() - started, finishReason: body.choices?.[0]?.finish_reason,
          promptTokens: body.usage?.prompt_tokens, completionTokens: body.usage?.completion_tokens,
          reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens,
          cachedTokens: body.usage?.prompt_tokens_details?.cached_tokens,
          outputCharacters: body.choices?.[0]?.message?.content?.length || 0 };
        console.log(JSON.stringify({ event: "provider_completed", ...providerSummary }));
        return body;
      } };
    } });
  const rows = result.data.transactions;
  const balanceCheck = validateRunningBalanceContinuity(rows.map(row => ({ debit_amount: row.debitAmount,
    credit_amount: row.creditAmount, balance_amount: row.balanceAmount })), result.data.openingBalance);
  console.log(JSON.stringify({ event: "replay_completed", elapsedMs: Date.now() - started,
    transactionCount: rows.length, coverage: result.coverage, recommendations: rows.filter(r => r.suggestedLedgerName).length,
    balanceValid: balanceCheck.valid, balanceBreaks: balanceCheck.breaks.length,
    ...providerSummary }));
} catch (error) {
  // Never print provider messages / JSON snippets containing document content.
  console.log(JSON.stringify({ event: "replay_failed", elapsedMs: Date.now() - started,
    errorType: error.name, ...providerSummary }));
  process.exitCode = 1;
} finally { clearInterval(heartbeat); }
