// Explicit UI capabilities. Authorization still belongs to the API and database.
export function pagePermissions(path: string): string[] {
  const pathname = path.split('?')[0];
  if (pathname === '/') return ['purchases.view'];
  if (pathname === '/settings/team') return ['team.manage', 'roles.manage'];
  if (/^\/settings(?:\/|$)/.test(pathname)) return ['settings.manage'];
  // Every workflow can inspect its scoped connection; changes still need management access.
  if (/^\/tally-prime(?:\/|$)/.test(pathname)) return ['connections.manage', 'purchases.view', 'bank.view', 'discounts.view', 'followups.view'];
  if (/^\/workspace(?:\/|$)/.test(pathname)) return ['purchases.prepare'];
  if (/^\/cases(?:\/|$)/.test(pathname)) return ['purchases.view'];
  if (/^\/recycle-bin(?:\/|$)/.test(pathname)) return ['purchases.recycle'];
  if (/^\/bank-statements(?:\/|$)/.test(pathname)) return ['bank.view'];
  if (/^\/collections\/follow-ups(?:\/|$)/.test(pathname)) return ['followups.view'];
  if (/^\/collections(?:\/|$)/.test(pathname)) return ['discounts.view'];
  return [];
}

export function firstAccessiblePage(isAllowed: (permission: string) => boolean): string | null {
  return ['/', '/bank-statements', '/collections', '/collections/follow-ups', '/settings/team', '/settings', '/tally-prime?view=connection']
    .find(path => pagePermissions(path).some(isAllowed)) ?? null;
}
