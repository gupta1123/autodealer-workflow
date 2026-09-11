import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { BANK_LOCAL_V2_CAPABILITY } from './bank-local-v2.mjs';
import { createBankV2Readiness } from './bank-local-v2-readiness.mjs';

const migrationReady = createBankV2Readiness({team:process.env.TEAM_ACCESS_ENFORCEMENT==='true'});
// Select BEFORE creation. The installed migration is the prerequisite, not an
// additional synthetic capabilities function that would require another migration.
export async function canStartBankLocalV2(_db: ReturnType<typeof createSupabaseAdminClient>, capabilities: unknown) {
  if (process.env.BANK_LOCAL_PIPELINE_V2 !== 'true' || !Array.isArray(capabilities) || !capabilities.includes(BANK_LOCAL_V2_CAPABILITY)) return false;
  return migrationReady(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY);
}
