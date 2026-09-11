-- Run only against the disposable kalika_reminder_defaults_20260907 fixture.
begin;
insert into invoice_followup_pipelines(id,organization_id,company_id,connection_id,installation_id,session_generation,company_guid,company_name,financial_year,invoice_key,customer,invoice,invoice_date,recipient,plan_name,stages,created_by,mode)
values('11111111-1111-1111-1111-111111119901','org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ffffffff-ffff-ffff-ffff-fffffffff100','install-a',7,'guid-a','Company A','2026-27','test-once','Customer','Test','2026-09-07','919999999999','Once','[{"limit":1}]','11111111-1111-1111-1111-111111111111','once');
do $$ begin
 begin perform followup_queue_phone('33333333-3333-3333-3333-333333333333','org-a','11111111-1111-1111-1111-111111119901');raise exception 'Cross organization phone write accepted';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','followup_queue_phone(uuid,text,uuid)','EXECUTE') then raise exception 'Phone queue exposed';end if;
end $$;
-- One-time records must not conflict with a separately enrolled schedule.
insert into invoice_followup_pipelines(organization_id,company_id,connection_id,installation_id,session_generation,company_guid,company_name,financial_year,invoice_key,customer,invoice,invoice_date,recipient,plan_name,stages,created_by,mode)
select organization_id,company_id,connection_id,installation_id,session_generation,company_guid,company_name,financial_year,invoice_key,customer,invoice,invoice_date,recipient,plan_name,stages,created_by,'pipeline' from invoice_followup_pipelines where id='11111111-1111-1111-1111-111111119901';
rollback;
