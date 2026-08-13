import { createHash } from "node:crypto";

import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  getPurchaseAccountingSettingsOrDefaults,
  type PurchaseAccountingSettings,
} from "@/lib/purchase-accounting-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { suggestLedgerFromTallyCatalogue } from "@/lib/bank-statement-ledger-matching";
import {
  serializeTallyConnectionStatus,
  TALLY_CONNECTION_SELECT,
  type TallyConnectionRow,
} from "@/lib/tally/connections";
import {
  compactPurchasePostingReview,
  dedupeLedgerMasters,
  getCanonicalInvoiceDocuments,
  normalizePurchaseDuplicatePart,
  preparePurchasePosting,
  type PurchasePostingDocumentInput,
  type PurchasePostingMappingInput,
  type PurchasePostingMasterInput,
  type PurchasePostingReview,
} from "@/lib/tally/purchase-posting";

type PostingRow = {
  id: string;
  case_id: string;
  invoice_document_id: string | null;
  owner_user_id: string;
  connection_id: string | null;
  master_sync_run_id: string | null;
  command_id: string | null;
  status: string;
  revision: number;
  duplicate_key: string | null;
  idempotency_key: string | null;
  review_patch: Record<string, unknown>;
  approved_payload_hash: string | null;
  approved_at: string | null;
  queued_at: string | null;
  tally_voucher_number: string | null;
  tally_master_id: string | null;
  tally_guid: string | null;
  tally_created_at: string | null;
  verified_at: string | null;
  verification_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type LoadedContext = {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  caseRow: { id: string; status: string; owner_user_id: string };
  documents: PurchasePostingDocumentInput[];
  files: Array<{
    id: string;
    original_name: string;
    storage_bucket: string;
    storage_path: string;
  }>;
  connections: TallyConnectionRow[];
  connection: TallyConnectionRow | null;
  connectionStatus: ReturnType<typeof serializeTallyConnectionStatus> | null;
  liveCompanies: Array<{ companyName: string; isActive: boolean }>;
  selectedCompanyName: string | null;
  syncRun: {
    id: string;
    company_name: string | null;
    company_gstin: string | null;
    company_state_code: string | null;
    totals: Record<string, unknown>;
    completed_at: string;
  } | null;
  masters: PurchasePostingMasterInput[];
  mappings: PurchasePostingMappingInput[];
  posting: PostingRow | null;
  sourceFileId: string | null;
  sourceDocumentReference: string | null;
  purchaseAccountingSettings: PurchaseAccountingSettings;
};

const MASTER_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isPostingLocked(status: string | null | undefined) {
  return ["approved", "queued", "creating", "created", "verification_required"].includes(status ?? "");
}

function isFreshTimestamp(value: string | null | undefined, maxAgeMs: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
}

function hasCompleteMasterSnapshot(context: Pick<LoadedContext, "syncRun" | "masters">) {
  if (!context.syncRun) return false;
  const totals = context.syncRun.totals ?? {};
  const reportedTypes = [
    "ledger",
    "group",
    "stock_item",
    "unit",
    "voucher_type",
    "gst_ledger",
    "tax_ledger",
  ];
  return (
    reportedTypes.every((type) => Object.prototype.hasOwnProperty.call(totals, type)) &&
    context.masters.some((master) => master.master_type === "ledger")
  );
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const record = error as Record<string, unknown>;
  return [record.message, record.details, record.hint, record.error]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ") || JSON.stringify(error);
}

function isPurchasePostingSchemaMissing(error: unknown) {
  const message = serializeError(error);
  return /purchase_invoice_tally_postings|company_gstin|company_name.*tally_masters|schema cache|does not exist/i.test(message);
}

function normalizeFileName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

function normalizeCompanyName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function liveCompaniesFromHeartbeat(
  payload: Record<string, unknown> | null | undefined,
  activeCompanyName: string | null
) {
  if (!payload || typeof payload !== "object") return [];
  const values = Array.isArray(payload.companies)
    ? payload.companies
    : Array.isArray(payload.availableCompanies)
      ? payload.availableCompanies
      : [];
  const seen = new Set<string>();
  const companies: Array<{ companyName: string; isActive: boolean }> = [];
  for (const value of values) {
    const row =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
    const rawName = row ? row.companyName ?? row.name : value;
    if (typeof rawName !== "string" || !rawName.trim()) continue;
    const companyName = rawName.trim();
    const key = normalizeCompanyName(companyName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    companies.push({
      companyName,
      isActive:
        Boolean(activeCompanyName) &&
        key === normalizeCompanyName(activeCompanyName),
    });
  }
  if (activeCompanyName?.trim()) {
    const key = normalizeCompanyName(activeCompanyName);
    if (key && !seen.has(key)) {
      companies.unshift({ companyName: activeCompanyName.trim(), isActive: true });
    }
  }
  return companies;
}

function invoiceBuyerName(documents: PurchasePostingDocumentInput[]) {
  const invoice = getCanonicalInvoiceDocuments(documents)[0];
  if (
    !invoice?.extracted_fields ||
    typeof invoice.extracted_fields !== "object" ||
    Array.isArray(invoice.extracted_fields)
  ) {
    return "";
  }

  const buyerName = (invoice.extracted_fields as Record<string, unknown>)
    .buyerName;
  return typeof buyerName === "string" ? buyerName.trim() : "";
}

function preferredLiveConnection(
  connections: TallyConnectionRow[],
  buyerName: string
) {
  const normalizedBuyerName = normalizeCompanyName(buyerName);
  if (!normalizedBuyerName) return null;

  return (
    connections.find((candidate) => {
      const status = serializeTallyConnectionStatus(candidate);
      return (
        status.bridgeConnected &&
        status.tallyReachable &&
        status.companyLoaded &&
        normalizeCompanyName(status.lastCompanyName) === normalizedBuyerName
      );
    }) ?? null
  );
}

function getSourceFile(
  documents: PurchasePostingDocumentInput[],
  files: LoadedContext["files"]
) {
  const invoice = getCanonicalInvoiceDocuments(documents)[0];
  if (!invoice) return null;
  const sourceName = normalizeFileName(invoice.source_file_name);
  if (sourceName) {
    const exact = files.find((file) => normalizeFileName(file.original_name) === sourceName);
    if (exact) return exact;
    const partial = files.find((file) => {
      const fileName = normalizeFileName(file.original_name);
      return sourceName.includes(fileName) || fileName.includes(sourceName);
    });
    if (partial) return partial;
  }
  return files.length === 1 ? files[0] : null;
}

function duplicateKey(companyName: string, supplierGstin: string, invoiceNumber: string) {
  const raw = [companyName, supplierGstin, invoiceNumber]
    .map(normalizePurchaseDuplicatePart)
    .join(":");
  return createHash("sha256").update(raw.replace(/:+/g, ":")).digest("hex");
}

function idempotencyKey(caseId: string, revision: number, duplicate: string) {
  return createHash("sha256")
    .update(`purchase-voucher:${caseId}:${revision}:${duplicate}`)
    .digest("hex");
}

function asSavedReview(value: unknown): Partial<PurchasePostingReview> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const stringKeys = [
    "invoiceNumber",
    "invoiceDate",
    "voucherDate",
    "supplierName",
    "supplierGstin",
    "buyerName",
    "buyerGstin",
    "vehicleNumber",
    "invoiceTotal",
    "gstRate",
    "supplierLedgerName",
    "cgstLedgerName",
    "sgstLedgerName",
    "igstLedgerName",
    "freightAmount",
    "freightGstRate",
    "freightLedgerName",
    "tds194qLedgerName",
    "tds194qRate",
    "transportTdsLedgerName",
    "transportTdsRate",
    "cgstTdsLedgerName",
    "sgstTdsLedgerName",
    "igstTdsLedgerName",
    "gstTdsRate",
    "tdsLedgerName",
    "tdsRate",
    "tcsLedgerName",
    "tcsAmount",
    "roundOffLedgerName",
    "roundOffAmount",
    "narration",
  ] as const;
  for (const key of stringKeys) {
    if (typeof input[key] === "string") {
      output[key] = input[key].trim().slice(0, key === "narration" ? 2000 : 300);
    }
  }
  for (const key of ["tcsReceivable", "sourceReferenceApproved"] as const) {
    if (typeof input[key] === "boolean") output[key] = input[key];
  }
  if (Array.isArray(input.lines)) {
    const lineKeys = [
      "lineId",
      "description",
      "hsn",
      "quantity",
      "unit",
      "rate",
      "taxableAmount",
      "stockItemName",
      "purchaseLedgerName",
    ] as const;
    output.lines = input.lines.slice(0, 100).flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const record = candidate as Record<string, unknown>;
      if (typeof record.lineId !== "string" || !record.lineId.trim()) return [];
      const line: Record<string, string> = {};
      for (const key of lineKeys) {
        if (typeof record[key] === "string") {
          line[key] = record[key].trim().slice(0, key === "description" ? 500 : 300);
        }
      }
      return [line];
    });
  }
  return output as Partial<PurchasePostingReview>;
}

