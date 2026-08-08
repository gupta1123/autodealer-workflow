import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadPurchasePostingModule() {
  const lineItemsSource = readFileSync(new URL("../line-items.ts", import.meta.url), "utf8");
  const lineItemsUrl = dataUrl(transpile(lineItemsSource));
  const commercialFieldsSource = readFileSync(
    new URL("../invoice-commercial-fields.ts", import.meta.url),
    "utf8"
  );
  const commercialFieldsUrl = dataUrl(transpile(commercialFieldsSource));
  const postingSource = readFileSync(new URL("./purchase-posting.ts", import.meta.url), "utf8")
    .replace('from "@/lib/line-items"', `from "${lineItemsUrl}"`)
    .replace(
      'from "@/lib/invoice-commercial-fields"',
      `from "${commercialFieldsUrl}"`
    );
  return import(dataUrl(transpile(postingSource)));
}

const {
  compactPurchasePostingReview,
  preparePurchasePosting,
  getCanonicalInvoiceDocuments,
} = await loadPurchasePostingModule();

const supplierGstin = "27AAAAA0000A1Z5";
const maharashtraBuyerGstin = "27BBBBB0000B1Z5";
const gujaratBuyerGstin = "24BBBBB0000B1Z5";

function master(master_type, tally_name, extra = {}) {
  return {
    id: `${master_type}:${tally_name}`,
    master_type,
    master_key: tally_name.toLowerCase(),
    tally_name,
    parent_name: null,
    gstin: null,
    hsn_code: null,
    unit_name: null,
    tax_rate: null,
    is_active: true,
    ...extra,
  };
}

const completeMasters = [
  master("ledger", "Scrap Supplier", { gstin: supplierGstin }),
  master("ledger", "M.S. Scrap Purchase"),
  master("ledger", "O.M.S. Scrap Purchase"),
  master("stock_item", "M S Scrap & Sponge Iron", { unit_name: "MTS" }),
  master("gst_ledger", "Input ITC CGST 9%"),
  master("gst_ledger", "Input ITC SGST 9%"),
  master("gst_ledger", "Input ITC IGST 18%"),
  master("ledger", "Transportation Inward @ 18.00%"),
  master("tax_ledger", "TDS Payable @ 0.10% (194Q)"),
  master("tax_ledger", "Tds on Goods Transport"),
  master("tax_ledger", "CGST TDS PAYABLE 1%"),
  master("tax_ledger", "SGST TDS PAYABLE 1%"),
  master("tax_ledger", "IGST TDS PAYABLE 2%"),
  master("tax_ledger", "TCS Receivable"),
  master("ledger", "Round Off"),
];

function invoiceDocument({
  id = "invoice-1",
  hsn = "72044900",
  buyerGstin = maharashtraBuyerGstin,
  totalAmount = "1159.00",
  taxAmount = "180.00",
  tdsAmount = "1.00",
  lines,
} = {}) {
  const invoiceLines = lines ?? [{
    description: hsn === "72031000" ? "Sponge Iron" : "MS Scrap",
    hsnSac: hsn,
    quantity: "1",
    unit: "MT",
    rate: "1000.00",
    taxableAmount: "1000.00",
    taxAmount,
  }];
  return {
    id,
    document_type: "Tax Invoice",
    source_file_name: "invoice.pdf",
    source_hint: "invoice.pdf",
    title: "Purchase invoice",
    extracted_fields: {
      invoiceNumber: "INV-100",
      documentDate: "27/07/2026",
      vendorName: "Scrap Supplier",
      supplierGstin,
      buyerName: "Configured Buyer",
      buyerGstin,
      taxRate: "18",
      vehicleNumber: "MH12AB1234",
      totalTaxableAmount: "1000.00",
      taxAmount,
      totalAmount,
      tdsAmount,
      tds194qAmount: tdsAmount,
      tds194qRate: "0.1",
      cgstTdsAmount: hsn.startsWith("7204") && buyerGstin.slice(0, 2) === supplierGstin.slice(0, 2) ? "10.00" : "",
      sgstTdsAmount: hsn.startsWith("7204") && buyerGstin.slice(0, 2) === supplierGstin.slice(0, 2) ? "10.00" : "",
      __lineItems: invoiceLines,
    },
  };
}

