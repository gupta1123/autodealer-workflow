import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {requireDataset} from './dataset';
import {AccessError} from './server';
import {bankParsingPolicy} from '@/lib/processing/local-bank-parsing.mjs';

/** The initiating user authorizes the document; the paired owner identifies the
 * transport. Never substitute one for the other or return raw agent settings. */
export async function teamBankParsing(request:Request,connectionId:string,selection:Record<string,unknown>) {
 const scope=await requireDataset(request,connectionId,selection,'bank.prepare');
 const {data,error}=await createSupabaseAdminClient().from('tally_connections').select('*').eq('id',connectionId)
  .eq('installation_id',scope.connection.installation_id).eq('session_generation',scope.connection.session_generation)
  .is('revoked_at',null).maybeSingle();
 if(error)throw error;
 if(!data)throw new AccessError('The selected connector pairing changed.',409);
 const policy=bankParsingPolicy(data,{companyName:scope.link.company_name,year:scope.link.financial_year,ownerUserId:scope.connection.owner_user_id});
 if(policy.mode==='local_agent') {
  if(!policy.identity||policy.identity.organizationId!==scope.access.organizationId||policy.identity.companyGuid!==scope.link.company_guid)
   throw new AccessError('The paired agent does not match this organization and company.',409);
  // The agent policy normalizes short financial years (2026-27) for matching
  // against Tally's snapshot. Once verified, keep the persisted access-link
  // identity in the ticket because every live/queued authorization check is
  // bound to that exact dataset key.
  policy.identity.companyGuid=scope.link.company_guid;
  policy.identity.companyName=scope.link.company_name;
  policy.identity.financialYear=scope.link.financial_year;
 }
 return {scope,connection:data,policy};
}
