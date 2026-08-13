import assert from "node:assert/strict";
import test from "node:test";

import {
  addBankStatementPageProvenance,
  classifyBankStatementBatchOutcome,
  shouldAttemptBankStatementSingleShot,
  sortBankStatementTransactionsByProvenance,
  unresolvedBankStatementRecoveryPages,
} from "./bank-statement-resilience.mjs";

test("dense short statements skip single-shot extraction", () => {
  const densePage = Array.from({ length: 40 }, (_, index) =>
    `01/08/2026 NEFT PARTY ${index} 1,000.00 50,000.00`
  ).join("\n");
  assert.equal(shouldAttemptBankStatementSingleShot({
    isPdf: true,
    pageCount: 5,
    pages: [{ text: densePage }, { text: densePage }],
    maxPages: 8,
  }), false);
});

test("empty summary batches do not trigger recovery", () => {
  assert.deepEqual(classifyBankStatementBatchOutcome({ rowCount: 0, likelyHasRows: false }), {
    status: "empty_non_transaction",
    requiresRecovery: false,
  });
  assert.equal(classifyBankStatementBatchOutcome({ rowCount: 0, likelyHasRows: true }).requiresRecovery, true);
});

test("recovered rows return to page order before balance validation", () => {
  const pageFour = addBankStatementPageProvenance([{ description: "later" }], {
    startPage: 4,
    endPage: 4,
    method: "text_batch",
  });
  const recoveredPageTwo = addBankStatementPageProvenance([{ description: "earlier" }], {
    startPage: 2,
    endPage: 2,
    method: "rendered_image_recovery",
  });
  assert.deepEqual(
    sortBankStatementTransactionsByProvenance([...pageFour, ...recoveredPageTwo]).map((row) => row.description),
    ["earlier", "later"]
  );
});

test("failed and empty recovery pages remain unresolved", () => {
  assert.deepEqual(unresolvedBankStatementRecoveryPages([
    { page: 1, status: "succeeded" },
    { page: 2, status: "empty" },
    { page: 3, status: "failed" },
    { page: 4, status: "confirmed_non_transaction" },
  ], [1, 2, 3, 4, 5]), [2, 3, 5]);
});
