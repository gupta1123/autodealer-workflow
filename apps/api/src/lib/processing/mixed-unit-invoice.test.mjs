import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("pipeline.ts", source, ts.ScriptTarget.Latest, true);
const functions = ["parseLooseNumber", "numbersClose", "formatNumberForField", "isClearMagnitudeError", "correctLineItemAmounts"];
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && functions.includes(node.name.text))
  .map(node => node.getText(ast)).join("\n");
const correct = vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText + "\ncorrectLineItemAmounts");
const line = { quantity: "27900", unit: "KG", rate: "38200", taxableAmount: "1065780", lineTotal: "1065780" };
const fields = { subtotal: "1065780", taxAmount: "191840", totalAmount: "1257620" };

test("mixed-unit handwritten rate is normalized once and the printed taxable amount survives", () => {
  const text = "M.S. Scrap | 27900 Kg | 38/200 P/T | 1065780/-";
  const [fixed] = correct([line], fields, text);
  assert.equal(fixed.rate, "38.2");
  assert.equal(fixed.taxableAmount, "1065780");
  assert.equal(fixed.lineTotal, "1065780");
  assert.equal(correct([fixed], fields, text)[0].rate, "38.2");
});

test("corroborated totals survive ambiguous units without inventing a converted rate", () => {
  const [fixed] = correct([line], fields, "");
  assert.deepEqual(fixed, line);
  assert.equal(correct([{...line, taxableAmount: "10", lineTotal: "10", quantity: "10", rate: "10"}], {}, "")[0].taxableAmount, "100");
});
