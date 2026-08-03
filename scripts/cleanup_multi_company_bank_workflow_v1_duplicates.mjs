import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridgePath = path.join(repoRoot, "apps", "tally-bridge", "src", "bridge.mjs");
const tallyUrl = process.env.TALLY_URL || "http://localhost:9000";
const companyName = process.argv.includes("--company")
  ? process.argv[process.argv.indexOf("--company") + 1]
  : "Solution Nyx";
const tag = "MCB-260712-V1";
const refsByCompany = {
  "Nyx": ["VMW-901", "RFP-902", "TCP-903", "NIS-904", "HDFC-PAY-904", "HDFC-CHG-905"],
  "Solution Nyx": ["CCL-101", "BPF-102", "STC-103", "NAT-104", "MOM-201"],
};
const expectedRefs = (refsByCompany[companyName] ?? []).map((suffix) => `${tag}-${suffix}`);
const apply = process.argv.includes("--apply");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function listVouchers() {
  const output = execFileSync(
    process.execPath,
    [bridgePath, "list-vouchers", "--company-name", companyName, "--all", "true", "--tally-url", tallyUrl],
    { encoding: "utf8", timeout: 20000 }
  );
  return JSON.parse(output).vouchers ?? [];
}

function xmlAttribute(xml, attributeName) {
  return String(xml ?? "").match(new RegExp(`${attributeName}="([^"]+)"`, "i"))?.[1] ?? "";
}

function deletionXml(vouchers) {
  const messages = vouchers.map((voucher) => [
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `<VOUCHER DATE="10-Jul-2026" TAGNAME="Voucher Number" TAGVALUE="${escapeXml(voucher.voucherNumber)}" VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Delete">`,
    "</VOUCHER></TALLYMESSAGE>",
  ].join(""));
  return [
    "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>",
    `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    "</STATICVARIABLES></REQUESTDESC><REQUESTDATA>",
    ...messages,
    "</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>",
  ].join("");
}

async function main() {
  const groups = new Map();
  for (const voucher of listVouchers()) {
    if (!expectedRefs.includes(voucher.reference)) continue;
    const list = groups.get(voucher.reference) ?? [];
    list.push(voucher);
    groups.set(voucher.reference, list);
  }

  const duplicates = [...groups.entries()].flatMap(([reference, vouchers]) =>
    vouchers
      .sort((left, right) => Number(left.masterId) - Number(right.masterId))
      .slice(1)
      .map((voucher) => ({
        reference,
        voucherType: voucher.voucherType,
        masterId: voucher.masterId,
        alterId: voucher.alterId,
        voucherNumber: voucher.voucherNumber,
        remoteId: xmlAttribute(voucher.rawPreview, "REMOTEID"),
        voucherKey: xmlAttribute(voucher.rawPreview, "VCHKEY"),
      }))
  );

  if (!apply) {
    console.log(JSON.stringify({ companyName, apply: false, duplicates }, null, 2));
    return;
  }
  if (duplicates.length === 0) {
    console.log(JSON.stringify({ companyName, deleted: [] }, null, 2));
    return;
  }

  const response = await fetch(tallyUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: deletionXml(duplicates),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  const lineError = text.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1]?.trim();
  const errors = Number(text.match(/<ERRORS[^>]*>([^<]+)<\/ERRORS>/i)?.[1] ?? 0);
  if (!response.ok || lineError || errors > 0) {
    throw new Error(lineError || `Tally duplicate cleanup failed (HTTP ${response.status}, errors ${errors}).`);
  }
  console.log(JSON.stringify({ companyName, deleted: duplicates }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
