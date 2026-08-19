import assert from "node:assert/strict";
import test from "node:test";

import { correctRowsFromRunningBalance } from "./bank-statement-running-balance.mjs";

test("uses the opening balance to correct the first transaction direction", () => {
  const [row] = correctRowsFromRunningBalance(
    [
      {
        description: "FIRST PAYMENT",
        debit_amount: null,
        credit_amount: 10000,
        balance_amount: 90000,
        category: "receipt",
        confidence: 0.7,
      },
    ],
    { openingBalance: 100000 }
  );

  assert.equal(row.debit_amount, 10000);
  assert.equal(row.credit_amount, null);
  assert.equal(row.category, "payment");
  assert.equal(row.raw_payload.balanceCorrection.previousBalance, 100000);
});

test("does not guess the first-row direction when no opening balance was extracted", () => {
  const original = {
    description: "FIRST ROW",
    debit_amount: null,
    credit_amount: 10000,
    balance_amount: 90000,
    category: "receipt",
  };

  const [row] = correctRowsFromRunningBalance([original]);
  assert.equal(row, original);
});

test("continues validating later rows from the preceding running balance", () => {
  const rows = correctRowsFromRunningBalance([
    { description: "FIRST", debit_amount: 10000, credit_amount: null, balance_amount: 90000 },
    { description: "SECOND", debit_amount: 5000, credit_amount: null, balance_amount: 95000 },
  ]);

  assert.equal(rows[1].debit_amount, null);
  assert.equal(rows[1].credit_amount, 5000);
});

test("can correct direction after a newest-first statement is reversed", () => {
  const newestFirst = [
    { description: "LATEST RECEIPT", debit_amount: null, credit_amount: 10000, balance_amount: 140000 },
    { description: "EARLIER PAYMENT", debit_amount: 20000, credit_amount: null, balance_amount: 130000 },
    { description: "EARLIEST RECEIPT", debit_amount: 50000, credit_amount: null, balance_amount: 150000 },
  ];
  const chronological = correctRowsFromRunningBalance([...newestFirst].reverse(), { openingBalance: 100000 });
  const restoredPdfOrder = chronological.reverse();

  assert.equal(restoredPdfOrder[0].credit_amount, 10000);
  assert.equal(restoredPdfOrder[1].debit_amount, 20000);
  assert.equal(restoredPdfOrder[2].debit_amount, null);
  assert.equal(restoredPdfOrder[2].credit_amount, 50000);
});