function prepare(document, options = {}) {
  const base = preparePurchasePosting({
    documents: [document],
    masters: options.masters ?? completeMasters,
    mappings: [],
    savedReview: options.savedReview ?? { sourceReferenceApproved: true },
    caseStatus: "accepted",
    connectionReady: true,
    companyName: "Test Company",
    companyGstin: options.companyGstin ?? document.extracted_fields.buyerGstin,
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
    duplicateExists: options.duplicateExists ?? false,
    accountingSettings: options.accountingSettings ?? {
      purchaseGoodsTdsEnabled: true,
      transporterTdsEnabled: true,
      gstTdsEnabled: true,
    },
  });
  return base;
}

test("72044900 maps to the combined client stock and Maharashtra purchase rules", () => {
  const document = invoiceDocument();
  // Some invoices/OCR return the combined GST-TDS rate as 2%. Tally's
  // intrastate ledgers must still receive 1% CGST and 1% SGST individually.
  document.extracted_fields.gstTdsRate = "2";
  const result = prepare(document);
  assert.equal(result.review.lines[0].stockItemName, "M S Scrap & Sponge Iron");
  assert.equal(result.review.lines[0].unit, "MT");
  assert.equal(result.tallyPayload.items[0].unit, "MTS");
  assert.equal(result.review.lines[0].purchaseLedgerName, "M.S. Scrap Purchase");
  assert.equal(result.review.lines[0].hsn, "72044900");
  assert.equal(result.calculation.taxMode, "cgst_sgst");
  assert.equal(result.calculation.cgstAmount, "90.00");
  assert.equal(result.calculation.sgstAmount, "90.00");
  assert.equal(result.calculation.tds194qAmount, "1.00");
  assert.equal(result.calculation.cgstTdsAmount, "10.00");
  assert.equal(result.calculation.sgstTdsAmount, "10.00");
  assert.equal(result.calculation.gstTdsRate, "1");
  assert.ok(result.tallyPayload.withholdings
    .filter((entry) => entry.kind === "cgst_tds" || entry.kind === "sgst_tds")
    .every((entry) => entry.rate === "1"));
  assert.equal(result.blockers.length, 0);
});

test("qualifying Maharashtra MS Scrap automatically deducts 1% CGST and 1% SGST without invoice-printed TDS", () => {
  const document = invoiceDocument({
    totalAmount: "354000.00",
    taxAmount: "54000.00",
    tdsAmount: "",
    lines: [{
      description: "MS Scrap",
      hsnSac: "72044900",
      quantity: "10",
      unit: "MT",
      rate: "30000.00",
      taxableAmount: "300000.00",
      taxAmount: "54000.00",
    }],
  });
  delete document.extracted_fields.cgstTdsAmount;
  delete document.extracted_fields.sgstTdsAmount;

  const result = prepare(document, {
    accountingSettings: {
      purchaseGoodsTdsEnabled: false,
      transporterTdsEnabled: false,
      gstTdsEnabled: true,
    },
  });

  assert.equal(result.calculation.scrapGstTdsEligible, true);
  assert.equal(result.calculation.gstTdsAutomatic, true);
  assert.equal(result.calculation.gstTdsBasisAmount, "300000.00");
  assert.equal(result.calculation.gstTdsRate, "1");
  assert.equal(result.calculation.cgstTdsAmount, "3000.00");
  assert.equal(result.calculation.sgstTdsAmount, "3000.00");
  assert.equal(result.calculation.calculatedPayable, "348000.00");
  assert.equal(result.calculation.totalDifference, "0.00");
  assert.ok(!result.blockers.some((blocker) => /INVOICE_EVIDENCE_REQUIRED$/.test(blocker.code)));
  assert.ok(result.tallyPayload.withholdings.some((entry) =>
    entry.kind === "cgst_tds" && entry.taxableBasis === "300000.00" && entry.amount === "3000.00"
  ));
  assert.equal(result.blockers.length, 0);
});

