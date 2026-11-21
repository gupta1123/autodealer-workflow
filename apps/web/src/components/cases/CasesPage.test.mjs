import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./CasesPage.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("CasesPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parts = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["eligibleRows", "selectedRows"].includes(node.name.getText(page))) {
    parts.set(node.name.getText(page), node.initializer.getText(page));
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === "confirmDecision") {
    parts.set("confirmDecision", node.getText(page));
  }
  ts.forEachChild(node, visit);
}
visit(page);

const cases = ["completed", "accepted", "completed", "queued", "rejected"].map((status, id) =>
  ({ id: String(id), displayName: "Invoice " + id, status }));

test("bulk selection includes only visible analysed cases the reviewer may decide", () => {
  const expr = `const eligibleRows = ${parts.get("eligibleRows")}; ${parts.get("selectedRows")}.map(row => row.id)`;
  for (const canDecide of [false, true]) {
    const result = vm.runInNewContext(expr, { canDecide, cases, selectedIds: ["0", "1", "2", "3", "4", "another-page"] });
    assert.deepEqual(Array.from(result), canDecide ? ["0", "2"] : []);
  }
});

async function runDecision(value, rows, { fail, invalidate, canDecide = true } = {}) {
  const calls = [];
  let message;
  let epoch = 1;
  const context = {
    Error, canDecide, deciding: false, decision: { value, rows },
    accessCacheEpoch: () => epoch,
    updateCaseDecision: async (id, decision) => {
      calls.push([id, decision]);
      if (invalidate) epoch++;
      if (id === fail) throw new Error("Already decided");
    },
    setDeciding() {}, setDecision() {}, setListRevision() {}, caseListCache: new Map(),
    setDecisionMessage(value) { message = value; },
  };
  const body = ts.transpile(parts.get("confirmDecision"), { target: ts.ScriptTarget.ES2022 });
  await vm.runInNewContext(body + "\nconfirmDecision()", context);
  return { calls, message };
}

test("single acceptance and bulk rejection call each case decision once and report partial failure", async () => {
  assert.deepEqual((await runDecision("accepted", [cases[0]])).calls, [["0", "accepted"]]);
  const { calls, message } = await runDecision("rejected", [cases[0], cases[2]], { fail: "2" });
  assert.deepEqual(calls, [["0", "rejected"], ["2", "rejected"]]);
  assert.match(message, /1 of 2 cases rejected.*Invoice 2.*Already decided/);
});

test("a permission change stops subsequent batches and a read-only reviewer cannot start one", async () => {
  assert.equal((await runDecision("accepted", cases, { invalidate: true })).calls.length, 4);
  assert.equal((await runDecision("accepted", cases, { canDecide: false })).calls.length, 0);
});
