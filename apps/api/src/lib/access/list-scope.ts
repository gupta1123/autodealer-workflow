import { canAccess } from '@autodealer/shared/lib/access';
import { AccessError, requireAccessContext } from './server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Apply the same predicate BEFORE pagination, counts, search and cursors. */
export async function listAccessPredicate(request: Request, legacyOwner: string, permission: string) {
  // Preserve the legacy shared Cases workspace only before enforcement.
  // Once enabled, lists and detail routes must use the same reviewed company
  // mapping; organization membership alone must not expose other companies.
  if (process.env.TEAM_ACCESS_ENFORCEMENT !== 'true' && permission.startsWith('purchases.')) {
    const context = await requireAccessContext(request);
    if (!canAccess(context, permission)) throw new AccessError('You do not have access to this module.');
    const { data: members, error } = await createSupabaseAdminClient()
      .from('access_members')
      .select('user_id')
      .eq('organization_id', context.organizationId)
      .eq('status', 'active');
    if (error) throw error;
    const owners = (members ?? [])
      .map((member) => member.user_id)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);
    if (!owners.length) return 'id.is.null';
    return `owner_user_id.in.(${owners.map((owner) => JSON.stringify(owner)).join(',')})`;
  }

  if (process.env.TEAM_ACCESS_ENFORCEMENT !== 'true') return `owner_user_id.eq.${JSON.stringify(legacyOwner)}`;
  const context = await requireAccessContext(request);
  if (!canAccess(context, permission)) throw new AccessError('You do not have access to this module.');

  if (!context.sharingEnabled) throw new AccessError('Organization access mapping is not activated.', 503);
  const org = JSON.stringify(context.organizationId);
  // Existing unrestricted users may still read their own unclassified legacy
  // work while its company is reviewed. Restricted teammates never receive it.
  if (context.member.all_companies) return `or(and(access_organization_id.eq.${org},access_company_id.not.is.null),and(owner_user_id.eq.${JSON.stringify(legacyOwner)},access_organization_id.is.null,access_company_id.is.null))`;
  // Empty company scope is an empty result, never an omitted predicate.
  if (!context.member.company_ids.length) return 'id.is.null';
  const companies = context.member.company_ids.map(id => JSON.stringify(id)).join(',');
  return `and(access_organization_id.eq.${org},access_company_id.in.(${companies}))`;
}
