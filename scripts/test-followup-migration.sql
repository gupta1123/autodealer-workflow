-- Disposable local database only. Fixture dependencies, never run hosted.
create table public.tally_connections(id uuid primary key, installation_id text,session_generation bigint,revoked_at timestamptz);
create function public.access_assert_permission(uuid,text,text,uuid) returns void language plpgsql as $$ begin
 if $1<>'00000000-0000-0000-0000-000000000001'::uuid then raise exception 'Forbidden';end if;
end $$;
\ir ../supabase/migrations/20260907073704_invoice_followup_pipelines.sql
insert into tally_connections values('00000000-0000-0000-0000-000000000002','test',1,null);
insert into invoice_followup_pipelines(id,organization_id,company_id,connection_id,installation_id,session_generation,company_guid,company_name,financial_year,invoice_key,customer,invoice,invoice_date,recipient,plan_name,stages,created_by,outstanding,next_due_at,verification_expires_at)
values('00000000-0000-0000-0000-000000000004','test','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','test',1,'guid','Test','2026-27','inv','Test','1','2026-09-07','919999999999','Test','[{"limit":1}]','00000000-0000-0000-0000-000000000001',100,now(),now()+interval '5 minutes');
do $$ declare a jsonb;begin
 begin perform followup_claim_send('00000000-0000-0000-0000-000000000004',1,'00000000-0000-0000-0000-000000000009','test','00000000-0000-0000-0000-000000000003','test',1);raise exception 'Unauthorized claim accepted';exception when raise_exception then if sqlerrm<>'Forbidden' then raise;end if;end;
 begin perform followup_claim_send('00000000-0000-0000-0000-000000000004',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','wrong',1);raise exception 'Wrong pairing accepted';exception when serialization_failure then null;end;
 a:=followup_claim_send('00000000-0000-0000-0000-000000000004',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1);
 begin perform followup_claim_send('00000000-0000-0000-0000-000000000004',1,'00000000-0000-0000-0000-000000000001','test','00000000-0000-0000-0000-000000000003','test',1);raise exception 'Duplicate claim accepted';exception when serialization_failure then null;end;
 perform followup_finish_send('00000000-0000-0000-0000-000000000004',(a->>'attempt_id')::uuid,'accepted','fixture',null,'{"status":"finished","stage_index":0,"stage_sent":1,"next_due_at":null}');
 perform followup_finish_send('00000000-0000-0000-0000-000000000004',(a->>'attempt_id')::uuid,'accepted','fixture',null,'{}');
 if (select stage_sent<>1 or status<>'finished' from invoice_followup_pipelines limit 1) then raise exception 'Finalization incorrect';end if;
 if has_table_privilege('authenticated','invoice_followup_pipelines','SELECT') then raise exception 'Client access leaked';end if;
 if exists(select from pg_class where relname in ('invoice_followup_pipelines','invoice_followup_attempts','followup_pipeline_templates') and not relrowsecurity) then raise exception 'RLS missing';end if;
end $$;
