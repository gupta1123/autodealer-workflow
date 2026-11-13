-- A purchase voucher write runs a financial-year duplicate scan, a save that can take over
-- a minute on a large Tally company, and a read-back. Give it 5 minutes before its claim
-- is treated as a lost response; every other command keeps the 2-minute window.
-- Same function as 20260904160936_team_access_command_dispatch.sql except that window.
create or replace function public.access_claim_next_command(p_connection uuid,p_installation text,p_generation bigint,p_bridge_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cmd record; claimed record; n integer:=0;
begin
 if not exists(select 1 from public.tally_connections where id=p_connection and installation_id=p_installation and session_generation=p_generation and revoked_at is null) then
   raise exception 'Pairing session changed' using errcode='42501';
 end if;
 -- Issued writes are uncertain, never automatically retried after a missing response.
 update public.tally_bridge_commands b set status='failed',completed_at=now(),error='Response missing; verify the existing voucher before retrying.'
 where b.connection_id=p_connection and b.status='claimed'
 and b.claimed_at<now()-case when b.command_type='create_purchase_voucher' then interval '5 minutes' else interval '2 minutes' end
 and exists(select 1 from public.access_command_authority a where a.command_id=b.id and a.state in ('issued','uncertain'));
 update public.purchase_invoice_tally_postings p set status='verification_required',last_error='Tally response missing. Verify the existing voucher before retrying.'
 where p.status in ('queued','creating','approved') and exists(select 1 from public.access_command_authority a join public.tally_bridge_commands b on b.id=a.command_id where a.command_id=p.command_id and b.connection_id=p_connection and a.state='uncertain');
 for cmd in select b.* from public.tally_bridge_commands b where b.connection_id=p_connection and b.status='queued'
   and b.installation_id=p_installation and b.session_generation=p_generation and b.available_at<=now()
   order by b.priority desc,b.created_at,b.id limit 25 for update skip locked loop
   begin
     if not exists(select 1 from public.access_command_authority where command_id=cmd.id) then
       raise exception 'Command has no initiating-user authority' using errcode='42501';
     end if;
     if cmd.deadline_at is not null and cmd.deadline_at<now() then raise exception 'Command expired' using errcode='55000';end if;
     -- Existing trigger rechecks current membership/scope and the exact approved revision.
     update public.tally_bridge_commands set status='claimed',claimed_at=now(),attempts=attempts+1,bridge_version=p_bridge_version
       where id=cmd.id and status='queued' returning * into claimed;
     if found then return to_jsonb(claimed);end if;
   exception when insufficient_privilege or object_not_in_prerequisite_state or serialization_failure then
     -- The failed trigger is rolled back before cancellation. Move past revoked work.
     update public.tally_bridge_commands set status='canceled',completed_at=now(),error='Access, approval, session or deadline changed. Submit a new authorized request.' where id=cmd.id and status='queued';
     update public.access_command_authority set state='cancelled',completed_at=now() where command_id=cmd.id and state='queued';
     update public.purchase_invoice_tally_postings set status='ready_for_approval',command_id=null,last_error='Queued request cancelled because access or approval changed.'
       where command_id=cmd.id and status in ('approved','queued');
     n:=n+1;
   end;
 end loop;
 return null;
end $$;

revoke all on function public.access_claim_next_command(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.access_claim_next_command(uuid,text,bigint,text) to service_role;
