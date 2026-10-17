import test from "node:test";
import assert from "node:assert/strict";
import {reconcileBankTransactionsInTally,strictBankTransactionCandidates,verifyBankTransactionInTally} from "./bridge.mjs";

function bankVoucher({ reference = "", party = "Customer A" } = {}) {
  return {
    date: "20260801",
    effectiveDate: "20260801",
    reference,
    bankReferences: reference ? [reference] : [],
    partyLedgerName: party,
    ledgerNames: [party, "ICICI Current Account"],
    ledgerEntries: [
      { ledgerName: "ICICI Current Account", amount: 1250, isDebit: true },
      { ledgerName: party, amount: 1250, isDebit: false },
    ],
  };
}

test("numeric bank references verify Suspense only with exact date, bank amount and direction", () => {
  const transaction = { voucherDate: "2026-08-01", amount: 1250, expectedDirection: "incoming",
    referenceNumber: "1967486047", counterpartyLedgerName: "Suspense" };
  const voucher = bankVoucher({ reference: "1967486047", party: "Suspense" });
  const check = (vouchers, row = transaction) => strictBankTransactionCandidates(vouchers, row, "ICICI Current Account", new Set());
  assert.equal(check([voucher]).hasUsableReference, true);
  assert.equal(check([voucher]).identityInsufficient, false);
  assert.equal(check([voucher]).candidates.length, 1);
  assert.equal(check([voucher], { ...transaction, amount: 1251 }).candidates.length, 0);
  assert.equal(check([voucher], { ...transaction, expectedDirection: "outgoing" }).candidates.length, 0);
  assert.equal(check([{ ...voucher, date: "20260731", effectiveDate: "20260731" }]).candidates.length, 0);
  assert.equal(check([voucher], { ...transaction, referenceNumber: "1967486048" }).candidates.length, 0);
  assert.equal(check([bankVoucher({ reference: "00000000", party: "Suspense" })], { ...transaction, referenceNumber: "00000000" }).identityInsufficient, true);
});

test("duplicate numeric references remain ambiguous rather than confirming either voucher", async () => {
  const voucher = bankVoucher({ reference: "1967486047", party: "Suspense" });
  const result = await reconcileBankTransactionsInTally({}, { bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
    transactions: [{ transactionId: "txn", voucherDate: "2026-08-01", amount: 1250, expectedDirection: "incoming",
      referenceNumber: "1967486047", counterpartyLedgerName: "Suspense" }] },
    { voucherProvider: async () => ({ vouchers: [voucher, voucher], diagnostics: {} }) });
  assert.equal(result.result.transactions[0].verificationStatus, "ambiguous");
});

test("a repeated strong reference is ambiguous and a cross-date reference is still found", () => {
  const transaction = {
    voucherDate: "2026-08-01",
    amount: 1250,
    expectedDirection: "incoming",
    referenceNumber: "UTR-123456",
    counterpartyLedgerName: "Customer A",
  };
  const first = bankVoucher({ reference: "UTR-123456" });
  const otherDate = {
    ...bankVoucher({ reference: "UTR-123456" }),
    date: "20260731",
    effectiveDate: "20260731",
  };
  const one = strictBankTransactionCandidates(
    [otherDate], transaction, "ICICI Current Account", new Set()
  );
  assert.equal(one.candidates.length, 1);
  const repeated = strictBankTransactionCandidates(
    [first, otherDate], transaction, "ICICI Current Account", new Set()
  );
  assert.equal(repeated.candidates.length, 2);
});

const MANUAL_BANK_TRANSACTION = {
  transactionId: "manual-row", voucherDate: "2026-08-01", amount: 1250,
  expectedDirection: "incoming", counterpartyLedgerName: "Customer A",
};

async function checkManualBankVouchers(vouchers, transaction = {}) {
  const outcome = await reconcileBankTransactionsInTally({}, {
    bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
    transactions: [{ ...MANUAL_BANK_TRANSACTION, ...transaction }],
  }, { voucherProvider: async () => ({ vouchers, diagnostics: {} }) });
  return outcome.result.transactions[0];
}

