import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  serializeCashDiscountRule,
  serializeDebitNoteProposal,
  toNumber,
  toText,
  type CashDiscountRuleRow,
  type DebitNoteProposalRow,
} from "@/lib/collections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TallyLedgerRow = {
  tally_name: string;
  parent_name: string | null;
  gstin: string | null;
  raw_payload: Record<string, unknown> | null;
};

type OpenBillRow = {
  kind?: string | null;
  ledgerName?: string | null;
  referenceName?: string | null;
  voucherNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  originalAmount?: number | string | null;
  pendingAmount?: number | string | null;
  sourceVoucherType?: string | null;
  status?: string | null;
};

type OpenBillBucket = {
  ledgerName?: string | null;
  openBills?: OpenBillRow[];
};

type TallyCommandRow = {
  id: string;
  connection_id: string;
  owner_user_id: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
};

function nullableText(value: unknown, maxLength = 500) {
  const text = toText(value, maxLength);
  return text || null;
}

function isMissingCollectionsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /cash_discount_rules|debit_note_proposals|collections_analysis_cache|relation .* does not exist|schema cache/i.test(message);
}

function normalizeLedgerName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function commandCompanyName(command: TallyCommandRow) {
  return nullableText(command.payload?.companyName, 240);
}

function commandScanId(command: TallyCommandRow) {
  return nullableText(command.payload?.scanId, 120);
}

function belongsToCompany(command: TallyCommandRow, companyName: string | null) {
  return normalizeLedgerName(commandCompanyName(command)) === normalizeLedgerName(companyName);
}

function isGenericTallyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return (
    !normalized ||
    normalized === "tally" ||
    normalized === "tally prime" ||
    /^tally(?: prime)?\s*[-–]\s*(?:current year|\d{4}[-–]\d{2})$/.test(normalized)
  );
}

function readRawText(raw: Record<string, unknown> | null | undefined, key: string, maxLength = 500) {
  return toText(raw?.[key], maxLength) || null;
}

function proposalWithLedgerSnapshot(proposal: DebitNoteProposalRow, ledger?: TallyLedgerRow) {
  if (!ledger) return proposal;
  const raw = ledger.raw_payload && typeof ledger.raw_payload === "object" ? ledger.raw_payload : {};
  const partyEmail = proposal.party_email ?? readRawText(raw, "email", 320);
  const partyPhone = proposal.party_phone ?? readRawText(raw, "phone", 80);
  const partyContactPerson = proposal.party_contact_person ?? readRawText(raw, "contactPerson", 240);
  const partyAddress = proposal.party_address ?? readRawText(raw, "address", 1000);
  const partyGstin = proposal.party_gstin ?? ledger.gstin;

  return {
    ...proposal,
    party_gstin: partyGstin,
    party_email: partyEmail,
    party_phone: partyPhone,
    party_contact_person: partyContactPerson,
    party_address: partyAddress,
    customer_snapshot: {
      ...(proposal.customer_snapshot ?? {}),
      ledgerName: ledger.tally_name,
      parentName: ledger.parent_name,
      gstin: partyGstin,
      email: partyEmail,
      phone: partyPhone,
      contactPerson: partyContactPerson,
      address: partyAddress,
    },
  };
}

function proposalIdentityKey(proposal: DebitNoteProposalRow) {
  return [
    normalizeLedgerName(proposal.company_name),
    normalizeLedgerName(proposal.party_ledger_name),
    normalizeLedgerName(proposal.linked_invoice_number),
    toNumber(proposal.recoverable_amount).toFixed(2),
  ].join("|");
}

function proposalRank(proposal: DebitNoteProposalRow) {
  const statusRank: Record<string, number> = {
    created_in_tally: 60,
    queued_in_tally: 50,
    approved: 40,
    pending_approval: 30,
    draft: 20,
    failed: 10,
  };

  const statusScore = statusRank[proposal.status] ?? 0;
  const updatedScore = Date.parse(String(proposal.updated_at ?? proposal.created_at ?? "")) || 0;
  return statusScore * 10_000_000_000_000 + updatedScore;
}

