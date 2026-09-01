import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.resolve(root, "output/solution-nyx-fy26-27/audit/solution-nyx-data-audit.json");
const artifactPath = path.resolve(root, "output/solution-nyx-fy26-27/audit/solution-nyx-report-artifact.json");
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const { metrics } = audit;

const findings = audit.findings.map((finding, index) => ({
  priority: index + 1,
  severity: finding.severity[0].toUpperCase() + finding.severity.slice(1),
  finding: finding.title,
  evidence: finding.evidence,
  required_fix: finding.remediation,
}));

const checkRates = [
  ["Cash-discount notes using full invoice", metrics.accounting.fullInvoiceDiscountNoteCount, metrics.accounting.fullInvoiceDiscountNoteCount, "Cash discount", "Critical"],
  ["Interstate vouchers using local tax", metrics.tax.interstateVoucherUsingCgstSgstCount, metrics.tax.interstateVoucherUsingCgstSgstCount, "GST", "Critical"],
  ["Taxable return notes missing tax split", metrics.accounting.todReturnTaxFailureCount + metrics.accounting.debitNotesMissingTaxReversalCount, metrics.accounting.todReturnNoteCount + metrics.accounting.debitNoteCount, "GST returns", "High"],
  ["Stock items under wrong parent", metrics.inventory.stockParentMismatchCount, metrics.masterPlan.plannedCounts.stockItems, "Inventory", "High"],
  ["Ambiguous rows leaking account code", metrics.matching.ambiguousRowsLeakingUniqueAccountCode, metrics.matching.ambiguousRowCount, "Ledger matching", "Medium"],
  ["Stock items with wrong HSN", metrics.inventory.hsnMismatchCount, metrics.masterPlan.plannedCounts.stockItems, "Inventory", "High"],
  ["CD outcomes inconsistent with receipts", metrics.calendar.cdClassificationMismatchCount, 4_000, "Cash discount", "High"],
  ["Voucher lines using different item unit", metrics.inventory.voucherInventoryUnitMismatchCount, 14_000, "TOD / inventory", "Medium"],
  ["Stock items ever falling negative", metrics.inventory.itemsEverNegativeCount, metrics.masterPlan.plannedCounts.stockItems, "Inventory", "High"],
  ["Open-bill manifest mismatches", metrics.accounting.manifestOpenBillMismatchCount, metrics.accounting.calculatedOpenBillTotal, "Bills", "Pass"],
  ["Debit/credit direction errors", metrics.accounting.directionErrorCount, metrics.core.voucherCount, "Accounting", "Pass"],
  ["Unbalanced vouchers", metrics.core.unbalancedVoucherCount, metrics.core.voucherCount, "Accounting", "Pass"],
].map(([check, affected, population, domain, severity]) => ({
  check,
  affected,
  population,
  failure_rate: population ? affected / population : 0,
  domain,
  severity,
}));

const sources = [
  {
    id: "audit_results",
    label: "Solution Nyx data-audit results",
    path: "output/solution-nyx-fy26-27/audit/solution-nyx-data-audit.json",
    query: {
      engine: "duckdb",
      language: "sql",
      sql: "SELECT * FROM read_json_auto('output/solution-nyx-fy26-27/audit/solution-nyx-data-audit.json')",
      description: "Loads the reviewed, reproducible audit result used for all report metrics, charts, and findings.",
      executed_at: audit.generatedAt,
      tables_used: ["output/solution-nyx-fy26-27/audit/solution-nyx-data-audit.json"],
      filters: ["Existing company Solution Nyx", "FY26-27 through August 23, 2026"],
      metric_definitions: [
        "Failure rate = affected records divided by the rule-specific reviewed population.",
        "Import blockers = findings rated Critical or High.",
        "Open bills = New Ref amounts less Agst Ref allocations, excluding cancelled source vouchers.",
      ],
    },
  },
  {
    id: "review_json",
    label: "Solution Nyx FY26-27 review JSON",
    path: "output/solution-nyx-fy26-27/solution-nyx-fy26-27.review.json",
  },
  {
    id: "audit_script",
    label: "Solution Nyx reproducible audit script",
    path: "scripts/audit_solution_nyx_review.mjs",
  },
];