test("qualifying interstate MS Scrap automatically deducts 2% IGST TDS", () => {
  const document = invoiceDocument({
    buyerGstin: gujaratBuyerGstin,
    totalAmount: "354000.00",
    taxAmount: "54000.00",
    tdsAmount: "",
    lines: [{
      description: "MS Scrap",
      hsnSac: "72044900",
      quantity: "10",
      unit: "MT",
      rate: "30000.00",
      taxableAmount: "300000.00",
      taxAmount: "54000.00",
    }],
  });

  const result = prepare(document, {
    companyGstin: gujaratBuyerGstin,
    accountingSettings: {
      purchaseGoodsTdsEnabled: false,
      transporterTdsEnabled: false,
      gstTdsEnabled: true,
    },
  });

  assert.equal(result.calculation.gstTdsAutomatic, true);
  assert.equal(result.calculation.gstTdsRate, "2");
  assert.equal(result.calculation.igstTdsAmount, "6000.00");
  assert.equal(result.calculation.calculatedPayable, "348000.00");
  assert.equal(result.calculation.totalDifference, "0.00");
  assert.equal(result.blockers.length, 0);
});

test("qualifying MS Scrap is blocked instead of silently posting when GST TDS is disabled", () => {
  const document = invoiceDocument({
    totalAmount: "354000.00",
    taxAmount: "54000.00",
    tdsAmount: "",
    lines: [{
      description: "MS Scrap",
      hsnSac: "72044900",
      quantity: "10",
      unit: "MT",
      rate: "30000.00",
      taxableAmount: "300000.00",
      taxAmount: "54000.00",
    }],
  });
  delete document.extracted_fields.cgstTdsAmount;
  delete document.extracted_fields.sgstTdsAmount;

  const result = prepare(document, {
    accountingSettings: {
      purchaseGoodsTdsEnabled: false,
      transporterTdsEnabled: false,
      gstTdsEnabled: false,
    },
  });

  assert.equal(result.calculation.scrapGstTdsEligible, true);
  assert.equal(result.calculation.gstTdsAutomatic, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "SCRAP_GST_TDS_DISABLED"));
});

test("source PDF attachment is automatic and legacy link approval no longer blocks posting", () => {
  const document = invoiceDocument();
  const result = prepare(document, {
    savedReview: {
      sourceReferenceApproved: false,
      narration: `Purchase invoice ${document.extracted_fields.invoiceNumber} imported from the packet-matching case.`,
    },
  });

  assert.equal(result.review.sourceReferenceApproved, true);
  assert.equal(
    result.review.narration,
    `Purchase invoice ${document.extracted_fields.invoiceNumber} dated ${result.source.invoiceDate}.`
  );
  assert.ok(!result.blockers.some((blocker) => blocker.code === "SOURCE_REFERENCE_APPROVAL_REQUIRED"));
  assert.equal("sourceDocumentReference" in result.tallyPayload, false);
});

test("recovers vehicle and explicit withholding evidence from invoice text", () => {
  const document = invoiceDocument({
    buyerGstin: gujaratBuyerGstin,
    totalAmount: "1159.00",
    tdsAmount: "1.00",
  });
  delete document.extracted_fields.vehicleNumber;
  delete document.extracted_fields.tdsAmount;
  delete document.extracted_fields.tds194qAmount;
  document.markdown = [
    "**Vehicle:** MH12AB1234",
    "| Less: TDS 194Q @ 0.10% | -1.00 |",
    "| Less: IGST TDS @ 2% | -20.00 |",
  ].join("\n");

  const result = prepare(document, { companyGstin: gujaratBuyerGstin });
  assert.equal(result.source.vehicleNumber, "MH12AB1234");
  assert.equal(result.source.invoiceTds194qAmount, "1.00");
  assert.equal(result.source.invoiceTds194qRate, "0.1");
  assert.equal(result.source.invoiceIgstTdsAmount, "20.00");
  assert.equal(result.source.invoiceGstTdsRate, "2");
  assert.ok(!result.blockers.some((blocker) => /INVOICE_EVIDENCE_REQUIRED$/.test(blocker.code)));
});

test("recovers one consistent vehicle number from linked packet documents", () => {
  const document = invoiceDocument();
  delete document.extracted_fields.vehicleNumber;
  const result = preparePurchasePosting({
    documents: [
      document,
      {
        id: "challan-1",
        document_type: "Delivery Challan",
        source_file_name: "packet.pdf",
        source_hint: "packet.pdf",
        title: "Delivery challan",
        extracted_fields: { vehicleNumber: "MH12AB1234" },
      },
      {
        id: "eway-1",
        document_type: "E-Way Bill",
        source_file_name: "packet.pdf",
        source_hint: "packet.pdf",
        title: "E-way bill",
        extracted_fields: { vehicleNumber: "MH12 AB 1234" },
      },
    ],
    masters: completeMasters,
    mappings: [],
    savedReview: { sourceReferenceApproved: true },
    caseStatus: "accepted",
    connectionReady: true,
    companyName: "Test Company",
    companyGstin: maharashtraBuyerGstin,
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
    duplicateExists: false,
  });
  assert.equal(result.source.vehicleNumber, "MH12AB1234");
  assert.equal(result.review.vehicleNumber, "MH12AB1234");
});

