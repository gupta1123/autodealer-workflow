const execute = process.argv.includes("--execute");
if (!execute) throw new Error("Refusing to alter accounting masters without --execute.");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const messages = [
  ["Solution Sales Account", "<AFFECTSSTOCK>Yes</AFFECTSSTOCK>"],
  ["Solution Purchase Account", "<AFFECTSSTOCK>Yes</AFFECTSSTOCK>"],
  ["Output CGST 9%", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>CGST</GSTDUTYHEAD><RATEOFTAXCALCULATION>9</RATEOFTAXCALCULATION>"],
  ["Output SGST 9%", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>SGST</GSTDUTYHEAD><RATEOFTAXCALCULATION>9</RATEOFTAXCALCULATION>"],
  ["Output IGST 18%", "<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>IGST</GSTDUTYHEAD><RATEOFTAXCALCULATION>18</RATEOFTAXCALCULATION>"],
].map(([name, fields]) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${escapeXml(name)}" ACTION="Alter">${fields}</LEDGER></TALLYMESSAGE>`);
const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
const response = await fetch("http://127.0.0.1:9000", { method: "POST", headers: { "Content-Type": "text/xml" }, body: xml, signal: AbortSignal.timeout(60_000) });
const body = await response.text();
const counter = (name) => Number(body.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`, "i"))?.[1] ?? 0);
const result = { altered: counter("ALTERED"), errors: counter("ERRORS"), exceptions: counter("EXCEPTIONS"), lineError: body.match(/<LINEERROR[^>]*>([\s\S]*?)<\/LINEERROR>/i)?.[1] ?? null };
if (result.altered !== messages.length || result.errors || result.exceptions || result.lineError) throw new Error(`Accounting-master repair mismatch: ${JSON.stringify(result)}`);
console.log(JSON.stringify({ status: "complete", ...result }, null, 2));
