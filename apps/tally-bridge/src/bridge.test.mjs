import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionExportXml,
  buildBankVoucherXml,
  buildPurchaseVoucherXml,
  buildRequestedLedgerFormula,
  cashDiscountFinancialYearRange,
  cashDiscountVoucherDateChunks,
  classifyOpenBillReferenceKind,
  classifyTaxLedgers,
  decodeRealtimeFrame,
  findBankLedgersFromMasters,
  findPartyLedgersFromMasters,
  selectCashDiscountLedgers,
  fetchCustomerOpenBillsFromTally,
  exportTargetedBillEvidenceXml,
  openBillPendingFormula,
  parseTallyImportResult,
  openBillBlockRequiresVoucherFallback,
  parseLedgerClosingBalance,
  purchasePayloadMasterNames,
  purchaseVoucherFinancialYearRange,
  purchaseVoucherReadbackComparison,
  strictBankTransactionCandidates,
} from "./bridge.mjs";

test("Supabase binary broadcast wake frames decode without financial payloads", () => {
  const topic = "realtime:tally-command:522c18c7-95fa-41ff-a6fe-ed27d8675ed7";
  const event = "command_queued";
  const payload = Buffer.from(JSON.stringify({ wake: true }), "utf8");
  const topicBytes = Buffer.from(topic, "utf8");
  const eventBytes = Buffer.from(event, "utf8");
  const frame = Buffer.concat([
    Buffer.from([4, topicBytes.length, eventBytes.length, 0, 1]),
    topicBytes,
    eventBytes,
    payload,
  ]);

  assert.deepEqual(decodeRealtimeFrame(frame), [
    null,
    null,
    topic,
    "broadcast",
    { event, payload: { wake: true } },
  ]);
});

test("purchase master preflight covers every selected ledger and stock item once", () => {
  assert.deepEqual(purchasePayloadMasterNames({
    supplierLedgerName: "Supplier A",
    items: [
      { stockItemName: "Item One", purchaseLedgerName: "Purchase Local" },
      { stockItemName: "Item One", purchaseLedgerName: "Purchase Local" },
      { stockItemName: "Item Two", purchaseLedgerName: "Purchase Interstate" },
    ],
    charges: [{ name: "Freight Inward" }],
    withholdings: [{ name: "TDS 194Q" }],
    ledgers: {
      cgst: { name: "Input CGST" },
      sgst: { name: "Input SGST" },
      repeated: { name: "Supplier A" },
    },
  }), {
    ledgerNames: [
      "Supplier A",
      "Purchase Local",
      "Purchase Interstate",
      "Freight Inward",
      "TDS 194Q",
      "Input CGST",
      "Input SGST",
    ],
    stockItemNames: ["Item One", "Item Two"],
  });
});

test("ledger closing balances preserve Tally Dr and Cr meaning", () => {
  assert.deepEqual(parseLedgerClosingBalance("1,24,500.00 Dr"), {
    amount: 124500,
    type: "Dr",
    raw: "1,24,500.00 Dr",
  });
  assert.deepEqual(parseLedgerClosingBalance("842300 Cr"), {
    amount: 842300,
    type: "Cr",
    raw: "842300 Cr",
  });
  assert.deepEqual(parseLedgerClosingBalance("-950"), {
    amount: 950,
    type: "Dr",
    raw: "-950",
  });
  assert.deepEqual(parseLedgerClosingBalance(""), {
    amount: null,
    type: null,
    raw: null,
  });
});

test("outgoing supplier payments create Payment vouchers with bill allocations", () => {
  const xml = buildBankVoucherXml({
    companyName: "Solution Nyx",
    voucherType: "Payment",
    voucherDate: "2026-08-17",
    bankLedgerName: "State Bank of India",
    counterpartyLedgerName: "Mahavir Steel Corporation",
    counterpartyIsPartyLedger: true,
    bankLedgerEntryIsDebit: false,
    amount: 94000,
    referenceNumber: "SB61708260002",
    billAllocations: [
      { referenceType: "Agst Ref", referenceName: "MSC/26-27/403", amount: 75000 },
      { referenceType: "Agst Ref", referenceName: "MSC/26-27/404", amount: 19000 },
    ],
  });

  assert.match(xml, /<VOUCHERTYPENAME>Payment<\/VOUCHERTYPENAME>/);
  assert.match(xml, /<LEDGERNAME>Mahavir Steel Corporation<\/LEDGERNAME>/);
  assert.match(xml, /<NAME>MSC\/26-27\/403<\/NAME>/);
  assert.match(xml, /<NAME>MSC\/26-27\/404<\/NAME>/);
  assert.match(xml, /<LEDGERNAME>State Bank of India<\/LEDGERNAME>/);
});

