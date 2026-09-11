// Actual concurrent PostgreSQL sessions. Never accepts a remote host/connection URL.
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const database = process.argv[2];
assert.match(database || '', /^bank_v2_[a-z0-9_]+$/);
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(statement, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject);
    child.on('exit', code => code && !allowFailure ? reject(new Error(`Disposable SQL failed: ${err}`)) : resolve({ code, out, err }));
    child.stdin.end(statement);
  });
}
async function create() {
  const owner = randomUUID(), connection = randomUUID(), job = randomUUID(), imp = randomUUID(), command = randomUUID();
  const identity = { organizationId: owner, ownerUserId: owner, connectionId: connection, installationId: 'concurrency-test', sessionGeneration: 1, companyGuid: 'test-company', companyName: 'Test Company', financialYear: '2026-2027' };
  const id = quote(JSON.stringify(identity)) + '::jsonb';
  await sql(`insert into auth.users values(${quote(owner)});
    insert into public.tally_connections values(${quote(connection)},${quote(owner)},${quote(owner)},'concurrency-test',1,null,'[{"guid":"test-company","companyName":"Test Company","financialYear":"2026-27"}]');
    select public.bank_local_v2_create(${quote(imp)},${quote(job)},${quote(command)},${id},
      '{"name":"test.pdf","size":100,"sha256":"${'a'.repeat(64)}"}',
      jsonb_build_object('tokenHash',repeat('b',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000),
      'http://localhost:3001/result','fixture-token');
    update public.tally_bridge_commands set status='claimed' where id=${quote(command)};`);
  return { owner, job, imp, command, id,
    claim: `select public.bank_local_v2_claim(${quote(job)},${quote(command)},${id},'${'a'.repeat(64)}','${'c'.repeat(64)}',2);` };
}
const prep = { account: {}, extractionIncomplete: false, metadata: {}, rows: Array.from({ length: 150 }, (_, i) => ({ transaction_date: '2026-09-01', description: `Fixture ${i+1}`, credit_amount: 10, debit_amount: 0, transaction_type: 'unknown', category: 'unknown' })) };
const digest = createHash('sha256').update(JSON.stringify(prep)).digest('hex');
for (const preferred of ['finalize','cancel']) {
  const f = await create();
  const claims = await Promise.all([sql(f.claim), sql(f.claim)]);
  const states = claims.map(r => JSON.parse(r.out.trim()).state).sort();
  assert.deepEqual(states, ['accepted','analyzing']);
  const finalize = `select public.bank_local_v2_finalize(${quote(f.job)},${f.id},${quote(digest)},${quote(JSON.stringify(prep))}::jsonb);`;
  const cancel = `select public.bank_local_v2_cancel(${quote(f.job)},${quote(f.owner)},${quote(f.owner)});`;
  const hold = query => `begin; select id from public.bank_statement_extraction_jobs where id=${quote(f.job)} for update; select pg_sleep(0.2); ${query} commit;`;
  const first = sql(hold(preferred === 'finalize' ? finalize : cancel), true);
  const second = sql(preferred === 'finalize' ? cancel : finalize, true);
  await Promise.all([first, second]);
  const state = JSON.parse((await sql(`select jsonb_build_object('state',r.state,'jobState',j.status,'rows',
    (select count(*) from public.bank_statement_import_preview_transactions where import_id=${quote(f.imp)}))
    from public.bank_local_pipeline_runs r join public.bank_statement_extraction_jobs j on j.id=r.job_id where r.job_id=${quote(f.job)};`)).out.trim());
  assert.ok(['completed','cancelled'].includes(state.state));
  assert.equal(state.rows, state.state === 'completed' ? 150 : 0);
  assert.equal(state.jobState, state.state === 'completed' ? 'succeeded' : 'cancelled');
  if (state.state === 'completed') assert.equal(JSON.parse((await sql(finalize)).out.trim()).state, 'completed');
  console.log(JSON.stringify({ test: 'claim-and-terminal-race', preferred, actualWinner: state.state, rows: state.rows, duplicateClaimRejected: true }));
}
