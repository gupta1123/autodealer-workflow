\set ON_ERROR_STOP on
\ir team-access-registration.sql
alter table bank_accounts add column account_number_normalized text;
alter table bank_accounts alter column id set default gen_random_uuid();
alter table bank_accounts add unique(owner_user_id,account_number_normalized);
\ir ../../supabase/migrations/20260904172300_team_access_bank_account_identity.sql
update access_members set status='active',modules=array['purchases','bank'] where organization_id='org-a';
update access_roles set permissions=permissions||array['bank.view','bank.prepare'] where organization_id='org-a' and template_key is null;
do $$declare actor uuid:='22222222-2222-2222-2222-222222222222';other_actor uuid:='44444444-4444-4444-4444-444444444444';company uuid:='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';begin
 insert into bank_accounts(owner_user_id,account_number_normalized,access_organization_id,access_company_id) values(actor,'123','org-a',company);
 begin insert into bank_accounts(owner_user_id,account_number_normalized,access_organization_id,access_company_id) values(other_actor,'123','org-a',company);raise exception 'Duplicate shared account allowed';exception when unique_violation then null;end;
 insert into bank_accounts(owner_user_id,account_number_normalized) values(actor,'123');
 begin insert into bank_accounts(owner_user_id,account_number_normalized) values(actor,'123');raise exception 'Legacy duplicate allowed';exception when unique_violation then null;end;
 if (select count(*) from bank_accounts where account_number_normalized='123')<>2 then raise exception 'Failed insert left data';end if;
 if not exists(select 1 from access_resource_scopes where resource_type='bank_account' and company_id=company) then raise exception 'Shared account was not registered';end if;
end$$;
select 'Shared account identity and legacy deduplication checks passed' as result;
