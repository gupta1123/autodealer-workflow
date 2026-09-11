import { withTeamAccess } from '@/lib/access/route-boundary';
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";

export function OPTIONS(request: Request) { return optionsWithCors(request); }

async function POSTHandler(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    return jsonWithCors(request, {
      error: "Ledger embeddings are generated inside the Local Agent and are never sent to a paid embedding service.",
      code: "LOCAL_AGENT_EMBEDDINGS_ONLY",
    }, { status: 410 });
  } catch (error) {
    console.error("Error in Local Agent embedding endpoint:", error);
    return jsonWithCors(request, { error: "Could not generate ledger embeddings." }, { status: 500 });
  }
}

export const POST = withTeamAccess(POSTHandler);