test("an absent freight charge is not included in the Tally payload", () => {
  const result = prepare(invoiceDocument(), {
    savedReview: {
      sourceReferenceApproved: true,
      freightAmount: "100.00",
      freightGstRate: "18",
      freightLedgerName: "Transportation Inward @ 18.00%",
    },
  });
  assert.equal(result.review.freightAmount, "");
  assert.equal(result.tallyPayload.charges.some((entry) => entry.kind === "freight"), false);
  assert.equal(result.tallyPayload.withholdings.some((entry) => entry.kind === "transport_tds"), false);
});

test("round-off is invoice-driven and cannot be added only through the review", () => {
  const withoutEvidence = prepare(invoiceDocument(), {
    savedReview: {
      sourceReferenceApproved: true,
      roundOffAmount: "0.50",
      roundOffLedgerName: "Round Off",
    },
  });
  assert.equal(withoutEvidence.review.roundOffAmount, "");
  assert.equal(withoutEvidence.calculation.roundOffAmount, "0.00");
  assert.equal(withoutEvidence.tallyPayload.ledgers.roundOff, null);

  const document = invoiceDocument({ totalAmount: "1158.50" });
  document.extracted_fields.roundOffAmount = "-0.50";
  const withEvidence = prepare(document);
  assert.equal(withEvidence.review.roundOffAmount, "-0.50");
  assert.equal(withEvidence.calculation.roundOffAmount, "-0.50");
  assert.deepEqual(withEvidence.tallyPayload.ledgers.roundOff, {
    name: "Round Off",
    amount: "-0.50",
  });
});

test("freight is a separate charge, expands the GST basis, and has its own TDS", () => {
  const document = invoiceDocument({
    taxAmount: "198.00",
    totalAmount: "1276.00",
  });
  document.extracted_fields.freightAmount = "100.00";
  document.extracted_fields.freightGstRate = "18";
  document.extracted_fields.transportTdsAmount = "1.00";
  document.extracted_fields.transportTdsRate = "1";

  const result = prepare(document);
  assert.equal(result.review.freightLedgerName, "Transportation Inward @ 18.00%");
  assert.equal(result.calculation.gstTaxableAmount, "1100.00");
  assert.equal(result.calculation.gstAmount, "198.00");
  assert.equal(result.calculation.transportTdsAmount, "1.00");
  assert.equal(result.calculation.calculatedPayable, "1276.00");
  assert.ok(result.tallyPayload.charges.some((entry) => entry.kind === "freight"));
  assert.ok(result.tallyPayload.withholdings.some((entry) => entry.kind === "transport_tds"));
  assert.equal(result.blockers.length, 0);
});

test("72031000 uses the combined stock, O.M.S. purchase, IGST, and no scrap deduction", () => {
  const document = invoiceDocument({
    hsn: "72031000",
    buyerGstin: gujaratBuyerGstin,
    totalAmount: "1180.00",
    tdsAmount: "",
  });
  const result = prepare(document, { companyGstin: gujaratBuyerGstin });
  assert.equal(result.review.lines[0].stockItemName, "M S Scrap & Sponge Iron");
  assert.equal(result.review.lines[0].purchaseLedgerName, "O.M.S. Scrap Purchase");
  assert.equal(result.calculation.taxMode, "igst");
  assert.equal(result.calculation.igstAmount, "180.00");
  assert.equal(result.calculation.tdsAmount, "0.00");
  assert.equal(result.blockers.length, 0);
});

test("TCS is opt-in and changes the visible payable only when selected", () => {
  const document = invoiceDocument({ totalAmount: "1164.00" });
  const initial = prepare(document);
  assert.equal(initial.calculation.tcsAmount, "0.00");
  const selected = prepare(document, {
    savedReview: {
      ...initial.review,
      sourceReferenceApproved: true,
      tcsReceivable: true,
      tcsAmount: "5.00",
      tcsLedgerName: "TCS Receivable",
    },
  });
  assert.equal(selected.calculation.tcsAmount, "5.00");
  assert.equal(selected.calculation.calculatedPayable, "1164.00");
  assert.equal(selected.blockers.length, 0);
});

