import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=new URL('./provision-team-user.mjs',import.meta.url);
const env={...process.env,TEAM_ACCESS_ENFORCEMENT:'false',SUPABASE_URL:'https://ktpaupxmlbtpjgvigmpb.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-real-key'};
const args=['--org','fixture','--org-name','Fixture','--name','Fixture User','--email','fixture@example.test','--role','operator'];
function run(extra=[],override={}){return spawnSync(process.execPath,[script.pathname.replace(/^\/(?=[A-Za-z]:)/,'').replaceAll('%20',' '),...args,...extra],{encoding:'utf8',env:{...env,...override}});}
test('dry-run does not attempt network/account creation',()=>{const r=run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/dry-run/);assert.match(r.stdout,/"sendsInvitation":false/);assert.doesNotMatch(r.stdout,/synthetic-not/);});
test('rejects wrong project and passwords passed in arguments',()=>{assert.notEqual(run([],{SUPABASE_URL:'https://wrong.supabase.co'}).status,0);assert.notEqual(run(['--password','test']).status,0);});
test('hosted execution requires explicit enforcement configuration',()=>{const r=run(['--execute']);assert.notEqual(r.status,0);assert.match(r.stderr,/Hosted provisioning is blocked/);});
