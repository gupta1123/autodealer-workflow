import {jsonWithCors,optionsWithCors} from '@/lib/api/cors';
import {withTeamAccess} from '@/lib/access/route-boundary';
import {AccessError} from '@/lib/access/server';
import {requireResourceAccess} from '@/lib/access/resources';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';

export function OPTIONS(request:Request){return optionsWithCors(request);}
async function POSTHandler(request:Request,context:{params:Promise<{id:string}>}) {
 try {
  if(process.env.TEAM_ACCESS_ENFORCEMENT!=='true')throw new AccessError('Scoped job notifications are not enabled.',404);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new AccessError('Job not found.',404);
  const body=await request.json();
  const db=createSupabaseAdminClient();
  const result=await db.from('bank_local_pipeline_runs')
   .select('job_id,import_id,owner_user_id,organization_id,identity,state,revision').eq('job_id',id).maybeSingle();
  if(result.error)throw new AccessError('Job status is unavailable.',503);
  const job=result.data;
  if(!job)throw new AccessError('Job not found.',404);
  const {access,scope}=await requireResourceAccess(request,'bank_import',job.import_id,'bank.view');
  if(job.organization_id!==access.organizationId||job.identity?.connectionId!==body.connectionId)throw new AccessError('Job not found.',404);
  // Match the recorded dataset, not whichever company is currently open on a
  // machine. Completed jobs remain readable after the connector goes offline.
  const link=await db.from('access_company_links').select('company_id').eq('organization_id',access.organizationId)
   .eq('connection_id',body.connectionId).eq('installation_id',job.identity.installationId)
   .eq('company_guid',job.identity.companyGuid).eq('financial_year',job.identity.financialYear).maybeSingle();
  if(link.error)throw new AccessError('Job routing is unavailable.',503);
  if(!link.data||link.data.company_id!==scope.company_id)throw new AccessError('Job dataset is outside your access.',404);
  return jsonWithCors(request,{jobId:job.job_id,importId:job.import_id,ownerUserId:job.owner_user_id,
   connectionId:body.connectionId,revision:Number(job.revision),state:job.state}, {headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return jsonWithCors(request,{error:error instanceof AccessError?error.message:'Job authorization failed.'},
  {status:error instanceof AccessError?error.status:503});}
}
export const POST=withTeamAccess(POSTHandler);