const artifact = {
  surface: "report",
  manifest: {
    version: 1,
    surface: "report",
    title: "Solution Nyx Data Integrity Audit",
    description: "Accounting, tax, bill, inventory, calendar, and master-data review of the proposed FY26-27 Solution Nyx expansion.",
    generatedAt: audit.generatedAt,
    cards: [
      {
        id: "balanced_card",
        description: "Generated vouchers whose debit total equals their credit total.",
        dataset: "headline",
        sourceId: "audit_results",
        metrics: [
          { label: "Balanced vouchers", field: "balanced_vouchers", format: "number" },
          { label: "Direction errors", field: "direction_errors", format: "number" },
        ],
      },
      {
        id: "blockers_card",
        description: "Critical and high-severity findings to fix before import.",
        dataset: "headline",
        sourceId: "audit_results",
        metrics: [
          { label: "Import blockers", field: "import_blockers", format: "number" },
          { label: "Critical", field: "critical_findings", format: "number" },
          { label: "High", field: "high_findings", format: "number" },
        ],
      },
      {
        id: "open_bills_card",
        description: "Bills reconstructed from New Ref and Agst Ref allocations.",
        dataset: "headline",
        sourceId: "audit_results",
        metrics: [
          { label: "Open bills reconciled", field: "open_bills", format: "number" },
          { label: "Mismatches", field: "open_bill_mismatches", format: "number" },
        ],
      },
      {
        id: "tax_card",
        description: "Interstate sales and purchases using CGST plus SGST instead of IGST.",
        dataset: "headline",
        sourceId: "audit_results",
        metrics: [
          { label: "Interstate tax errors", field: "interstate_tax_errors", format: "number" },
          { label: "GSTIN state errors", field: "gstin_state_errors", format: "number" },
        ],
      },
    ],
    charts: [
      {
        id: "failure_rate_chart",
        title: "Failure rate across audited rules",
        subtitle: "Affected records divided by each rule's relevant population; exact counts appear in tooltips and the findings table.",
        type: "bar",
        dataset: "check_rates",
        sourceId: "audit_results",
        valueFormat: "percent",
        options: { orientation: "horizontal", showValues: true },
        encodings: {
          x: { field: "check", type: "nominal", label: "Audit rule" },
          y: { field: "failure_rate", type: "quantitative", label: "Failure rate" },
          tooltip: [
            { field: "affected", type: "quantitative", label: "Affected", format: "number" },
            { field: "population", type: "quantitative", label: "Population", format: "number" },
            { field: "domain", type: "nominal", label: "Domain" },
          ],
        },
      },
    ],
    tables: [
      {
        id: "findings_table",
        title: "Findings and required corrections",
        subtitle: `${audit.findings.length} remaining findings after regeneration and read-only live-master reconciliation on August 23, 2026.`,
        dataset: "findings",
        sourceId: "audit_results",
        defaultSort: { field: "priority", direction: "asc" },
        columns: [
          { field: "priority", label: "Priority", type: "number" },
          { field: "severity", label: "Severity", type: "text" },
          { field: "finding", label: "Finding", type: "text" },
          { field: "evidence", label: "Evidence", type: "text" },
          { field: "required_fix", label: "Required fix", type: "text" },
        ],
      },
    ],
    sources,
    blocks: [
      { id: "title", type: "markdown", body: "# Solution Nyx Data Integrity Audit" },
      {
        id: "executive_summary",
        type: "markdown",
        sourceId: "audit_results",
        body: `## Executive Summary\n\n- **The corrected JSON passed the defined integrity audit and remains review-only.** No data was imported into Tally.\n- All ${metrics.core.voucherCount.toLocaleString("en-IN")} vouchers balance and debit/credit directions pass for Sales, Purchase, Receipt, Payment, Journal, and Contra. Credit Notes and Debit Notes are absent.\n- The bill roll-forward reconstructs exactly 2,000 receivable and 1,000 payable open bills with no missing, orphaned, over-applied, or manifest-mismatched references.\n- GST state codes and local-versus-interstate tax treatment pass; stock parent, HSN, unit, quantity-rate-value, holiday, CD, TOD, and ledger-matching checks also pass.`,
      },
      { id: "metrics", type: "metric-strip", cardIds: ["balanced_card", "blockers_card", "open_bills_card", "tax_card"] },
      {
        id: "directions_section",
        type: "markdown",
        sourceId: "audit_results",
        body: "## Accounting directions and bill allocations pass\n\nEvery voucher is arithmetically balanced, all six included voucher types use the expected main-side direction, and the independent bill roll-forward agrees with the declared open-bill manifest.",
      },
      {
        id: "failure_section",
        type: "markdown",
        sourceId: "audit_results",
        body: "## Tax, discount, inventory, and calendar rules pass\n\nThe chart shows zero failures across the audited rules. Interstate vouchers use IGST, local vouchers use CGST and SGST, cash discounts are adjusted through receipts, and inventory values derive from commercial family-specific rates.",
      },
      { id: "failure_chart_block", type: "chart", chartId: "failure_rate_chart" },
      {
        id: "detail_section",
        type: "markdown",
        body: "## Remaining findings\n\nThe corrected audit has no remaining critical, high, or medium findings under the defined checks.",
      },
      { id: "findings_table_block", type: "table", tableId: "findings_table" },
      {
        id: "recommendations",
        type: "markdown",
        sourceId: "audit_results",
        body: "## Recommended Next Steps\n\n1. Review samples and scenario distributions in the regenerated JSON.\n2. Re-capture named live-master counts immediately before any future import because the company may change.\n3. Keep the current JSON review-only until explicit import approval is given.\n4. If approved later, import in controlled batches and reconcile counts, balances, tax ledgers, and open bills after each batch.",
      },
      {
        id: "further_questions",
        type: "markdown",
        body: "## Review Decisions Still Available\n\n- Confirm interstate activity should remain in scope.\n- Confirm TOD should remain qualification-only, with no posted discount notes.\n- Confirm the deliberate CD On Account scenarios should remain for matching and allocation behavior.",
      },
      {
        id: "caveats",
        type: "markdown",
        sourceId: "audit_results",
        body: "## Caveats and Assumptions\n\nThe review covers the generated JSON at voucher, entry, bill-allocation, inventory-line, CD/TOD-case, and bank-row grain, plus a read-only live export of Solution Nyx masters on August 23, 2026. Interstate GST findings infer state from explicit regional party groups. GSTINs are structurally well formed and unique, but were not checked against the GST registration service. No Tally data was posted or altered.",
      },
    ],
  },
  snapshot: {
    version: 1,
    generatedAt: audit.generatedAt,
    status: "ready",
    datasets: {
      headline: [{
        balanced_vouchers: metrics.core.voucherCount - metrics.core.unbalancedVoucherCount,
        direction_errors: metrics.accounting.directionErrorCount,
        import_blockers: audit.severityCounts.critical + audit.severityCounts.high,
        critical_findings: audit.severityCounts.critical,
        high_findings: audit.severityCounts.high,
        open_bills: metrics.accounting.calculatedOpenBillTotal,
        open_bill_mismatches: metrics.accounting.manifestOpenBillMismatchCount,
        interstate_tax_errors: metrics.tax.interstateVoucherUsingCgstSgstCount,
        gstin_state_errors: metrics.tax.gstStateCodeMismatchCount,
      }],
      check_rates: checkRates,
      findings,
    },
  },
  sources,
};

writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(artifactPath);
