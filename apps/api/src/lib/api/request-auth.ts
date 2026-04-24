import { createClient, type User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function requireEnv(name: string, value?: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createTokenValidationClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function resolveUserFromBearer(request: Request): Promise<User | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const supabase = createTokenValidationClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  return user ?? null;
}

async function resolveUserFromCookies() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}

export async function requireRequestUser(request: Request) {
  const bearerUser = await resolveUserFromBearer(request);
  if (bearerUser) {
    return bearerUser;
  }

  return resolveUserFromCookies();
}
