import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { isTdsBill } from "../../lib/bank-statement-bill-allocation.ts";

const source = readFileSync(new URL("./BankStatementsPage.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) &&
  ["CloseMatchPanel", "sortOpenBills"].includes(n.name.text)).map(n => n.getText(ast)).join("\n");
const code = ts.transpileModule(functions, {compilerOptions: {
  jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022
}}).outputText;

test("browsing uses a single batch, preserves selection until confirmed, and retries missing data", async () => {
  const hooks = [], effects = [];
  let cursor = 0, calls = 0, chosen = null;
  function useState(initial) {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = initial;
    return [hooks[i], value => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }];
  }
  function useRef(initial) {
    const i = cursor++;
    return hooks[i] ??= {current: initial};
  }
  function useEffect(fn, deps) {
    const i = cursor++, key = JSON.stringify(deps);
    if (hooks[i] !== key) { hooks[i] = key; effects.push(fn); }
  }
  const panel = vm.runInNewContext(code + "\nCloseMatchPanel", { React, useRef, useState, useEffect,
    window: {setTimeout, clearTimeout}, Button: "button", parseNumber: Number, formatCurrencyAmount: String,
    formatShortDate: String, isTdsBill });
  const names = ["A", "B", "C"];
  const rows = [{referenceName:"first",pendingAmount:7},{referenceName:"INV-TDS-184",pendingAmount:100},
    {referenceName:"tds",pendingAmount:100}];
  const props = {names, transaction:{creditAmount:100,description:"receipt",transactionDate:"2026-11-16"},
    load: async () => {
      calls++;
      return new Map([["A",{openBills:rows,existingAdvances:[]}],["B",{openBills:[],existingAdvances:[]}],
        ...(calls > 1 ? [["C",{openBills:[],existingAdvances:[]}]] : [])]);
    }, choose: (name,data) => {chosen = [name,data];} };
  let nodes;
  function render() {
    cursor = 0; nodes = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (React.isValidElement(node)) { nodes.push(node); visit(node.props.children); }
      else if (typeof node === "string") nodes.push(node);
    }
    visit(panel(props)); effects.splice(0).forEach(fn => fn());
  }
  function click(label) {
    const button = nodes.find(n => n?.type === "button" && n.props.children === label);
    assert.ok(button && !button.props.disabled, label);
    button.props.onClick(); render();
  }
  render(); await new Promise(r => setTimeout(r,10)); render();
  assert.ok(nodes.indexOf("INV-TDS-184") < nodes.indexOf("first"));
  assert.ok(!nodes.includes("tds"));
  click("Next"); assert.ok(nodes.includes("No eligible open bills."));
  click("Next"); assert.ok(nodes.some(n => typeof n === "string" && n.includes("Could not load")));
  assert.equal(calls,1); assert.equal(chosen,null);
  click("Retry"); await new Promise(r => setTimeout(r,10)); render();
  assert.equal(calls,2); click("Previous"); click("Previous"); click("Use this ledger");
  assert.equal(chosen[0],"A"); assert.deepEqual(chosen[1].openBills,rows);
});
