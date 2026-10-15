import { createHash } from 'node:crypto';
import { canAccess } from '@autodealer/shared/lib/access';
import { advanceReminder, stageMs, validateReminderPlan, verificationOutcome, REMINDER_CHECK_MS } from '@autodealer/shared/lib/followup-pipeline';
import { jsonWithCors } from '@/lib/api/cors';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashSecret } from '@/lib/tally/connections';
import { getCashDiscountCustomerScopeOrDefault } from '@/lib/cash-discount-customer-scope';
import { businessDateText } from '@/lib/business-date';
import { automaticReminderBill } from '@/lib/followups/automatic-policy';
import { reminderDefaults } from '@/lib/followups/defaults';
import { reminderMessages, submitReminder } from '@/lib/followups/messages';
import { normalizeWhatsappPhone, WhatsappRejectedError } from '@/lib/msg91/whatsapp';
import type { OpenBillRow } from '@/lib/collections-dashboard';
import { readCompleteHistory } from '@/lib/collections-history';

export const runtime = 'nodejs';
function checked<T>(result: { data: T; error: unknown }) { if (result.error) throw new Error('Automatic follow-up storage or authorization is unavailable.'); return result.data; }
function yearKey(value: string) { return value.replace(/^(20\d{2})-(\d{2})$/, '$1-20$2'); }

