// Read-only PostgREST schema discovery. Never probe readiness by creating a job.
// This module is server-only: callers supply server credentials, never a browser.
export const BANK_V2_FUNCTIONS = Object.freeze({
  create: ['p_import_id','p_job_id','p_command_id','p_identity','p_file','p_upload','p_result_url','p_result_token','p_global_limit'],
  claim: ['p_job_id','p_command_id','p_identity','p_source_hash','p_context_hash','p_ledger_count'],
  finalize: ['p_job_id','p_identity','p_digest','p_prepared'],
  cancel: ['p_job_id','p_owner_id','p_organization_id'],
  checkpoint: ['p_job_id','p_identity','p_digest','p_prepared'],
  fail: ['p_job_id','p_identity','p_code'],
  recover_next: [],
  status: ['p_command_id','p_owner_id','p_connection_id'],
});

export const BANK_TEAM_FUNCTIONS = Object.freeze({
  access_bank_local_create:['p_actor','p_org','p_company','p_import_id','p_job_id','p_command_id','p_identity','p_file','p_upload','p_result_url','p_result_token','p_global_limit'],
  access_cancel_bank_document:['p_actor','p_org','p_job'],
  access_assert_bank_document:['p_job'],
});
export function bankV2SchemaReady(schema, team=false) {
  if (!schema?.paths?.['/bank_local_pipeline_runs'] || !schema.paths['/bank_local_pipeline_checkpoints']) return false;
  if(team && !schema.paths['/access_bank_document_jobs']) return false;
  const functions={...Object.fromEntries(Object.entries(BANK_V2_FUNCTIONS).map(([name,args])=>[`bank_local_v2_${name}`,args])),...(team?BANK_TEAM_FUNCTIONS:{})};
  return Object.entries(functions).every(([name, args]) => {
    const operation = schema.paths[`/rpc/${name}`]?.post;
    if (!operation) return false;
    let body = operation.parameters?.find(p => p.in === 'body')?.schema;
    if (body?.$ref?.startsWith('#/definitions/')) body = schema.definitions?.[body.$ref.slice(14)];
    return args.every(arg => Object.hasOwn(body?.properties || {}, arg));
  });
}

export function createBankV2Readiness({fetchImpl = fetch, now = Date.now, team=false} = {}) {
  let lastUrl, lastKey, expires = 0, value = false, pending;
  return async (url, key) => {
    if (!url || !key) return false;
    if (url === lastUrl && key === lastKey) {
      if (pending) return pending;
      if (now() < expires) return value;
    }
    lastUrl = url; lastKey = key;
    const request = (async () => {
      try {
        const response = await fetchImpl(`${url.replace(/\/$/,'')}/rest/v1/`, {
          headers: {apikey:key, Authorization:`Bearer ${key}`, Accept:'application/openapi+json'},
          signal:AbortSignal.timeout(5000), cache:'no-store',
        });
        return response.ok && bankV2SchemaReady(await response.json(),team);
      } catch { return false; }
    })();
    pending = request;
    const ready = await request;
    if (pending === request) { value = ready; expires = now() + (ready ? 300000 : 10000); pending = undefined; }
    return ready;
  };
}
