// Hosted integration checks. All DDL, case edits and commands are rolled back.
// Run from repository root with DATABASE_URL and SUPABASE_CA_CERT (official CA file).
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Client}=require('pg');
async function connect(){
 const endpoint=new URL(process.env.DATABASE_URL);
 if(endpoint.hostname!=='db.ktpaupxmlbtpjgvigmpb.supabase.co'&&!(endpoint.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(endpoint.username)==='postgres.ktpaupxmlbtpjgvigmpb'))throw Error('This regression fixture is only for the Kalika project.');
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{ca:fs.readFileSync(process.env.SUPABASE_CA_CERT,'utf8'),rejectUnauthorized:true},connectionTimeoutMillis:15000,query_timeout:30000});
 await client.connect();return client;
}
const c=await connect(),org='9046f797-9f18-428f-ac1c-0e3427a3387e',aditya='16f5f272-c4d7-4e98-aace-4dc75feb1782',nilesh='233eaab3-b8c3-4839-aa0a-980832232d79';
const checks=[];const check=(name,ok)=>{assert(ok,name);checks.push(name);};
async function denied(name,sql,args,code){await c.query('savepoint denial');let error;try{await c.query(sql,args);}catch(e){error=e;}await c.query('rollback to savepoint denial');check(name,error?.code===code);}
try{
 await c.query('begin');await c.query("set local lock_timeout='3s';set local statement_timeout='20s'");
 const migration=fs.readFileSync('supabase/migrations/20261016131313_separate_purchase_approval_from_team_access.sql','utf8');
 const installed=(await c.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='access_organizations' and column_name='purchase_approval_required') as yes")).rows[0].yes;
 if(!installed)await c.query(migration.replace(/^begin;$/m,'').replace(/^commit;$/m,''));
 await c.query('update public.access_organizations set purchase_approval_required=true where id=$1',[org]);
 const fixture=(await c.query(`select p.*,s.organization_id,s.company_id,s.source_revision,a.name as company_name
 from public.purchase_invoice_tally_postings p join public.access_resource_scopes s on s.resource_type='case' and s.resource_id=p.case_id
 join public.access_companies a on a.id=s.company_id
 join public.tally_connections t on t.id=p.connection_id and t.revoked_at is null
 where s.organization_id=$1 and p.status in ('draft','correction_required','ready_for_approval','failed')
 and p.command_id is null and p.tally_created_at is null
 and s.company_id in (select unnest(company_ids) from public.access_members where user_id=$2 and organization_id=$1)
 and (select count(*) from public.access_company_links l where l.organization_id=$1 and l.company_id=s.company_id and l.connection_id=t.id and l.installation_id=t.installation_id)=1
 order by p.updated_at desc limit 1`,[org,aditya])).rows[0];
 if(!fixture)throw Error('No safe unposted fixture available');
 const {case_id:caseId}=fixture;
 await c.query('savepoint baseline');
 await c.query('delete from public.access_purchase_workflows where case_id=$1',[caseId]);
 const args={p_posting_id:fixture.id,p_connection_id:fixture.connection_id,p_master_sync_run_id:null,p_duplicate_key:crypto.randomUUID(),p_idempotency_key:crypto.randomUUID(),p_approved_payload_hash:'b'.repeat(64),p_revision:fixture.revision,p_tally_payload:{companyName:fixture.company_name,postingId:fixture.id,caseId,canonicalVersion:1}};
 const enqueue='select public.access_enqueue_purchase($1,$2,$3,$4,$5,$6,$7) as id';
 const values=[aditya,org,caseId,0,fixture.source_revision,'a'.repeat(64),args];
 await denied('approval-required organizations still require approval',enqueue,values,'55000');
 await c.query('update public.access_organizations set purchase_approval_required=false where id=$1',[org]);
 const snap=(await c.query('select public.access_snapshot($1,$2) as s',[aditya,org])).rows[0].s;
 check('team sharing remains on while approval is off',snap.sharingEnabled&&snap.purchaseApprovalRequired===false);
 await denied('Nilesh cannot queue a purchase in direct mode',enqueue,[nilesh,...values.slice(1)],'42501');
 await denied('stale saved inputs are rejected',enqueue,[...values.slice(0,4),fixture.source_revision-1,...values.slice(5)],'40001');
 await denied('other-company payload is rejected',enqueue,[...values.slice(0,6),{...args,p_tally_payload:{...args.p_tally_payload,companyName:'Unauthorized company'}}],'42501');
 await denied('old approval endpoint cannot submit in direct mode','select public.access_purchase_transition($1,$2,$3,\'submit\',0,$4,null,$5)',[aditya,org,caseId,'a'.repeat(64),fixture.source_revision],'55000');
 const command=(await c.query(enqueue,values)).rows[0].id;
 const state=(await c.query('select * from public.access_purchase_workflows where case_id=$1',[caseId])).rows[0];
 check('same user posts directly without submission or invented reviewer',state.direct_post&&state.approved_by===null&&state.submitted_by===null);
 const authority=(await c.query('select * from public.access_command_authority where command_id=$1',[command])).rows[0];
 check('command retains initiating user, company and posting permission',authority.initiating_user_id===aditya&&authority.company_id===fixture.company_id&&authority.permission==='purchases.post');
 check('double click reuses one command',(await c.query(enqueue,values)).rows[0].id===command);
 await denied('queued voucher prevents financial edits',"update public.purchase_invoice_tally_postings set review_patch=review_patch||'{\"directModeProbe\":true}'::jsonb where id=$1",[fixture.id],'55000');
 await c.query('savepoint revoked');
 await c.query("update public.access_members set status='suspended' where organization_id=$1 and user_id=$2",[org,aditya]);
 await denied('revoked permissions block dispatch','select public.access_dispatch_command($1)',[command],'42501');
 await c.query('rollback to savepoint revoked');
 await c.query("update public.tally_bridge_commands set status='claimed' where id=$1",[command]);
 check('direct command reaches posting through normal guarded dispatch',(await c.query('select state from public.access_purchase_workflows where case_id=$1',[caseId])).rows[0].state==='posting');
 await c.query('rollback to savepoint baseline');
 await c.query('update public.access_organizations set purchase_approval_required=false where id=$1',[org]);
 // Old awaiting-review records must become editable without a return action.
 await c.query(`insert into public.access_purchase_workflows(case_id,state,financial_digest,prepared_by,submitted_by)
 values($1,'awaiting_approval',$2,$3,$3) on conflict(case_id) do update set state='awaiting_approval',prepared_by=$3,submitted_by=$3`,[caseId,'a'.repeat(64),aditya]);
 await c.query("update public.purchase_invoice_tally_postings set review_patch=review_patch||'{\"directModeProbe\":true}'::jsonb where id=$1",[fixture.id]);
 check('previously submitted case is editable without return-for-correction',(await c.query('select state from public.access_purchase_workflows where case_id=$1',[caseId])).rows[0].state==='draft');
 for(const role of ['anon','authenticated']){
  check(role+' cannot execute queue RPC',(await c.query("select not has_function_privilege($1,'public.access_enqueue_purchase(uuid,text,uuid,bigint,bigint,text,jsonb)','execute') as safe",[role])).rows[0].safe);
 }
 const exposure=(await c.query('select public.access_data_api_exposure() as e')).rows[0].e;
 check('no application data API exposure introduced',exposure.relations.length===0&&exposure.routines.length===0);
 await c.query('rollback');
 console.log(JSON.stringify({passed:checks.length,checks,rolledBack:true,commandsCommitted:0}));
}catch(e){await c.query('rollback');console.log(JSON.stringify({message:e.message,code:e.code,passed:checks.length,rolledBack:true}));process.exitCode=1;}finally{await c.end();}
