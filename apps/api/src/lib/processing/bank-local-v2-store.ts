import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectiveEnvelopeLedgerCount } from './bank-local-v2.mjs';

type Database = ReturnType<typeof createSupabaseAdminClient>;
type Envelope = { jobId: string; commandId: string; identity: Record<string, unknown>; sourceHash: string; contextHash: string;
  ledgerNames: string[]; vectorCandidates?: Array<Array<{ ledgerName?: string | null }>> };

// Only authenticated server routes/recovery code may construct this adapter.
// SQL functions, not preceding reads, decide ownership and terminal state.
export function localBankV2Store(db: Database) {
  const call = async (name: string, params: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, params);
    if (error) throw error;
    return data;
  };
  return {
    claim: (e: Envelope) => call('bank_local_v2_claim', { p_job_id: e.jobId, p_command_id: e.commandId,
      p_identity: e.identity, p_source_hash: e.sourceHash, p_context_hash: e.contextHash, p_ledger_count: effectiveEnvelopeLedgerCount(e) }),
    finalize: (e: Envelope, digest: string, prepared: unknown) => call('bank_local_v2_finalize', {
      p_job_id: e.jobId, p_identity: e.identity, p_digest: digest, p_prepared: prepared }),
    checkpoint: (e: Envelope, digest: string, prepared: unknown) => call('bank_local_v2_checkpoint', {
      p_job_id: e.jobId, p_identity: e.identity, p_digest: digest, p_prepared: prepared }),
    fail: (e: Envelope, code: string) => call('bank_local_v2_fail', { p_job_id: e.jobId, p_identity: e.identity, p_code: code }),
  };
}
