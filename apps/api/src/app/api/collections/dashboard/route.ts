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

function isMissingCollectionsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return /cash_discount_rules|debit_note_proposals|collections_analysis_cache|relation .* does not exist|schema cache/i.test(message);
}

function normalizeLedgerName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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

    const companyName = connection.last_company_name || connection.display_name;
    const compatibleConnectionIds = new Set([connectionId]);

    if (connection.last_company_name) {
      const { data: companyConnectionRows, error: companyConnectionError } = await supabase
        .from("tally_connections")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("last_company_name", connection.last_company_name)
        .limit(50);

      if (companyConnectionError) throw companyConnectionError;
      for (const row of companyConnectionRows ?? []) {
        if (row.id) compatibleConnectionIds.add(String(row.id));
      }
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
        .in("connection_id", connectionIds)
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
    ]);

    if (ruleError) throw ruleError;
    if (proposalError) throw proposalError;
    if (ledgerError) throw ledgerError;

    const ledgerByName = new Map(
      ((ledgerRows ?? []) as unknown as TallyLedgerRow[]).map((ledger) => [normalizeLedgerName(ledger.tally_name), ledger])
    );
    const proposals = ((proposalRows ?? []) as unknown as DebitNoteProposalRow[]).map((proposal) =>
      proposalWithLedgerSnapshot(proposal, ledgerByName.get(normalizeLedgerName(proposal.party_ledger_name)))
    );
    const rules = (ruleRows ?? []) as unknown as CashDiscountRuleRow[];
    const openProposals = proposals.filter((proposal) =>
      ["draft", "pending_approval", "approved", "queued_in_tally", "failed"].includes(proposal.status)
    );
    const pendingApproval = proposals.filter((proposal) => ["draft", "pending_approval", "failed"].includes(proposal.status));
    const lateShortPayments = proposals.filter((proposal) =>
      proposal.reason_code === "cash_discount_expired" || proposal.reason_code === "late_short_payment"
    );
    const recoverableAmount = openProposals.reduce((sum, row) => sum + toNumber(row.recoverable_amount), 0);
    const createdProposals = proposals.filter((proposal) => proposal.status === "created_in_tally");
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
        cdExpired: lateShortPayments.length,
        lateShortPayments: lateShortPayments.length,
        debitNotesPendingApproval: pendingApproval.length,
        createdDebitNotes: createdProposals.length,
        createdDebitNoteAmount: createdAmount,
      },
      tabs: {
        overduePayments: [],
        cashDiscountTracker: proposals.map(serializeDebitNoteProposal),
        debitNoteQueue: proposals.map(serializeDebitNoteProposal),
      },
      rules: rules.map(serializeCashDiscountRule),
      notes: [
        "Collections uses Cash Discount rules and Tally-side debit-note proposals. Bank statement review is handled separately.",
        "Full automated proposal creation requires a Tally collection scan for invoices, bill references, and receipt allocations.",
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
