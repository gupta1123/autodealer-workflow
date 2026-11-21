import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./TallyPurchasePostingPanel.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ["tonnesPerUnit", "purchasePreviewWeight", "tallyQuantity"];
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && functions.includes(node.name.text))
  .map(node => node.getText(ast)).join("\n");
const { purchasePreviewWeight, tallyQuantity } = vm.runInNewContext(ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText + "\n({purchasePreviewWeight,tallyQuantity})");

test("Shaikh Brothers 173 shows the Tally weight and rate on the main voucher line", () => {
  const invoice = { quantity: "20450", rate: "35.50", unit: "KG" };
  const line = purchasePreviewWeight(invoice);
  assert.equal(tallyQuantity(line.quantity), "20.450");
  assert.equal(line.rate, 35500);
  assert.equal(line.unit, "MT");
  assert.equal(line.rate * line.quantity, 725975);
  const second = purchasePreviewWeight({ quantity: "1.550", rate: "35500", unit: "MTS" });
  assert.equal(tallyQuantity(line.quantity + second.quantity), "22.000");
  assert.equal(second.rate, line.rate);
  assert.equal(invoice.quantity, "20450");
});

test("fractional weight stays visible and non-weight lines keep their own unit", () => {
  assert.equal(tallyQuantity(purchasePreviewWeight({quantity: "1", rate: "1", unit: "g"}).quantity), "0.000001");
  const line = {quantity: "7", rate: "120", unit: "NOS"};
  assert.equal(purchasePreviewWeight(line), line);
});