/** Bridge-authenticated service route. Browser balances cannot enter this path. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = createSupabaseAdminClient();
    const token = request.headers.get('x-bridge-token');
    const connection = checked(await db.from('tally_connections').select('id,owner_user_id,organization_id,installation_id,session_generation,bridge_token_hash,last_company_name,last_company_loaded,last_tally_reachable,last_heartbeat_at').eq('id',body.connectionId).is('revoked_at',null).maybeSingle());
    if (!token || !connection?.bridge_token_hash || hashSecret(token) !== connection.bridge_token_hash) return jsonWithCors(request,{error:'Invalid connector pairing.'},{status:401});
    if (!connection.organization_id || !connection.installation_id || !connection.last_company_loaded || !connection.last_tally_reachable || Date.now() - Date.parse(connection.last_heartbeat_at || '') > 120_000 || !Number.isFinite(Date.parse(connection.last_heartbeat_at || ''))) throw new Error('A current, verified Tally company is required.');
    const access = checked(await db.rpc('access_snapshot',{p_user:connection.owner_user_id,p_org:connection.organization_id}));
    if (!access?.sharingEnabled || !access.member || access.member.must_change_password) throw new Error('Automatic follow-ups require active company access.');
    const defaults = (await reminderDefaults(connection.organization_id)).value;
    if (defaults.automatic === false) return jsonWithCors(request,{contexts:[],tasks:[]});
    const links = checked(await db.from('access_company_links').select('company_id,company_guid,financial_year').eq('organization_id',connection.organization_id).eq('connection_id',connection.id).eq('installation_id',connection.installation_id).limit(1000));
    if ((links?.length || 0) >= 1000) throw new Error('Company mappings could not be completely checked.');
    const names = new Map<string,string>(access.companies.map((c: { id: string; name: string }) => [c.id,c.name]));
    const day = businessDateText(); const start = Number(day.slice(0,4)) - (Number(day.slice(5,7)) < 4 ? 1 : 0);
    const eligible = (links || []).filter(link => names.get(link.company_id) === connection.last_company_name && yearKey(link.financial_year) === `${start}-${start+1}` && canAccess(access,'followups.prepare',link.company_id) && canAccess(access,'followups.export',link.company_id));
    if (eligible.length !== 1) throw new Error('Select exactly one reviewed active company and financial year for automatic reminders.');
    const link = eligible[0];
    const scope = { organization_id: connection.organization_id, company_id:link.company_id, installation_id:connection.installation_id, company_guid:link.company_guid, financial_year:link.financial_year };
    const scoped = (table: string) => Object.entries(scope).reduce((query,[key,value]) => query.eq(key,value),db.from(table).select('*'));
    const context = { connectionId:connection.id, companyName:names.get(link.company_id), companyGuid:link.company_guid, financialYear:link.financial_year, organizationId:connection.organization_id, installationId:connection.installation_id, sessionGeneration:connection.session_generation, initiatingUserId:connection.owner_user_id };
    if (body.action === 'context') return jsonWithCors(request,{contexts:[{...context,customerScope:await getCashDiscountCustomerScopeOrDefault({ownerUserId:connection.owner_user_id,connectionId:connection.id,companyName:connection.last_company_name})}]});
    if (body.companyGuid !== context.companyGuid || body.companyName !== context.companyName || yearKey(String(body.financialYear || '')) !== yearKey(context.financialYear) || body.installationId !== context.installationId || body.sessionGeneration !== context.sessionGeneration) throw new Error('The automatic reminder dataset or pairing changed.');
    const plan = validateReminderPlan(defaults.plan);
    if (plan.stages.some(stage => !reminderMessages().some(message => message.key === stage.template))) throw new Error('An approved reminder template is required.');
    if (body.action === 'reconcile') {
      const scan = body.scan;
      if (!scan || scan.companyGuid !== context.companyGuid || scan.companyName !== context.companyName || yearKey(String(scan.financialYear || '')) !== yearKey(context.financialYear) || scan.scanSummary?.complete !== true || scan.cache?.stale === true || Date.now()-Date.parse(scan.cache?.updatedAt || '') > 120_000 || !Number.isFinite(Date.parse(scan.cache?.updatedAt || ''))) throw new Error('Automatic invoice discovery was incomplete or stale.');
      const ledgers = new Map<string,{raw?:{phone?:string}}>((scan.ledgers || []).map((ledger: {name:string;raw?:{phone?:string}}) => [ledger.name,ledger]));
      const byLedger = scan.openBillsResult?.result?.byLedger || scan.openBillsResult?.byLedger || {};
      const existing = new Set((await readCompleteHistory((from,to)=>scoped('invoice_followup_pipelines').eq('mode','pipeline').order('id').range(from,to))).map(row => row.invoice_key));
      let enrolled = 0;
      let regularCreditMigrationRequired = false;
      for (const [customer,bucket] of Object.entries(byLedger) as Array<[string,{complete?:boolean;openBills?:OpenBillRow[]}]>) {
        if (bucket.complete === false) continue;
        const recipient = normalizeWhatsappPhone(ledgers.get(customer)?.raw?.phone);
        if (!/^91\d{10}$/.test(recipient)) continue;
        for (const bill of bucket.openBills || []) {
          const candidate = automaticReminderBill(bill);
          if (!candidate || (regularCreditMigrationRequired && candidate.category === 'regular_credit')) continue;
          const invoiceKey = createHash('sha256').update(JSON.stringify([customer,candidate.invoice,candidate.invoiceDate])).digest('hex');
          // Any existing recurring schedule, including paused/stopped/finished,
          // remains an operator decision. Do not restart it through discovery.
          if (existing.has(invoiceKey) || enrolled >= 25) continue;
          const firstDue = new Date(Date.parse(candidate.startsAt)+stageMs(plan.stages[0],'delay')).toISOString();
          const inserted = await db.from('invoice_followup_pipelines').insert({...scope,connection_id:connection.id,session_generation:connection.session_generation,company_name:context.companyName,customer,invoice:candidate.invoice,invoice_date:candidate.invoiceDate,invoice_key:invoiceKey,recipient,mode:'pipeline',automatic:true,payment_category:candidate.category,plan_name:plan.name,stages:plan.stages,outstanding:candidate.outstanding,next_due_at:firstDue,created_by:connection.owner_user_id});
          // Older installations allow only RTGS categories. Keep their existing
          // schedules working while the regular-credit migration is applied.
          if (inserted.error?.code === '23514' && candidate.category === 'regular_credit') { regularCreditMigrationRequired = true; continue; }
          if (inserted.error && inserted.error.code !== '23505') throw new Error('Automatic reminder enrollment failed.');
          existing.add(invoiceKey); enrolled++;
        }
      }
      const tasks = checked(await scoped('invoice_followup_pipelines').eq('automatic',true).eq('status','active').lte('next_due_at',new Date().toISOString()).order('next_due_at').order('id').limit(25));
      return jsonWithCors(request,{regularCreditMigrationRequired,tasks:(tasks || []).map(row => ({id:row.id,customer:row.customer,invoice:row.invoice,invoiceDate:row.invoice_date}))});
    }
    if (body.action !== 'deliver') throw new Error('Unknown automatic reminder action.');
    const row = checked(await scoped('invoice_followup_pipelines').eq('id',body.id).eq('automatic',true).eq('mode','pipeline').maybeSingle());
    if (!row || row.status !== 'active' || !row.next_due_at || Date.parse(row.next_due_at) > Date.now() || row.created_by !== connection.owner_user_id) return jsonWithCors(request,{status:'skipped'});
    const evidence = body.evidence;
    const bucket = evidence?.byLedger?.[row.customer];
    if (!evidence || evidence.complete === false || bucket?.complete === false || !Array.isArray(bucket?.openBills)) throw new Error('Fresh Tally invoice evidence is required.');
    const outcome = verificationOutcome(bucket.openBills,row.invoice,row.invoice_date,evidence.settlementEvidence,row.customer);
    const matching = bucket.openBills.filter((bill: OpenBillRow) => (bill.referenceName === row.invoice || bill.voucherNumber === row.invoice) && bill.invoiceDate === row.invoice_date);
    const category = matching.length === 1 ? automaticReminderBill(matching[0]) : null;
    const status = outcome.status === 'active' && (!category || category.category !== row.payment_category) ? 'review' : outcome.status;
    const updated = checked(await db.from('invoice_followup_pipelines').update({connection_id:connection.id,session_generation:connection.session_generation,outstanding:outcome.outstanding,status,note:status === 'review' ? 'Payment terms or invoice evidence changed. Review before resuming.' : outcome.note,verified_at:new Date().toISOString(),verification_expires_at:status === 'active' ? new Date(Date.now()+REMINDER_CHECK_MS).toISOString() : null,...(status === 'settled' ? {next_due_at:null} : {}),revision:row.revision+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('revision',row.revision).select('*').maybeSingle());
    if (!updated || status !== 'active') return jsonWithCors(request,{status:updated ? status : 'changed'});
    // This database claim rechecks the actor's current export permission,
    // pairing, due time, stage limit and revision under a row lock.
    const claim = checked(await db.rpc('followup_claim_send',{p_id:row.id,p_revision:updated.revision,p_actor:row.created_by,p_org:scope.organization_id,p_company:scope.company_id,p_installation:scope.installation_id,p_generation:connection.session_generation}));
    if (!claim?.attempt_id) throw new Error('The reminder could not be claimed.');
    let sendStatus = 'uncertain'; let provider: string | null = null; let error: string | null = null;
    try { provider = await submitReminder(updated.stages[updated.stage_index].template,updated,updated.recipient); sendStatus = 'accepted'; }
    catch (reason) { sendStatus = reason instanceof WhatsappRejectedError ? 'rejected' : 'uncertain'; error = reason instanceof Error ? reason.message : 'Provider verification required.'; }
    const next = sendStatus === 'accepted' ? advanceReminder(updated.stages,updated.stage_index,updated.stage_sent) : null;
    checked(await db.rpc('followup_finish_send',{p_id:row.id,p_attempt:claim.attempt_id,p_status:sendStatus,p_provider:provider,p_error:error,p_next:next}));
    // Rejected automatic submissions wait for an operator rather than retry
    // every minute indefinitely. Uncertain submissions are already held.
    if (sendStatus === 'rejected') checked(await db.from('invoice_followup_pipelines').update({status:'review',revision:updated.revision+3}).eq('id',row.id).eq('status','active').eq('revision',updated.revision+2));
    return jsonWithCors(request,{status:sendStatus});
  } catch (error) {
    return jsonWithCors(request,{error:error instanceof Error ? error.message : 'Automatic follow-ups unavailable.'},{status:409});
  }
}
