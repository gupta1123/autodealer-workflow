import { canAccess } from '@autodealer/shared/lib/access';
import { AccessError, requireAccessContext } from './server';

/** Apply the same predicate BEFORE pagination, counts, search and cursors. */
export async function listAccessPredicate(request: Request, legacyOwner: string, permission: string) {
  if (process.env.TEAM_ACCESS_ENFORCEMENT !== 'true') return `owner_user_id.eq.${JSON.stringify(legacyOwner)}`;
  const context = await requireAccessContext(request);
  if (!context.sharingEnabled) throw new AccessError('Organization access mapping is not activated.', 503);
  if (!canAccess(context, permission)) throw new AccessError('You do not have access to this module.');
  const org = JSON.stringify(context.organizationId);
  if (context.member.all_companies) return `and(access_organization_id.eq.${org},access_company_id.not.is.null)`;
  // Empty company scope is an empty result, never an omitted predicate.
  if (!context.member.company_ids.length) return 'id.is.null';
  const companies = context.member.company_ids.map(id => JSON.stringify(id)).join(',');
  return `and(access_organization_id.eq.${org},access_company_id.in.(${companies}))`;
}
