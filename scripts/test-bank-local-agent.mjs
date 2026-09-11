// Creates an explicitly labelled analysis-only test from an existing uploaded PDF.
// Does not confirm transactions or post vouchers. Run with apps/api/.env loaded.
import { createClient } from "@supabase/supabase-js";
import { bankParsingPolicy } from "../apps/api/src/lib/processing/local-bank-parsing.mjs";
const [sourceId, connectionId] = process.argv.slice(2);
if (!sourceId || !connectionId) throw new Error("Usage: test-bank-local-agent.mjs <source-import-id> <connection-id>");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: source, error: sourceError } = await supabase.from("bank_statement_imports").select("*").eq("id", sourceId).single();
if (sourceError) throw sourceError;
const { data: connection, error: connectionError } = await supabase.from("tally_connections").select("*").eq("id", connectionId).eq("owner_user_id", source.owner_user_id).single();
if (connectionError) throw connectionError;
const ctx = source.processing_meta.selectedContext;
const policy = bankParsingPolicy(connection, { companyName: ctx.companyName, year: ctx.financialYear, ownerUserId: source.owner_user_id });
if (policy.mode !== "local_agent") throw new Error("Local parsing must be enabled for this test.");
const { data: imported, error: importError } = await supabase.from("bank_statement_imports").insert({
  owner_user_id: source.owner_user_id, original_file_name: `LOCAL-PARSE-TEST-${source.original_file_name}`,
  storage_bucket: source.storage_bucket, storage_path: source.storage_path, storage_asset_id: source.storage_asset_id,
  content_sha256: source.content_sha256, mime_type: source.mime_type, size_bytes: source.size_bytes, status: "processing",
  processing_meta: { source: "local_agent_integration_test", selectedContext: { ...ctx, connectionId, localParsing: policy },
    analysis: { status: "queued", connectionId, startedAt: new Date().toISOString() } },
}).select("id").single();
if (importError) throw importError;
const { data: job, error: jobError } = await supabase.from("bank_statement_extraction_jobs").insert({ import_id: imported.id, owner_user_id: source.owner_user_id, status: "queued", result: { workerPool: "local" } }).select("id").single();
if (jobError) throw jobError;
console.log(JSON.stringify({ importId: imported.id, jobId: job.id, machine: policy.machineName }));
const started = Date.now();
let prior = "";
let completed = false;
while (Date.now() - started < 300_000) {
  const { data, error } = await supabase.from("bank_statement_extraction_jobs").select("status,stage,error,result").eq("id", job.id).single();
  if (error) throw error;
  const current = `${data.status}: ${data.stage}`;
  if (prior !== current) console.log(current);
  prior = current;
  if (["succeeded", "failed", "cancelled"].includes(data.status)) {
    const { data: finished } = await supabase.from("bank_statement_imports").select("processing_meta").eq("id", imported.id).single();
    console.log(JSON.stringify({ elapsedMs: Date.now() - started, status: data.status, error: data.error, result: data.result, diagnostics: finished?.processing_meta?.extractionDiagnostics }, null, 2));
    process.exitCode = data.status === "succeeded" ? 0 : 1;
    completed = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
}
if (!completed) { console.error("Test polling timed out; inspect the job before retrying."); process.exitCode = 1; }
