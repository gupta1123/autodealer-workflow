export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeApiTarget(value?: string | null) {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized?.replace(/\/api$/i, "") || null;
}

export function GET() {
  const configured = process.env.NEXT_PUBLIC_CASH_DISCOUNT_GATEWAY_URL?.trim();
  if (configured) return Response.json({ url: configured });
  const target =
    normalizeApiTarget(process.env.API_PROXY_TARGET) ||
    normalizeApiTarget(process.env.NEXT_PUBLIC_API_BASE_URL) ||
    normalizeApiTarget(process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL);

  if (!target) {
    return Response.json({ error: "The Cash Discount backend URL is not configured." }, { status: 500 });
  }

  const url = new URL(target);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.port = "3002";
    url.pathname = "/";
  } else {
    url.pathname = "/agent-live";
  }
  url.search = "";
  url.hash = "";

  return Response.json({ url: url.toString() });
}