test("direct party posting creates an Advance without settling an existing bill", () => {
  const xml = buildBankVoucherXml({
    companyName: "Solution Nyx",
    voucherType: "Receipt",
    voucherDate: "2026-08-17",
    bankLedgerName: "State Bank of India",
    counterpartyLedgerName: "Aarohi Steel Distributors",
    counterpartyIsPartyLedger: true,
    bankLedgerEntryIsDebit: true,
    amount: 5977,
    referenceNumber: "SBS01010900001",
    billAllocations: [
      { referenceType: "Advance", referenceName: "ADV-20260817-0900001", amount: 5977 },
    ],
  });

  assert.match(xml, /<VOUCHERTYPENAME>Receipt<\/VOUCHERTYPENAME>/);
  assert.match(xml, /<NAME>ADV-20260817-0900001<\/NAME>/);
  assert.match(xml, /<BILLTYPE>Advance<\/BILLTYPE>/);
  assert.doesNotMatch(xml, /<BILLTYPE>Agst Ref<\/BILLTYPE>/);
});

test("outgoing Contra vouchers debit the destination and credit the statement bank", () => {
  const xml = buildBankVoucherXml({
    companyName: "Solution Nyx",
    voucherType: "Contra",
    voucherDate: "2026-08-17",
    bankLedgerName: "State Bank of India",
    counterpartyLedgerName: "HDFC Bank",
    bankLedgerEntryIsDebit: false,
    amount: 50000,
    referenceNumber: "TRANSFER-1",
  });

  assert.match(xml, /<VOUCHERTYPENAME>Contra<\/VOUCHERTYPENAME>/);
  assert.match(xml, /<LEDGERNAME>HDFC Bank<\/LEDGERNAME>[\s\S]*?<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>/);
  assert.match(xml, /<LEDGERNAME>State Bank of India<\/LEDGERNAME>[\s\S]*?<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>/);
  assert.ok(xml.indexOf("<LEDGERNAME>HDFC Bank</LEDGERNAME>") < xml.indexOf("<LEDGERNAME>State Bank of India</LEDGERNAME>"));
});

test("collection exports apply Tally-side formula filters", () => {
  const xml = buildCollectionExportXml({
    collectionName: "Filtered Bills",
    tallyType: "Bill",
    fetchFields: "Name,LedgerName,ClosingBalance",
    companyName: "Solution Nyx",
    dateTo: "2026-08-17",
    formulae: [{ name: "RequestedLedger", formula: '$$IsEqual:$LedgerName:"Customer A"' }],
    filterNames: ["RequestedLedger"],
  });

  assert.match(xml, /<FILTER>RequestedLedger<\/FILTER>/);
  assert.match(xml, /<SYSTEM TYPE="Formulae" NAME="RequestedLedger"/);
  assert.match(xml, /\$\$IsEqual:\$LedgerName:&quot;Customer A&quot;/);
  assert.match(xml, /<SVTODATE TYPE="Date">20260817<\/SVTODATE>/);
});

test("ledger filters remain targeted and deduplicated", () => {
  const ledgerFormula = buildRequestedLedgerFormula(["Customer A", "Customer A", "Customer B"], ["$LedgerName"]);
  assert.equal((ledgerFormula.match(/Customer A/g) || []).length, 1);
  assert.equal((ledgerFormula.match(/Customer B/g) || []).length, 1);
});

