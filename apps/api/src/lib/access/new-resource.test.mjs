import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { canAccess } from '../../../../../packages/shared/src/lib/access.ts';
import { defaultCaseCompany } from './default-case-company.ts';

const compiled = ts.transpileModule(fs.readFileSync(new URL('./new-resource.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const companies = [{ id: 'kalika25', name: 'Kalika Steel Alloys Pvt Ltd - (25-26)' },
  { id: 'kalika26', name: 'Kalika Steel Alloys Pvt Ltd - (26-27)' }, { id: 'nyx', name: 'Solution Nyx - 2026-27' }];
class AccessError extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
function setup({ enabled = true, permitted = ['kalika25', 'kalika26'], all = false, permissions = ['purchases.view', 'purchases.prepare'], status = 'active' } = {}) {
  let reads = 0;
  const context = { organizationId: 'org', companies,
    member: { status, must_change_password: false, all_companies: all, company_ids: permitted, modules: ['purchases'] },
    role: { archived: false, permissions } };
  const exports = {};
  const imports = { '@autodealer/shared/lib/access': { canAccess }, './server': { AccessError, requireAccessContext: async () => { reads++; return context; } },
    './default-case-company': { defaultCaseCompany: allowed => defaultCaseCompany(allowed, new Date('2026-10-17T05:00:00Z')) } };
  vm.runInNewContext(compiled, { exports, require: name => imports[name], process: { env: { TEAM_ACCESS_ENFORCEMENT: enabled ? 'true' : 'false' } } });
  return { resolve: company => exports.newCaseResourceScope(new Request('http://localhost/api/cases'), company, 'purchases.prepare'), reads: () => reads };
}

test('new cases get a company scope without any browser company field', async () => {
  for (const options of [{}, { all: true }]) {
    const result = await setup(options).resolve(null);
    assert.equal(result.access_organization_id, 'org');
    assert.equal(result.access_company_id, 'kalika26');
  }
});

test('company limits and prepare permissions remain enforced', async () => {
  for (const options of [{ permitted: ['nyx'] }, { permitted: [] }, { permissions: ['purchases.view'] }, { status: 'suspended' }]) {
    await assert.rejects(setup(options).resolve(null), error => error.status === 403);
  }
  await assert.rejects(setup().resolve('nyx'), error => error.status === 403);
  assert.equal((await setup({ permitted: ['kalika25'] }).resolve(null)).access_company_id, 'kalika25');
});

test('explicit authorized selections remain compatible, and disabled enforcement retains legacy behavior', async () => {
  assert.equal((await setup().resolve('kalika25')).access_company_id, 'kalika25');
  const legacy = setup({ enabled: false });
  assert.equal(await legacy.resolve(null), null);
  assert.equal(legacy.reads(), 0);
});
