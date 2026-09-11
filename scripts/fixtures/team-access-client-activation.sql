\set ON_ERROR_STOP on
\ir team-access-client-operations.sql
\ir ../../supabase/migrations/20260905084439_team_access_client_activation.sql
do $$ declare report jsonb;r bigint;
begin
 report:=access_client_release_readiness('discount-org');
 assert report->>'releaseVersion'='1','release version missing';
 assert report->>'schemaReady'='false','partial schema was declared complete';
 assert jsonb_array_length(report->'missingFunctions')>0,'missing dependencies not reported';
 assert not exists(select 1 from access_organizations where sharing_enabled),'preparation enabled sharing';
 select revision into r from access_organizations where id='discount-org';
 begin perform access_activate_client_release('discount-org',r,'wrong');raise exception 'Confirmation bypass';exception when invalid_parameter_value then null;end;
 begin perform access_activate_client_release('discount-org',r,'KALIKA_CLIENT_RELEASE_CODE_AND_MAPPINGS_REVIEWED');raise exception 'Incomplete activation accepted';exception when object_not_in_prerequisite_state then null;end;
 begin update access_organizations set sharing_enabled=true where id='discount-org';raise exception 'Unreviewed activation accepted';exception when check_violation then null;end;
 assert not has_function_privilege('service_role','access_activate_client_release(text,bigint,text)','execute'),'HTTP backend can activate';
 assert not has_function_privilege('authenticated','access_client_release_readiness(text)','execute'),'client schema inspection';
end $$;
select 'Activation stays off, missing dependencies fail closed, and only the migration operator can activate' as result;
