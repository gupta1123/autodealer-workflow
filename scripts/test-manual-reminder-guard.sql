-- Run against the authorized Kalika database after the manual-send guard
-- migration. Every fixture change and attempt is rolled back; no provider call.
begin;
set local lock_timeout='3s';
do $$
declare r public.invoice_followup_pipelines; result jsonb; blocked boolean:=false;
begin
 select p.* into r from public.invoice_followup_pipelines p
 join public.tally_connections c on c.id=p.connection_id and c.revoked_at is null
  and c.installation_id=p.installation_id and c.session_generation=p.session_generation
 where p.organization_id='9046f797-9f18-428f-ac1c-0e3427a3387e' and p.automatic and p.status='paused'
 order by p.created_at desc limit 1 for update of p;
 if not found then raise exception 'A paused automatic schedule on a valid connector is required for this regression fixture';end if;
 update public.invoice_followup_pipelines set status='active',next_due_at=now()-interval '1 minute',
  verified_at=now(),verification_expires_at=now()+interval '5 minutes',stage_index=0,stage_sent=0 where id=r.id;
 begin
  perform public.followup_claim_send(r.id,r.revision,r.created_by,r.organization_id,r.company_id,r.installation_id,r.session_generation);
 exception when insufficient_privilege then
  if sqlerrm not like 'Automatic reminder delivery is disabled.%' then raise;end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'Automatic send claim was allowed';end if;
 update public.invoice_followup_pipelines set automatic=false where id=r.id;
 select public.followup_claim_send(r.id,r.revision,r.created_by,r.organization_id,r.company_id,r.installation_id,r.session_generation) into result;
 if result->>'attempt_id' is null then raise exception 'Manual send claim was blocked';end if;
 raise notice 'PASS: automatic claim blocked; manual claim allowed. All fixture changes are rolled back.';
end $$;
rollback;
