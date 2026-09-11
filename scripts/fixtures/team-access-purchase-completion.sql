\set ON_ERROR_STOP on
\ir team-access-dispatch-identity.sql
alter table tally_connections add column bridge_token_hash text,add column last_heartbeat_at timestamptz,add column updated_at timestamptz;
alter table tally_bridge_commands add column result jsonb;
alter table purchase_invoice_tally_postings add column tally_voucher_number text,add column tally_master_id text,
 add column tally_guid text,add column verified_at timestamptz,add column verification_status text;
\ir ../../supabase/migrations/20260908190000_team_access_purchase_command_payload_durability.sql
update tally_connections set bridge_token_hash='fixture-token-hash';
do $$ declare cid uuid:='cccccccc-cccc-cccc-cccc-ccccccccc100'; pid uuid:='eeeeeeee-eeee-eeee-eeee-eeeeeeeee100';
 actor uuid:='44444444-4444-4444-4444-444444444444'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100';
 cmd uuid; rev bigint; verified boolean; outcome jsonb; first_result jsonb; second_result jsonb; audits bigint;
begin
 foreach verified in array array[true,false] loop
  update access_members set status='active' where user_id=actor;
  update access_purchase_workflows set state='approved' where case_id=cid;
  select approved_revision into rev from access_purchase_workflows where case_id=cid;
  insert into tally_bridge_commands(connection_id,owner_user_id,organization_id,installation_id,session_generation,
   company_guid,financial_year,command_type,status,payload)
  values(conn,'11111111-1111-1111-1111-111111111111','org-a','install-a',7,'guid-a','2026-27',
   'create_purchase_voucher','queued',jsonb_build_object('postingId',pid,'caseId',cid)) returning id into cmd;
  insert into access_command_authority(command_id,organization_id,company_id,initiating_user_id,permission,case_id,approved_revision)
  values(cmd,'org-a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',actor,'purchases.post',cid,rev);
  update purchase_invoice_tally_postings set command_id=cmd,status='queued' where id=pid;
  outcome:=jsonb_build_object('verified',verified,'alreadyInTally',false,'voucherCreated',true,
   'voucherNumber','P-1','masterId','12','guid','v-guid','verificationStatus',case when verified then 'verified' else 'mismatch' end,
   'error',case when verified then null else 'Verify first' end,'compactResult',jsonb_build_object('verified',verified));
  begin perform access_complete_purchase_command(cmd,conn,'fixture-token-hash',outcome);
   raise exception 'Unissued write completed';exception when object_not_in_prerequisite_state then null;end;
  update tally_bridge_commands set status='claimed' where id=cmd;
  update access_members set status='suspended' where user_id=actor;
  begin perform access_complete_purchase_command(cmd,conn,'wrong-token',outcome);
   raise exception 'Wrong bridge token accepted';exception when insufficient_privilege then null;end;
  first_result:=access_complete_purchase_command(cmd,conn,'fixture-token-hash',outcome);
  second_result:=access_complete_purchase_command(cmd,conn,'fixture-token-hash',outcome);
  if first_result<>second_result then raise exception 'Retry changed completion';end if;
  if (select payload->>'postingId' from tally_bridge_commands where id=cmd) is distinct from pid::text then raise exception 'Frozen Purchase payload was discarded';end if;
  if (select owner_user_id from purchase_invoice_tally_postings where id=pid)<>'22222222-2222-2222-2222-222222222222'::uuid then raise exception 'Creator attribution lost';end if;
  if (select status from purchase_invoice_tally_postings where id=pid)<>(case when verified then 'created' else 'verification_required' end) then raise exception 'Posting not updated';end if;
  if (select state from access_purchase_workflows where case_id=cid)<>(case when verified then 'posted' else 'posting' end) then raise exception 'Unverified workflow was marked posted';end if;
  if (select count(*) from access_audit where details->>'commandId'=cmd::text)<>1 then raise exception 'Duplicate audit';end if;
  begin perform access_complete_purchase_command(cmd,conn,'fixture-token-hash',outcome||'{"voucherNumber":"DIFFERENT"}');
   raise exception 'Conflicting result overwrote completion';exception when serialization_failure then null;end;
 end loop;
 if has_function_privilege('authenticated','access_complete_purchase_command(uuid,uuid,text,jsonb)','execute') then raise exception 'Public completion RPC';end if;
end $$;
select 'Atomic shared purchase completion, revocation and retry tests passed' as result;
