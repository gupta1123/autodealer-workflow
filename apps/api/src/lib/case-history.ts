import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Cases with purchase posting or approval history are never auto-purged and must
// not be re-analysed or re-decided, because that would rewrite what was posted.
export async function findHistoryProtectedCaseIds(supabase: AdminClient, caseIds: string[]) {
  const protectedIds = new Set<string>();
  if (caseIds.length === 0) return protectedIds;

  try {
    const [postings, workflows] = await Promise.all([
      supabase.from("purchase_invoice_tally_postings").select("case_id").in("case_id", caseIds),
      supabase
        .from("access_purchase_workflows")
        .select("case_id")
        .in("case_id", caseIds)
        .neq("state", "draft"),
    ]);
    // A table missing in an older schema just contributes nothing.
    for (const result of [postings, workflows]) {
      for (const row of result.data ?? []) {
        if (typeof row.case_id === "string") protectedIds.add(row.case_id);
      }
    }
  } catch (error) {
    console.error("Failed to look up purchase history for cases", error);
  }
  return protectedIds;
}

export async function caseHasPurchaseHistory(supabase: AdminClient, caseId: string) {
  return (await findHistoryProtectedCaseIds(supabase, [caseId])).has(caseId);
}
