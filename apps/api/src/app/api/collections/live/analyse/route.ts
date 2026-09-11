import { withTeamAccess } from '@/lib/access/route-boundary';
import { readCompleteHistory } from '@/lib/collections-history';
import { followUpsDashboard } from '@/lib/access/followups-dashboard';
import {requireDataset} from '@/lib/access/dataset';
import {accessFailureResponse} from '@/lib/access/failures';
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

async function POSTHandler(request: Request) {
  const diagnosticStartedAt = performance.now();
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const connectionId = toText(body.connectionId, 80);
    const companyName = toText(body.companyName, 240);
    const scan = body.scan && typeof body.scan === "object" ? body.scan as Record<string, unknown> : {};
    const benchmarkDiagnostics = scan.benchmarkDiagnostics && typeof scan.benchmarkDiagnostics === "object"
      ? scan.benchmarkDiagnostics
      : null;
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
    const followUps = new URL(request.url).pathname === '/api/collections/follow-ups/analyse';
    const team=process.env.TEAM_ACCESS_ENFORCEMENT==='true'?await requireDataset(request,connectionId,{companyName,financialYear:body.financialYear||financialYear,companyGuid:body.companyGuid},followUps?'followups.prepare':'discounts.prepare'):null;
    let proposals=supabase.from('debit_note_proposals').select('*').eq('company_name',companyName).eq('status','created_in_tally')
      .order('created_at',{ascending:false}).order('id',{ascending:false});
    proposals=team?proposals.eq('access_organization_id',team.access.organizationId).eq('access_company_id',team.link.company_id):proposals.eq('owner_user_id',user.id);
    const databaseStartedAt = performance.now();
    const [{ data: connection, error: connectionError }, { data: proposalRows, error: proposalError }] = await Promise.all([
      team?Promise.resolve({data:team.connection,error:null}):supabase
        .from("tally_connections")
        .select("id, owner_user_id, status, last_company_name, last_heartbeat_at, last_tally_reachable, last_company_loaded")
        .eq("id", connectionId)
        .eq("owner_user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle(),
      followUps ? Promise.resolve({data: [], error: null}) : readCompleteHistory((from,to) => proposals.range(from,to)).then(data => ({data,error:null})),
    ]);
    const databaseMs = performance.now() - databaseStartedAt;
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
      ((proposalRows ?? []) as unknown as DebitNoteProposalRow[]).filter(proposal => !financialYear || !proposal.financial_year || proposal.financial_year === financialYear).map((proposal) =>
        proposalWithLedgerSnapshot(proposal, ledgerByName.get(normalizeLedgerName(proposal.party_ledger_name)))
      )
    );
    const analysisStartedAt = performance.now();
    const dashboard = analyseLiveCashDiscountSnapshot({
      connectionId,
      companyName,
      financialYear,
      openBillsResult,
      ledgers,
      createdProposals,
      connectionStatus: connection.status,
      lastHeartbeatAt: connection.last_heartbeat_at,
    });
    const analysisMs = performance.now() - analysisStartedAt;
    if (followUps) return jsonWithCors(request, followUpsDashboard(dashboard));
    return jsonWithCors(request, {
      ...dashboard,
      scanSummary: scan.scanSummary ?? null,
      ...(benchmarkDiagnostics ? {
        benchmarkDiagnostics: {
          connector: benchmarkDiagnostics,
          api: {
            databaseMs: Number(databaseMs.toFixed(2)),
            analysisMs: Number(analysisMs.toFixed(2)),
            totalMs: Number((performance.now() - diagnosticStartedAt).toFixed(2)),
          },
        },
      } : {}),
    });
  } catch (error) {
    const failure=accessFailureResponse(request,error);if(failure)return failure;
    console.error("Error in POST /api/collections/live/analyse:", error);
    return jsonWithCors(request, {
      error: error instanceof Error ? error.message : "Could not analyse the live Tally data.",
    }, { status: 500 });
  }
}

export const POST = withTeamAccess(POSTHandler);