test("cash discount keeps short voucher periods in one Tally request", () => {
  assert.deepEqual(cashDiscountVoucherDateChunks("2026-08-01", "2026-08-31"), [
    { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
  ]);
});

test("cash discount splits long voucher periods into bounded sequential requests", () => {
  const chunks = cashDiscountVoucherDateChunks("2026-01-01", "2026-12-31");
  assert.equal(chunks.length, 12);
  assert.equal(chunks[0].dateFrom, "2026-01-01");
  assert.equal(chunks.at(-1).dateTo, "2026-12-31");
  for (const [index, chunk] of chunks.entries()) {
    const days = ((Date.parse(`${chunk.dateTo}T00:00:00.000Z`) - Date.parse(`${chunk.dateFrom}T00:00:00.000Z`)) / 86_400_000) + 1;
    assert.ok(days <= 31);
    if (index > 0) assert.equal(chunk.dateFrom, new Date(Date.parse(`${chunks[index - 1].dateTo}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10));
  }
});

test("cash discount bounds scans to the selected Indian financial year", () => {
  assert.deepEqual(cashDiscountFinancialYearRange("2026-27", "2026-08-16"), {
    financialYear: "2026-27",
    dateFrom: "2026-04-01",
    dateTo: "2026-08-16",
  });
});

test("open Bill exports filter empty and zero pending balances in Tally", () => {
  const formula = openBillPendingFormula();
  assert.match(formula, /\$ClosingBalance/);
  assert.match(formula, /\$PendingAmount/);
  assert.match(formula, /\$Balance/);
  assert.match(formula, /NOT \$\$IsEqual/);
});

test("timed-out voucher periods split into smaller date slices", async () => {
  const calls = [];
  const result = await exportTargetedBillEvidenceXml(
    "http://127.0.0.1:9000",
    { companyName: "Solution Nyx", ledgerNames: ["Customer A"], dateFrom: "2026-08-01", dateTo: "2026-08-08" },
    async (_url, options) => {
      calls.push(options);
      if (options.dateFrom === "2026-08-01" && options.dateTo === "2026-08-08") {
        throw new Error("Tally export timed out after 60 seconds.");
      }
      return "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
    }
  );
  assert.equal(calls.length, 3);
  assert.equal(result.batchCount, 2);
  assert.equal(result.retrySplitCount, 1);
  assert.equal(result.dateChunkCount, 2);
});

test("one-day timed-out voucher evidence splits the ledger batch", async () => {
  const calls = [];
  const result = await exportTargetedBillEvidenceXml(
    "http://127.0.0.1:9000",
    { companyName: "Solution Nyx", ledgerNames: ["Customer A", "Customer B"], dateFrom: "2026-08-01", dateTo: "2026-08-01" },
    async (_url, options) => {
      calls.push(options);
      if (options.formulae[0].formula.includes("Customer A") && options.formulae[0].formula.includes("Customer B")) {
        throw new Error("Tally export timed out after 60 seconds.");
      }
      return "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
    }
  );
  assert.equal(calls.length, 3);
  assert.equal(result.batchCount, 2);
  assert.equal(result.retrySplitCount, 1);
});

test("voucher fallback is required only for incomplete Bill exports", () => {
  const complete = '<BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><BILLTYPE>New Ref</BILLTYPE><CLOSINGBALANCE>500</CLOSINGBALANCE></BILL>';
  const missingType = '<BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><CLOSINGBALANCE>500</CLOSINGBALANCE></BILL>';
  const missingPending = '<BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><BILLTYPE>New Ref</BILLTYPE><OPENINGBALANCE>500</OPENINGBALANCE></BILL>';
  assert.equal(openBillBlockRequiresVoucherFallback(complete), false);
  assert.equal(openBillBlockRequiresVoucherFallback(missingType), true);
  assert.equal(openBillBlockRequiresVoucherFallback(missingPending), true);
});

test("zero targeted bills returns an authoritative empty result without fetching vouchers", async () => {
  const calls = [];
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    { companyName: "Solution Nyx", ledgerNames: ["Customer A"], asOfDate: "2026-08-17" },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        return "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tallyType, "Bill");
  assert.deepEqual(result.result.openBills, []);
  assert.equal(result.result.queryDiagnostics.voucherFallbackUsed, false);
});

test("complete targeted Bill data avoids the voucher fallback", async () => {
  const calls = [];
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    { ledgerNames: ["Customer A"] },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        return '<ENVELOPE><STATUS>1</STATUS><BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><BILLTYPE>New Ref</BILLTYPE><DATE>20260801</DATE><OPENINGBALANCE>500</OPENINGBALANCE><CLOSINGBALANCE>500</CLOSINGBALANCE></BILL></ENVELOPE>';
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(result.result.openBills.length, 1);
  assert.equal(result.result.openBills[0].pendingAmount, 500);
  assert.equal(result.result.queryDiagnostics.voucherFallbackUsed, false);
});

test("cash discount reuses its open-bills-first export and reads one compact voucher collection", async () => {
  const calls = [];
  const billXml = '<ENVELOPE><STATUS>1</STATUS><BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><BILLTYPE>New Ref</BILLTYPE><DATE>20260801</DATE><OPENINGBALANCE>500</OPENINGBALANCE><CLOSINGBALANCE>500</CLOSINGBALANCE></BILL></ENVELOPE>';
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    { companyName: "Solution Nyx", ledgerNames: ["Customer A"], asOfDate: "2026-08-17" },
    {
      billExport: { xml: billXml, batchCount: 1, queryMode: "open_bills_first" },
      forceVoucherEvidence: true,
      exportCollection: async (_url, options) => {
        calls.push(options);
        return '<ENVELOPE><STATUS>1</STATUS><VOUCHER><DATE>20260801</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>INV-1</VOUCHERNUMBER><NARRATION>1% cash discount within 15 days</NARRATION><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer A</LEDGERNAME><AMOUNT>-500</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><BILLALLOCATIONS.LIST><NAME>INV-1</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-500</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER></ENVELOPE>';
      },
    }
  );

  assert.deepEqual(calls.map((call) => call.tallyType), ["Voucher"]);
  assert.equal(calls[0].collectionName, "Kalika Cash Discount Voucher Evidence");
  assert.equal(calls[0].timeoutMs, 20_000);
  assert.deepEqual(calls[0].filterNames, undefined);
  assert.equal(result.result.queryDiagnostics.billQueryMode, "open_bills_first");
  assert.equal(result.result.queryDiagnostics.voucherEvidenceMode, "required");
  assert.equal(result.result.queryDiagnostics.voucherQueryMode, "compact_full_period");
  assert.equal(result.result.queryDiagnostics.voucherBatchCount, 1);
  assert.equal(result.result.openBills[0].narration, "1% cash discount within 15 days");
});

test("cash discount scans a full financial year and many customers in one voucher request", async () => {
  const calls = [];
  const ledgerNames = Array.from({ length: 45 }, (_, index) => `Customer ${index + 1}`);
  const billXml = ledgerNames.map((ledgerName, index) =>
    `<BILL NAME="INV-${index + 1}"><LEDGERNAME>${ledgerName}</LEDGERNAME><BILLTYPE>New Ref</BILLTYPE><DATE>20260401</DATE><OPENINGBALANCE>500</OPENINGBALANCE><CLOSINGBALANCE>500</CLOSINGBALANCE></BILL>`
  ).join("");
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    {
      companyName: "Solution Nyx",
      ledgerNames,
      dateFrom: "2026-04-01",
      asOfDate: "2027-03-31",
    },
    {
      billExport: {
        xml: `<ENVELOPE><STATUS>1</STATUS>${billXml}</ENVELOPE>`,
        batchCount: 1,
        queryMode: "open_bills_first",
      },
      forceVoucherEvidence: true,
      exportCollection: async (_url, options) => {
        calls.push(options);
        return "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].dateFrom, "2026-04-01");
  assert.equal(calls[0].dateTo, "2027-03-31");
  assert.equal(result.result.queryDiagnostics.requestedLedgerCount, 45);
  assert.equal(result.result.queryDiagnostics.voucherBatchCount, 1);
  assert.equal(result.result.queryDiagnostics.voucherDateChunkCount, 1);
});

test("incomplete Bill data performs one targeted sequential voucher fallback", async () => {
  const calls = [];
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    { ledgerNames: ["Customer A"], asOfDate: "2026-08-17" },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        if (options.tallyType === "Bill") {
          return '<ENVELOPE><STATUS>1</STATUS><BILL NAME="INV-1"><LEDGERNAME>Customer A</LEDGERNAME><DATE>20260801</DATE><OPENINGBALANCE>500</OPENINGBALANCE></BILL></ENVELOPE>';
        }
        return '<ENVELOPE><STATUS>1</STATUS><VOUCHER><DATE>20260801</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>INV-1</VOUCHERNUMBER><PARTYLEDGERNAME>Customer A</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer A</LEDGERNAME><AMOUNT>-500</AMOUNT><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><BILLALLOCATIONS.LIST><NAME>INV-1</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-500</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER></ENVELOPE>';
      },
    }
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.tallyType), ["Bill", "Voucher"]);
  assert.equal(result.result.queryDiagnostics.voucherFallbackUsed, true);
  assert.equal(result.result.queryDiagnostics.voucherFallbackLedgerCount, 1);
});

test("large ledger sets use one full Bill collection instead of repeatedly rescanning Tally", async () => {
  const calls = [];
  const ledgerNames = Array.from({ length: 51 }, (_, index) => `Customer ${index + 1}`);
  const result = await fetchCustomerOpenBillsFromTally(
    { tallyUrl: "http://127.0.0.1:9000" },
    { ledgerNames, queryPurpose: "bank_statement_match" },
    {
      exportCollection: async (_url, options) => {
        calls.push(options);
        return "<ENVELOPE><STATUS>1</STATUS></ENVELOPE>";
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filterNames, ["AutodealerPendingBill"]);
  assert.equal(result.result.queryDiagnostics.billQueryMode, "full");
});

test("a failed Bill query is not misreported as an empty successful result", async () => {
  await assert.rejects(
    () => fetchCustomerOpenBillsFromTally(
      { tallyUrl: "http://127.0.0.1:9000" },
      { ledgerNames: ["Customer A"], queryPurpose: "bank_statement_match" },
      { exportCollection: async () => { throw new Error("Tally timed out"); } }
    ),
    /Tally timed out/
  );
});

test("cash discount includes ledgers nested under Sundry Debtors subgroups", () => {
  const ledgers = [
    { name: "Direct Customer", parent: "Sundry Debtors" },
    { name: "Dealer Customer", parent: "North Dealers" },
    { name: "Supplier", parent: "Sundry Creditors" },
  ];
  const groups = [
    { name: "North Dealers", parent: "Dealers" },
    { name: "Dealers", parent: "Sundry Debtors" },
  ];
  assert.deepEqual(
    findPartyLedgersFromMasters(ledgers, groups, "Sundry Debtors").map((ledger) => ledger.name),
    ["Direct Customer", "Dealer Customer"]
  );
});

test("cash discount customer scope supports custom roots, nesting, and strict mode", () => {
  const groups = [
    { name: "Trade Receivables", parent: "Current Assets" },
    { name: "Export Customers", parent: "Trade Receivables" },
    { name: "Suppliers", parent: "Current Liabilities" },
  ];
  const ledgers = [
    { name: "Domestic Buyer", parent: "Trade Receivables" },
    { name: "Overseas Buyer", parent: "Export Customers" },
    { name: "Vendor", parent: "Suppliers" },
  ];

  const selected = selectCashDiscountLedgers(ledgers, groups, {
    mode: "strict",
    selectedGroupNames: ["Trade Receivables"],
    includeNestedGroups: true,
  });
  assert.deepEqual(selected.map((ledger) => ledger.name), ["Domestic Buyer", "Overseas Buyer"]);
  assert.ok(selected.every((ledger) => ledger.cashDiscountCustomerScope.source === "selected_group"));
});

test("cash discount automatic scope marks outside ledgers for Sales-evidence verification", () => {
  const groups = [
    { name: "Sundry Debtors", parent: "Current Assets" },
    { name: "Other Parties", parent: "Current Assets" },
  ];
  const ledgers = [
    { name: "Standard Customer", parent: "Sundry Debtors" },
    { name: "Unusual Customer", parent: "Other Parties" },
    { name: "Excluded Customer", parent: "Other Parties" },
  ];

  const selected = selectCashDiscountLedgers(ledgers, groups, {
    mode: "automatic",
    selectedGroupNames: ["Sundry Debtors"],
    detectSalesLinkedExceptions: true,
    excludedLedgerNames: ["Excluded Customer"],
  });
  assert.deepEqual(selected.map((ledger) => [ledger.name, ledger.cashDiscountCustomerScope.source]), [
    ["Standard Customer", "selected_group"],
    ["Unusual Customer", "sales_linked_exception"],
  ]);
});

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

test("strict bank presence uses exact reference independently of a wrong selected party", () => {
  const result = strictBankTransactionCandidates(
    [bankVoucher({ reference: "UTR-123456", party: "Actual Customer" })],
    {
      voucherDate: "2026-08-01",
      amount: 1250,
      expectedDirection: "incoming",
      referenceNumber: "UTR-123456",
      counterpartyLedgerName: "Wrong Customer",
    },
    "ICICI Current Account",
    new Set()
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.hasUsableReference, true);
});

test("strict bank presence requires the exact party when no usable reference exists", () => {
  const result = strictBankTransactionCandidates(
    [bankVoucher({ party: "Actual Customer" })],
    {
      voucherDate: "2026-08-01",
      amount: 1250,
      expectedDirection: "incoming",
      counterpartyLedgerName: "Wrong Customer",
    },
    "ICICI Current Account",
    new Set()
  );
  assert.equal(result.baseCandidateCount, 1);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.hasUsableCounterparty, true);
});

test("strict bank presence marks same-date amount evidence insufficient for Suspense", () => {
  const result = strictBankTransactionCandidates(
    [bankVoucher({ party: "Actual Customer" })],
    {
      voucherDate: "2026-08-01",
      amount: 1250,
      expectedDirection: "incoming",
      counterpartyLedgerName: "Suspense",
    },
    "ICICI Current Account",
    new Set()
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.identityInsufficient, true);
});

test("open-bill classification preserves invoices and recovers exported advances", () => {
  assert.equal(
    classifyOpenBillReferenceKind({ billType: "Advance", referenceName: "RCPT-1" }),
    "advance"
  );
  assert.equal(
    classifyOpenBillReferenceKind({ referenceName: "ADV-0007", sourceVoucherType: "Receipt" }),
    "advance"
  );
  assert.equal(
    classifyOpenBillReferenceKind({ referenceName: "ADV-0007", knownInvoice: true }),
    "bill"
  );
  assert.equal(
    classifyOpenBillReferenceKind({ referenceName: "INV-0007", sourceVoucherType: "Sales" }),
    "bill"
  );
});

test("bank discovery returns ledgers nested below Bank Accounts, never groups", () => {
  const groups = [
    { name: "Current Assets", parent: "Primary" },
    { name: "Bank Accounts", parent: "Current Assets" },
    { name: "QA Current Accounts", parent: "Bank Accounts" },
    { name: "Deeply Nested Banks", parent: "QA Current Accounts" },
    { name: "Sundry Debtors", parent: "Current Assets" },
  ];
  const ledgers = [
    { name: "Direct Bank", parent: "Bank Accounts" },
    { name: "Nested HDFC Bank", parent: "QA Current Accounts" },
    { name: "Deep Bank", parent: "Deeply Nested Banks" },
    { name: "Ordinary Customer", parent: "Sundry Debtors" },
    { name: "Metadata Bank", parent: "Current Assets", bankAccountNumber: "50123456789" },
  ];

  assert.deepEqual(
    findBankLedgersFromMasters(ledgers, groups).map((item) => item.name),
    ["Direct Bank", "Nested HDFC Bank", "Deep Bank", "Metadata Bank"]
  );
});

test("bank discovery terminates safely when custom group ancestry contains a cycle", () => {
  const groups = [
    { name: "Cycle A", parent: "Cycle B" },
    { name: "Cycle B", parent: "Cycle A" },
  ];
  const ledgers = [{ name: "Not A Bank", parent: "Cycle A" }];

  assert.deepEqual(findBankLedgersFromMasters(ledgers, groups), []);
});

function ledger(name, { dutyHead = "", taxType = "", parent = "Duties & Taxes" } = {}) {
  return {
    name,
    guid: `guid:${name}`,
    parent,
    raw: { dutyHead, taxType },
  };
}

test("GST and withholding ledgers are classified independently", () => {
  const inputCgst = ledger("Input CGST 9%", { dutyHead: "CGST", taxType: "GST" });
  const inputSgst = ledger("Input SGST 9%", { dutyHead: "SGST/UTGST", taxType: "GST" });
  const tdsPayable = ledger("TDS Payable - Scrap", { taxType: "TDS" });
  const tcsReceivable = ledger("TCS Receivable", { taxType: "TCS" });
  const roundOff = ledger("Round Off");

  const result = classifyTaxLedgers([
    inputCgst,
    inputSgst,
    tdsPayable,
    tcsReceivable,
    roundOff,
  ]);

  assert.deepEqual(result.gstLedgers.map((item) => item.name), [
    "Input CGST 9%",
    "Input SGST 9%",
  ]);
  assert.deepEqual(result.taxLedgers.map((item) => item.name), [
    "TDS Payable - Scrap",
    "TCS Receivable",
  ]);
});

test("Purchase vouchers use Tally's item-invoice envelope and allocation tags", () => {
  const xml = buildPurchaseVoucherXml({
    companyName: "Solution Nyx",
    voucherDate: "2026-07-29",
    supplierInvoiceDate: "2026-07-28",
    supplierInvoiceNumber: "VIS/26-27/0142",
    supplierLedgerName: "Vertex Industrial Supplies",
    sourceDocumentPath: "C:\\Kalika Documents\\VIS-0142.pdf",
    sourceDocumentName: "VIS-0142.pdf",
    sourceDocumentSha256: "ABC123",
    sourceDocumentId: "file-1",
    vehicleNumber: "MH11AL4972",
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
    postingId: "internal-posting-id",
    finalPayableAmount: 292500,
    items: [{
      stockItemName: "M S Scrap & Sponge Iron",
      purchaseLedgerName: "M.S. Scrap Purchase",
      description: "Mild Steel Scrap - HMS",
      hsn: "72044900",
      quantity: 10,
      unit: "MTS",
      rate: 25000,
      taxableAmount: 250000,
    }],
    charges: [
      { kind: "freight", name: "Transportation Inward @ 18.00%", amount: 1000 },
      { kind: "cgst", name: "Input ITC CGST 9%", amount: 22590 },
      { kind: "sgst", name: "Input ITC SGST 9%", amount: 22590 },
    ],
    withholdings: [
      { kind: "tds_194q", name: "TDS Payable @ 0.10% (194Q)", amount: 250 },
      { kind: "transport_tds", name: "Tds on Goods Transport", amount: 10 },
      { kind: "cgst_tds", name: "CGST TDS PAYABLE 1%", amount: 2500 },
      { kind: "sgst_tds", name: "SGST TDS PAYABLE 1%", amount: 2500 },
    ],
  });

  assert.match(xml, /<TALLYREQUEST>Import<\/TALLYREQUEST><TYPE>Data<\/TYPE><ID>Vouchers<\/ID>/);
  assert.match(xml, /<DATA><TALLYMESSAGE/);
  assert.match(xml, /<LEDGERENTRIES\.LIST>/);
  assert.doesNotMatch(xml, /<ALLLEDGERENTRIES\.LIST>/);
  assert.doesNotMatch(xml, /Main Location|Primary Batch|BATCHALLOCATIONS\.LIST|GODOWNNAME/);
  assert.match(xml, /<GSTHSNINFERAPPLICABILITY>Specify Details Here<\/GSTHSNINFERAPPLICABILITY>/);
  assert.match(xml, /<GSTHSNNAME>72044900<\/GSTHSNNAME>/);
  assert.match(xml, /<DATE>20260729<\/DATE>/);
  assert.match(xml, /<REFERENCEDATE>20260728<\/REFERENCEDATE>/);
  assert.match(
    xml,
    /<BILLALLOCATIONS\.LIST><NAME>VIS\/26-27\/0142<\/NAME><BILLTYPE>New Ref<\/BILLTYPE><BILLDATE>20260729<\/BILLDATE><AMOUNT>292500\.00<\/AMOUNT><\/BILLALLOCATIONS\.LIST>/
  );
  assert.match(xml, /<LEDGERNAME>Transportation Inward @ 18\.00%<\/LEDGERNAME>/);
  assert.match(xml, /<LEDGERNAME>TDS Payable @ 0\.10% \(194Q\)<\/LEDGERNAME>/);
  assert.match(xml, /<LEDGERNAME>CGST TDS PAYABLE 1%<\/LEDGERNAME>/);
  assert.match(xml, /<UDF:KALIKASOURCEDOCUMENTPATH\.LIST[^>]*INDEX="30001">/);
  assert.match(xml, /C:\\Kalika Documents\\VIS-0142\.pdf/);
  assert.match(xml, /<UDF:KALIKASOURCEDOCUMENTSHA256[^>]*>ABC123<\/UDF:KALIKASOURCEDOCUMENTSHA256>/);
  assert.match(xml, /<UDF:KALIKASOURCEDOCUMENTID[^>]*>file-1<\/UDF:KALIKASOURCEDOCUMENTID>/);
  assert.match(xml, /<UDF:KALIKAVEHICLENUMBER[^>]*>MH11AL4972<\/UDF:KALIKAVEHICLENUMBER>/);
  assert.doesNotMatch(xml, /Source: https:\/\/app\.example/);
  assert.doesNotMatch(xml, /Posting: internal-posting-id/);
});

test("Purchase vouchers only include an explicitly selected Tally godown", () => {
  const xml = buildPurchaseVoucherXml({
    companyName: "Solution Nyx",
    voucherDate: "2026-08-21",
    supplierInvoiceDate: "2026-08-20",
    supplierInvoiceNumber: "TEST/1",
    supplierLedgerName: "Supplier",
    finalPayableAmount: 100,
    items: [{
      stockItemName: "MS Scrap",
      purchaseLedgerName: "Scrap Purchase",
      hsn: "72044900",
      quantity: 1,
      unit: "MTS",
      rate: 100,
      taxableAmount: 100,
      godownName: "Warehouse A",
      batchName: "Lot 1",
    }],
  });

  assert.match(
    xml,
    /<BATCHALLOCATIONS\.LIST><GODOWNNAME>Warehouse A<\/GODOWNNAME><BATCHNAME>Lot 1<\/BATCHNAME><DESTINATIONGODOWNNAME>Warehouse A<\/DESTINATIONGODOWNNAME>/
  );
});

test("Purchase duplicate checks cover the complete Indian financial year", () => {
  assert.deepEqual(purchaseVoucherFinancialYearRange("2026-08-21"), {
    dateFrom: "2026-04-01",
    dateTo: "2027-03-31",
  });
  assert.deepEqual(purchaseVoucherFinancialYearRange("2027-02-15"), {
    dateFrom: "2026-04-01",
    dateTo: "2027-03-31",
  });
});

test("Purchase narration does not append a vehicle already present in the review narration", () => {
  const xml = buildPurchaseVoucherXml({
    companyName: "Solution Nyx",
    voucherDate: "2026-08-21",
    supplierInvoiceDate: "2026-07-20",
    supplierInvoiceNumber: "DSM/26-27/087",
    supplierLedgerName: "Deccan Sponge and Minerals",
    vehicleNumber: "KA34AB2094",
    narration: "KA34AB2094 HSN: 72031000",
    finalPayableAmount: 327096,
    items: [{
      stockItemName: "M S Scrap & Sponge Iron",
      purchaseLedgerName: "O.M.S. Scrap Purchase",
      description: "Sponge Iron Lumps",
      hsn: "72031000",
      quantity: 12,
      unit: "MTS",
      rate: 23100,
      taxableAmount: 277200,
    }],
    charges: [{ kind: "igst", name: "Input ITC IGST 18%", amount: 49896 }],
    withholdings: [],
  });
  assert.match(xml, /<NARRATION>KA34AB2094 HSN: 72031000<\/NARRATION>/);
  assert.doesNotMatch(xml, /Vehicle: KA34AB2094/);
});

test("Tally import exceptions are reported as failures", () => {
  const outcome = parseTallyImportResult(
    "<RESPONSE><CREATED>0</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS><EXCEPTIONS>1</EXCEPTIONS></RESPONSE>",
    200
  );

  assert.equal(outcome.success, false);
  assert.equal(outcome.result.exceptions, 1);
  assert.match(outcome.error, /1 import exception/);
});

test("Purchase voucher verification includes the attached source PDF identity", () => {
  const payload = {
    voucherDate: "2026-07-29",
    supplierInvoiceDate: "2026-07-28",
    supplierInvoiceNumber: "VIS/26-27/0142",
    supplierLedgerName: "Vertex Industrial Supplies",
    finalPayableAmount: 292500,
    items: [],
    charges: [],
    withholdings: [],
    sourceDocumentPath: "C:\\Kalika Documents\\VIS-0142.pdf",
    sourceDocumentName: "VIS-0142.pdf",
    sourceDocumentSha256: "ABC123",
    sourceDocumentId: "file-1",
    vehicleNumber: "MH11AL4972",
  };
  const voucher = {
    date: "20260729",
    referenceDate: "20260728",
    inventoryEntries: [],
    ledgerEntries: [{
      ledgerName: "Vertex Industrial Supplies",
      amount: 292500,
    }],
    billAllocations: [{
      referenceName: "VIS/26-27/0142",
      billType: "New Ref",
      billDate: "20260729",
      amount: 292500,
    }],
    sourceDocumentPath: payload.sourceDocumentPath,
    sourceDocumentName: payload.sourceDocumentName,
    sourceDocumentSha256: payload.sourceDocumentSha256,
    sourceDocumentId: payload.sourceDocumentId,
    vehicleNumber: payload.vehicleNumber,
  };

  assert.deepEqual(purchaseVoucherReadbackComparison(voucher, payload), []);
  assert.ok(
    purchaseVoucherReadbackComparison(
      { ...voucher, sourceDocumentSha256: null },
      payload
    ).some((difference) => /checksum/i.test(difference))
  );
  assert.ok(
    purchaseVoucherReadbackComparison(
      {
        ...voucher,
        billAllocations: [{ ...voucher.billAllocations[0], billDate: "20260728" }],
      },
      payload
    ).some((difference) => /outstanding bill date/i.test(difference))
  );
  assert.ok(
    purchaseVoucherReadbackComparison(
      { ...voucher, vehicleNumber: "MH12WRONG" },
      payload
    ).some((difference) => /vehicle number/i.test(difference))
  );
  assert.deepEqual(
    purchaseVoucherReadbackComparison(
      {
        ...voucher,
        date: "20260821",
        billAllocations: [{ ...voucher.billAllocations[0], billDate: "20260821" }],
        sourceDocumentPath: null,
        sourceDocumentName: null,
        sourceDocumentSha256: null,
        sourceDocumentId: null,
        vehicleNumber: null,
        narration: "Vehicle MH11AL4972",
      },
      payload,
      {
        ignoreVoucherDate: true,
        ignoreBillDate: true,
        ignoreSourceDocumentIdentity: true,
      }
    ),
    []
  );
});