test("mixed-item invoices use the confirmed deduction amounts instead of inferring from HSN", () => {
  const document = invoiceDocument({
    totalAmount: "1169.50",
    tdsAmount: "0.50",
    lines: [
      { description: "MS Scrap", hsnSac: "72044900", quantity: "1", unit: "MT", rate: "500", taxableAmount: "500", taxAmount: "90" },
      { description: "Sponge Iron", hsnSac: "72031000", quantity: "1", unit: "MT", rate: "500", taxableAmount: "500", taxAmount: "90" },
    ],
  });
  document.extracted_fields.cgstTdsAmount = "5.00";
  document.extracted_fields.sgstTdsAmount = "5.00";
  const initial = prepare(document);
  const result = prepare(document, {
    savedReview: {
      ...initial.review,
      sourceReferenceApproved: true,
      tds194qRate: "0.1",
      lines: initial.review.lines,
    },
  });
  assert.equal(result.calculation.tds194qAmount, "0.50");
  assert.equal(result.calculation.cgstTdsAmount, "5.00");
  assert.equal(result.calculation.sgstTdsAmount, "5.00");
  assert.equal(result.blockers.length, 0);
});

test("optional deductions and their prompts are omitted when organization rules are off", () => {
  const document = invoiceDocument();
  document.extracted_fields.transportTdsAmount = "7.00";
  document.extracted_fields.cgstTdsAmount = "10.00";
  document.extracted_fields.sgstTdsAmount = "10.00";

  const result = prepare(document, {
    accountingSettings: {
      purchaseGoodsTdsEnabled: false,
      transporterTdsEnabled: false,
      gstTdsEnabled: false,
    },
  });

  assert.equal(result.calculation.tds194qAmount, "0.00");
  assert.equal(result.calculation.transportTdsAmount, "0.00");
  assert.equal(result.calculation.cgstTdsAmount, "0.00");
  assert.equal(result.calculation.sgstTdsAmount, "0.00");
  assert.deepEqual(result.tallyPayload.withholdings, []);
  assert.ok(!result.warnings.some((warning) => warning.code.includes("TDS_DISABLED")));
});

test("unknown HSN, missing masters, and an existing duplicate block posting", () => {
  const unknown = prepare(invoiceDocument({ hsn: "99999999", totalAmount: "1180.00", tdsAmount: "" }));
  assert.ok(unknown.blockers.some((blocker) => blocker.code === "HSN_MAPPING_REQUIRED"));

  const missingMaster = prepare(invoiceDocument(), { masters: [] });
  assert.ok(missingMaster.blockers.some((blocker) => blocker.code === "STOCK_ITEM_REQUIRED"));
  assert.ok(missingMaster.blockers.some((blocker) => blocker.code === "PURCHASE_LEDGER_REQUIRED"));

  const duplicate = prepare(invoiceDocument(), { duplicateExists: true });
  assert.ok(duplicate.blockers.some((blocker) => blocker.code === "DUPLICATE_INVOICE"));
});

test("duplicate copies of the same invoice are collapsed, distinct invoices are not", () => {
  const first = invoiceDocument();
  const copy = { ...invoiceDocument({ id: "invoice-copy" }), markdown: "more complete copy" };
  assert.equal(getCanonicalInvoiceDocuments([first, copy]).length, 1);
  const other = invoiceDocument({ id: "invoice-2" });
  other.extracted_fields = { ...other.extracted_fields, invoiceNumber: "INV-101" };
  assert.equal(getCanonicalInvoiceDocuments([first, other]).length, 2);
});

