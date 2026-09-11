\set ON_ERROR_STOP on
\ir team-access-dispatch-identity.sql
alter table tally_connections add column bridge_token_hash text;
\ir ../../supabase/migrations/20260905070944_team_access_dataset_masters.sql
do $$ declare actor uuid:='44444444-4444-4444-4444-444444444444';
 company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; conn uuid:='ffffffff-ffff-ffff-ffff-fffffffff100';
 cmd uuid; cmd2 uuid; ds uuid; outcome jsonb; identity jsonb; rows jsonb; mapping jsonb; saved jsonb; original uuid; count_before integer;
begin
 insert into access_roles(id,organization_id,name,permissions) values('66666666-6666-6666-6666-666666666666','org-a','Master manager',array['connections.manage']);
 update access_members set role_id='66666666-6666-6666-6666-666666666666',status='active' where organization_id='org-a' and user_id=actor;
 update tally_connections set bridge_token_hash='synthetic-hash' where id=conn;
 identity:=jsonb_build_object('organizationId','org-a','ownerUserId','11111111-1111-1111-1111-111111111111','connectionId',conn,
  'installationId','install-a','sessionGeneration',7,'companyGuid','guid-a','financialYear','2026-27');
 rows:='[{"master_type":"ledger","master_key":"ledger:a","tally_name":"Supplier A","raw_payload":{}}]';
 outcome:=access_enqueue_master_sync(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27',array['ledger','group']);
 cmd:=(outcome->>'id')::uuid;
 begin perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['ledger'],rows);raise exception 'Unissued upload accepted';exception when insufficient_privilege then null;end;
 update tally_bridge_commands set status='claimed' where id=cmd;
 begin perform access_save_master_snapshot(cmd,conn,'wrong',identity,array['ledger'],rows);raise exception 'Wrong token accepted';exception when insufficient_privilege then null;end;
 begin perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity||'{"financialYear":"2025-26"}',array['ledger'],rows);raise exception 'Wrong year accepted';exception when insufficient_privilege then null;end;
 begin perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['unit'],'[]');raise exception 'Unrequested types accepted';exception when insufficient_privilege then null;end;
 outcome:=access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['ledger'],rows);ds:=(outcome->>'datasetId')::uuid;
 original:=(select id from access_dataset_masters where dataset_id=ds);
 perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['ledger'],rows);
 if original<>(select id from access_dataset_masters where dataset_id=ds) then raise exception 'Identical retry replaced rows';end if;
 begin perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['ledger'],'[]');raise exception 'Conflict overwrote snapshot';exception when serialization_failure then null;end;
 mapping:='{"mapping_type":"supplier_gstin","source_key":"TEST","source_label":"Test","target_master_type":"ledger","target_master_key":"ledger:a","target_master_name":"Supplier A","status":"active"}';
 saved:=access_save_dataset_mapping(actor,'org-a',ds,0,mapping);
 if saved->>'revision'<>'1' then raise exception 'Initial revision wrong';end if;
 begin perform access_save_dataset_mapping(actor,'org-a',ds,0,mapping);raise exception 'Lost mapping update';exception when serialization_failure then null;end;
 begin perform access_save_dataset_mapping(actor,'org-a',ds,1,mapping||'{"target_master_name":"Other"}');raise exception 'Foreign master accepted';exception when serialization_failure then null;end;
 saved:=access_save_dataset_mapping(actor,'org-a',ds,1,mapping||'{"status":"inactive"}');
 if saved->>'revision'<>'2' then raise exception 'Revision not advanced';end if;
 begin perform access_save_dataset_mapping(actor,'org-b',ds,2,mapping);raise exception 'Cross-org mapping accepted';exception when insufficient_privilege then null;end;
 -- Another fiscal year has a separate dataset even with the same GUID/name.
 insert into access_company_links values('org-a',company,conn,'install-a','guid-a','2027-28',now(),'Synthetic next year');
 outcome:=access_enqueue_master_sync(actor,'org-a',company,conn,'install-a',7,'guid-a','2027-28',array['ledger']);cmd2:=(outcome->>'id')::uuid;
 update tally_bridge_commands set status='claimed' where id=cmd2;
 perform access_save_master_snapshot(cmd2,conn,'synthetic-hash',identity||'{"financialYear":"2027-28"}',array['ledger'],'[]');
 if not exists(select 1 from access_dataset_masters where id=original) then raise exception 'Other year invalidated prior cache';end if;
 -- Preparing bank statements does not grant general connection administration.
 update access_roles set permissions=array['bank.view','bank.prepare'] where id='66666666-6666-6666-6666-666666666666';
 update access_members set modules=array['bank'] where user_id=actor and organization_id='org-a';
 begin perform access_enqueue_master_sync(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27',array['stock_item'],'bank.prepare');raise exception 'Bank actor requested stock';exception when insufficient_privilege then null;end;
 outcome:=access_enqueue_master_sync(actor,'org-a',company,conn,'install-a',7,'guid-a','2026-27',array['ledger','group'],'bank.prepare');cmd2:=(outcome->>'id')::uuid;
 update tally_bridge_commands set status='claimed' where id=cmd2;
 perform access_save_master_snapshot(cmd2,conn,'synthetic-hash',identity,array['ledger'],rows);
 begin perform access_save_dataset_mapping(actor,'org-a',ds,2,mapping);raise exception 'Bank actor changed global mapping';exception when insufficient_privilege then null;end;
 update tally_connections set session_generation=8 where id=conn;
 begin perform access_save_master_snapshot(cmd,conn,'synthetic-hash',identity,array['ledger'],rows);raise exception 'Stale session replay accepted';exception when insufficient_privilege then null;end;
 update access_members set status='suspended' where organization_id='org-a' and user_id=actor;
 begin perform access_save_dataset_mapping(actor,'org-a',ds,2,mapping);raise exception 'Suspended mapping edit accepted';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','access_dataset_masters','select') or has_table_privilege('authenticated','access_dataset_mappings','update')
 or has_function_privilege('authenticated','access_save_master_snapshot(uuid,uuid,text,jsonb,text[],jsonb)','execute') then raise exception 'Public cache bypass';end if;
end $$;
select 'Dataset master isolation, atomicity, replay and mapping revision tests passed' as result;
