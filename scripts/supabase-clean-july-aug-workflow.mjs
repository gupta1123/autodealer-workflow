import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const env = {};
  const text = fs.readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, index).trim()] = value;
  }
  return env;
}

const apply = process.argv.includes("--apply");
const env = readEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase URL or service role key is missing in .env");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const TABLES = [
  "bank_statement_imports",
  "bank_transactions",
  "bank_transaction_posting_log",
  "tally_bridge_commands",
  "debit_note_proposals",
  "collections_analysis_cache",
  "cash_discount_rules",
  "tally_connections",
  "tally_masters",
  "tally_master_sync_runs",
];

const JULY_AUG_RE =
  /(2026-07|2026-08|2607|2608|KTC-260707|AUG|HPR\/26-27\/606|VMW\/26-27\/601|KTU\/26-27\/60[23]|RFP\/26-27\/604|TCP\/26-27\/605|NIS\/26-27\/701|ASC\/26-27\/209)/i;

function stringifyForScan(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function rowLooksJulyAug(row) {
  const preferredDateFields = [
    "transaction_date",
    "statement_start_date",
    "statement_end_date",
    "debit_note_date",
    "receipt_date",
    "linked_invoice_date",
    "tally_voucher_date",
    "period_start",
    "period_end",
    "voucher_date",
  ];

  for (const field of preferredDateFields) {
    const value = row[field];
    if (typeof value === "string" && /2026-(07|08)/.test(value)) return true;
  }

  const scanFields = [
    "source_file_name",
    "file_name",
    "narration",
    "description",
    "reference_number",
    "utr",
    "linked_invoice_number",
    "party_ledger_name",
    "bank_ledger_name",
    "cache_key",
    "command_type",
    "payload",
    "result",
    "error",
    "tally_voucher_number",
    "tally_open_reference_name",
  ];

  return scanFields.some((field) => JULY_AUG_RE.test(stringifyForScan(row[field])));
}

function rowSummary(row) {
  return {
    id: row.id,
    status: row.status ?? row.tally_status ?? null,
    type: row.command_type ?? row.direction ?? null,
    date:
      row.transaction_date ??
      row.statement_start_date ??
      row.debit_note_date ??
      row.receipt_date ??
      row.created_at ??
      null,
    party: row.party_ledger_name ?? row.counterparty_name ?? row.ledger_name ?? null,
    amount:
      row.amount ??
      row.deposit_amount ??
      row.withdrawal_amount ??
      row.recoverable_amount ??
      null,
    ref:
      row.reference_number ??
      row.utr ??
      row.linked_invoice_number ??
      row.tally_voucher_number ??
      null,
  };
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select("*").limit(5000);
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return data ?? [];
}

async function deleteIds(table, ids) {
  if (!ids.length) return { count: 0 };
  if (!apply) return { count: ids.length };
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
  return { count: ids.length };
}

const rowsByTable = {};
for (const table of TABLES) {
  const rows = await fetchAll(table);
  if (!rows) {
    rowsByTable[table] = { exists: false, rows: [] };
    continue;
  }
  rowsByTable[table] = { exists: true, rows };
}

const baseTargetBankImports = (rowsByTable.bank_statement_imports.rows ?? []).filter(rowLooksJulyAug);
const baseTargetBankImportIds = baseTargetBankImports.map((row) => row.id);

const targetBankTransactions = (rowsByTable.bank_transactions.rows ?? []).filter(
  (row) =>
    rowLooksJulyAug(row) ||
    baseTargetBankImportIds.includes(row.import_id) ||
    baseTargetBankImportIds.includes(row.statement_import_id)
);
const targetBankTransactionIds = targetBankTransactions.map((row) => row.id);
const targetBankImportIds = Array.from(
  new Set([
    ...baseTargetBankImportIds,
    ...targetBankTransactions
      .map((row) => row.import_id ?? row.statement_import_id)
      .filter((value) => typeof value === "string" && value.length > 0),
  ])
);
const targetBankImports = (rowsByTable.bank_statement_imports.rows ?? []).filter((row) =>
  targetBankImportIds.includes(row.id)
);

const targetDebitNotes = (rowsByTable.debit_note_proposals.rows ?? []).filter(rowLooksJulyAug);
const targetDebitNoteIds = targetDebitNotes.map((row) => row.id);

const targetCommands = (rowsByTable.tally_bridge_commands.rows ?? []).filter((row) => {
  const payloadText = stringifyForScan(row.payload);
  return (
    targetBankTransactionIds.some((id) => payloadText.includes(id)) ||
    targetDebitNoteIds.some((id) => payloadText.includes(id))
  );
});
const targetCommandIds = targetCommands.map((row) => row.id);

const targetPostingLogs = (rowsByTable.bank_transaction_posting_log.rows ?? []).filter(
  (row) =>
    targetBankTransactionIds.includes(row.bank_transaction_id) ||
    targetBankTransactionIds.includes(row.transaction_id) ||
    targetCommandIds.includes(row.command_id)
);
const targetPostingLogIds = targetPostingLogs.map((row) => row.id);

const targetCaches = (rowsByTable.collections_analysis_cache.rows ?? []).filter(rowLooksJulyAug);
const targetCacheIds = targetCaches.map((row) => row.id);

const report = {
  mode: apply ? "apply" : "dry-run",
  scanned: Object.fromEntries(
    Object.entries(rowsByTable).map(([table, value]) => [
      table,
      value.exists ? value.rows.length : "missing",
    ])
  ),
  targets: {
    bank_statement_imports: targetBankImports.map(rowSummary),
    bank_transactions: targetBankTransactions.map(rowSummary),
    bank_transaction_posting_log: targetPostingLogs.map(rowSummary),
    tally_bridge_commands: targetCommands.map(rowSummary),
    debit_note_proposals: targetDebitNotes.map(rowSummary),
    collections_analysis_cache: targetCaches.map(rowSummary),
  },
};

console.log(JSON.stringify(report, null, 2));

if (apply) {
  const deleted = {};
  deleted.bank_transaction_posting_log = await deleteIds(
    "bank_transaction_posting_log",
    targetPostingLogIds
  );
  deleted.tally_bridge_commands = await deleteIds("tally_bridge_commands", targetCommandIds);
  deleted.debit_note_proposals = await deleteIds("debit_note_proposals", targetDebitNoteIds);
  deleted.collections_analysis_cache = await deleteIds("collections_analysis_cache", targetCacheIds);
  deleted.bank_transactions = await deleteIds("bank_transactions", targetBankTransactionIds);
  deleted.bank_statement_imports = await deleteIds("bank_statement_imports", targetBankImportIds);
  console.log(JSON.stringify({ deleted }, null, 2));
}