test("missing invoice lines recover only from one strongly linked supporting document", () => {
  const invoice = invoiceDocument();
  invoice.extracted_fields = { ...invoice.extracted_fields };
  delete invoice.extracted_fields.__lineItems;
  const eway = {
    id: "eway-1",
    document_type: "E-Way Bill",
    source_file_name: "packet.pdf",
    source_hint: "packet.pdf (page 2)",
    title: "E-Way Bill",
    extracted_fields: {
      referenceInvoiceNumber: "INV-100",
      supplierGstin,
      buyerGstin: maharashtraBuyerGstin,
      totalTaxableAmount: "1000.00",
      __lineItems: [{
        description: "MS Scrap",
        hsnSac: "72044900",
        quantity: "1",
        unit: "MT",
        rate: "1000.00",
        taxableAmount: "1000.00",
        taxAmount: "180.00",
      }],
    },
  };
  const result = preparePurchasePosting({
    documents: [invoice, eway],
    masters: completeMasters,
    mappings: [],
    savedReview: { sourceReferenceApproved: true, invoiceDate: "" },
    caseStatus: "accepted",
    connectionReady: true,
    masterDataReady: true,
    companyName: "Test Company",
    companyGstin: maharashtraBuyerGstin,
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
  });
  assert.equal(result.source.lineRecovery, "linked_document");
  assert.equal(result.source.lineSourceDocumentId, "eway-1");
  assert.equal(result.review.lines.length, 1);
  assert.equal(result.review.lines[0].purchaseLedgerName, "M.S. Scrap Purchase");
  assert.ok(result.warnings.some((warning) => warning.code === "INVOICE_LINES_RECOVERED_FROM_LINKED_DOCUMENT"));
});

test("ambiguous supporting documents do not silently recover invoice lines", () => {
  const invoice = invoiceDocument();
  invoice.extracted_fields = { ...invoice.extracted_fields };
  delete invoice.extracted_fields.__lineItems;
  const linked = {
    id: "eway-1",
    document_type: "E-Way Bill",
    source_file_name: "packet.pdf",
    source_hint: "packet.pdf",
    title: "E-Way Bill",
    extracted_fields: {
      referenceInvoiceNumber: "INV-100",
      supplierGstin,
      totalTaxableAmount: "1000.00",
      __lineItems: [{
        description: "MS Scrap",
        hsnSac: "72044900",
        quantity: "1",
        unit: "MT",
        rate: "1000.00",
        taxableAmount: "1000.00",
      }],
    },
  };
  const result = preparePurchasePosting({
    documents: [invoice, linked, { ...linked, id: "delivery-1", document_type: "Delivery Challan" }],
    masters: completeMasters,
    mappings: [],
    savedReview: { sourceReferenceApproved: true, invoiceDate: "" },
    caseStatus: "accepted",
    connectionReady: true,
    masterDataReady: true,
    companyName: "Test Company",
    companyGstin: maharashtraBuyerGstin,
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
  });
  assert.equal(result.source.lineRecovery, "invoice");
  assert.equal(result.review.lines.length, 0);
  assert.ok(result.blockers.some((blocker) => blocker.code === "LINE_ITEMS_REQUIRED"));
});

test("new live masters fill previously blank saved master selections", () => {
  const result = prepare(invoiceDocument(), {
    savedReview: {
      sourceReferenceApproved: true,
      supplierLedgerName: "",
      cgstLedgerName: "",
      sgstLedgerName: "",
      tds194qLedgerName: "",
    },
  });
  assert.equal(result.review.supplierLedgerName, "Scrap Supplier");
  assert.equal(result.review.cgstLedgerName, "Input ITC CGST 9%");
  assert.equal(result.review.sgstLedgerName, "Input ITC SGST 9%");
  assert.equal(result.review.tds194qLedgerName, "TDS Payable @ 0.10% (194Q)");
});

test("classification copies of one physical ledger do not block automatic selection", () => {
  const duplicatedMasters = [
    ...completeMasters,
    master("ledger", "Input ITC CGST 9%"),
    master("tax_ledger", "Input ITC CGST 9%"),
    master("ledger", "Input ITC SGST 9%"),
    master("tax_ledger", "Input ITC SGST 9%"),
    master("ledger", "TDS Payable @ 0.10% (194Q)"),
    master("gst_ledger", "TDS Payable @ 0.10% (194Q)"),
  ];

  const result = prepare(invoiceDocument(), {
    masters: duplicatedMasters,
    savedReview: {
      sourceReferenceApproved: true,
      cgstLedgerName: "",
      sgstLedgerName: "",
      tds194qLedgerName: "",
    },
  });

  assert.equal(result.review.cgstLedgerName, "Input ITC CGST 9%");
  assert.equal(result.review.sgstLedgerName, "Input ITC SGST 9%");
  assert.equal(result.review.tds194qLedgerName, "TDS Payable @ 0.10% (194Q)");
  assert.ok(!result.blockers.some((blocker) =>
    ["CGST_LEDGER_REQUIRED", "SGST_LEDGER_REQUIRED", "TDS_194Q_LEDGER_REQUIRED"].includes(blocker.code)
  ));
});

