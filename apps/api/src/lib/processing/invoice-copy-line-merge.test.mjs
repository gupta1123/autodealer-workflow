import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// pipeline.ts pulls in the whole extraction stack, so lift just the line-merge functions
// (the real source, not a copy) and run them with the two helpers they depend on stubbed.
const source = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `could not find ${start}`);
  return source.slice(from, to);
}

const lineItemsSource = readFileSync(new URL("../line-items.ts", import.meta.url), "utf8");
const code = [
  lineItemsSource.slice(lineItemsSource.indexOf("export function mergeRowsAcrossCopies("), lineItemsSource.indexOf("function mergeInvoicePageCopies(")),
  between("function parseLooseNumber(", "function normalizeWeightForDisplay("),
  between("function formatNumberForField(", "function isClearMagnitudeError("),
  between("function normalizeInvoiceLineText(", "function compareInvoiceLineItems("),
  between("function mergeInvoiceLineItem(", "function getInvoiceDocCompletenessScore("),
].join("\n");

const js = ts.transpileModule(
  `const INVOICE_LINE_ITEM_KEYS = ["itemCode","description","hsnSac","quantity","unit","rate","taxableAmount","lineTotal"];
   const sanitizeLineItems = (items) => items.filter(Boolean);
   ${code}
   export { mergeInvoiceCopyLineItems };`,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;

const { mergeInvoiceCopyLineItems } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

test("copies that word the same item differently merge into one line", () => {
  const original = [{ description: "M S Scrap & Sponge Iron", hsnSac: "7204", quantity: "25.32", unit: "MTS", rate: "37000", taxableAmount: "936840" }];
  const duplicate = [{ description: "MS SCRAP", quantity: "25.320", unit: "MT", rate: "37,000.00", taxableAmount: "936,840.00" }];
  const merged = mergeInvoiceCopyLineItems(original, duplicate);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hsnSac, "7204");
});

test("a missing field on the primary copy is filled from the other copy", () => {
  const merged = mergeInvoiceCopyLineItems(
    [{ description: "Sponge Iron", quantity: "10", rate: "500", taxableAmount: "5000" }],
    [{ description: "Sponge iron lumps", hsnSac: "7203", quantity: "10", rate: "500", taxableAmount: "5000" }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hsnSac, "7203");
});

test("different quantities or amounts stay separate lines", () => {
  const merged = mergeInvoiceCopyLineItems(
    [{ description: "Item A", quantity: "10", rate: "500", taxableAmount: "5000" }],
    [{ description: "Item B", quantity: "12", rate: "500", taxableAmount: "6000" }]
  );
  assert.equal(merged.length, 2);
});

test("two real lines with identical numbers are not collapsed together, each copy line pairs once", () => {
  const first = [
    { description: "Bundle 1", quantity: "5", rate: "100", taxableAmount: "500" },
    { description: "Bundle 2", quantity: "5", rate: "100", taxableAmount: "500" },
  ];
  const second = [
    { description: "Item one", quantity: "5", rate: "100", taxableAmount: "500" },
    { description: "Item two", quantity: "5", rate: "100", taxableAmount: "500" },
  ];
  assert.equal(mergeInvoiceCopyLineItems(first, second).length, 2);
});

test("a line without a quantity or amount is never matched by numbers", () => {
  const merged = mergeInvoiceCopyLineItems(
    [{ description: "Freight", taxableAmount: "500" }],
    [{ description: "Loading", taxableAmount: "500" }]
  );
  assert.equal(merged.length, 2);
});

test("identical wording still merges as before", () => {
  const line = { description: "Item A", hsnSac: "7204", quantity: "10", unit: "MTS", rate: "500", taxableAmount: "5000" };
  assert.equal(mergeInvoiceCopyLineItems([line], [{ ...line }]).length, 1);
});

test("each copy contributes any occurrences the other missed", () => {
  const row = { description: "Scrap", quantity: "5", rate: "100", taxableAmount: "500" };
  for (const [a, b] of [[2, 2], [1, 2], [2, 1], [0, 2], [2, 0]]) {
    assert.equal(mergeInvoiceCopyLineItems(Array(a).fill(row), Array(b).fill(row)).length, 2);
  }
});
