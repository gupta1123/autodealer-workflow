import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./line-items.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeExtractedCommercialLineItems } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

const invoicePage = (copy) => [
  "Tax Invoice",
  `(${copy})`,
  "e-Invoice IRN : 6da250212c0bc397d14fc84aa4ccc5fa9abef0de036b Ack No. : 122635057817023",
  "M/s. SEEMA TRADERS 1478, BEHIND ADSURE COMPLEX, MUKINDPUR TAL NEWASA DIST-AHMEDNAGAR",
  "GSTIN/UIN: 27AMRPC2505P1ZQ Invoice No. 2026-27/422 e-Way Bill No. 272304782375 Dated 8-Oct-26",
  "Buyer (Bill to) M/s. Kalika Steel Alloys Pvt Ltd Plot No C-7&8 ADDL MIDC AREA, JALANA-431203",
  "GSTIN/UIN : 27AACCK1502A1ZD Motor Vehicle No. MH12KP0403 Dispatched through JAY MALHAR ROADLINES",
  "MS SCRAP 11,160.00 KGS 38.00 KGS 4,24,080.00 CGST 9% 38,167.20 SGST 9% 38,167.20",
  "Total 11,160.00 KGS 5,00,414.00 Amount Chargeable INR Five Lakh Four Hundred Fourteen Only",
  "HSN/SAC 72044900 Taxable Value 4,24,080.00 Company's Bank Details HDFC BANK A/c No. 50200031893771",
].join("\n");

const line = (sourcePage, hsnSac = "72044900") => ({
  description: "MS SCRAP",
  hsnSac,
  quantity: "11160",
  unit: "KGS",
  rate: "38",
  taxableAmount: "424080",
  sourcePage,
});

test("the original and transporter copy of one invoice give one line, not two", () => {
  const lines = normalizeExtractedCommercialLineItems({
    docType: "Tax Invoice",
    lineItems: [line(1), line(2)],
    visibleTextPages: [invoicePage("ORIGINAL FOR RECIPIENT"), invoicePage("DUPLICATE FOR TRANSPORTER")],
  });
  assert.equal(lines.length, 1);
});

test("a copy whose HSN was missed still merges, keeping the HSN from the other copy", () => {
  const lines = normalizeExtractedCommercialLineItems({
    docType: "Tax Invoice",
    lineItems: [line(1, ""), line(2)],
    visibleTextPages: [invoicePage("ORIGINAL FOR RECIPIENT"), invoicePage("DUPLICATE FOR TRANSPORTER")],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].hsnSac, "72044900");
});

test("two different rows on one page are both kept", () => {
  const lines = normalizeExtractedCommercialLineItems({
    docType: "Tax Invoice",
    lineItems: [line(1, ""), { ...line(1), description: "HMS SCRAP", rate: "40", taxableAmount: "446400" }],
    visibleTextPages: [invoicePage("ORIGINAL FOR RECIPIENT")],
  });
  assert.equal(lines.length, 2);
});
