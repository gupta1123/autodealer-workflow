-- Kalika only. Prepared for manual application, NOT applied by the agent.
begin;
alter table public.invoice_followup_pipelines add column mode text not null default 'pipeline' check(mode in ('pipeline','once'));
drop index public.invoice_followup_one_unfinished;
create unique index invoice_followup_one_unfinished on public.invoice_followup_pipelines
 (organization_id,company_id,connection_id,installation_id,company_guid,financial_year,invoice_key)
 where mode='pipeline' and status not in ('settled','finished','stopped');
create function public.followup_queue_phone(p_actor uuid,p_org text,p_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.invoice_followup_pipelines;c public.tally_connections;b public.tally_bridge_commands;
begin
 perform 1 from public.access_organizations where id=p_org for update;
 select * into r from public.invoice_followup_pipelines where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'Reminder not found';end if;
 perform public.access_assert_permission(p_actor,p_org,'connections.manage',r.company_id);
 select * into c from public.tally_connections where id=r.connection_id for share;
 if not found or c.revoked_at is not null or c.installation_id is distinct from r.installation_id or c.session_generation is distinct from r.session_generation then raise exception 'Pairing changed';end if;
 perform 1 from public.access_company_links where organization_id=p_org and company_id=r.company_id and connection_id=c.id and installation_id=c.installation_id and company_guid=r.company_guid and financial_year=r.financial_year;
 if not found or r.recipient !~ '^91[0-9]{10}$' then raise exception 'Invalid company or phone';end if;
 select * into b from public.tally_bridge_commands where connection_id=c.id and payload->>'followupId'=r.id::text order by created_at desc limit 1;
 if found then return to_jsonb(b);end if;
 insert into public.tally_bridge_commands(connection_id,owner_user_id,organization_id,installation_id,session_generation,company_guid,financial_year,command_type,status,priority,payload,protocol_version,job_class,max_attempts,deadline_at)
 values(c.id,c.owner_user_id,p_org,c.installation_id,c.session_generation,r.company_guid,r.financial_year,'alter_ledger','queued',45,
 jsonb_build_object('followupId',r.id,'oldName',r.customer,'newName',r.customer,'phoneNumber',r.recipient,'companyName',r.company_name,'companyGuid',r.company_guid,'financialYear',r.financial_year),1,'tally_write',1,now()+interval '5 minutes') returning * into b;
 insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission) values(b.id,p_org,r.company_id,p_actor,'connections.manage');
 return to_jsonb(b);
end $$;
revoke all on function public.followup_queue_phone(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.followup_queue_phone(uuid,text,uuid) to service_role;
commit;
