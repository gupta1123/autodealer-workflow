-- Disposable local PostgreSQL only; never run this fixture on a hosted project.
create role anon;
create role authenticated;
create role service_role;
\ir test-followup-migration.sql
alter table invoice_followup_pipelines add column mode text not null default 'pipeline';
\ir ../supabase/migrations/20260909133000_followup_stable_installation_identity.sql
\ir ../supabase/migrations/20261012081410_rtgs_payment_followup_automation.sql
insert into invoice_followup_pipelines(id,organization_id,company_id,connection_id,installation_id,session_generation,company_guid,company_name,financial_year,invoice_key,customer,invoice,invoice_date,recipient,plan_name,stages,created_by,outstanding,next_due_at,verification_expires_at,automatic,payment_category)
values('00000000-0000-0000-0000-000000000014','test','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','test',1,'guid','Test','2026-27','rtgs','Customer','RTGS-1','2026-10-12','919999999999','Automatic','[{"limit":3}]','00000000-0000-0000-0000-000000000001',100,now(),now()+interval '5 minutes',true,'advance_rtgs');
do $$ declare a jsonb; begin
  begin
    insert into invoice_followup_pipelines select (jsonb_populate_record(null::invoice_followup_pipelines,to_jsonb(r)||'{"id":"00000000-0000-0000-0000-000000000015"}'::jsonb)).* from invoice_followup_pipelines r where id='00000000-0000-0000-0000-000000000014';
    raise exception 'Duplicate automatic enrollment accepted';
  exception when unique_violation then null; end;
  update invoice_followup_pipelines set status='paused' where id='00000000-0000-0000-0000-000000000014';
  begin perform followup_claim_send('00000000-0000-0000-0000-000000000014',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1); raise exception 'Paused automatic reminder accepted'; exception when serialization_failure then null; end;
  update invoice_followup_pipelines set status='active',verification_expires_at=now()-interval '1 minute' where id='00000000-0000-0000-0000-000000000014';
  begin perform followup_claim_send('00000000-0000-0000-0000-000000000014',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1); raise exception 'Stale automatic check accepted'; exception when serialization_failure then null; end;
  update invoice_followup_pipelines set verification_expires_at=now()+interval '5 minutes' where id='00000000-0000-0000-0000-000000000014';
  a:=followup_claim_send('00000000-0000-0000-0000-000000000014',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1);
  perform followup_finish_send('00000000-0000-0000-0000-000000000014',(a->>'attempt_id')::uuid,'uncertain',null,'Uncertain provider response',null);
  begin perform followup_claim_send('00000000-0000-0000-0000-000000000014',3,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1); raise exception 'Uncertain reminder retried'; exception when serialization_failure then null; end;
  update invoice_followup_pipelines set status='finished' where id='00000000-0000-0000-0000-000000000014';
  begin
    insert into invoice_followup_pipelines select (jsonb_populate_record(null::invoice_followup_pipelines,to_jsonb(r)||'{"id":"00000000-0000-0000-0000-000000000016","status":"active"}'::jsonb)).* from invoice_followup_pipelines r where id='00000000-0000-0000-0000-000000000014';
    raise exception 'Finished automatic sequence restarted';
  exception when unique_violation then null; end;
  if has_table_privilege('authenticated','invoice_followup_pipelines','SELECT') then raise exception 'Client access leaked';end if;
  if not exists(select from pg_class where relname='invoice_followup_pipelines' and relrowsecurity) then raise exception 'RLS missing';end if;
end $$;
