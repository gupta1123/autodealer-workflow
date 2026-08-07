import { apiFetch } from "@/lib/api-client";
import { readPreferredTallyConnectionId } from "@/lib/tally-company-selection";

export type TallyPostingIssue = {
  code: string;
  label: string;
  message: string;
  scope: "case" | "company" | "invoice" | "line" | "tax" | "source";
  lineId?: string;
};

export type TallyPostingLine = {
  lineId: string;
  description: string;
  hsn: string;
  quantity: string;
  unit: string;
  rate: string;
  taxableAmount: string;
  stockItemName: string;
  purchaseLedgerName: string;
};

export type TallyPostingReview = {
  invoiceNumber: string;
  invoiceDate: string;
  voucherDate: string;
  supplierName: string;
  supplierGstin: string;
  buyerName: string;
  buyerGstin: string;
  vehicleNumber: string;
  invoiceTotal: string;
  gstRate: string;
  supplierLedgerName: string;
  cgstLedgerName: string;
  sgstLedgerName: string;
  igstLedgerName: string;
  freightAmount: string;
  freightGstRate: string;
  freightLedgerName: string;
  tds194qLedgerName: string;
  tds194qRate: string;
  transportTdsLedgerName: string;
  transportTdsRate: string;
  cgstTdsLedgerName: string;
  sgstTdsLedgerName: string;
  igstTdsLedgerName: string;
  gstTdsRate: string;
  tdsLedgerName?: string;
  tdsRate?: string;
  tcsReceivable: boolean;
  tcsLedgerName: string;
  tcsAmount: string;
  roundOffLedgerName: string;
  roundOffAmount: string;
  sourceReferenceApproved: boolean;
  narration: string;
  lines: TallyPostingLine[];
};

export type TallyPostingResponse = {
  caseStatus: string;
  accountingSettings: {
    purchaseGoodsTdsEnabled: boolean;
    transporterTdsEnabled: boolean;
    gstTdsEnabled: boolean;
  };
  selectedConnectionId: string | null;
  selectedCompanyName: string | null;
  connectionOptions: Array<{
    id: string;
    connectionId: string;
    displayName: string;
    machineName: string | null;
    status: string;
    companyName: string | null;
    isActive: boolean;
    bridgeConnected: boolean;
    tallyReachable: boolean;
    companyLoaded: boolean;
    heartbeatStale: boolean;
    connectorUpdateRequired: boolean;
    lastHeartbeatAt: string | null;
    lastError: string | null;
  }>;
  posting: null | {
    id: string;
    caseId: string;
    connectionId: string | null;
    commandId: string | null;
    status: string;
    revision: number;
    companyName: string | null;
    companyGstin: string | null;
    invoiceNumber: string | null;
    supplierGstin: string | null;
    approvedAt: string | null;
    queuedAt: string | null;
    tallyVoucherNumber: string | null;
    tallyMasterId: string | null;
    tallyGuid: string | null;
    tallyCreatedAt: string | null;
    verifiedAt: string | null;
    verificationResult: Record<string, unknown>;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  };
  eligibility: { eligible: boolean; canonicalInvoiceCount: number };
  connection: null | {
    id: string;
    displayName: string;
    machineName: string | null;
    status: string;
    companyName: string | null;
    activeCompanyName: string | null;
    bridgeConnected: boolean;
    tallyReachable: boolean | null;
    companyLoaded: boolean | null;
    heartbeatStale: boolean;
    connectorUpdateRequired: boolean;
    lastError: string | null;
    lastHeartbeatAt: string | null;
    masterSyncRunId: string | null;
    masterSyncedAt: string | null;
    masterSnapshotFresh: boolean;
    masterSnapshotComplete: boolean;
    masterTotals: Record<string, unknown>;
    companyGstin: string | null;
    companyStateCode: string | null;
  };
  sourceFileId: string | null;
  sourceDocumentReference: string | null;
  source: null | {
    documentId: string;
    documentType: string;
    lineSourceDocumentId: string;
    lineSourceDocumentType: string;
    lineRecovery: "invoice" | "linked_document";
    sourceFileName: string | null;
    sourceHint: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    supplierName: string;
    supplierGstin: string;
    buyerName: string;
    buyerGstin: string;
    vehicleNumber: string;
    invoiceTaxableAmount: string;
    invoiceTaxRate: string;
    invoiceTaxAmount: string;
    invoiceTotal: string;
    invoiceTdsAmount: string;
    invoiceTdsRate: string;
    invoiceFreightAmount: string;
    invoiceFreightGstRate: string;
    invoiceTds194qAmount: string;
    invoiceTds194qRate: string;
    invoiceTransportTdsAmount: string;
    invoiceTransportTdsRate: string;
    invoiceCgstTdsAmount: string;
    invoiceSgstTdsAmount: string;
    invoiceIgstTdsAmount: string;
    invoiceGstTdsRate: string;
    invoiceTcsAmount: string;
    invoiceRoundOffAmount: string;
    lines: Array<TallyPostingLine & {
      material: "ms_scrap" | "sponge_iron" | "unknown";
      materialLabel: string;
      sourcePage: number | null;
    }>;
  };
  review: TallyPostingReview | null;
  calculation: null | {
    taxMode: "cgst_sgst" | "igst" | "unknown";
    gstRate: string;
    supplierStateCode: string | null;
    buyerStateCode: string | null;
    basicAmount: string;
    freightAmount: string;
    gstTaxableAmount: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    gstAmount: string;
    invoiceGstAmount: string;
    gstDifference: string;
    tdsAmount: string;
    tds194qAmount: string;
    transportTdsAmount: string;
    cgstTdsAmount: string;
    sgstTdsAmount: string;
    igstTdsAmount: string;
    gstTdsBasisAmount: string;
    gstTdsRate: string;
    gstTdsAutomatic: boolean;
    scrapGstTdsEligible: boolean;
    totalWithholdingAmount: string;
    tcsAmount: string;
    roundOffAmount: string;
    calculatedPayable: string;
    invoiceTotal: string;
    totalDifference: string;
  };
  blockers: TallyPostingIssue[];
  warnings: TallyPostingIssue[];
  tallyPayload: Record<string, unknown> | null;
  readyForApproval: boolean;
  masterOptions: {
    ledgers: TallyMasterOption[];
    stockItems: TallyMasterOption[];
    units: TallyMasterOption[];
  };
  events: Array<Record<string, unknown>>;
};

