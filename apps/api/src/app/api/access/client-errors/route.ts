import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_CHARS = 32_000;

function clip(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : null;
}

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

// Any signed-in user can report a crash, whatever their permissions: the crash may be on any page.
export async function POST(request: Request) {
  const user = await requireRequestUser(request);
  if (!user) return jsonWithCors(request, { error: "Unauthorized." }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return jsonWithCors(request, { error: "Report is too large." }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    return jsonWithCors(request, { error: "Invalid report." }, { status: 400 });
  }

  const message = clip(body.message, 2_000);
  if (!message) return jsonWithCors(request, { error: "Invalid report." }, { status: 400 });

  const report = {
    user_id: user.id,
    boundary: body.boundary === "app" ? "app" : "page",
    error_name: clip(body.errorName, 200),
    message,
    stack: clip(body.stack, 8_000),
    digest: clip(body.digest, 200),
    path: clip(body.path, 500),
    user_agent: clip(request.headers.get("user-agent"), 500),
  };
  console.error(`[client-error] ${report.boundary} ${report.path ?? ""} ${report.error_name ?? "Error"}: ${message.slice(0, 500)}`);

  const { error } = await createSupabaseAdminClient().from("client_error_reports").insert(report);
  if (error) {
    console.warn(`[client-error] could not save report: ${error.message}`);
    return jsonWithCors(request, { saved: false });
  }
  return jsonWithCors(request, { saved: true });
}
