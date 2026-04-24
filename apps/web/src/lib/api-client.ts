"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const USE_CROSS_ORIGIN_API = API_BASE_URL.length > 0;

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

function getBrowserClient() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }

  return browserClient;
}

export function buildApiUrl(path: string) {
  if (!USE_CROSS_ORIGIN_API) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const supabase = getBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: USE_CROSS_ORIGIN_API ? "omit" : (init?.credentials ?? "same-origin"),
  });
}