export type TallyMasterOption = {
  id: string;
  type: string;
  key: string;
  name: string;
  parent: string | null;
  gstin: string | null;
  hsnCode: string | null;
  unitName: string | null;
  taxRate: number | null;
};

async function readResponse(response: Response, fallback: string) {
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : raw || fallback);
  }
  return payload as unknown as TallyPostingResponse;
}

export async function fetchTallyPurchasePosting(
  caseId: string,
  connectionId?: string | null,
  companyName?: string | null
) {
  const preferredConnectionId =
    connectionId || readPreferredTallyConnectionId();
  const params = new URLSearchParams();
  if (preferredConnectionId) params.set("connectionId", preferredConnectionId);
  if (companyName) params.set("companyName", companyName);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await apiFetch(`/api/cases/${caseId}/tally-posting${query}`, { cache: "no-store" });
  return readResponse(response, "Failed to load Tally posting review.");
}

export async function saveTallyPurchasePosting(
  caseId: string,
  review: TallyPostingReview,
  connectionId: string,
  companyName: string
) {
  const response = await apiFetch(`/api/cases/${caseId}/tally-posting`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ review, connectionId, companyName }),
  });
  return readResponse(response, "Failed to save Tally posting review.");
}

export async function approveAndQueueTallyPurchasePosting(caseId: string) {
  const response = await apiFetch(`/api/cases/${caseId}/tally-posting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve_and_queue" }),
  });
  return readResponse(response, "Failed to queue the Purchase voucher.");
}

export async function queueTallyMasterRefresh(connectionId: string, companyName: string) {
  const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandType: "sync_masters",
      payload: {
        companyName,
        requestedMasterTypes: [
          "ledger",
          "group",
          "stock_item",
          "unit",
          "voucher_type",
          "gst_ledger",
          "tax_ledger",
        ],
      },
    }),
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : raw || "Failed to refresh Tally masters.");
  }
  return payload;
}

export async function waitForTallyCommand(
  connectionId: string,
  commandId: string,
  options?: { attempts?: number; intervalMs?: number }
) {
  const attempts = options?.attempts ?? 45;
  const intervalMs = options?.intervalMs ?? 2000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    const params = new URLSearchParams({ ids: commandId, limit: "1" });
    const response = await apiFetch(
      `/api/tally/connections/${connectionId}/commands?${params.toString()}`,
      { cache: "no-store" }
    );
    const raw = await response.text();
    let payload: { commands?: Array<{ id: string; status: string; error?: string | null }> } = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new Error(raw || "Failed to read Tally command status.");
    }
    const command = (payload.commands ?? []).find((item) => item.id === commandId);
    if (!command) continue;
    if (["succeeded", "failed", "canceled"].includes(command.status)) return command;
  }
  return null;
}
