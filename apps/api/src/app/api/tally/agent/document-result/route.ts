import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyAgentJobToken } from "@/lib/tally/agent-job-token";
import { matchBankMarkdown } from "@/lib/processing/bank-markdown-ai.mjs";
import { bankParsingPolicy } from "@/lib/processing/local-bank-parsing.mjs";
import { BANK_LOCAL_V2_CONTENT_TYPE, handleLocalBankV2 } from '@/lib/processing/bank-local-v2-http.mjs';
import { localBankV2Store } from '@/lib/processing/bank-local-v2-store';
import { publishBankJobEvent, subscribeBankJobEvents } from '@/lib/processing/bank-job-events.mjs';
import { watchBankAnalysis } from '@/lib/processing/bank-local-v2-cancellation.mjs';
import {subscribeAccessChanges} from '@/lib/access/events';

export function OPTIONS(request: Request) { return optionsWithCors(request); }

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() === BANK_LOCAL_V2_CONTENT_TYPE) {
    const db = createSupabaseAdminClient();
    return handleLocalBankV2(request, { verifyToken: verifyAgentJobToken, store: localBankV2Store(db),
      watchAnalysis: envelope => watchBankAnalysis({ identity: envelope.identity, jobId: envelope.jobId,
        subscribeAccess:process.env.TEAM_ACCESS_ENFORCEMENT==='true'?subscribeAccessChanges:undefined,
        subscribe: subscribeBankJobEvents, readStatus: async () => {
          const { data, error } = await db.rpc('bank_local_v2_status', { p_command_id: envelope.commandId,
            p_owner_id: envelope.identity.ownerUserId, p_connection_id: envelope.identity.connectionId });
          if (error) throw error;
          return data;
        } }),
      notify: async (type, value, identity) => { await publishBankJobEvent(identity, type, value); },
      diagnostic: metrics => console.info('[bank-v2]', JSON.stringify(metrics)),
    });
  }
  const started = Date.now();
  let traceId = "unverified";
  let phase = "authentication";
  let failureContext: { db: ReturnType<typeof createSupabaseAdminClient>; jobId: string; importId: string; ownerId: string; meta: Record<string, unknown> } | null = null;
  const mark = (nextPhase: string, details: Record<string, unknown> = {}) => {
    phase = nextPhase;
    console.info("[bank-document-result]", JSON.stringify({ traceId, phase, elapsedMs: Date.now() - started, ...details }));
  };
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const claims = verifyAgentJobToken(token);
    if (!claims) return jsonWithCors(request, { error: "Invalid or expired document job token." }, { status: 401 });
    traceId = claims.jobId;
    mark("reading_markdown_upload");
    const bytes = Buffer.from(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) {
      return jsonWithCors(request, { error: "Compressed document result is empty or too large." }, { status: 413 });
    }
    mark("decompressing_markdown", { compressedBytes: bytes.length });
    const markdown = gunzipSync(bytes, { maxOutputLength: 100 * 1024 * 1024 }).toString("utf8");
    mark("loading_command", { markdownChars: markdown.length });
    const auditHash = createHash("sha256").update(markdown).digest("hex");
    const supabase = createSupabaseAdminClient();
    const { data: command, error } = await supabase.from("tally_bridge_commands")
      .select("id,connection_id,owner_user_id,status,command_type,payload,deadline_at,external_result_reference")
      .eq("id", claims.jobId).eq("connection_id", claims.connectionId).eq("owner_user_id", claims.ownerUserId).maybeSingle();
    if (error) throw error;
    if (!command) return jsonWithCors(request, { error: "Document job not found." }, { status: 404 });
    if (command.command_type !== "agent_parse_document") return jsonWithCors(request, { error: "Not a document job." }, { status: 409 });
    const jobPayload = command.payload as Record<string, unknown>;
    if (jobPayload.pipelineVersion === 2) {
      return jsonWithCors(request, { error: 'This job requires its v2 document envelope. The pipeline cannot change after creation.' }, { status: 409 });
    }
    if (jobPayload.bankStatementJobId) {
      mark("validating_connection", { bankJobId: jobPayload.bankStatementJobId, importId: jobPayload.bankStatementImportId });
      const { data: connection, error: connectionError } = await supabase.from("tally_connections").select("*")
        .eq("id", claims.connectionId).eq("owner_user_id", claims.ownerUserId).maybeSingle();
      if (connectionError) throw connectionError;
      const identity = jobPayload.agentIdentity && typeof jobPayload.agentIdentity === "object" && !Array.isArray(jobPayload.agentIdentity)
        ? jobPayload.agentIdentity as { companyName?: string; financialYear?: string; installationId?: string; companyGuid?: string; sessionGeneration?: number }
        : null;
      if (!identity) return jsonWithCors(request, { error: "Document job identity is missing." }, { status: 409 });
      const current = bankParsingPolicy(connection, { companyName: identity.companyName, year: identity.financialYear, ownerUserId: claims.ownerUserId });
      if (current.mode !== "local_agent" || current.identity?.installationId !== identity.installationId || current.identity?.companyGuid !== identity.companyGuid || Number(current.identity?.sessionGeneration) !== Number(identity.sessionGeneration)) {
        return jsonWithCors(request, { error: "Document pairing or settings changed." }, { status: 409 });
      }
      const suppliedHash = request.headers.get("x-kalika-document-sha256") || "";
      if (suppliedHash.toLowerCase() !== String(jobPayload.expectedSha256 || "").toLowerCase()) return jsonWithCors(request, { error: "Document hash mismatch." }, { status: 409 });
      mark("loading_bank_job");
      const { data: bankJob, error: bankError } = await supabase.from("bank_statement_extraction_jobs")
        .select("id,status,result,import_id").eq("id", jobPayload.bankStatementJobId).eq("owner_user_id", claims.ownerUserId).single();
      if (bankError) throw bankError;
      if (bankJob.import_id !== jobPayload.bankStatementImportId) return jsonWithCors(request, { error: "Document import mismatch." }, { status: 409 });
      if (command.external_result_reference === `bank-document:${auditHash}`) return jsonWithCors(request, { accepted: true, auditHash });
      if (command.status !== "claimed" || Date.parse(command.deadline_at || "") < Date.now() || bankJob.status !== "running") {
        return jsonWithCors(request, { error: "This document job is no longer active." }, { status: 409 });
      }
      // Claim the one-time result before making a paid AI call. Concurrent replays
      // cannot process the same document. A lost HTTP response can be acknowledged above.
      mark("claiming_result");
      const { data: accepted, error: claimError } = await supabase.from("tally_bridge_commands")
        .update({ external_result_reference: "bank-document:processing" }).eq("id", command.id)
        .is("external_result_reference", null).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!accepted) return jsonWithCors(request, { error: "Document result is already processing." }, { status: 409 });
      mark("loading_statement_context");
      const { data: statement, error: statementError } = await supabase.from("bank_statement_imports")
        .select("processing_meta").eq("id", bankJob.import_id).eq("owner_user_id", claims.ownerUserId).single();
      if (statementError) throw statementError;
      failureContext = { db: supabase, jobId: bankJob.id, importId: bankJob.import_id,
        ownerId: claims.ownerUserId, meta: statement.processing_meta || {} };
      const ctx = statement.processing_meta?.selectedContext || {};
      await supabase.from("bank_statement_extraction_jobs").update({ progress: 50, stage: "Analyzing transactions" }).eq("id", bankJob.id).eq("status", "running");
      mark("ai_analysis");
      const extraction = await matchBankMarkdown({ markdown, ledgerNames: ctx.liveTallyLedgerNames || [], bankAccountCandidates: ctx.liveTallyBankAccountCandidates || [], traceId });
      const localExtraction = {
        commandId: command.id, data: extraction.data,
        diagnostics: { source: "local_agent", machineName: current.machineName, installationId: identity.installationId, auditHash,
          sourceRetention: jobPayload.browserUpload ? "local_only" : "cloud", markdownChars: markdown.length, aiMs: extraction.aiMs,
          coverage: extraction.coverage },
      };
      mark("saving_result", { aiMs: extraction.aiMs, transactionCount: extraction.data.transactions.length });
      const { data: updated, error: saveError } = await supabase.from("bank_statement_extraction_jobs")
        .update({ result: { ...bankJob.result, localExtraction } }).eq("id", bankJob.id).eq("status", "running").select("id").maybeSingle();
      if (saveError) throw saveError;
      if (!updated) return jsonWithCors(request, { error: "Bank analysis was cancelled." }, { status: 409 });
      await supabase.from("tally_bridge_commands").update({ external_result_reference: `bank-document:${auditHash}` }).eq("id", command.id);
      mark("completed");
      return jsonWithCors(request, { accepted: true, auditHash, transactionCount: extraction.data.transactions.length });
    }
    // Markdown is intentionally processed in-memory and is never stored in a
    // Supabase table. The workflow receives only compact extraction metadata;
    // downstream business extraction can consume `markdown` in this request.
    return jsonWithCors(request, {
      accepted: true,
      auditHash,
      structuredResult: {
        characters: markdown.length,
        lines: markdown.split(/\r?\n/).length,
        headings: (markdown.match(/^#{1,6}\s+/gm) || []).length,
      },
    });
  } catch (error) {
    const detail = error as { name?: string; code?: string; cause?: { code?: string } };
    console.error("[bank-document-result]", JSON.stringify({ traceId, event: "failed", phase,
      elapsedMs: Date.now() - started,
      errorType: ["TimeoutError", "AbortError", "SyntaxError", "TypeError", "Error"].includes(detail?.name || "") ? detail.name : "DatabaseOrUnknownError",
      errorCode: /^[A-Z0-9_]{1,80}$/.test(String(detail?.code || detail?.cause?.code || "")) ? detail.code || detail.cause?.code : null,
    }));
    const diagnostic = error as { diagnosticCode?: string; publicMessage?: string };
    const message = diagnostic.publicMessage || (error instanceof Error ? error.message : "Document result processing failed.");
    if (failureContext) {
      const { db, jobId, importId, ownerId, meta } = failureContext;
      try {
        const finishedAt = new Date().toISOString();
        const { data: failed, error: jobError } = await db.from("bank_statement_extraction_jobs")
          .update({ status: "failed", stage: "Document analysis failed", error: message, finished_at: finishedAt })
          .eq("id", jobId).eq("owner_user_id", ownerId).eq("status", "running").select("id").maybeSingle();
        if (jobError) throw jobError;
        if (failed) {
          const existingAnalysis = meta.analysis && typeof meta.analysis === "object" && !Array.isArray(meta.analysis)
            ? meta.analysis as Record<string, unknown>
            : {};
          const { error: importError } = await db.from("bank_statement_imports")
            .update({ status: "failed", processing_meta: { ...meta,
              analysis: { ...existingAnalysis, status: "failed", stage: "Document analysis failed", error: message, updatedAt: finishedAt },
              failureDiagnostics: { traceId, phase, code: diagnostic.diagnosticCode || "DOCUMENT_RESULT_FAILED", elapsedMs: Date.now() - started },
            } }).eq("id", importId).eq("owner_user_id", ownerId).eq("status", "processing");
          if (importError) throw importError;
        }
      } catch {
        console.error("[bank-document-result]", JSON.stringify({ traceId, event: "failure_status_save_failed" }));
      }
    }
    return jsonWithCors(request, { error: message, code: diagnostic.diagnosticCode || "DOCUMENT_RESULT_FAILED" },
      { status: diagnostic.diagnosticCode === "AI_TIMEOUT" ? 504 : /incorrect header|invalid/i.test(message) ? 400 : 500 });
  }
}

export async function GET(request: Request) {
  let claims;
  try { claims = verifyAgentJobToken(request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || ''); }
  catch { claims = null; }
  if (!claims) return jsonWithCors(request, { error: 'Invalid or expired document job token.' }, { status: 401 });
  const { data, error } = await createSupabaseAdminClient().rpc('bank_local_v2_status', {
    p_command_id: claims.jobId, p_owner_id: claims.ownerUserId, p_connection_id: claims.connectionId,
  });
  if (error) return jsonWithCors(request, { error: 'Document status unavailable.' }, { status: error.code === '42501' ? 403 : 503 });
  return jsonWithCors(request, data, { headers: { 'Cache-Control': 'no-store' } });
}
