import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processStorageCleanupQueue } from "@/lib/storage-assets";

const WORKER_SECRET = process.env.WORKER_SECRET || "";

// Drains storage_cleanup_queue for every owner. The worker calls this on a timer so
// files from recycle-bin purges (and teammates' deletions) are removed without
// waiting for someone to open the recycle bin.
export async function POST(request: Request) {
  if (!WORKER_SECRET || request.headers.get("x-worker-secret") !== WORKER_SECRET) {
    return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const result = await processStorageCleanupQueue(supabase, null, { limit: 100 });
    return jsonWithCors(request, {
      removed: result.removed.length,
      retained: result.retained.length,
      failed: result.failed.length,
    });
  } catch (error) {
    return jsonWithCors(
      request,
      { error: error instanceof Error ? error.message : "Storage cleanup failed." },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}
