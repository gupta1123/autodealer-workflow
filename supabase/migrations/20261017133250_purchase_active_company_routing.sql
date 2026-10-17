begin;
-- Case classification and the currently open Tally dataset are separate.
-- Only verified representations of the SAME business on the SAME installation
-- may differ by year. Names alone never grant access or establish identity.
create or replace function public.access_purchase_posting_company(
 p_actor uuid,p_org text,p_case uuid,p_connection uuid,p_company_name text,p_permission text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.access_resource_scopes; c public.tally_connections; target_id uuid;
 source_name text; target_name text; target_guid text; matches integer;
begin
 if p_permission not in ('purchases.view','purchases.prepare','purchases.post') or p_permission is null then
  raise exception 'Unsupported purchase permission' using errcode='42501';end if;
 select * into s from public.access_resource_scopes where resource_type='case' and resource_id=p_case and organization_id=p_org;
 if not found or s.company_id is null then raise exception 'Purchase outside organization' using errcode='42501';end if;
 perform public.access_assert_permission(p_actor,p_org,p_permission,s.company_id);
 select * into c from public.tally_connections where id=p_connection and organization_id=p_org and revoked_at is null;
 if not found or c.installation_id is null then raise exception 'Purchase installation unavailable' using errcode='55000';end if;
 select count(*),min(a.id::text)::uuid,min(a.name),min(l.company_guid) into matches,target_id,target_name,target_guid
 from public.access_company_links l join public.access_companies a on a.organization_id=l.organization_id and a.id=l.company_id
 where l.organization_id=p_org and l.connection_id=c.id and l.installation_id=c.installation_id
  and lower(trim(a.name))=lower(trim(p_company_name));
 if matches<>1 then raise exception 'Select one verified purchase company' using errcode='42501';end if;
 perform public.access_assert_permission(p_actor,p_org,p_permission,target_id);
 if target_id<>s.company_id then
  select name into source_name from public.access_companies where organization_id=p_org and id=s.company_id;
  if nullif(trim(target_guid),'') is null or not exists(
   select 1 from public.access_company_links where organization_id=p_org and company_id=s.company_id
    and connection_id=c.id and installation_id=c.installation_id and company_guid=target_guid
  ) or regexp_replace(regexp_replace(lower(source_name), '\s*[-–—]?\s*\(?\s*(fy\s*)?([0-9]{4}|[0-9]{2})\s*[-–—]\s*([0-9]{4}|[0-9]{2})\s*\)?\s*$', ''), '[^a-z0-9]', '', 'g')
   is distinct from regexp_replace(regexp_replace(lower(target_name), '\s*[-–—]?\s*\(?\s*(fy\s*)?([0-9]{4}|[0-9]{2})\s*[-–—]\s*([0-9]{4}|[0-9]{2})\s*\)?\s*$', ''), '[^a-z0-9]', '', 'g') then
   raise exception 'The active Tally company is a different business from this case' using errcode='42501';
  end if;
 end if;
 return target_id;
end $$;
revoke all on function public.access_purchase_posting_company(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.access_purchase_posting_company(uuid,text,uuid,uuid,text,text) to service_role;

create or replace function public.access_enqueue_purchase(
 p_actor uuid,p_org text,p_case uuid,p_workflow_revision bigint,p_source_revision bigint,
 p_financial_digest text,p_args jsonb
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.access_resource_scopes; w public.access_purchase_workflows;
 p record; c record; link record; cid uuid; existing_authority public.access_command_authority; target_company uuid;
begin
 perform 1 from public.access_organizations where id=p_org for update;
 select * into s from public.access_resource_scopes where resource_type='case' and resource_id=p_case and organization_id=p_org for update;
 if not found then raise exception 'Purchase outside organization' using errcode='42501';end if;
 perform public.access_assert_permission(p_actor,p_org,'purchases.post',s.company_id);
 select * into w from public.access_purchase_workflows where case_id=p_case for update;
 -- Direct posting is a separate organization policy, never a bypass of team access.
 -- Freeze a dispatch checkpoint on the existing confirmation click. No reviewer,
 -- submission or approval is attributed to a user in this mode.
 if not (select purchase_approval_required from public.access_organizations where id=p_org) then
   if s.source_revision<>p_source_revision then raise exception 'Saved financial details changed' using errcode='40001';end if;
   if p_financial_digest is null or length(p_financial_digest)<>64 then raise exception 'Invalid financial digest' using errcode='22023';end if;
   select * into p from public.purchase_invoice_tally_postings where id=(p_args->>'p_posting_id')::uuid and case_id=p_case for update;
   if not found or p.connection_id is distinct from (p_args->>'p_connection_id')::uuid then raise exception 'Saved posting connection changed' using errcode='40001';end if;
   if p.command_id is not null then
     select * into existing_authority from public.access_command_authority where command_id=p.command_id and case_id=p_case and organization_id=p_org;
   end if;
   if existing_authority.command_id is null or existing_authority.state not in ('queued','issued','completed','uncertain') then
     if p.status in ('queued','creating','created','sending','verification_required') or w.state in ('posting','posted') then
       raise exception 'Verify the existing Tally posting before retrying' using errcode='55000';end if;
     insert into public.access_purchase_workflows(case_id,state,financial_digest,prepared_by,approved_by,approved_revision,approved_at,direct_post)
     values(p_case,'approved',p_financial_digest,p_actor,null,1,now(),true)
     on conflict(case_id) do update set state='approved',financial_digest=excluded.financial_digest,
       prepared_by=p_actor,submitted_by=null,submitted_at=null,approved_by=null,
       approved_revision=access_purchase_workflows.financial_revision,approved_at=now(),direct_post=true,
       revision=access_purchase_workflows.revision+1,updated_at=now()
     returning * into w;
   end if;
   p_workflow_revision:=w.revision;
 end if;
 if not found or w.state not in ('approved','posting','posted') then raise exception 'Purchase approval required' using errcode='55000';end if;
 if w.financial_digest is distinct from p_financial_digest or w.approved_revision is distinct from w.financial_revision or s.source_revision<>p_source_revision then
   raise exception 'Approved financial details changed' using errcode='40001';
 end if;
 select * into p from public.purchase_invoice_tally_postings where id=(p_args->>'p_posting_id')::uuid and case_id=p_case for update;
 if not found or p.connection_id is distinct from (p_args->>'p_connection_id')::uuid then raise exception 'Saved posting connection changed' using errcode='40001';end if;
 if p.command_id is not null then
   select * into existing_authority from public.access_command_authority where command_id=p.command_id and case_id=p_case and organization_id=p_org;
   if found and existing_authority.state in ('queued','issued','completed','uncertain') then return p.command_id;end if;
 end if;
 if w.state<>'approved' or w.revision<>p_workflow_revision then raise exception 'Purchase approval revision changed' using errcode='40001';end if;
 select * into c from public.tally_connections where id=p.connection_id and revoked_at is null for share;
 if not found or c.installation_id is null or c.session_generation is null then raise exception 'Connector unavailable' using errcode='55000';end if;
 target_company:=public.access_purchase_posting_company(p_actor,p_org,p_case,c.id,p_args->'p_tally_payload'->>'companyName','purchases.post');
 if coalesce(nullif(p.review_patch->>'postingCompanyId','')::uuid,s.company_id) is distinct from target_company then
  raise exception 'The Tally company changed. Save the purchase review again before posting' using errcode='55000';end if;
 if c.last_company_name is distinct from (p_args->'p_tally_payload'->>'companyName') then
  raise exception 'The active Tally company changed. Refresh the purchase review' using errcode='55000';end if;
 select * into link from public.access_company_links where organization_id=p_org and company_id=target_company and connection_id=c.id and installation_id=c.installation_id;
 -- The legacy atomic queue still enforces duplicate invoice and posting-revision rules.
 -- Its attribution owner is the saved posting owner, NOT the acting teammate.
 cid:=public.queue_purchase_invoice_tally_posting(p.id,p.owner_user_id,c.id,
   (p_args->>'p_master_sync_run_id')::uuid,p_args->>'p_duplicate_key',p_args->>'p_idempotency_key',
   p_args->>'p_approved_payload_hash',w.approved_at,p_args->'p_tally_payload',(p_args->>'p_revision')::integer);
 -- Paired connector identity is preserved separately from the initiating user.
 update public.tally_bridge_commands set owner_user_id=c.owner_user_id,organization_id=p_org,
   installation_id=c.installation_id,session_generation=c.session_generation,company_guid=link.company_guid,
   financial_year=link.financial_year,protocol_version=1,job_class='tally_write',max_attempts=1 where id=cid;
 insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission,case_id,approved_revision)
 values(cid,p_org,target_company,p_actor,'purchases.post',p_case,w.approved_revision);
 insert into public.access_audit(organization_id,actor_id,action,target_id,revision,details)
 values(p_org,p_actor,'purchase.queue',p_case::text,w.revision,jsonb_build_object('commandId',cid,'approvedRevision',w.approved_revision,'directPost',w.direct_post,'caseCompanyId',s.company_id,'postingCompanyId',target_company));
 return cid;
end $$;

create or replace function public.access_dispatch_command(p_command uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.access_command_authority; w public.access_purchase_workflows;
 org text; cmd record; connection record;
begin
 select organization_id into org from public.access_command_authority where command_id=p_command;
 if org is null then raise exception 'Command authority missing' using errcode='42501';end if;
 perform 1 from public.access_organizations where id=org for update;
 select * into c from public.access_command_authority where command_id=p_command for update;
 if c.state<>'queued' then raise exception 'Command already issued or terminal; verify before retrying' using errcode='55000';end if;
 perform public.access_assert_permission(c.initiating_user_id,c.organization_id,c.permission,c.company_id);
 select * into cmd from public.tally_bridge_commands where id=p_command;
 if not found then raise exception 'Command missing' using errcode='42501';end if;
 select * into connection from public.tally_connections where id=cmd.connection_id for share;
 if not found or connection.revoked_at is not null
  or cmd.organization_id is distinct from c.organization_id
  or cmd.owner_user_id is distinct from connection.owner_user_id
  or cmd.installation_id is null or cmd.session_generation is null
  or cmd.installation_id is distinct from connection.installation_id
  or cmd.session_generation is distinct from connection.session_generation then
   raise exception 'Command pairing identity changed' using errcode='42501';
 end if;
 -- A GUID/year is mandatory, even when a company name happens to be unique.
 perform 1 from public.access_company_links where organization_id=c.organization_id
  and company_id=c.company_id and connection_id=cmd.connection_id
  and installation_id=cmd.installation_id and company_guid=cmd.company_guid
  and financial_year=cmd.financial_year for share;
 if not found then raise exception 'Command company mapping changed' using errcode='42501';end if;
 if cmd.deadline_at is not null and cmd.deadline_at<now() then
  raise exception 'Command expired' using errcode='55000';end if;
 if c.case_id is not null then
  select * into w from public.access_purchase_workflows where case_id=c.case_id for update;
  if not found or w.state<>'approved' or w.approved_revision is distinct from c.approved_revision
   or w.financial_revision is distinct from c.approved_revision then
   raise exception 'Approved revision changed' using errcode='40001';end if;
  if c.permission<>'purchases.post' then raise exception 'Posting authority required' using errcode='42501';end if;
  if public.access_purchase_posting_company(c.initiating_user_id,c.organization_id,c.case_id,cmd.connection_id,cmd.payload->>'companyName','purchases.post') is distinct from c.company_id then
   raise exception 'Command company differs from saved purchase target' using errcode='42501';end if;
  if not exists(select 1 from public.purchase_invoice_tally_postings p join public.access_resource_scopes s
   on s.resource_type='case' and s.resource_id=p.case_id and s.organization_id=c.organization_id
   where p.case_id=c.case_id and p.command_id=p_command
    and coalesce(nullif(p.review_patch->>'postingCompanyId','')::uuid,s.company_id)=c.company_id) then
   raise exception 'Saved purchase target changed' using errcode='42501';end if;
  update public.access_purchase_workflows set state='posting',command_id=p_command,revision=revision+1,updated_at=now() where case_id=c.case_id;
 end if;
 update public.access_command_authority set state='issued',issued_at=now() where command_id=p_command returning * into c;
 return to_jsonb(c);
end $$;

create or replace function public.access_enqueue_purchase_verification(
 p_actor uuid,p_org text,p_case uuid,p_connection uuid,p_requested_at timestamptz
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.access_resource_scopes; w public.access_purchase_workflows; p record; c record; link record;
 previous_authority public.access_command_authority; cid uuid; target_company uuid; target_name text;
begin
 perform 1 from public.access_organizations where id=p_org for update;
 select * into s from public.access_resource_scopes where resource_type='case' and resource_id=p_case and organization_id=p_org for update;
 if not found then raise exception 'Purchase outside organization' using errcode='42501';end if;
 perform public.access_assert_permission(p_actor,p_org,'purchases.post',s.company_id);
 select * into w from public.access_purchase_workflows where case_id=p_case for update;
 if not found or w.state<>'posting' or w.approved_revision is distinct from w.financial_revision then
  raise exception 'Approved purchase verification is unavailable' using errcode='55000';end if;
 select * into p from public.purchase_invoice_tally_postings where case_id=p_case and connection_id=p_connection for update;
 if not found or p.status<>'verification_required' or p.command_id is null then raise exception 'Purchase voucher is not awaiting verification' using errcode='55000';end if;
 select * into previous_authority from public.access_command_authority where command_id=p.command_id and organization_id=p_org and case_id=p_case for share;
 if not found or previous_authority.state not in ('uncertain','completed') then raise exception 'Issued purchase authority is unavailable' using errcode='42501';end if;
 select * into c from public.tally_connections where id=p_connection and revoked_at is null for share;
 if not found or c.installation_id is null or c.session_generation is null then raise exception 'Connector unavailable' using errcode='55000';end if;
 select payload->>'companyName' into target_name from public.tally_bridge_commands where id=p.command_id;
 target_company:=public.access_purchase_posting_company(p_actor,p_org,p_case,c.id,target_name,'purchases.post');
 if target_company is distinct from previous_authority.company_id then raise exception 'Issued purchase target changed' using errcode='42501';end if;
 select * into link from public.access_company_links where organization_id=p_org and company_id=target_company
  and connection_id=c.id and installation_id=c.installation_id for share;
 if not found then raise exception 'Verified company and installation mapping required' using errcode='42501';end if;
 cid:=public.queue_purchase_invoice_tally_verification(p.id,p.owner_user_id,c.id,p.command_id,p_requested_at);
 update public.tally_bridge_commands set owner_user_id=c.owner_user_id,organization_id=p_org,
  installation_id=c.installation_id,session_generation=c.session_generation,company_guid=link.company_guid,
  financial_year=link.financial_year,protocol_version=1,job_class='interactive_read',max_attempts=1 where id=cid;
 insert into public.access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission,case_id,approved_revision)
 values(cid,p_org,target_company,p_actor,'purchases.post',p_case,w.approved_revision);
 update public.access_purchase_workflows set state='approved',command_id=null,revision=revision+1,updated_at=now() where case_id=p_case;
 insert into public.access_audit(organization_id,actor_id,action,target_id,revision,details)
 values(p_org,p_actor,'purchase.verify',p_case::text,w.revision,jsonb_build_object('commandId',cid));
 return cid;
end $$;
notify pgrst, 'reload schema';
commit;
