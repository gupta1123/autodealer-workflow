import { canAccess } from '@autodealer/shared/lib/access';
import { AccessError, requireAccessContext } from './server';
import { defaultCaseCompany } from './default-case-company';

export async function newCaseResourceScope(request: Request, company: unknown, permission: string) {
  if (process.env.TEAM_ACCESS_ENFORCEMENT !== 'true') return null;
  const context = await requireAccessContext(request);
  const permitted = context.companies.filter(candidate => canAccess(context, permission, candidate.id));
  if (!permitted.length) throw new AccessError('You do not have permission to create cases for any company.', 403);
  const companyId = typeof company === 'string' && company.trim() ? company.trim() : defaultCaseCompany(permitted);
  if (!companyId) {
    throw new AccessError('The Kalika Steel company for this case is unavailable or ambiguous. Ask your administrator to check your company access.', 403);
  }
  if (!permitted.some(candidate => candidate.id === companyId)) throw new AccessError('The selected company is outside your access.', 403);
  return { access_organization_id: context.organizationId, access_company_id: companyId };
}
