import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bankParsingPolicy, parseBankOnAgent } from "./local-bank-parsing.mjs";
import { matchBankMarkdown } from "./bank-markdown-ai.mjs";

const now = Date.now();
const context = { ownerUserId: "owner", companyName: "Company", year: "2026-27" };
const connection = { id: "connection", owner_user_id: "owner", agent_version: "1.0.0", agent_last_seen_at: new Date(now).toISOString(),
  installation_id: "client-pc", session_generation: 2, agent_status: { settings: { localAnydocEnabled: true } },
  agent_capabilities: ["local-anydoc-v1"], last_companies_snapshot: [{ companyName: "Company", guid: "company-guid", financialYear: "2026-27" }] };
test("local mode binds to exact installation, company GUID and FY", () => {
  const policy = bankParsingPolicy(connection, context, now);
  assert.equal(policy.mode, "local_agent");
  assert.equal(policy.identity.installationId, "client-pc");
  assert.equal(policy.identity.companyGuid, "company-guid");
  assert.equal(policy.identity.financialYear, "2026-2027");
});
test("off and legacy retain backend mode", () => {
  assert.equal(bankParsingPolicy({ ...connection, agent_status: { settings: { localAnydocEnabled: false } } }, context, now).mode, "backend");
  assert.equal(bankParsingPolicy({ ...connection, agent_version: null }, context, now).mode, "backend");
});
test("unknown settings, stale agent, revoked pairing and wrong owner fail closed", () => {
  for (const patch of [{ agent_status: {} }, { agent_last_seen_at: new Date(now - 61000).toISOString() }, { revoked_at: "now" }, { owner_user_id: "other" }, { agent_capabilities: [] }, { last_companies_snapshot: [] }]) {
    assert.throws(() => bankParsingPolicy({ ...connection, ...patch }, context, now));
  }
});
test("ambiguous company names cannot select another dataset", () => {
  assert.throws(() => bankParsingPolicy({ ...connection, last_companies_snapshot: [...connection.last_companies_snapshot, ...connection.last_companies_snapshot] }, context, now));
});
test("AI consumes markdown and rejects invented ledgers", async () => {
  const prior = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only";
  try {
    const result = await matchBankMarkdown({ markdown: "Statement text", ledgerNames: ["Allowed"], fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.match(request.messages[1].content, /Statement text/);
      assert.doesNotMatch(request.messages[1].content, /file_data/);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ transactions: [{ suggestedLedgerName: "Invented" }] }) } }] }) };
    } });
    assert.equal(result.data.transactions[0].suggestedLedgerName, null);
  } finally { if (prior === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prior; }
});
test("bank master read is ephemeral and local worker path cannot fall back", () => {
  const ui = readFileSync(new URL("../../../../web/src/components/bank-statements/BankStatementsPage.tsx", import.meta.url), "utf8");
  assert.match(ui, /operation: "ledger_masters",\s+payload: \{ persist: false, \.\.\.\(exactScope \? \{ bankDocumentIdentity: exactScope.identity \} : \{\}\) \}/);
  const worker = readFileSync(new URL("../../../worker/process-packet-jobs.mjs", import.meta.url), "utf8");
  assert.match(worker, /if \(useLocalParser\) \{/);
  assert.match(worker, /else extraction = await extractBankStatementAdaptive/);
});

test("direct PDF job queues only an upload ticket and never accesses cloud storage", async () => {
  const prior = process.env.AGENT_JOB_TOKEN_SECRET;
  process.env.AGENT_JOB_TOKEN_SECRET = "test-only-secret";
  let command;
  const current = { ...connection, agent_last_seen_at: new Date().toISOString(), agent_capabilities: [...connection.agent_capabilities, "browser-document-upload-v1"] };
  const db = {
    storage: { from() { throw new Error("Direct local PDFs must never access cloud storage"); } },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: current }),
        insert: async value => { command = value; return { error: null }; },
        single: async () => ({ data: { status: "running", result: { localExtraction: { commandId: command.id, data: { transactions: [] } } } } }),
      };
      assert.ok(["tally_connections", "tally_bridge_commands", "bank_statement_extraction_jobs"].includes(table));
      return query;
    },
  };
  try {
    const policy = { ...bankParsingPolicy(current, context), browserUpload: { tokenHash: "a".repeat(64), origin: "http://localhost:3000", sizeBytes: 123, expiresAt: Date.now() + 60_000 } };
    const result = await parseBankOnAgent({ supabase: db, job: { id: "job", owner_user_id: "owner" },
      importRow: { id: "import", storage_bucket: "", storage_path: "", content_sha256: "b".repeat(64) }, policy,
      apiBase: "http://localhost:3001", progress: async () => {}, wakeConnector: async () => {},
    });
    assert.equal(command.payload.sourceUrl, undefined);
    assert.deepEqual(command.payload.browserUpload, policy.browserUpload);
    assert.equal(result.commandId, command.id);
  } finally { if (prior === undefined) delete process.env.AGENT_JOB_TOKEN_SECRET; else process.env.AGENT_JOB_TOKEN_SECRET = prior; }
});

test("local frontend unlocks protected previews before keeping analysis local", () => {
  const ui = readFileSync(new URL("../../../../web/src/components/bank-statements/BankStatementsPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /nextPreview.kind === "pdf" && mode === "local_agent"[\s\S]*?URL.createObjectURL\(nextFile\)[\s\S]*?return;/);
  assert.match(ui, /apiFetch\("\/api\/bank-statements\/pdf-preview"[\s\S]*?const unlockedPdf = new File[\s\S]*?setFile\(unlockedPdf\)/);
  assert.match(ui, /if \(parsingMode === "local_agent"\) \{\s+formData.set\("localDocument"[\s\S]*?\} else \{\s+formData.set\("file", nextFile\)/);
  const route = readFileSync(new URL("../../app/api/bank-statements/imports/route.ts", import.meta.url), "utf8");
  assert.match(route, /const asset = localDocument \? \{[\s\S]*?storageBucket: "", storagePath: ""[\s\S]*?\} : await ensureStorageAsset/);
});
