import { withTeamAccess } from '@/lib/access/route-boundary';
import {readTeamCommands} from '@/lib/access/command-results';
import {accessFailureResponse} from '@/lib/access/failures';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

type PurchaseQueueRow = { id: string; status: string; claimed_at: string | null; invoice: string | null };

// Where a waiting Purchase post stands: the connector posts one purchase at a time per
// connection, oldest first. Read only after the caller is authorized for this command.
async function purchaseQueuePosition(connectionId: string, commandId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tally_bridge_commands")
    .select("id, status, claimed_at, invoice:payload->>supplierInvoiceNumber")
    .eq("connection_id", connectionId)
    .eq("command_type", "create_purchase_voucher")
    .in("status", ["queued", "claimed"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return null;
  const rows = (data ?? []) as unknown as PurchaseQueueRow[];
  const index = rows.findIndex((row) => row.id === commandId);
  if (index < 0) return null;
  const running = rows.find((row) => row.status === "claimed" && row.id !== commandId);
  return {
    position: index + 1,
    ahead: index,
    total: rows.length,
    runningInvoiceNumber: running?.invoice ?? null,
    startedAt: rows[index].status === "claimed" ? rows[index].claimed_at : null,
  };
}

async function withPurchaseQueue<T extends { status: string }>(connectionId: string, commandId: string, command: T, commandType: string | null | undefined) {
  if (commandType !== "create_purchase_voucher" || !["queued", "claimed"].includes(command.status)) return command;
  return { ...command, queue: await purchaseQueuePosition(connectionId, commandId) };
}

// Fast status lookup for a known command. Ownership is enforced on the
// command row itself, avoiding the former connection read + command read.
async function GETHandler(
  request: Request,
  context: { params: Promise<{ id: string; commandId: string }> }
) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });

    const { id, commandId } = await context.params;
    if(process.env.TEAM_ACCESS_ENFORCEMENT==='true') {
      const [command]=await readTeamCommands(request,id,[commandId],1);
      return jsonWithCors(request,{command:command?await withPurchaseQueue(id,commandId,{
        id:command.id,status:command.status,result:command.result,error:command.error,
        completedAt:command.completed_at,updatedAt:command.updated_at,compactProgress:command.compact_progress,
      },command.command_type):null});
    }
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tally_bridge_commands")
      .select("id, status, result, error, completed_at, updated_at, compact_progress, command_type")
      .eq("id", commandId)
      .eq("connection_id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return jsonWithCors(request, {
      command: data ? await withPurchaseQueue(id, commandId, {
        id: data.id,
        status: data.status,
        result: data.result,
        error: data.error,
        completedAt: data.completed_at,
        updatedAt: data.updated_at,
        compactProgress: data.compact_progress,
      }, data.command_type) : null,
    });
  } catch (error) {
    console.error("Error in GET /api/tally/connections/[id]/commands/[commandId]:", error);
    const accessFailure=accessFailureResponse(request,error);if(accessFailure)return accessFailure;
    return jsonWithCors(request, { error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withTeamAccess(GETHandler);