function serializePosting(
  row: PostingRow | null,
  prepared: Awaited<ReturnType<typeof prepareContext>>["prepared"],
  context: LoadedContext
) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    invoiceDocumentId: row.invoice_document_id,
    connectionId: row.connection_id,
    masterSyncRunId: row.master_sync_run_id,
    commandId: row.command_id,
    status: row.status,
    revision: row.revision,
    companyName: context.syncRun?.company_name ?? null,
    companyGstin: context.syncRun?.company_gstin ?? null,
    invoiceNumber: prepared.review?.invoiceNumber ?? null,
    supplierGstin: prepared.review?.supplierGstin ?? null,
    approvedAt: row.approved_at,
    queuedAt: row.queued_at,
    tallyVoucherNumber: row.tally_voucher_number,
    tallyMasterId: row.tally_master_id,
    tallyGuid: row.tally_guid,
    tallyCreatedAt: row.tally_created_at,
    verifiedAt: row.verified_at,
    verificationResult: row.verification_status
      ? { verificationStatus: row.verification_status }
      : {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function masterOption(master: PurchasePostingMasterInput) {
  return {
    id: master.id,
    type: master.master_type,
    key: master.master_key,
    name: master.tally_name,
    parent: master.parent_name,
    gstin: master.gstin,
    hsnCode: master.hsn_code,
    unitName: master.unit_name,
    taxRate: master.tax_rate,
  };
}

async function loadContext(
  caseId: string,
  ownerUserId: string,
  requestedConnectionId?: string | null,
  requestedCompanyName?: string | null
): Promise<LoadedContext> {
  const supabase = createSupabaseAdminClient();
  const { data: caseRow, error: caseError } = await supabase
    .from("packet_cases")
    .select("id, status, owner_user_id")
    .eq("id", caseId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!caseRow) throw new Error("CASE_NOT_FOUND");

  const purchaseAccountingSettings =
    await getPurchaseAccountingSettingsOrDefaults();

  const [documentsResult, filesResult, connectionsResult, postingResult] = await Promise.all([
    supabase
      .from("packet_documents")
      .select("id, document_type, source_file_name, source_hint, title, extracted_fields, markdown")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("packet_case_files")
      .select("id, original_name, storage_bucket, storage_path")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    supabase
      .from("tally_connections")
      .select(TALLY_CONNECTION_SELECT)
      .eq("owner_user_id", ownerUserId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("purchase_invoice_tally_postings")
      .select("*")
      .eq("case_id", caseId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle(),
  ]);

  if (documentsResult.error) throw documentsResult.error;
  if (filesResult.error) throw filesResult.error;
  if (connectionsResult.error) throw connectionsResult.error;
  if (postingResult.error) throw postingResult.error;

  const documents = (documentsResult.data ?? []) as PurchasePostingDocumentInput[];
  const files = filesResult.data ?? [];
  const allConnections = (connectionsResult.data ?? []) as unknown as TallyConnectionRow[];
  const connections = allConnections
    .filter((row) =>
      Boolean(row.bridge_token_hash) &&
      Boolean(row.installation_id) &&
      Boolean(row.paired_at) &&
      !row.revoked_at
    );
  const posting = postingResult.data as PostingRow | null;
  const lockedConnectionId = isPostingLocked(posting?.status) ? posting?.connection_id : null;
  const buyerMatchedConnection = preferredLiveConnection(
    connections,
    invoiceBuyerName(documents)
  );
  const selectedConnectionId =
    lockedConnectionId ||
    requestedConnectionId ||
    posting?.connection_id ||
    buyerMatchedConnection?.id ||
    (connections.length === 1 ? connections[0].id : null);
  const connection = selectedConnectionId
    ? allConnections.find((candidate) => candidate.id === selectedConnectionId) ?? null
    : null;
  if (selectedConnectionId && !connection) {
    throw new Error("TALLY_CONNECTION_NOT_FOUND");
  }
  const connectionStatus = connection ? serializeTallyConnectionStatus(connection) : null;
  let liveCompanies: Array<{ companyName: string; isActive: boolean }> = [];
  if (
    connection &&
    connectionStatus?.bridgeConnected &&
    connectionStatus.tallyReachable
  ) {
    const { data: heartbeat, error: heartbeatError } = await supabase
      .from("tally_connection_events")
      .select("created_at, payload")
      .eq("connection_id", connection.id)
      .eq("owner_user_id", ownerUserId)
      .eq("event_type", "bridge_heartbeat")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (heartbeatError) throw heartbeatError;
    if (
      heartbeat?.created_at &&
      isFreshTimestamp(heartbeat.created_at, 45_000)
    ) {
      liveCompanies = liveCompaniesFromHeartbeat(
        heartbeat.payload as Record<string, unknown> | null,
        connectionStatus.lastCompanyName
      );
    }
  }
  const requestedLiveCompany = liveCompanies.find(
    (company) =>
      normalizeCompanyName(company.companyName) ===
      normalizeCompanyName(requestedCompanyName)
  );
  const buyerLiveCompany = liveCompanies.find(
    (company) =>
      normalizeCompanyName(company.companyName) ===
      normalizeCompanyName(invoiceBuyerName(documents))
  );
  const selectedCompanyName =
    requestedLiveCompany?.companyName ??
    buyerLiveCompany?.companyName ??
    liveCompanies.find((company) => company.isActive)?.companyName ??
    null;
  const companyName = selectedCompanyName;

  let syncRun: LoadedContext["syncRun"] = null;
  let masters: PurchasePostingMasterInput[] = [];
  let mappings: PurchasePostingMappingInput[] = [];
  if (connection && companyName) {
    const [syncResult, mastersResult, mappingsResult] = await Promise.all([
      supabase
        .from("tally_master_sync_runs")
        .select("id, company_name, company_gstin, company_state_code, totals, completed_at")
        .eq("connection_id", connection.id)
        .ilike("company_name", companyName)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tally_masters")
        .select("id, master_type, master_key, tally_name, parent_name, gstin, hsn_code, unit_name, tax_rate, is_active")
        .eq("connection_id", connection.id)
        .ilike("company_name", companyName)
        .eq("is_active", true)
        .order("tally_name", { ascending: true }),
      supabase
        .from("tally_mapping_settings")
        .select("mapping_type, source_key, target_master_name, status")
        .eq("connection_id", connection.id)
        .ilike("company_name", companyName)
        .eq("status", "active"),
    ]);
    if (syncResult.error) throw syncResult.error;
    if (mastersResult.error) throw mastersResult.error;
    if (mappingsResult.error) throw mappingsResult.error;
    syncRun = syncResult.data;
    masters = (mastersResult.data ?? []) as PurchasePostingMasterInput[];
    mappings = (mappingsResult.data ?? []) as PurchasePostingMappingInput[];
  }

  const sourceFile = getSourceFile(documents, files);
  const webBase = String(
    process.env.WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const sourceDocumentReference = sourceFile
    ? `${webBase}/cases/${caseId}?sourceFileId=${encodeURIComponent(sourceFile.id)}`
    : null;

  return {
    supabase,
    caseRow,
    documents,
    files,
    connections,
    connection,
    connectionStatus,
    liveCompanies,
    selectedCompanyName,
    syncRun,
    masters,
    mappings,
    posting,
    sourceFileId: sourceFile?.id ?? null,
    sourceDocumentReference,
    purchaseAccountingSettings,
  };
}

async function hasDuplicateClaim(params: {
  context: LoadedContext;
  ownerUserId: string;
  duplicate: string | null;
}) {
  if (!params.duplicate) return false;
  const { data, error } = await params.context.supabase
    .from("purchase_invoice_tally_postings")
    .select("id")
    .eq("owner_user_id", params.ownerUserId)
    .eq("duplicate_key", params.duplicate)
    .in("status", ["approved", "queued", "creating", "created"])
    .neq("case_id", params.context.caseRow.id)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function prepareContext(context: LoadedContext, ownerUserId: string, savedReview?: Partial<PurchasePostingReview> | null) {
  const companyName = context.selectedCompanyName ?? "";
  const activeCompanyName = context.connectionStatus?.lastCompanyName ?? "";
  const companyGstin = context.syncRun?.company_gstin ?? "";
  const source = getCanonicalInvoiceDocuments(context.documents)[0];
  const sourceFields = source?.extracted_fields && typeof source.extracted_fields === "object"
    ? source.extracted_fields as Record<string, unknown>
    : {};
  const draftInvoice = String(savedReview?.invoiceNumber ?? sourceFields.invoiceNumber ?? "");
  const draftSupplier = String(savedReview?.supplierGstin ?? sourceFields.supplierGstin ?? "");
  const duplicate = companyGstin && draftInvoice && draftSupplier
    ? duplicateKey(companyGstin, draftSupplier, draftInvoice)
    : null;
  const duplicateExists = await hasDuplicateClaim({ context, ownerUserId, duplicate });
  const masterSnapshotComplete = hasCompleteMasterSnapshot(context);
  return {
    prepared: preparePurchasePosting({
      documents: context.documents,
      masters: context.masters,
      mappings: context.mappings,
      savedReview,
      caseStatus: context.caseRow.status,
      connectionReady: Boolean(
        context.connectionStatus?.bridgeConnected &&
        context.connectionStatus?.tallyReachable &&
        context.connectionStatus?.companyLoaded &&
        companyName &&
        normalizeCompanyName(companyName) ===
          normalizeCompanyName(activeCompanyName)
      ),
      masterDataReady: Boolean(
        context.syncRun?.id &&
        context.syncRun.company_name &&
        context.syncRun.company_name.trim().toLowerCase() === companyName.trim().toLowerCase() &&
        isFreshTimestamp(context.syncRun.completed_at, MASTER_SNAPSHOT_MAX_AGE_MS) &&
        masterSnapshotComplete
      ),
      companyName,
      companyGstin,
      sourceDocumentReference: context.sourceDocumentReference,
      duplicateExists,
      accountingSettings: context.purchaseAccountingSettings,
    }),
    duplicate,
  };
}

function responseBody(context: LoadedContext, prepared: Awaited<ReturnType<typeof prepareContext>>["prepared"]) {
  const connectionOptions = context.connection && context.connectionStatus
    ? context.liveCompanies.map((company) => {
    const status = context.connectionStatus!;
    return {
      id: `${context.connection!.id}::${encodeURIComponent(company.companyName)}`,
      connectionId: context.connection!.id,
      displayName: status.displayName,
      machineName: status.bridgeMachineName,
      status: status.status,
      companyName: company.companyName,
      isActive: company.isActive,
      bridgeConnected: status.bridgeConnected,
      tallyReachable: status.tallyReachable,
      companyLoaded: status.companyLoaded,
      heartbeatStale: status.heartbeatStale,
      connectorUpdateRequired: status.connectorUpdateRequired,
      lastHeartbeatAt: status.lastHeartbeatAt,
      lastError: status.lastError,
    };
  })
    : [];
  return {
    caseStatus: context.caseRow.status,
    posting: serializePosting(context.posting, prepared, context),
    eligibility: {
      eligible: prepared.eligible,
      canonicalInvoiceCount: prepared.canonicalInvoiceCount,
    },
    selectedConnectionId: context.connection?.id ?? null,
    selectedCompanyName: context.selectedCompanyName,
    connectionOptions,
    connection: context.connection && context.connectionStatus ? {
      id: context.connection.id,
      displayName: context.connectionStatus.displayName,
      machineName: context.connectionStatus.bridgeMachineName,
      status: context.connectionStatus.status,
      bridgeConnected: context.connectionStatus.bridgeConnected,
      heartbeatStale: context.connectionStatus.heartbeatStale,
      connectorUpdateRequired: context.connectionStatus.connectorUpdateRequired,
      lastError: context.connectionStatus.lastError,
      companyName: context.selectedCompanyName,
      activeCompanyName: context.connectionStatus.lastCompanyName,
      tallyReachable: context.connectionStatus.tallyReachable,
      companyLoaded: context.connectionStatus.companyLoaded,
      lastHeartbeatAt: context.connectionStatus.lastHeartbeatAt,
      masterSyncRunId: context.syncRun?.id ?? null,
      masterSyncedAt: context.syncRun?.completed_at ?? null,
      masterSnapshotFresh: isFreshTimestamp(
        context.syncRun?.completed_at,
        MASTER_SNAPSHOT_MAX_AGE_MS
      ),
      masterSnapshotComplete: hasCompleteMasterSnapshot(context),
      masterTotals: context.syncRun?.totals ?? {},
      companyGstin: context.syncRun?.company_gstin ?? null,
      companyStateCode: context.syncRun?.company_state_code ?? null,
    } : null,
    sourceFileId: context.sourceFileId,
    sourceDocumentReference: context.sourceDocumentReference,
    accountingSettings: context.purchaseAccountingSettings,
    source: prepared.source,
    review: prepared.review,
    calculation: prepared.calculation,
    blockers: prepared.blockers,
    warnings: prepared.warnings,
    tallyPayload: prepared.tallyPayload,
    readyForApproval: prepared.blockers.length === 0,
    masterOptions: {
      ledgers: dedupeLedgerMasters(context.masters).map(masterOption),
      stockItems: context.masters
        .filter((master) => master.master_type === "stock_item")
        .map(masterOption),
      units: context.masters
        .filter((master) => master.master_type === "unit")
        .map(masterOption),
    },
    events: [],
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request, contextParam: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const { id } = await contextParam.params;
    const searchParams = new URL(request.url).searchParams;
    const requestedConnectionId = searchParams.get("connectionId");
    const requestedCompanyName = searchParams.get("companyName");
    const context = await loadContext(
      id,
      user.id,
      requestedConnectionId,
      requestedCompanyName
    );
    const { prepared } = await prepareContext(context, user.id, asSavedReview(context.posting?.review_patch));
    return jsonWithCors(request, responseBody(context, prepared));
  } catch (error) {
    if (serializeError(error) === "CASE_NOT_FOUND") {
      return jsonWithCors(request, { error: "Case not found." }, { status: 404 });
    }
    if (serializeError(error) === "TALLY_CONNECTION_NOT_FOUND") {
      return jsonWithCors(request, { error: "The selected Tally connection is unavailable." }, { status: 409 });
    }
    if (isPurchasePostingSchemaMissing(error)) {
      return jsonWithCors(request, {
        error: "Purchase posting schema is not installed. Run supabase/migrations/202607270001_purchase_invoice_tally_posting.sql.",
        migrationRequired: true,
      }, { status: 409 });
    }
    console.error("Error in GET /api/cases/[id]/tally-posting:", error);
    return jsonWithCors(request, { error: serializeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, contextParam: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const { id } = await contextParam.params;
    const body = await request.json().catch(() => ({}));
    const requestedReview = asSavedReview(body.review);
    const requestedConnectionId =
      typeof body.connectionId === "string" && body.connectionId.trim()
        ? body.connectionId.trim()
        : null;
    const requestedCompanyName =
      typeof body.companyName === "string" && body.companyName.trim()
        ? body.companyName.trim()
        : null;
    if (!requestedReview) {
      return jsonWithCors(request, { error: "A Tally posting review is required." }, { status: 400 });
    }
    const context = await loadContext(
      id,
      user.id,
      requestedConnectionId,
      requestedCompanyName
    );
    if (context.posting && isPostingLocked(context.posting.status)) {
      return jsonWithCors(request, { error: "This approved or posted revision is locked." }, { status: 409 });
    }
    if (!context.connection) {
      return jsonWithCors(request, { error: "Select the exact Tally company before saving this review." }, { status: 409 });
    }
    const [{ prepared: defaults }, { prepared, duplicate }] = await Promise.all([
      prepareContext(context, user.id),
      prepareContext(context, user.id, requestedReview),
    ]);
    if (!prepared.source || !prepared.review) {
      return jsonWithCors(request, responseBody(context, prepared), { status: 409 });
    }

    const nextRevision = context.posting ? context.posting.revision + 1 : 1;
    const row = {
      case_id: id,
      invoice_document_id: prepared.source.documentId,
      owner_user_id: user.id,
      connection_id: context.connection?.id ?? null,
      master_sync_run_id: context.syncRun?.id ?? null,
      command_id: null,
      status: prepared.suggestedStatus,
      revision: nextRevision,
      duplicate_key: duplicate,
      idempotency_key: null,
      review_patch: compactPurchasePostingReview(defaults.review, prepared.review),
      approved_payload_hash: null,
      approved_at: null,
      queued_at: null,
      verification_status: null,
      last_error: null,
    };
    const result = context.posting
      ? await context.supabase
          .from("purchase_invoice_tally_postings")
          .update(row)
          .eq("id", context.posting.id)
          .eq("owner_user_id", user.id)
          .select("*")
          .single()
      : await context.supabase
          .from("purchase_invoice_tally_postings")
          .insert(row)
          .select("*")
          .single();
    if (result.error) throw result.error;
    const posting = result.data as PostingRow;
    const refreshed = await loadContext(
      id,
      user.id,
      posting.connection_id,
      context.selectedCompanyName
    );
    const { prepared: refreshedPrepared } = await prepareContext(refreshed, user.id, asSavedReview(posting.review_patch));
    return jsonWithCors(request, responseBody(refreshed, refreshedPrepared));
  } catch (error) {
    if (serializeError(error) === "TALLY_CONNECTION_NOT_FOUND") {
      return jsonWithCors(request, { error: "The selected Tally connection is unavailable." }, { status: 409 });
    }
    if (isPurchasePostingSchemaMissing(error)) {
      return jsonWithCors(request, {
        error: "Purchase posting schema is not installed. Run supabase/migrations/202607270001_purchase_invoice_tally_posting.sql.",
        migrationRequired: true,
      }, { status: 409 });
    }
    console.error("Error in PATCH /api/cases/[id]/tally-posting:", error);
    return jsonWithCors(request, { error: serializeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request, contextParam: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const { id } = await contextParam.params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "match_supplier_ledger") {
      const requestedConnectionId = typeof body.connectionId === "string" ? body.connectionId : null;
      const requestedCompanyName = typeof body.companyName === "string" ? body.companyName : null;
      const context = await loadContext(id, user.id, requestedConnectionId, requestedCompanyName);
      if (!context.connection || !context.syncRun || !hasCompleteMasterSnapshot(context)) {
        return jsonWithCors(request, { error: "Refresh the selected Tally company's masters before matching the supplier." }, { status: 409 });
      }

      const supplierName = String(body.supplierName ?? "").trim().slice(0, 300);
      const supplierGstin = String(body.supplierGstin ?? "").trim().toUpperCase().slice(0, 30);
      if (!supplierName && !supplierGstin) {
        return jsonWithCors(request, { error: "A supplier name or GSTIN is required for ledger matching." }, { status: 400 });
      }

      const ledgerMasters = dedupeLedgerMasters(context.masters);
      const exactGstinMatches = supplierGstin
        ? ledgerMasters.filter((master) => master.gstin?.trim().toUpperCase() === supplierGstin)
        : [];
      const normalizedSupplierName = supplierName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const exactNameMatches = normalizedSupplierName
        ? ledgerMasters.filter((master) =>
            master.tally_name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedSupplierName
          )
        : [];
      const deterministic = exactGstinMatches.length === 1
        ? exactGstinMatches[0]
        : exactNameMatches.length === 1
          ? exactNameMatches[0]
          : null;

      if (deterministic) {
        return jsonWithCors(request, {
          supplierLedgerMatch: {
            matchType: "direct_match",
            ledgerName: deterministic.tally_name,
            candidateLedgerNames: [],
            confidence: 1,
            reason: exactGstinMatches.length === 1
              ? "Unique GSTIN match in the selected Tally company."
              : "Exact supplier-name match in the selected Tally company.",
          },
        });
      }

      const suggestion = await suggestLedgerFromTallyCatalogue({
        ledgers: ledgerMasters.map((master) => ({
          id: master.id,
          name: master.tally_name,
          parent: master.parent_name,
        })),
        transaction: {
          description: `Purchase invoice supplier: ${supplierName || "Not available"}${supplierGstin ? `; GSTIN: ${supplierGstin}` : ""}`,
          category: "Purchase supplier",
          counterpartyName: supplierName || null,
          transactionType: "Purchase",
        },
      });
      return jsonWithCors(request, { supplierLedgerMatch: suggestion });
    }
    if (body.action !== "approve_and_queue") {
      return jsonWithCors(request, { error: "Unsupported Tally posting action." }, { status: 400 });
    }
    const initial = await loadContext(id, user.id);
    const context = initial.posting?.connection_id
      ? await loadContext(id, user.id, initial.posting.connection_id)
      : initial;
    if (!context.posting) {
      return jsonWithCors(request, { error: "Save the Tally review before approving it." }, { status: 409 });
    }
    if (["queued", "creating", "created"].includes(context.posting.status)) {
      const { prepared } = await prepareContext(context, user.id, asSavedReview(context.posting.review_patch));
      return jsonWithCors(request, responseBody(context, prepared));
    }
    if (
      context.posting.status === "verification_required" ||
      context.posting.tally_created_at
    ) {
      return jsonWithCors(request, {
        error: "Tally may already contain this voucher. Verify or correct the existing voucher before creating another command.",
      }, { status: 409 });
    }
    const { prepared, duplicate } = await prepareContext(context, user.id, asSavedReview(context.posting.review_patch));
    if (!prepared.source || !prepared.review || !prepared.tallyPayload) {
      return jsonWithCors(request, { error: "This case does not have one eligible invoice." }, { status: 409 });
    }
    if (prepared.blockers.length > 0) {
      return jsonWithCors(request, {
        error: "Resolve every Tally posting blocker before approval.",
        blockers: prepared.blockers,
      }, { status: 409 });
    }
    if (!context.connection || !duplicate) {
      return jsonWithCors(request, { error: "An active Tally company and invoice identity are required." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const idem = idempotencyKey(id, context.posting.revision, duplicate);
    const sourceFile = context.sourceFileId
      ? context.files.find((file) => file.id === context.sourceFileId) ?? null
      : null;
    let sourceDocument: {
      id: string;
      name: string;
      downloadUrl: string;
    } | null = null;
    if (sourceFile) {
      const signedUrlResult = await context.supabase.storage
        .from(sourceFile.storage_bucket)
        .createSignedUrl(sourceFile.storage_path, 7 * 24 * 60 * 60);
      if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
        throw signedUrlResult.error ?? new Error("Could not prepare the source invoice for Tally.");
      }
      sourceDocument = {
        id: sourceFile.id,
        name: sourceFile.original_name,
        downloadUrl: signedUrlResult.data.signedUrl,
      };
    }
    const frozenPayload = {
      ...prepared.tallyPayload,
      postingId: context.posting.id,
      caseId: id,
      sourceFileId: sourceFile?.id ?? null,
      sourceDocument,
      revision: context.posting.revision,
      idempotencyKey: idem,
      duplicateKey: duplicate,
      masterSyncRunId: context.syncRun?.id ?? null,
      approvedAt: now,
    };
    const approvedPayloadHash = createHash("sha256")
      .update(JSON.stringify(frozenPayload))
      .digest("hex");
    const commandResult = await context.supabase.rpc("queue_purchase_invoice_tally_posting", {
      p_posting_id: context.posting.id,
      p_owner_user_id: user.id,
      p_connection_id: context.connection.id,
      p_master_sync_run_id: context.syncRun?.id ?? null,
      p_duplicate_key: duplicate,
      p_idempotency_key: idem,
      p_approved_payload_hash: approvedPayloadHash,
      p_approved_at: now,
      p_tally_payload: frozenPayload,
      p_revision: context.posting.revision,
    });
    if (commandResult.error) {
      if (/duplicate|unique/i.test(serializeError(commandResult.error))) {
        return jsonWithCors(request, { error: "This supplier invoice is already claimed by another Tally posting." }, { status: 409 });
      }
      throw commandResult.error;
    }

    const commandId = String(commandResult.data);
    await context.supabase.from("tally_connection_events").insert({
      connection_id: context.connection.id,
      owner_user_id: user.id,
      event_type: "command_queued",
      message: "Purchase voucher creation queued from packet review.",
      payload: { commandType: "create_purchase_voucher", commandId, caseId: id, postingId: context.posting.id },
    });

    const refreshed = await loadContext(id, user.id, context.connection.id);
    const { prepared: refreshedPrepared } = await prepareContext(refreshed, user.id, asSavedReview(refreshed.posting?.review_patch));
    return jsonWithCors(request, responseBody(refreshed, refreshedPrepared));
  } catch (error) {
    if (serializeError(error) === "TALLY_CONNECTION_NOT_FOUND") {
      return jsonWithCors(request, { error: "The selected Tally connection is unavailable." }, { status: 409 });
    }
    if (isPurchasePostingSchemaMissing(error)) {
      return jsonWithCors(request, {
        error: "Purchase posting schema is not installed. Run supabase/migrations/202607270001_purchase_invoice_tally_posting.sql.",
        migrationRequired: true,
      }, { status: 409 });
    }
    console.error("Error in POST /api/cases/[id]/tally-posting:", error);
    return jsonWithCors(request, { error: serializeError(error) }, { status: 500 });
  }
}