test("review persistence keeps only user changes and reconstructs the full review", () => {
  const document = invoiceDocument();
  const defaults = prepare(document, { savedReview: {} });
  const reviewed = {
    ...defaults.review,
    narration: "User-approved purchase narration.",
    sourceReferenceApproved: true,
    lines: defaults.review.lines.map((line, index) =>
      index === 0 ? { ...line, rate: "123.45" } : line
    ),
  };

  const patch = compactPurchasePostingReview(defaults.review, reviewed);
  assert.deepEqual(Object.keys(patch).sort(), ["lines", "narration"]);
  assert.deepEqual(patch.lines, [{ lineId: reviewed.lines[0].lineId, rate: "123.45" }]);

  const reconstructed = prepare(document, { savedReview: patch });
  assert.deepEqual(reconstructed.review, reviewed);
});

test("visible invoice date and TDS in source text fill missing structured fields", () => {
  const document = invoiceDocument({
    totalAmount: "1170.00",
    tdsAmount: "",
  });
  delete document.extracted_fields.documentDate;
  document.markdown = [
    "TAX INVOICE",
    "Invoice No: INV-100",
    "Date: 27.07.2026",
    "TDS base: INR 1,000.00",
    "TDS on MS Scrap basic @ 1% -10.00",
  ].join("\n");
  const result = prepare(document, { savedReview: { sourceReferenceApproved: true } });
  assert.equal(result.review.invoiceDate, "2026-07-27");
  assert.equal(result.review.tds194qRate, "0.1");
  assert.equal(result.calculation.tds194qAmount, "10.00");
  assert.ok(!result.blockers.some((blocker) => blocker.code === "INVOICE_DATE_REQUIRED"));
});

test("loose ISO invoice dates are normalized", () => {
  const document = invoiceDocument();
  document.extracted_fields.documentDate = "2026-7-27";
  const result = prepare(document);
  assert.equal(result.review.invoiceDate, "2026-07-27");
  assert.ok(!result.blockers.some((blocker) => blocker.code === "INVOICE_DATE_REQUIRED"));
});

test("manually saved invoice dates are normalized before validation", () => {
  const document = invoiceDocument();
  delete document.extracted_fields.documentDate;
  document.markdown = "TAX INVOICE\nInvoice No: INV-100";
  const result = prepare(document, {
    savedReview: { sourceReferenceApproved: true, invoiceDate: "27/07/2026" },
  });
  assert.equal(result.review.invoiceDate, "2026-07-27");
  assert.ok(result.warnings.some((warning) => warning.code === "INVOICE_DATE_MISSING_FROM_EXTRACTION"));
  assert.ok(!result.blockers.some((blocker) => blocker.code === "INVOICE_DATE_REQUIRED"));
});

test("missing extracted invoice date warns and uses clearer blocker copy", () => {
  const document = invoiceDocument();
  delete document.extracted_fields.documentDate;
  document.markdown = "TAX INVOICE\nInvoice No: INV-100";
  const result = prepare(document);
  assert.equal(result.review.invoiceDate, "");
  assert.ok(result.warnings.some((warning) =>
    warning.code === "INVOICE_DATE_MISSING_FROM_EXTRACTION" &&
    warning.message === "The invoice date was not found in the extracted documents. Enter the supplier invoice date manually before posting."
  ));
  assert.ok(result.blockers.some((blocker) =>
    blocker.code === "INVOICE_DATE_REQUIRED" &&
    blocker.message === "Enter the supplier invoice date before posting."
  ));
});

test("linked E-Way Bill supplies one unambiguous missing invoice date", () => {
  const invoice = invoiceDocument();
  delete invoice.extracted_fields.documentDate;
  invoice.markdown = "TAX INVOICE\\nInvoice No: INV-100";
  const eway = {
    id: "eway-date",
    document_type: "E-Way Bill",
    source_file_name: "packet.pdf",
    source_hint: "packet.pdf (page 5)",
    title: "E-Way Bill",
    extracted_fields: {
      referenceInvoiceNumber: "INV-100",
      documentDate: "20-07-2026",
    },
  };
  const result = preparePurchasePosting({
    documents: [invoice, eway],
    masters: completeMasters,
    mappings: [],
    savedReview: { sourceReferenceApproved: true },
    caseStatus: "accepted",
    connectionReady: true,
    masterDataReady: true,
    companyName: "Test Company",
    companyGstin: maharashtraBuyerGstin,
    sourceDocumentReference: "https://app.example/cases/case-1?sourceFileId=file-1",
  });
  assert.equal(result.review.invoiceDate, "2026-07-20");
  assert.ok(!result.blockers.some((blocker) => blocker.code === "INVOICE_DATE_REQUIRED"));
});

