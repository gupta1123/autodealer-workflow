\set ON_ERROR_STOP on
\ir team-access-dispatch-identity.sql
\ir ../../supabase/migrations/20260904175244_team_access_enqueue_reads.sql
do $$ declare actor uuid:='44444444-4444-4444-4444-444444444444';
 company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100'; result jsonb; cmd uuid;
begin
 begin perform access_enqueue_read(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27','post_bank_voucher','{"companyName":"Company A"}');raise exception 'Write through read endpoint';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_read(actor,'org-a',company,conn,'install-a',8,'guid-a','2026-27','fetch_purchase_masters','{"companyName":"Company A"}');raise exception 'Wrong session queued';exception when insufficient_privilege then null;end;
 begin perform access_enqueue_read(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27','fetch_purchase_masters','{"companyName":"Company A","companyNames":["Other"]}');raise exception 'Cross-company payload queued';exception when insufficient_privilege then null;end;
 result:=access_enqueue_read(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27','fetch_purchase_masters','{"companyName":"Company A"}');cmd:=(result->>'id')::uuid;
 if result->>'owner_user_id'=actor::text then raise exception 'Transport owner replaced with initiator';end if;
 if not exists(select 1 from access_command_authority where command_id=cmd and initiating_user_id=actor and permission='purchases.prepare') then raise exception 'Receipt not created';end if;
 update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
 perform access_claim_next_command(conn,'install-a',7,'1.0');
 if (select status from tally_bridge_commands where id=cmd)<>'canceled' then raise exception 'Revoked read executed';end if;
 if has_function_privilege('authenticated','access_enqueue_read(uuid,text,uuid,uuid,text,bigint,text,text,text,jsonb)','execute') then raise exception 'Public queue API';end if;
end $$;
select 'Shared read admission and revocation tests passed' as result;
