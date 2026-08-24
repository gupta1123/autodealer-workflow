import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { dedupeDebitNoteProposals, normalizeLedgerName, proposalWithLedgerSnapshot } from "@/lib/collections-dashboard";
import {
  analyseLiveCashDiscountSnapshot,
  liveCashDiscountLedgerRow,
  type LiveCashDiscountLedger,
} from "@/lib/cash-discount-live-analysis";
import { toText, type DebitNoteProposalRow } from "@/lib/collections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeCompanyName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const connectionId = toText(body.connectionId, 80);
    const companyName = toText(body.companyName, 240);
    const scan = body.scan && typeof body.scan === "object" ? body.scan as Record<string, unknown> : {};
    const financialYear = toText(scan.financialYear, 20) || null;
    const openBillsResult = scan.openBillsResult && typeof scan.openBillsResult === "object"
      ? scan.openBillsResult as Record<string, unknown>
      : null;
    const ledgers = Array.isArray(scan.ledgers)
      ? (scan.ledgers as LiveCashDiscountLedger[]).map(liveCashDiscountLedgerRow).filter((row): row is NonNullable<typeof row> => Boolean(row))
      : [];
    if (!connectionId || !companyName || !openBillsResult) {
      return jsonWithCors(request, { error: "A live Tally company scan is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const [{ data: connection, error: connectionError }, { data: proposalRows, error: proposalError }] = await Promise.all([
      supabase
        .from("tally_connections")
        .select("id, owner_user_id, status, last_company_name, last_heartbeat_at, last_tally_reachable, last_company_loaded")
        .eq("id", connectionId)
        .eq("owner_user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle(),
      supabase
        .from("debit_note_proposals")
        .select("*")
        .eq("owner_user_id", user.id)
        .eq("company_name", companyName)
        .eq("status", "created_in_tally")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (connectionError) throw connectionError;
    if (proposalError) throw proposalError;
    if (!connection) return jsonWithCors(request, { error: "Tally connection not found." }, { status: 404 });
    if (
      connection.last_tally_reachable !== true ||
      connection.last_company_loaded !== true ||
      normalizeCompanyName(connection.last_company_name) !== normalizeCompanyName(companyName)
    ) {
      return jsonWithCors(request, {
        error: `Tally is currently open to ${connection.last_company_name || "another company"}. Refresh the connection before calculating Cash Discounts.`,
      }, { status: 409 });
    }

    const ledgerByName = new Map(ledgers.map((ledger) => [normalizeLedgerName(ledger.tally_name), ledger]));
    const createdProposals = dedupeDebitNoteProposals(
      ((proposalRows ?? []) as unknown as DebitNoteProposalRow[]).map((proposal) =>
        proposalWithLedgerSnapshot(proposal, ledgerByName.get(normalizeLedgerName(proposal.party_ledger_name)))
      )
    );
    return jsonWithCors(request, analyseLiveCashDiscountSnapshot({
      connectionId,
      companyName,
      financialYear,
      openBillsResult,
      ledgers,
      createdProposals,
      connectionStatus: connection.status,
      lastHeartbeatAt: connection.last_heartbeat_at,
    }));
  } catch (error) {
    console.error("Error in POST /api/collections/live/analyse:", error);
    return jsonWithCors(request, {
      error: error instanceof Error ? error.message : "Could not analyse the live Tally data.",
    }, { status: 500 });
  }
}
