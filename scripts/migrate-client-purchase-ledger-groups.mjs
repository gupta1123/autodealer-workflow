import fs from "node:fs/promises";
import path from "node:path";

const tallyUrl = process.env.TALLY_URL || "http://localhost:9000";
const finoraUrl = process.env.FINORA_URL || "http://localhost:3003";
const apply = process.argv.includes("--apply");
const rollbackFile = process.argv.find((value) => value.startsWith("--rollback="))?.slice("--rollback=".length);

const migrations = [
  { ledger: "Input ITC CGST 9%", from: "Duties & Taxes", to: "Input GST", groupParent: "Duties & Taxes" },
  { ledger: "Input ITC SGST 9%", from: "Duties & Taxes", to: "Input GST", groupParent: "Duties & Taxes" },
  { ledger: "Input ITC IGST 18%", from: "Duties & Taxes", to: "Input GST", groupParent: "Duties & Taxes" },
  { ledger: "CGST TDS PAYABLE 1%", from: "Duties & Taxes", to: "GST TDS Payable", groupParent: "Duties & Taxes" },
  { ledger: "SGST TDS PAYABLE 1%", from: "Duties & Taxes", to: "GST TDS Payable", groupParent: "Duties & Taxes" },
  { ledger: "IGST TDS PAYABLE 2%", from: "Duties & Taxes", to: "GST TDS Payable", groupParent: "Duties & Taxes" },
  { ledger: "TDS Payable @ 0.10% (194Q)", from: "Duties & Taxes", to: "TDS / TCS Payable", groupParent: "Duties & Taxes" },
  { ledger: "TCS Receivable", from: "Duties & Taxes", to: "Balance with Government Authorities", groupParent: "Current Assets" },
  { ledger: "Transportation Inward @ 18.00%", from: "Direct Expenses", to: "Freight A/c", groupParent: "Direct Expenses" },
  { ledger: "M.S. Scrap Purchase", from: "Purchase Accounts", to: "Indigenous Scrap & Sponge Purchase", groupParent: "Purchase Accounts" },
  { ledger: "O.M.S. Scrap Purchase", from: "Purchase Accounts", to: "Indigenous Scrap & Sponge Purchase", groupParent: "Purchase Accounts" },
  { ledger: "Round Off", from: "Indirect Expenses", to: "Other Income", groupParent: "Indirect Incomes" },
];

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function tallyImport(messages, company) {
  const payload = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>
  <BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${xml(company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC>
  <DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${messages}</TALLYMESSAGE></DATA></BODY>
</ENVELOPE>`.trim();
  const response = await fetch(tallyUrl, { method: "POST", headers: { "Content-Type": "text/xml" }, body: payload });
  const text = await response.text();
  if (!response.ok) throw new Error(`Tally returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  const errors = Number(text.match(/<ERRORS>(\d+)<\/ERRORS>/i)?.[1] ?? 0);
  if (errors > 0 || /LINEERROR|IMPORTERROR/i.test(text)) throw new Error(`Tally import error: ${text.slice(0, 1000)}`);
  return text;
}

async function main() {
  const live = await json(`${finoraUrl}/api/tally/ledgers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tallyUrl }),
  });
  if (!live.success) throw new Error(`Live Tally read failed: ${live.error}`);

  const ledgerMap = new Map((live.ledgers ?? []).map((ledger) => [ledger.name, ledger]));
  const groups = new Set();
  function collect(nodes) {
    for (const node of nodes ?? []) {
      if (node.children) groups.add(node.name);
      collect(node.children);
    }
  }
  collect(live.tree);

  if (rollbackFile) {
    const rollback = JSON.parse(await fs.readFile(rollbackFile, "utf8"));
    const messages = rollback.ledgers.map((entry) =>
      `<LEDGER NAME="${xml(entry.ledger)}" ACTION="Alter"><PARENT>${xml(entry.parent)}</PARENT></LEDGER>`
    ).join("");
    await tallyImport(messages, rollback.company);
    console.log(`Rolled back ${rollback.ledgers.length} ledgers from ${rollbackFile}.`);
    return;
  }

  const missing = migrations.filter((entry) => !ledgerMap.has(entry.ledger));
  const wrongParent = migrations.filter((entry) => ledgerMap.get(entry.ledger)?.parent !== entry.from);
  const existingTargetGroups = [...new Set(migrations.map((entry) => entry.to))].filter((group) => groups.has(group));
  if (missing.length || wrongParent.length) {
    throw new Error(JSON.stringify({ missing, wrongParent }, null, 2));
  }
  if (existingTargetGroups.length) {
    throw new Error(`Target groups already exist; refusing to guess their parents: ${existingTargetGroups.join(", ")}`);
  }

  const backupDir = path.resolve("output", "tally-group-migration-backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `solution-nyx-${new Date().toISOString().replaceAll(":", "-")}.json`);
  const backup = {
    company: live.companyName === "0" ? "Solution Nyx" : live.companyName,
    tallyUrl,
    createdAt: new Date().toISOString(),
    ledgers: migrations.map((entry) => ({ ledger: entry.ledger, parent: ledgerMap.get(entry.ledger).parent })),
    plannedGroups: migrations.map(({ to, groupParent }) => ({ name: to, parent: groupParent })),
  };
  await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    company: backup.company,
    backupFile,
    liveCounts: { ledgers: live.ledgerCount, groups: live.groupCount },
    migrations: migrations.map(({ ledger, from, to, groupParent }) => ({ ledger, from, to, groupParent })),
  }, null, 2));

  if (!apply) return;

  const groupsToCreate = [...new Map(migrations.map(({ to, groupParent }) => [to, groupParent])).entries()]
    .map(([name, parent]) => `<GROUP NAME="${xml(name)}" ACTION="Create"><NAME>${xml(name)}</NAME><PARENT>${xml(parent)}</PARENT></GROUP>`)
    .join("");
  await tallyImport(groupsToCreate, backup.company);

  const ledgersToMove = migrations
    .map(({ ledger, to }) => `<LEDGER NAME="${xml(ledger)}" ACTION="Alter"><PARENT>${xml(to)}</PARENT></LEDGER>`)
    .join("");
  await tallyImport(ledgersToMove, backup.company);
  console.log(`Applied ${migrations.length} ledger moves. Rollback with --rollback=${backupFile}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
