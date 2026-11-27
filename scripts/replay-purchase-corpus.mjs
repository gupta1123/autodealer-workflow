import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadPurchasePostingModule } from "../apps/api/src/lib/tally/load-purchase-posting-test-module.mjs";

const root = process.argv[2];
if (!root) throw Error("Supply the directory containing manifest.json.");
const { cases, failures } = JSON.parse(await fs.readFile(path.join(root, "manifest.json")));
assert.equal(failures.length, 0, "Incomplete archive");
const { preparePurchasePosting, normalizeExtractedCommercialLineItems } = await loadPurchasePostingModule();
const results = {};
for (const c of cases) {
  for (const f of c.files) {
    const bytes = await fs.readFile(path.join(root, f.localPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256, f.localPath);
  }
  const posting = c.postings.toSorted((a, b) => Number(b.revision) - Number(a.revision))[0];
  const prepared = preparePurchasePosting({
    documents: c.documents,
    masters: [],
    savedReview: posting?.review_patch,
    caseStatus: c.status,
    companyName: posting?.payload?.companyName || "",
    companyGstin: posting?.review_patch?.buyerGstin,
    connectionReady: false,
    masterDataReady: false,
  });
  const normalized = c.documents.map(d => ({
    id: d.id,
    rows: normalizeExtractedCommercialLineItems({
      docType: d.document_type,
      lineItems: d.extracted_fields?.__lineItems || [],
      documentFields: d.extracted_fields,
      visibleTextPages: (d.markdown || "").split("\f"),
    }),
  }));
  results[c.id] = {
    normalized,
    invoice: prepared.review?.invoiceNumber,
    lines: prepared.review?.lines.map(({ description, hsn, quantity, unit, rate, taxableAmount, taxRate }) =>
      ({ description, hsn, quantity, unit, rate, taxableAmount, taxRate })),
    calculation: prepared.calculation,
    blockers: prepared.blockers.map(x => x.code),
  };
}

const baselineFile = path.join(root, "baseline.json");
if (process.argv.includes("--baseline")) {
  await fs.writeFile(baselineFile, JSON.stringify(results, null, 2), { flag: "wx" });
  console.log("Baseline saved", cases.length);
  process.exit(0);
}
const before = JSON.parse(await fs.readFile(baselineFile));
assert.deepEqual(Object.keys(results).sort(), Object.keys(before).sort());
const changed = Object.keys(results).filter(id => JSON.stringify(results[id]) !== JSON.stringify(before[id]));
const issues = [];
for (const [id, result] of Object.entries(results)) {
  const problems = [];
  if (!result.calculation) problems.push("No voucher calculation");
  else {
    if (Math.abs(Number(result.calculation.totalDifference)) > 0.01) problems.push("Invoice total differs");
    if (Math.abs(Number(result.calculation.gstDifference)) > 0.01) problems.push("Invoice GST differs");
  }
  if (problems.length) issues.push({ id, invoice: result.invoice, problems });
}
await fs.writeFile(path.join(root, "replay.json"), JSON.stringify({ changed, issues, results }, null, 2));

function findInvoice(number) {
  const matches = Object.entries(results).filter(([, result]) => result.invoice === number);
  assert.equal(matches.length, 1, "Expected one archived case for " + number);
  return matches[0];
}
const [unitedId, united] = findInvoice("UT/26-27/1335");
assert.equal(before[unitedId].lines.length, 2);
assert.equal(united.lines.length, 1);
assert.equal(Number(united.lines[0].quantity), 9625);
assert.equal(Number(united.lines[0].rate), 22);
assert.equal(Number(united.calculation.basicAmount), 211750);
assert.equal(Number(united.calculation.cgstAmount), 19057.50);
assert.equal(Number(united.calculation.sgstAmount), 19057.50);
assert.equal(Number(united.calculation.calculatedInvoiceTotal), 249865);
const [, bharat] = findInvoice("BS/26-27/49");
assert.equal(Number(bharat.calculation.basicAmount), 1065780);
assert.equal(Number(bharat.calculation.totalDifference), 0);
assert.equal(Number(bharat.calculation.calculatedInvoiceTotal), 1257620);
const expectedChanges = [unitedId];
for (const [number, basic, cgst, total] of [
  ["PSP/26-27/5731", 613200, 55188, 723576],
  ["BS/26-27/44", 513922, 46253, 606428],
  ["173", 725975, 65337.75, 856651],
]) {
  const [id, result] = findInvoice(number);
  expectedChanges.push(id);
  assert.equal(result.lines.length, 1);
  assert.equal(Number(result.calculation.basicAmount), basic);
  assert.equal(Number(result.calculation.cgstAmount), cgst);
  assert.equal(Number(result.calculation.sgstAmount), cgst);
  assert.equal(Number(result.calculation.calculatedInvoiceTotal), total);
  assert.equal(Number(result.calculation.gstDifference), 0);
  assert.equal(Number(result.calculation.totalDifference), 0);
  assert.ok(!result.blockers.includes("LINE_TAXABLE_MISMATCH"));
  assert.ok(!result.blockers.includes("GST_RATE_REQUIRED"));
}
// Both suppliers printed the two 9% components independently rounded to paise.
for (const [invoice, half, total] of [["1485/2026-27", 87162.08, 1142792], ["1482/2026-27", 99002.48, 1298032]]) {
  const [id, result] = findInvoice(invoice);
  assert.deepEqual(result.lines, before[id].lines);
  assert.equal(Number(result.calculation.cgstAmount), half);
  assert.equal(Number(result.calculation.sgstAmount), half);
  assert.equal(Number(result.calculation.calculatedInvoiceTotal), total);
  assert.equal(Number(result.calculation.gstDifference), 0);
  assert.equal(Number(result.calculation.totalDifference), 0);
  expectedChanges.push(id);
}
assert.deepEqual(changed.sort(), expectedChanges.sort(), "Inspect unexpected voucher changes");
console.log({ cases: cases.length, changed: changed.length, otherChanges: 0, flaggedForInspection: issues.length });