test("printed GST, 194Q, and GST TDS reconcile as separate deductions", () => {
  const document = invoiceDocument({
    totalAmount: "289750.00",
    taxAmount: "",
    tdsAmount: "",
    lines: [{
      description: "MS Scrap",
      hsnSac: "72044900",
      quantity: "10",
      unit: "MT",
      rate: "25000.00",
      taxableAmount: "250000.00",
      taxAmount: "",
    }],
  });
  delete document.extracted_fields.documentDate;
  delete document.extracted_fields.cgstTdsAmount;
  delete document.extracted_fields.sgstTdsAmount;
  document.markdown = [
    "INVOICE DATE 28/07/2026",
    "CGST 9% INR 22,500.00",
    "SGST 9% INR 22,500.00",
    "Invoice value INR 295,000.00",
    "TDS Payable @ 0.10% (194Q) INR 250.00",
    "CGST TDS PAYABLE 1% INR 2,500.00",
    "SGST TDS PAYABLE 1% INR 2,500.00",
    "Net amount payable INR 289,750.00",
  ].join("\n");

  const result = prepare(document, {
    savedReview: { sourceReferenceApproved: true },
  });

  assert.equal(result.source.invoiceTaxAmount, "45000");
  assert.equal(result.source.invoiceTds194qAmount, "250.00");
  assert.equal(result.review.tds194qRate, "0.1");
  assert.equal(result.review.cgstLedgerName, "Input ITC CGST 9%");
  assert.equal(result.review.sgstLedgerName, "Input ITC SGST 9%");
  assert.equal(result.review.tds194qLedgerName, "TDS Payable @ 0.10% (194Q)");
  assert.equal(result.calculation.gstAmount, "45000.00");
  assert.equal(result.calculation.tds194qAmount, "250.00");
  assert.equal(result.calculation.cgstTdsAmount, "2500.00");
  assert.equal(result.calculation.sgstTdsAmount, "2500.00");
  assert.equal(result.calculation.calculatedPayable, "289750.00");
  assert.equal(result.calculation.gstDifference, "0.00");
  assert.equal(result.calculation.totalDifference, "0.00");
});

test("line arithmetic, stock HSN, and supplier GSTIN mismatches are blocked", () => {
  const document = invoiceDocument();
  const initial = prepare(document);
  const mismatchedMasters = completeMasters.map((item) => {
    if (item.tally_name === "Scrap Supplier") return { ...item, gstin: "27CCCCC0000C1Z5" };
    if (item.tally_name === "M S Scrap & Sponge Iron") return { ...item, hsn_code: "72031000" };
    return item;
  });
  const result = prepare(document, {
    masters: mismatchedMasters,
    savedReview: {
      ...initial.review,
      sourceReferenceApproved: true,
      lines: initial.review.lines.map((line) => ({ ...line, taxableAmount: "998.00" })),
    },
  });
  assert.ok(result.blockers.some((blocker) => blocker.code === "SUPPLIER_LEDGER_GSTIN_MISMATCH"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "STOCK_ITEM_HSN_MISMATCH"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "LINE_TAXABLE_MISMATCH"));
});

test("output GST ledgers cannot be used for a purchase voucher", () => {
  const outputMasters = completeMasters.map((item) => {
    if (item.tally_name === "Input ITC CGST 9%") return { ...item, tally_name: "Output CGST 9%" };
    if (item.tally_name === "Input ITC SGST 9%") return { ...item, tally_name: "Output SGST 9%" };
    return item;
  });
  const result = prepare(invoiceDocument(), {
    masters: outputMasters,
    savedReview: { sourceReferenceApproved: true },
  });
  assert.ok(result.blockers.some((blocker) => blocker.code === "CGST_LEDGER_REQUIRED"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "SGST_LEDGER_REQUIRED"));
});
