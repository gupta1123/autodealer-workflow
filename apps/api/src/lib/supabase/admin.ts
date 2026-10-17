import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string, value?: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createSupabaseAdminClient(options?: {fetch?: typeof fetch}) {
  const supabaseUrl = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  );
  const serviceRoleKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return createClient(supabaseUrl, serviceRoleKey, {
    ...(options?.fetch ? {global: {fetch: options.fetch}} : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
