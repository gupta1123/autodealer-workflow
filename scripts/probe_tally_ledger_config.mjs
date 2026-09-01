const request = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Ledger Config Probe</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>Solution Nyx</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="Ledger Config Probe"><TYPE>Ledger</TYPE><FETCH>Name,Parent,IsInventoryValuesAffected,AffectsStock,IsBillWiseOn,TaxType,GSTDutyHead</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
const response = await fetch("http://127.0.0.1:9000", { method: "POST", headers: { "Content-Type": "text/xml" }, body: request });
const text = await response.text();
const ledgers = [...text.matchAll(/<LEDGER\b[\s\S]*?<\/LEDGER>/gi)].map((match) => match[0]);
for (const name of process.argv.slice(2)) {
  const ledger = ledgers.find((block) => block.includes(`NAME="${name}"`));
  console.log(name, ledger?.slice(0, 2500) ?? "NOT FOUND");
}
