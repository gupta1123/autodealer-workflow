import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import {
  MASTER_TYPES,
  serializeTallyMaster,
  type TallyMasterRow,
  type TallyMasterType,
} from "@/lib/tally/masters";

function parseMasterType(value: string | null): TallyMasterType | null {
  if (!value) return null;
  return MASTER_TYPES.includes(value as TallyMasterType) ? (value as TallyMasterType) : null;
}

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

const TALLY_MASTERS_PAGE_SIZE = 1000;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) {
      return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const url = new URL(request.url);
    const type = parseMasterType(url.searchParams.get("type"));
    const query = url.searchParams.get("q")?.trim() ?? "";
    const name = url.searchParams.get("name")?.trim() ?? "";
    const parent = url.searchParams.get("parent")?.trim() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 5000);

    const supabase = createSupabaseAdminClient();
    const { data: connection, error: connectionError } = await supabase
      .from("tally_connections")
      .select("id, owner_user_id")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    if (!connection) {
      return jsonWithCors(request, { error: "Tally connection not found" }, { status: 404 });
    }

    const masters: TallyMasterRow[] = [];
    for (let offset = 0; offset < limit; offset += TALLY_MASTERS_PAGE_SIZE) {
      const pageLimit = Math.min(TALLY_MASTERS_PAGE_SIZE, limit - offset);
      let builder = supabase
        .from("tally_masters")
        .select("*")
        .eq("connection_id", id)
        .eq("owner_user_id", user.id)
        .eq("is_active", true)
        .order("master_type", { ascending: true })
        .order("tally_name", { ascending: true })
        .range(offset, offset + pageLimit - 1);

      if (type) {
        builder = builder.eq("master_type", type);
      }

      if (parent) {
        builder = builder.ilike("parent_name", parent);
      }

      if (name) {
        builder = builder.ilike("tally_name", name);
      }

      if (query) {
        builder = builder.ilike("tally_name", `%${query}%`);
      }

      const { data, error } = await builder;
      if (error) {
        throw error;
      }

      masters.push(...((data ?? []) as unknown as TallyMasterRow[]));
      if ((data ?? []).length < pageLimit) break;
    }

    const { data: runData, error: runError } = await supabase
      .from("tally_master_sync_runs")
      .select("id, status, company_name, totals, error, completed_at")
      .eq("connection_id", id)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) {
      throw runError;
    }

    return jsonWithCors(request, {
      masters: masters.map(serializeTallyMaster),
      latestSync: runData ?? null,
    });
  } catch (error) {
    console.error("Error in GET /api/tally/connections/[id]/masters:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
