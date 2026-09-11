// Mechanical SQL bundle generator. Never connects to or modifies a database.
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../', import.meta.url);
const dir = new URL('supabase/migrations/', root);
const files = (await readdir(dir)).filter(name => /^\d+_team_access_.*\.sql$/.test(name)).sort();
if (files.length !== 21 || files[0] !== '20260904145334_team_access_foundation.sql' ||
    files.at(-1) !== '20260908190000_team_access_purchase_command_payload_durability.sql') {
  throw Error('Migration inventory changed; review the bundle manifest before regenerating.');
}
const sections = [];
for (const [index, name] of files.entries()) {
  const raw = await readFile(new URL(name, dir), 'utf8');
  const source = raw.replaceAll('\r\n', '\n');
  if ((source.match(/^begin;\s*$/gmi) || []).length !== 1 ||
      (source.match(/^commit;\s*$/gmi) || []).length !== 1) throw Error(`Unexpected transaction boundaries: ${name}`);
  const sql = source.replace(/^begin;\s*$/mi, '').replace(/^commit;\s*$/mi, '').trim();
  const hash = createHash('sha256').update(raw).digest('hex');
  sections.push(`-- SECTION ${index + 1}/${files.length}: ${name}\n-- Source SHA256: ${hash}\n${sql}`);
}
const bundle = `-- KALIKA TEAM & ACCESS: single-run bundle of 21 migrations.
-- TARGET ONLY: ktpaupxmlbtpjgvigmpb (Kalika). NEVER Gajkesari.
-- Run this entire file in the Kalika Supabase SQL Editor as database operator.
-- Existing Kalika application and bank-local-v2 prerequisites must be present.
-- Intended for a database with NONE of these Team & Access migrations applied.
-- Do NOT run the individual 21 files afterward. Keep this outside migrations/.
-- Originals preserved; only their transaction wrappers are replaced by one wrapper.
-- All statements roll back together if any statement fails. No automatic sharing activation.
-- Does not provision users or record Supabase CLI migration history.
-- Review project, back up first, and retain the complete success/error output.
begin;
set local lock_timeout='5s';
do $bundle_preflight$
begin
 if to_regclass('public.access_organizations') is not null then
  raise exception 'Team & Access already exists. Do not rerun this bundle; inspect migration state first.';
 end if;
end
$bundle_preflight$;

${sections.join('\n\n')}

commit;
-- Schema preparation complete. Review mappings/memberships before enabling enforcement/sharing.
`;
const output = new URL('supabase/manual/kalika-team-access-all-in-one.sql', root);
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== bundle) throw Error('Bundle differs from the current ordered source migrations.');
  console.log(`PASS: bundle matches all ${files.length} source migrations and their hashes; one transaction.`);
} else {
  await mkdir(new URL('supabase/manual/', root), {recursive: true});
  await writeFile(output, bundle, 'utf8');
  console.log(JSON.stringify({file: output.pathname, migrations: files.length, bytes: Buffer.byteLength(bundle), applied: false}));
}
