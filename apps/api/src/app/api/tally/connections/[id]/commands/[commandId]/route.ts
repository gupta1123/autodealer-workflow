import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

// Fast status lookup for a known command. Ownership is enforced on the
// command row itself, avoiding the former connection read + command read.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; commandId: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });

    const { id, commandId } = await context.params;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_bridge_commands")
      .select("id, status, result, error, completed_at, updated_at")
      .eq("id", commandId)
      .eq("connection_id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return jsonWithCors(request, {
      command: data ? {
        id: data.id,
        status: data.status,
        result: data.result,
        error: data.error,
        completedAt: data.completed_at,
        updatedAt: data.updated_at,
      } : null,
    });
  } catch (error) {
    console.error("Error in GET /api/tally/connections/[id]/commands/[commandId]:", error);
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}