test("the same known party still detects a manual duplicate among different-party coincidences", async () => {
  const result = await checkManualBankVouchers([bankVoucher({ party: "Other Customer" }), bankVoucher()]);
  assert.equal(result.verificationStatus, "found");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].partyLedgerName, "Customer A");
});

test("unavailable party evidence stays under review rather than assuming a different party", async () => {
  const voucher = { ...bankVoucher(), partyLedgerName: "", ledgerNames: ["ICICI Current Account"] };
  assert.equal((await checkManualBankVouchers([voucher])).verificationStatus, "ambiguous");
  const withoutPartyField = { ...bankVoucher({ party: "Other Customer" }), partyLedgerName: "" };
  assert.equal((await checkManualBankVouchers([withoutPartyField])).verificationStatus, "missing");
});

test("generated tracking references do not hide a unique manually entered voucher", async () => {
  const referenceNumber = "NEFT-ICICI-171A17A86A895CCDCF57";
  for (const metadata of [{}, { bankReferenceNumber: null, referenceSource: "generated" }]) {
    const row = await checkManualBankVouchers([bankVoucher()], { referenceNumber, ...metadata });
    assert.equal(row.verificationStatus, "found");
    assert.equal(row.matchBasis, "date_bank_amount_direction_party");
  }
});

test("a PDF UTR still permits a unique manual voucher without a recorded UTR", async () => {
  const row = await checkManualBankVouchers([bankVoucher()], { referenceNumber: "UTR-123456" });
  assert.equal(row.verificationStatus, "found");
});

test("a generated tracking reference still identifies an earlier app posting", async () => {
  const referenceNumber = "NEFT-ICICI-171A17A86A895CCDCF57";
  const row = await checkManualBankVouchers([bankVoucher({ reference: referenceNumber })], {
    referenceNumber, bankReferenceNumber: null, referenceSource: "generated", counterpartyLedgerName: "Suspense",
  });
  assert.equal(row.verificationStatus, "found");
  assert.equal(row.matchBasis, "reference");
});

test("uncertain manual candidates and multiple party matches are held for review", async () => {
  for (const [vouchers, counterpartyLedgerName] of [
    [[bankVoucher()], "Suspense"],
    [[bankVoucher({ party: "Suspense" })], "Customer A"],
    [[bankVoucher(), bankVoucher()], "Customer A"],
  ]) {
    const row = await checkManualBankVouchers(vouchers, { referenceNumber: "UTR-123456", counterpartyLedgerName });
    assert.equal(row.verificationStatus, "ambiguous");
    assert.equal(row.voucherId, null);
    assert.equal(row.reason, "Possible existing entry — please review.");
  }
});

test("an invoice or unfamiliar manual reference is reviewed instead of treated as a different bank UTR", async () => {
  for (const reference of ["INV-2026-1001", "CUSTOM-123456"]) {
    const row = await checkManualBankVouchers([bankVoucher({ reference })], { referenceNumber: "UTR-123456" });
    assert.equal(row.verificationStatus, "ambiguous");
    assert.equal(row.voucherId, null);
  }
});

test("reference matches in bank details and narration tolerate spacing but never substrings", async () => {
  for (const voucher of [
    { ...bankVoucher(), bankReferences: ["utr 123-456"] },
    { ...bankVoucher(), narration: "Bank receipt. UTR: utr 123-456. Thank you." },
  ]) {
    const row = await checkManualBankVouchers([voucher], { referenceNumber: "UTR123456", counterpartyLedgerName: "Suspense" });
    assert.equal(row.verificationStatus, "found");
    assert.equal(row.matchBasis, "reference");
  }
  for (const narration of ["UTR: XUTR123456", "UTR: UTR1234567"]) {
    const row = await checkManualBankVouchers([{ ...bankVoucher(), narration }], {
      referenceNumber: "UTR123456", counterpartyLedgerName: "Suspense",
    });
    assert.notEqual(row.verificationStatus, "found");
  }
});

