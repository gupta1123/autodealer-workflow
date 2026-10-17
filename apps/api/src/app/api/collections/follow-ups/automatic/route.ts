import { jsonWithCors } from '@/lib/api/cors';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashSecret } from '@/lib/tally/connections';

export const runtime = 'nodejs';

/** Retired background endpoint. Older gateways receive an empty work list;
 * neither existing settings nor a paired connector authorize sending. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = request.headers.get('x-bridge-token');
    if (!token || typeof body?.connectionId !== 'string') return jsonWithCors(request, {error:'Invalid connector pairing.'}, {status:401});
    const {data:connection,error} = await createSupabaseAdminClient().from('tally_connections')
      .select('bridge_token_hash').eq('id',body.connectionId).is('revoked_at',null).maybeSingle();
    if (error) return jsonWithCors(request, {error:'Connector authorization unavailable.'}, {status:503});
    if (!connection?.bridge_token_hash || hashSecret(token) !== connection.bridge_token_hash) return jsonWithCors(request, {error:'Invalid connector pairing.'}, {status:401});
    return jsonWithCors(request, {contexts:[],tasks:[],disabled:true,reason:'Reminders require an explicit user action in Payment Follow-ups.'});
  } catch {
    return jsonWithCors(request, {error:'Invalid reminder request.'}, {status:400});
  }
}
