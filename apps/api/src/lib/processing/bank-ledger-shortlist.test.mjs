import assert from "node:assert/strict";
import { test } from "node:test";
import { createLedgerShortlister, shortlistLedgerNames } from "./bank-ledger-shortlist.mjs";

const filler = Array.from({ length: 1000 }, (_, i) => `Customer Account ${i}`);
const ledgers = [...filler, "Kalika Steel Alloys Pvt Ltd", "Rajesh Traders", "Bank Charges", "Interest Received", "Suspense A/c", "Surya Steel Trading Co"];

test("finds the party ledger from a bank narration", () => {
  const shortlister = createLedgerShortlister(ledgers);
  assert.ok(shortlister.candidatesFor("| 05/09/2026 | NEFT/SBIN0001234/RAJESH TRADERS/INV 45 | 12,000.00 |").includes("Rajesh Traders"));
  assert.ok(shortlister.candidatesFor("RTGS-UTIB000-SURYA STEEL TRADING").includes("Surya Steel Trading Co"));
});

test("matches truncated narration words", () => {
  const shortlister = createLedgerShortlister(ledgers);
  assert.ok(shortlister.candidatesFor("IMPS/KALIKA STE/9988").includes("Kalika Steel Alloys Pvt Ltd"));
});

test("always offers generic ledgers and returns only real names", () => {
  const names = shortlistLedgerNames(createLedgerShortlister(ledgers), ["UPI/unknown person/123"]);
  for (const generic of ["Bank Charges", "Interest Received", "Suspense A/c"]) assert.ok(names.includes(generic));
  assert.ok(names.every((name) => ledgers.includes(name)));
  assert.ok(names.length < 100);
});

test("small catalogues are sent unchanged", () => {
  assert.equal(shortlistLedgerNames(createLedgerShortlister(["A Ltd", "B Ltd"]), ["A"]), null);
});