test("manual matching requires the bank, date, amount and accounting direction", async () => {
  for (const voucher of [
    { ...bankVoucher(), date: "20260802", effectiveDate: "20260802" },
    { ...bankVoucher(), ledgerEntries: [{ ledgerName: "Other Bank", amount: 1250, isDebit: true }] },
    { ...bankVoucher(), ledgerEntries: [{ ledgerName: "ICICI Current Account", amount: 1251, isDebit: true }] },
    { ...bankVoucher(), ledgerEntries: [{ ledgerName: "ICICI Current Account", amount: 1250, isDebit: false }] },
  ]) {
    assert.equal((await checkManualBankVouchers([voucher])).verificationStatus, "missing");
  }
  assert.equal((await checkManualBankVouchers([])).verificationStatus, "missing");
});

test("a reserved manual voucher holds an indistinguishable second row for review", async () => {
  const outcome = await reconcileBankTransactionsInTally({}, {
    bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
    transactions: [MANUAL_BANK_TRANSACTION, { ...MANUAL_BANK_TRANSACTION, transactionId: "second-row" }],
  }, { voucherProvider: async () => ({ vouchers: [bankVoucher()], diagnostics: {} }) });
  assert.deepEqual(outcome.result.transactions.map((row) => row.verificationStatus), ["found", "ambiguous"]);
});

test("single-voucher checks also hold multiple reference matches instead of confirming either", async () => {
  const voucherXml = '<VOUCHER><DATE>20260801</DATE><REFERENCE>1967486047</REFERENCE><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Current Account</LEDGERNAME><AMOUNT>-1250</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER>';
  const { result } = await verifyBankTransactionInTally({}, {
    ...MANUAL_BANK_TRANSACTION, bankLedgerName: "ICICI Current Account", referenceNumber: "1967486047",
  }, { exportCollection: async () => `<ENVELOPE>${voucherXml}${voucherXml.replace('<DATE>', '<MASTERID>2</MASTERID><DATE>')}</ENVELOPE>` });
  assert.equal(result.verificationStatus, "ambiguous");
  assert.equal(result.voucherId, null);
});

test("cross-date identity reads cannot change the statement-period bank movement", async () => {
  const outcome = await reconcileBankTransactionsInTally({}, {
    bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
    transactions: [{ ...MANUAL_BANK_TRANSACTION, referenceNumber: "UTR-123456" }],
  }, { voucherProvider: async () => ({ vouchers: [bankVoucher(), {
    ...bankVoucher({ reference: "UTR-999999" }), date: "20260731", effectiveDate: "20260731",
  }], diagnostics: {} }) });
  assert.equal(outcome.result.balanceProof.tallyMovement, -1250);
});

test("the primary export finds manual vouchers even when Tally would exclude a Reference-only lookup", async () => {
  for (const referenceNumber of ["NEFT-ICICI-171A17A86A895CCDCF57", "UTR-123456"]) {
    const calls = [];
    const outcome = await reconcileBankTransactionsInTally({}, {
      bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
      transactions: [{ ...MANUAL_BANK_TRANSACTION, referenceNumber }],
    }, { exportCollection: async (_url, options) => {
      calls.push(options);
      if (options.formulae?.some(({ formula }) => formula.includes("$Reference"))) {
        return "<ENVELOPE><COLLECTION></COLLECTION></ENVELOPE>";
      }
      return '<ENVELOPE><VOUCHER><DATE>20260801</DATE><MASTERID>101</MASTERID><VOUCHERNUMBER>MANUAL-1</VOUCHERNUMBER><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Current Account</LEDGERNAME><AMOUNT>-1250</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer A</LEDGERNAME><AMOUNT>1250</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER></ENVELOPE>';
    } });
    assert.equal(outcome.result.transactions[0].verificationStatus, "found");
    assert.equal(outcome.result.transactions[0].voucherId, "101");
    assert.equal(calls[0].formulae, undefined);
    assert.equal(calls.length, referenceNumber.startsWith("NEFT-ICICI-") ? 1 : 2);
  }
});

