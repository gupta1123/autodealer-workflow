import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PostingStatusPayload = {
  accountId?: string | null;
  references?: string[];
};

type PostedReferenceRow = {
  reference_number: string | null;
  tally_voucher_id: string | null;
  tally_posted_at: string | null;
};

type PostedTransactionReferenceRow = {
  reference_number: string | null;
  tally_voucher_id: string | null;
  tally_posted_at: string | null;
};

function normalizeReferenceNumber(value: unknown) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 3 ? normalized : null;
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PostingStatusPayload;
    const accountId = String(body.accountId ?? "").trim();
    const requestedReferences = Array.isArray(body.references) ? body.references : [];
    const referenceSet = new Set(
      requestedReferences
        .map((reference) => normalizeReferenceNumber(reference))
        .filter((reference): reference is string => Boolean(reference))
    );

    if (!accountId) {
      return jsonWithCors(request, { error: "Bank account is required." }, { status: 400 });
    }
    if (referenceSet.size === 0) {
      return jsonWithCors(request, { postedReferences: [] });
    }

    const supabase = createSupabaseAdminClient();
    const { data: account, error: accountError } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return jsonWithCors(request, { error: "Bank account not found." }, { status: 404 });
    }

    const [{ data: postedLogData, error: postedLogError }, { data: postedTransactionData, error: postedTransactionError }] =
      await Promise.all([
        supabase
          .from("bank_transaction_posting_log")
          .select("reference_number, tally_voucher_id, tally_posted_at")
          .eq("owner_user_id", user.id)
          .eq("bank_account_id", accountId)
          .eq("status", "posted"),
        supabase
          .from("bank_transactions")
          .select("reference_number, tally_voucher_id, tally_posted_at")
          .eq("owner_user_id", user.id)
          .eq("bank_account_id", accountId)
          .eq("tally_status", "posted"),
      ]);

    if (postedLogError) throw postedLogError;
    if (postedTransactionError) throw postedTransactionError;

    const postedByReference = new Map<
      string,
      { referenceNumber: string; tallyVoucherId: string | null; tallyPostedAt: string | null }
    >();

    function addPostedReference(row: PostedReferenceRow | PostedTransactionReferenceRow) {
      const keys = [
        normalizeReferenceNumber(row.reference_number),
        normalizeReferenceNumber(row.tally_voucher_id),
      ].filter((value): value is string => Boolean(value));
      for (const key of keys) {
        if (!referenceSet.has(key) || postedByReference.has(key)) continue;
        postedByReference.set(key, {
          referenceNumber: row.reference_number || row.tally_voucher_id || key,
          tallyVoucherId: row.tally_voucher_id,
          tallyPostedAt: row.tally_posted_at,
        });
      }
    }

    for (const row of (postedLogData ?? []) as unknown as PostedReferenceRow[]) {
      addPostedReference(row);
    }
    for (const row of (postedTransactionData ?? []) as unknown as PostedTransactionReferenceRow[]) {
      addPostedReference(row);
    }

    return jsonWithCors(request, {
      postedReferences: Array.from(postedByReference.values()),
    });
  } catch (error) {
    console.error("Error in POST /api/bank-statements/posting-status:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
