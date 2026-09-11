// Disposable PostgreSQL only; two concurrent owner changes through real transactions.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const executable=process.env.TEST_PSQL||'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const database=process.argv[2];
if(!database?.startsWith('kalika_team_'))throw new Error('Use an explicitly named kalika_team_* disposable database.');
function sql(statement){return new Promise((resolve,reject)=>{
 const child=spawn(executable,['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',statement],{windowsHide:true});
 let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));
});}
const ownerA='11111111-1111-1111-1111-111111111111',ownerB='44444444-4444-4444-4444-444444444444';
const setup=await sql(`update access_members set is_owner=true,status='active' where organization_id='org-a' and user_id in ('${ownerA}','${ownerB}');`);
assert.equal(setup.code,0,setup.output);
function suspend(actor){return sql(`begin; select access_change('${actor}','org-a','member.update','${actor}',(select revision from access_members where organization_id='org-a' and user_id='${actor}'),jsonb_build_object('status','suspended')); select pg_sleep(0.2); commit;`);}
const result=await Promise.all([suspend(ownerA),suspend(ownerB)]);
assert.equal(result.filter(r=>r.code===0).length,1,JSON.stringify(result));
const remaining=await sql(`select count(*) from access_members where organization_id='org-a' and is_owner and status='active';`);
assert.equal(remaining.output.trim(),'1');
console.log('Concurrent last-owner protection passed: one change committed and one was rejected.');