test("an incomplete or unavailable duplicate read never becomes missing", async () => {
  for (const exportCollection of [
    async () => "<ENVELOPE><COLLECTION>",
    async () => "<ENVELOPE><LINEERROR>Read failed</LINEERROR></ENVELOPE>",
    async () => { throw new Error("Tally unavailable"); },
  ]) {
    await assert.rejects(reconcileBankTransactionsInTally({}, {
      bankLedgerName: "ICICI Current Account", includeBalanceProof: false,
      transactions: [MANUAL_BANK_TRANSACTION],
    }, { exportCollection }));
  }
});

test("statement reconciliation reads manual entries and a bounded amount-filtered financial year", async () => {
  const calls = [];
  const outcome = await reconcileBankTransactionsInTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    {
      companyName: "Solution Nyx",
      bankLedgerName: "ICICI Current Account",
      includeBalanceProof: false,
      transactions: [{
        transactionId: "txn-1",
        voucherDate: "2026-08-01",
        amount: 1250,
        debitAmount: 0,
        creditAmount: 1250,
        expectedDirection: "incoming",
        referenceNumber: "UTR-123456",
        counterpartyLedgerName: "Customer A",
      }],
    },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        return '<ENVELOPE><VOUCHER><DATE>20260801</DATE><EFFECTIVEDATE>20260801</EFFECTIVEDATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><REFERENCE>UTR-123456</REFERENCE><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><MASTERID>101</MASTERID><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Current Account</LEDGERNAME><AMOUNT>-1250</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer A</LEDGERNAME><AMOUNT>1250</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER></ENVELOPE>';
      },
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].fetchFields, /AllLedgerEntries\.BankAllocations\.\*/);
  assert.equal(calls[0].tallyType, "Vouchers : Ledger");
  assert.equal(calls[0].childOf, '"ICICI Current Account"');
  assert.equal(calls[0].dateFrom, "2026-08-01");
  assert.equal(calls[0].dateTo, "2026-08-01");
  assert.equal(calls[0].formulae, undefined);
  assert.equal(calls[1].dateFrom, "2026-04-01");
  assert.equal(calls[1].dateTo, "2027-03-31");
  assert.equal(calls[1].formulae.length, 2);
  assert.match(calls[1].formulae[0].formula, /\$Amount = 1250/);
  assert.ok(calls[1].formulae.every(({ formula }) => !formula.includes("$Reference")));
  assert.equal(outcome.result.transactions[0].verificationStatus, "found");
  assert.equal(outcome.result.queryDiagnostics.detailBatchCount, 0);
  assert.equal(outcome.result.queryDiagnostics.queryMode, "bank_ledger_plus_financial_year_amount");
});

test("statement reconciliation reads bank allocations from the primary export", async () => {
  const calls = [];
  const outcome = await reconcileBankTransactionsInTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    {
      companyName: "Solution Nyx",
      bankLedgerName: "ICICI Current Account",
      includeBalanceProof: false,
      transactions: [{
        transactionId: "txn-1",
        voucherDate: "2026-08-01",
        amount: 1250,
        debitAmount: 0,
        creditAmount: 1250,
        expectedDirection: "incoming",
        referenceNumber: "UTR-123456",
        counterpartyLedgerName: "Customer A",
      }],
    },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        return '<ENVELOPE><VOUCHER><DATE>20260801</DATE><EFFECTIVEDATE>20260801</EFFECTIVEDATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><MASTERID>101</MASTERID><ALLLEDGERENTRIES.LIST><LEDGERNAME>ICICI Current Account</LEDGERNAME><AMOUNT>-1250</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><BANKALLOCATIONS.LIST><INSTRUMENTNUMBER>UTR-123456</INSTRUMENTNUMBER></BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer A</LEDGERNAME><AMOUNT>1250</AMOUNT><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE></ALLLEDGERENTRIES.LIST></VOUCHER></ENVELOPE>';
      },
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].fetchFields, /AllLedgerEntries\.BankAllocations\.\*/);
  assert.equal(outcome.result.transactions[0].verificationStatus, "found");
  assert.equal(outcome.result.queryDiagnostics.detailedVoucherCount, 0);
  assert.equal(outcome.result.queryDiagnostics.primaryIncludesBankReferences, true);
});