function dedupeDebitNoteProposals(proposals: DebitNoteProposalRow[]) {
  const bestByKey = new Map<string, DebitNoteProposalRow>();

  for (const proposal of proposals) {
    const key = proposalIdentityKey(proposal);
    const existing = bestByKey.get(key);
    if (!existing || proposalRank(proposal) > proposalRank(existing)) {
      bestByKey.set(key, proposal);
    }
  }

  return Array.from(bestByKey.values()).sort((left, right) => proposalRank(right) - proposalRank(left));
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function isAfterDate(left: string, right: string) {
  return Date.parse(`${left}T00:00:00.000Z`) > Date.parse(`${right}T00:00:00.000Z`);
}

function moneyClose(left: number, right: number) {
  return Math.abs(left - right) <= 1;
}

function serializeTallyCandidate(params: {
  bill: OpenBillRow;
  ledgerName: string;
  ledger?: TallyLedgerRow;
  rule?: CashDiscountRuleRow;
  companyName: string | null;
  connectionId: string;
  financialYear: string | null;
  today: string;
  issueType?: string;
  expectedDiscount?: number;
  canCreateDebitNote?: boolean;
}) {
  const originalAmount = toNumber(params.bill.originalAmount);
  const pendingAmount = toNumber(params.bill.pendingAmount);
  const invoiceDate = String(params.bill.invoiceDate ?? "").slice(0, 10);
  const eligibilityDays = Math.trunc(toNumber(params.rule?.eligibility_days, 15));
  const discountDeadline = invoiceDate ? addDays(invoiceDate, eligibilityDays) : null;
  const referenceName = toText(params.bill.referenceName ?? params.bill.voucherNumber, 240);
  const ruleName = params.rule?.rule_name ?? "Standard 2% within 15 days";
  const raw = params.ledger?.raw_payload && typeof params.ledger.raw_payload === "object" ? params.ledger.raw_payload : {};
  const partyEmail = readRawText(raw, "email", 320);
  const partyPhone = readRawText(raw, "phone", 80);
  const partyContactPerson = readRawText(raw, "contactPerson", 240);
  const partyAddress = readRawText(raw, "address", 1000);
  const amountReceived = originalAmount > 0 ? Math.max(originalAmount - pendingAmount, 0) : null;
  const issueType = params.issueType ?? "discount_shortfall";
  const expectedDiscount =
    params.expectedDiscount ?? Math.round((originalAmount * toNumber(params.rule?.discount_value, 2)) / 100);
  const canCreateDebitNote = params.canCreateDebitNote ?? true;

  return {
    id: `tally:${Buffer.from(`${params.ledgerName}|${referenceName}|${pendingAmount.toFixed(2)}`).toString("base64url")}`,
    connectionId: params.connectionId,
    companyName: params.companyName,
    financialYear: params.financialYear,
    sourceTransactionId: null,
    sourceKind: "tally_open_bill",
    issueType,
    expectedDiscount,
    canCreateDebitNote,
    partyLedgerName: params.ledgerName,
    partyGstin: params.ledger?.gstin ?? null,
    partyEmail,
    partyPhone,
    partyContactPerson,
    partyAddress,
    linkedInvoiceNumber: referenceName || params.bill.voucherNumber || null,
    linkedInvoiceDate: invoiceDate || null,
    originalInvoiceAmount: originalAmount || null,
    cashDiscountRuleId: params.rule?.id ?? null,
    cashDiscountRuleName: ruleName,
    discountDeadline,
    receiptDate: null,
    amountReceived,
    recoverableAmount: issueType === "discount_shortfall" ? pendingAmount : expectedDiscount,
    pendingAmount,
    reasonCode: "cash_discount_expired",
    narration: `Cash discount recovery against invoice ${referenceName || "-"}.`,
    gstMode: "finance_review",
    debitNoteDate: params.today,
    status: "pending_approval",
    approvalBy: null,
    approvedAt: null,
    tallyCommandId: null,
    tallyVoucherGuid: null,
    tallyVoucherId: null,
    tallyVoucherNumber: null,
    tallyVoucherDate: null,
    tallyOpenReferenceName: referenceName || null,
    remainingRecoverableAmount: pendingAmount,
    createdInTallyAt: null,
    lastSyncedFromTallyAt: null,
    communicationStatus: "not_sent",
    communicationChannel: null,
    communicationRecipient: null,
    communicationSentAt: null,
    customerSnapshot: {
      ledgerName: params.ledger?.tally_name ?? params.ledgerName,
      parentName: params.ledger?.parent_name ?? null,
      gstin: params.ledger?.gstin ?? null,
      email: partyEmail,
      phone: partyPhone,
      contactPerson: partyContactPerson,
      address: partyAddress,
    },
    tallyPdfReference: null,
    lastError: null,
    createdAt: params.today,
    updatedAt: params.today,
  };
}

function readTallyOpenBills(commandResult: Record<string, unknown> | null | undefined) {
  const result = commandResult?.result && typeof commandResult.result === "object"
    ? (commandResult.result as Record<string, unknown>)
    : commandResult;
  const byLedger = result?.byLedger && typeof result.byLedger === "object"
    ? (result.byLedger as Record<string, OpenBillBucket>)
    : {};

  return Object.entries(byLedger).flatMap(([ledgerName, bucket]) => {
    const openBills = Array.isArray(bucket?.openBills) ? bucket.openBills : [];
    return openBills.map((bill) => ({
      ledgerName: toText(bill.ledgerName ?? bucket?.ledgerName ?? ledgerName, 500),
      bill,
    }));
  });
}

function candidateKey(candidate: { partyLedgerName: string; linkedInvoiceNumber: string | null; recoverableAmount: number }) {
  return [
    normalizeLedgerName(candidate.partyLedgerName),
    normalizeLedgerName(candidate.linkedInvoiceNumber),
    toNumber(candidate.recoverableAmount).toFixed(2),
  ].join("|");
}

function debitNoteRowFromSucceededCommand(command: TallyCommandRow, connection: { last_company_name: string | null }) {
  const payload = command.payload ?? {};
  const result = command.result ?? {};
  const sourceProposal = payload.sourceProposal && typeof payload.sourceProposal === "object"
    ? (payload.sourceProposal as Record<string, unknown>)
    : {};
  const amount = toNumber(payload.amount);
  const voucherDate = nullableText(result.voucherDate, 20) ?? nullableText(payload.voucherDate, 20);
  const voucherNumber =
    nullableText(result.voucherNumber, 500) ??
    nullableText(payload.referenceNumber, 500) ??
    nullableText(result.voucherId, 500);

  if (!nullableText(payload.partyLedgerName, 500) || amount <= 0 || !voucherNumber) return null;

  return {
    owner_user_id: command.owner_user_id,
    connection_id: command.connection_id,
    company_name: nullableText(payload.companyName, 240) ?? connection.last_company_name,
    financial_year: nullableText(sourceProposal.financialYear, 20),
    source_transaction_id: null,
    party_ledger_name: nullableText(payload.partyLedgerName, 500) ?? "Unknown party",
    party_gstin: nullableText(payload.partyGstin, 32),
    party_email: nullableText(sourceProposal.partyEmail, 320),
    party_phone: nullableText(sourceProposal.partyPhone, 80),
    party_contact_person: nullableText(sourceProposal.partyContactPerson, 240),
    party_address: nullableText(sourceProposal.partyAddress, 1000),
    linked_invoice_number: nullableText(payload.linkedInvoiceNumber, 120) ?? nullableText(sourceProposal.linkedInvoiceNumber, 120),
    linked_invoice_date: nullableText(payload.linkedInvoiceDate, 20) ?? nullableText(sourceProposal.linkedInvoiceDate, 20),
    original_invoice_amount: toNumber(sourceProposal.originalInvoiceAmount) || null,
    cash_discount_rule_id: nullableText(sourceProposal.cashDiscountRuleId, 80),
    cash_discount_rule_name: nullableText(sourceProposal.cashDiscountRuleName, 160),
    discount_deadline: nullableText(sourceProposal.discountDeadline, 20),
    receipt_date: nullableText(sourceProposal.receiptDate, 20),
    amount_received: sourceProposal.amountReceived === null || sourceProposal.amountReceived === undefined
      ? null
      : toNumber(sourceProposal.amountReceived),
    recoverable_amount: amount,
    reason_code: nullableText(payload.reasonCode, 80) ?? "cash_discount_expired",
    narration: nullableText(payload.narration, 1000),
    gst_mode: nullableText(payload.gstMode, 80) ?? "finance_review",
    debit_note_date: voucherDate ?? new Date().toISOString().slice(0, 10),
    status: "created_in_tally",
    approval_by: command.owner_user_id,
    approved_at: command.created_at,
    tally_command_id: command.id,
    tally_voucher_guid: nullableText(result.voucherGuid, 500) ?? nullableText(result.guid, 500),
    tally_voucher_id: nullableText(result.voucherId, 500) ?? command.id,
    tally_voucher_number: voucherNumber,
    tally_voucher_date: voucherDate,
    tally_open_reference_name: nullableText(result.openReferenceName, 500) ?? nullableText(payload.referenceNumber, 500),
    remaining_recoverable_amount: amount,
    created_in_tally_at: command.completed_at ?? new Date().toISOString(),
    last_synced_from_tally_at: new Date().toISOString(),
    communication_status: "not_sent",
    customer_snapshot: sourceProposal.customerSnapshot && typeof sourceProposal.customerSnapshot === "object"
      ? sourceProposal.customerSnapshot
      : {},
    last_error: null,
  };
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const connectionId = url.searchParams.get("connectionId")?.trim();
    const requestedCompanyName = nullableText(url.searchParams.get("companyName"), 240);

    if (!connectionId) {
      return jsonWithCors(request, { error: "Tally company/connection is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id, display_name, last_company_name, status, last_heartbeat_at, last_tally_reachable, last_company_loaded")
      .eq("id", connectionId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) {
      return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    }

    const companyName = requestedCompanyName ?? (!isGenericTallyLabel(connection.last_company_name)
      ? connection.last_company_name
      : connection.display_name);
    // A connector ID is a pairing instance, not a company identity. The same
    // Tally company can be paired again many times, so collect every connector
    // that has ever synced the selected company rather than trusting the latest
    // heartbeat from the currently paired connector.
    const compatibleConnectionIds = new Set([connectionId]);
    const [
      { data: companyConnectionRows, error: companyConnectionError },
      { data: companySyncRows, error: companySyncError },
    ] = await Promise.all([
      supabase
        .from("tally_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("last_company_name", companyName)
        .limit(200),
      supabase
        .from("tally_master_sync_runs")
        .select("connection_id")
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .limit(500),
    ]);

    if (companyConnectionError) throw companyConnectionError;
    if (companySyncError) throw companySyncError;
    for (const row of companyConnectionRows ?? []) {
      if (row.id) compatibleConnectionIds.add(String(row.id));
    }
    for (const row of companySyncRows ?? []) {
      if (row.connection_id) compatibleConnectionIds.add(String(row.connection_id));
    }

    const connectionIds = Array.from(compatibleConnectionIds);
    const ruleConnectionFilter = [
      ...connectionIds.map((id) => `connection_id.eq.${id}`),
      "connection_id.is.null",
    ].join(",");

    const [
      { data: ruleRows, error: ruleError },
      { data: proposalRows, error: proposalError },
      { data: ledgerRows, error: ledgerError },
      { data: openBillCommandRows, error: openBillCommandError },
      { data: debitNoteCommandRows, error: debitNoteCommandError },
    ] = await Promise.all([
      supabase
        .from("cash_discount_rules")
        .select("*")
        .eq("owner_user_id", user.id)
        .or(ruleConnectionFilter)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("debit_note_proposals")
        .select("*")
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .eq("status", "created_in_tally")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("tally_masters")
        .select("tally_name, parent_name, gstin, raw_payload")
        .eq("owner_user_id", user.id)
        .eq("connection_id", connectionId)
        .eq("master_type", "ledger")
        .eq("is_active", true)
        .limit(5000),
      supabase
        .from("tally_bridge_commands")
        .select("id, connection_id, owner_user_id, payload, result, completed_at, created_at")
        .eq("owner_user_id", user.id)
        .eq("connection_id", connectionId)
        .eq("command_type", "fetch_customer_open_bills")
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(100),
      supabase
        .from("tally_bridge_commands")
        .select("id, connection_id, owner_user_id, payload, result, completed_at, created_at")
        .eq("owner_user_id", user.id)
        .in("connection_id", connectionIds)
        .eq("command_type", "create_debit_note")
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(50),
    ]);

    if (ruleError) throw ruleError;
    if (proposalError) throw proposalError;
    if (ledgerError) throw ledgerError;
    if (openBillCommandError) throw openBillCommandError;
    if (debitNoteCommandError) throw debitNoteCommandError;

    const companyProposalRows = ((proposalRows ?? []) as unknown as DebitNoteProposalRow[]).filter(
      (proposal) => normalizeLedgerName(proposal.company_name) === normalizeLedgerName(companyName)
    );
    let allProposalRows = companyProposalRows;
    const proposalCommandIds = new Set(allProposalRows.map((row) => row.tally_command_id).filter(Boolean));
    const missingCreatedRows = ((debitNoteCommandRows ?? []) as unknown as TallyCommandRow[])
      .filter((command) => belongsToCompany(command, companyName))
      .filter((command) => !proposalCommandIds.has(command.id))
      .map((command) => debitNoteRowFromSucceededCommand(command, { last_company_name: connection.last_company_name }))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (missingCreatedRows.length > 0) {
      const { data: insertedRows, error: insertMissingError } = await supabase
        .from("debit_note_proposals")
        .insert(missingCreatedRows)
        .select("*");
      if (insertMissingError) throw insertMissingError;
      allProposalRows = [...(insertedRows as unknown as DebitNoteProposalRow[]), ...allProposalRows];
    }

    const ledgerByName = new Map(
      ((ledgerRows ?? []) as unknown as TallyLedgerRow[]).map((ledger) => [normalizeLedgerName(ledger.tally_name), ledger])
    );
    const createdProposals = dedupeDebitNoteProposals(
      allProposalRows.map((proposal) =>
        proposalWithLedgerSnapshot(proposal, ledgerByName.get(normalizeLedgerName(proposal.party_ledger_name)))
      )
    );
    const rules = (ruleRows ?? []) as unknown as CashDiscountRuleRow[];
    const defaultRule = rules[0];
    const today = todayText();
    const actedKeys = new Set(
      createdProposals.map((proposal) =>
        candidateKey({
          partyLedgerName: proposal.party_ledger_name,
          linkedInvoiceNumber: proposal.linked_invoice_number,
          recoverableAmount: toNumber(proposal.recoverable_amount),
        })
      )
    );
    const companyOpenBillCommands = ((openBillCommandRows ?? []) as unknown as TallyCommandRow[]).filter((command) =>
      belongsToCompany(command, companyName)
    );
    // A refresh can be split into chunks, all marked with the same scanId. Use
    // only the newest complete refresh; never merge its results with a prior
    // scan or a different Tally company.
    const newestOpenBillCommand = companyOpenBillCommands[0] ?? null;
    const newestScanId = newestOpenBillCommand ? commandScanId(newestOpenBillCommand) : null;
    const latestOpenBillCommands = newestOpenBillCommand
      ? newestScanId
        ? companyOpenBillCommands.filter((command) => commandScanId(command) === newestScanId)
        : [newestOpenBillCommand]
      : [];
    const tallyOpenBills = latestOpenBillCommands.flatMap((row) =>
      readTallyOpenBills(row.result)
    );
    const seenBillKeys = new Set<string>();
    const tallyCandidates = tallyOpenBills
      .map(({ ledgerName, bill }) => {
        const billKey = `${normalizeLedgerName(ledgerName)}|${normalizeLedgerName(bill.referenceName)}|${normalizeLedgerName(bill.voucherNumber)}`;
        if (seenBillKeys.has(billKey)) return null;
        seenBillKeys.add(billKey);
        const originalAmount = toNumber(bill.originalAmount);
        const pendingAmount = toNumber(bill.pendingAmount);
        const discountValue = toNumber(defaultRule?.discount_value, 2);
        const expectedDiscount = Math.round((originalAmount * discountValue) / 100);
        const invoiceDate = String(bill.invoiceDate ?? "").slice(0, 10);
        const deadline = invoiceDate ? addDays(invoiceDate, Math.trunc(toNumber(defaultRule?.eligibility_days, 15))) : null;
        if (!ledgerName || bill.kind === "advance" || originalAmount <= 0 || pendingAmount <= 0) return null;
        if (!deadline || !isAfterDate(today, deadline)) return null;

        let issueType: "discount_shortfall" | "invoice_unpaid" | "partial_unpaid" | null = null;
        if (moneyClose(pendingAmount, expectedDiscount)) {
          issueType = "discount_shortfall";
        } else if (moneyClose(pendingAmount, originalAmount)) {
          issueType = "invoice_unpaid";
        } else if (pendingAmount > expectedDiscount && pendingAmount < originalAmount) {
          issueType = "partial_unpaid";
        }
        if (!issueType) return null;

        const candidate = serializeTallyCandidate({
          bill,
          ledgerName,
          ledger: ledgerByName.get(normalizeLedgerName(ledgerName)),
          rule: defaultRule,
          companyName,
          connectionId,
          financialYear: null,
          today,
          issueType,
          expectedDiscount,
          canCreateDebitNote: true,
        });
        return actedKeys.has(candidateKey(candidate)) ? null : candidate;
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

    const sortedTallyCandidates = [...tallyCandidates].sort((left, right) => {
      const leftDate = Date.parse(`${left.linkedInvoiceDate ?? ""}T00:00:00.000Z`) || 0;
      const rightDate = Date.parse(`${right.linkedInvoiceDate ?? ""}T00:00:00.000Z`) || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;
      return String(left.partyLedgerName).localeCompare(String(right.partyLedgerName));
    });

    const proposals = [...sortedTallyCandidates, ...createdProposals.map(serializeDebitNoteProposal)];
    const debitNoteCandidates = sortedTallyCandidates.filter((row) => row.issueType === "discount_shortfall");
    const unpaidInvoices = sortedTallyCandidates.filter((row) => row.issueType === "invoice_unpaid");
    const partialUnpaid = sortedTallyCandidates.filter((row) => row.issueType === "partial_unpaid");
    const recoverableAmount = debitNoteCandidates.reduce((sum, row) => sum + row.recoverableAmount, 0);
    const createdAmount = createdProposals.reduce((sum, row) => sum + toNumber(row.recoverable_amount), 0);

    return jsonWithCors(request, {
      setupRequired: false,
      company: {
        connectionId,
        companyName,
        status: connection.status,
        lastHeartbeatAt: connection.last_heartbeat_at,
        tallyReachable: connection.last_tally_reachable === true,
        companyLoaded: connection.last_company_loaded === true,
      },
      filters: {
        connectionId,
        compatibleConnectionIds: connectionIds,
      },
      kpis: {
        totalOutstanding: recoverableAmount,
        overdueOutstanding: null,
        dueThisWeek: null,
        cdAtRisk: null,
        cdExpired: debitNoteCandidates.length,
        lateShortPayments: debitNoteCandidates.length,
        debitNotesPendingApproval: debitNoteCandidates.length,
        unpaidInvoices: unpaidInvoices.length,
        partialUnpaidInvoices: partialUnpaid.length,
        needsAttention: tallyCandidates.length,
        createdDebitNotes: createdProposals.length,
        createdDebitNoteAmount: createdAmount,
      },
      tabs: {
        overduePayments: [],
        cashDiscountTracker: proposals,
        debitNoteQueue: proposals,
      },
      rules: rules.map(serializeCashDiscountRule),
      notes: [
        "Needs action is computed from the latest Tally open-bill scan.",
        "Created debit notes are kept as the Supabase audit trail after Tally confirms the action.",
      ],
    });
  } catch (error) {
    if (isMissingCollectionsTable(error)) {
      return jsonWithCors(request, {
        setupRequired: true,
        error: "Run the collections cash discount migration before opening this dashboard.",
        kpis: {},
        tabs: {
          overduePayments: [],
          cashDiscountTracker: [],
          debitNoteQueue: [],
        },
      });
    }

    console.error("Error in GET /api/collections/dashboard:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
