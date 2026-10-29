'use client';
// Unpaid invoices grouped by customer, and one WhatsApp reminder per customer
// listing their unpaid invoices (Gajkesari's "By customer" view).
import {createPortal} from 'react-dom';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Loader2} from 'lucide-react';
import {apiFetch} from '@/lib/api-client';
import {useActionAccess} from '@/components/access/useActionAccess';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {fetchCollectionsPage,isExpiredCollectionsError,type CollectionsRemote,type PageableDashboard} from './collections-source';
import {useReminderStatuses,invoiceKey,reminderLabel,type ScheduleStatus} from './useReminderStatuses';
import {WhatsappBubble} from './WhatsappBubble';
import styles from './CollectionsDashboardPage.module.css';

export type UnpaidInvoice={id:string;followUpStatus:string;ageDays:number|null;ageLabel:string;partyLedgerName:string;partyPhone:string|null;linkedInvoiceNumber:string|null;linkedInvoiceDate:string|null;outstandingAmount:number;amountReceived:number};
type Group={name:string;phone:string;invoices:UnpaidInvoice[];total:number;maxAge:number;oldest:string};
type Scope={connectionId:string;companyId?:string;companyGuid?:string;companyName:string;financialYear:string};
type Message={key:string;text:string};

const PAGE_ROWS=200;
// 25 pages of 200: beyond this the grouped view asks for a search instead.
const MAX_PAGES=25;
const SUMMARY_KEY='payment_reminder_summary';
const UNFINISHED=(status:string)=>!['settled','finished','stopped'].includes(status);
const money=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
const day=(value:string|null|undefined)=>value?new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
function tenDigits(value:string|null|undefined) {
  const digits=String(value??'').replace(/\D/g,'');
  return digits.length===12&&digits.startsWith('91')?digits.slice(2):digits.length===10?digits:'';
}
// Same one-line list the server sends: oldest five, then "and N more".
function invoiceListLine(invoices:UnpaidInvoice[]) {
  const sorted=[...invoices].sort((a,b)=>String(a.linkedInvoiceDate??'9999').localeCompare(String(b.linkedInvoiceDate??'9999')));
  const parts=sorted.slice(0,5).map(row=>`${row.linkedInvoiceNumber} ₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(row.outstandingAmount)}${row.linkedInvoiceDate?` (${new Date(`${row.linkedInvoiceDate}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'})})`:''}`);
  const rest=sorted.length-parts.length;
  return `${parts.join('; ')}${rest>0?`; and ${rest} more`:''}`;
}
function previewText(messages:Message[],group:Group,company:string) {
  const only=group.invoices.length===1?group.invoices[0]:null;
  const template=messages.find(m=>m.key===(only?'payment_reminder_v2':SUMMARY_KEY))?.text??'';
  const values:Record<string,string>={customer:group.name,company,invoice:only?.linkedInvoiceNumber??'',invoice_date:day(only?.linkedInvoiceDate),
    outstanding:new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(group.total),invoice_count:String(group.invoices.length),invoice_list:invoiceListLine(group.invoices)};
  return template.replace(/\{\{(customer|company|invoice|invoice_date|outstanding|invoice_count|invoice_list)\}\}/g,(_,key:string)=>values[key]);
}
function sortGroups(list:Group[],sort:string) {
  const band=(group:Group)=>Math.floor(group.maxAge/30);
  return [...list].sort((a,b)=>sort==='highest_outstanding'?b.total-a.total
    :sort==='oldest_invoice'?a.oldest.localeCompare(b.oldest)
    :sort==='customer'?a.name.localeCompare(b.name)
    :sort==='most_overdue'?b.maxAge-a.maxAge||b.total-a.total
    :band(b)-band(a)||b.total-a.total);
}

export function UnpaidByCustomer({dashboard,revision,paymentType,search,sort,remote,onExpired,scope,toolbarTarget,onOpenInvoice,onShowSchedule,onDone}:{
  dashboard:PageableDashboard|null;revision:string;paymentType:string;search:string;sort:string;remote:CollectionsRemote;onExpired:()=>void;scope:Scope;toolbarTarget:HTMLDivElement|null;
  onOpenInvoice:(row:UnpaidInvoice)=>void;onShowSchedule:(id:string)=>void;onDone:(message:{tone:'success'|'info'|'error';text:string},tab?:'pipelines'|'due'|'history')=>void;
}) {
  const allowed=useActionAccess(scope.companyId);
  const [rows,setRows]=useState<UnpaidInvoice[]|null>(null),[loading,setLoading]=useState(''),[error,setError]=useState('');
  const [query,setQuery]=useState(search.trim());
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer);},[search]);
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25);
  const [opened,setOpened]=useState<Set<string>>(()=>new Set());
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const remoteRef=useRef(remote),expiredRef=useRef(onExpired);
  remoteRef.current=remote;expiredRef.current=onExpired;

  // Every matching invoice is read (a page of 200 at a time) so a customer's invoices are never split across pages.
  useEffect(()=>{
    if(!dashboard){setRows(null);return;}
    let active=true;
    void (async()=>{
      setLoading('Reading unpaid invoices…');setError('');
      try{
        const base={view:'followUps' as const,paymentType,search:query,sort:'customer',pageSize:PAGE_ROWS};
        const first=await fetchCollectionsPage<UnpaidInvoice>(dashboard,{...base,page:1},remoteRef.current);
        if(first.pageCount>MAX_PAGES)throw new Error(`${first.total} unpaid invoices are too many to group by customer. Search for a customer, or choose By invoice.`);
        const all=[...first.rows];
        for(let next=2;next<=first.pageCount&&active;next++){
          setLoading(`Reading unpaid invoices… ${all.length} of ${first.total}`);
          all.push(...(await fetchCollectionsPage<UnpaidInvoice>(dashboard,{...base,page:next},remoteRef.current)).rows);
        }
        if(active)setRows(all);
      }catch(reason){
        if(!active)return;
        if(isExpiredCollectionsError(reason)){expiredRef.current();return;}
        setError(reason instanceof Error?reason.message:'Could not read unpaid invoices.');
      }finally{if(active)setLoading('');}
    })();
    return()=>{active=false;};
    // A new or changed dashboard (its id and revision) and the filters decide when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[revision,paymentType,query,Boolean(dashboard)]);
  useEffect(()=>{setPage(1);setSelected(new Set());},[paymentType,query]);

  // Invoices without a number or date, or with terms that need review, stay out of customer messages.
  const {groups,leftOut}=useMemo(()=>{
    const byName=new Map<string,Group>();let leftOut=0;
    for(const row of rows??[]){
      if(!row.linkedInvoiceNumber||!row.linkedInvoiceDate||row.followUpStatus==='needs_review'){leftOut+=1;continue;}
      const group=byName.get(row.partyLedgerName)??{name:row.partyLedgerName,phone:'',invoices:[],total:0,maxAge:-1,oldest:'9999'};
      group.invoices.push(row);group.total+=Number(row.outstandingAmount)||0;
      group.maxAge=Math.max(group.maxAge,row.ageDays??-1);
      if(row.linkedInvoiceDate<group.oldest)group.oldest=row.linkedInvoiceDate;
      group.phone||=tenDigits(row.partyPhone);
      byName.set(row.partyLedgerName,group);
    }
    return {groups:sortGroups([...byName.values()],sort),leftOut};
  },[rows,sort]);
  const pageCount=Math.max(1,Math.ceil(groups.length/pageSize)),safePage=Math.min(page,pageCount);
  const pageGroups=groups.slice((safePage-1)*pageSize,safePage*pageSize);

  // Reminder status of the invoices on this page (a customer reminder reports for each invoice it lists).
  const statusInvoices=useMemo(()=>{const list:UnpaidInvoice[]=[];for(const group of pageGroups){for(const row of group.invoices.slice(0,20)){if(list.length<200)list.push(row);}}return list;},[pageGroups]);
  const statuses=useReminderStatuses(scope,statusInvoices,Boolean(rows));
  const statusOf=(row:UnpaidInvoice)=>statuses?.rows[invoiceKey(row.partyLedgerName,row.linkedInvoiceNumber,row.linkedInvoiceDate)];
  const customerReminder=(group:Group)=>group.invoices.map(statusOf).find((row):row is ScheduleStatus=>Boolean(row&&row.kind==='customer'&&UNFINISHED(row.status)));

  // Start reminders / send once for chosen customers.
  const [enrolling,setEnrolling]=useState<{names:string[];once:boolean}|null>(null);
  const [phones,setPhones]=useState<Record<string,string>>({});
  const [savePhones,setSavePhones]=useState(true);
  const [messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false),[enrollError,setEnrollError]=useState('');
  const [previewName,setPreviewName]=useState('');
  const openEnroll=(names:string[],once:boolean)=>{
    const chosen=groups.filter(group=>names.includes(group.name)&&(once||!customerReminder(group)));
    if(!chosen.length){onDone({tone:'info',text:'Those customers already have a reminder running.'});return;}
    setPhones(Object.fromEntries(chosen.map(group=>[group.name,group.phone])));
    setEnrolling({names:chosen.map(group=>group.name),once});setEnrollError('');setPreviewName(chosen[0].name);
    if(!messages.length)void apiFetch(`/api/collections/follow-ups/pipelines?${new URLSearchParams({connectionId:scope.connectionId,companyId:scope.companyId||'',companyGuid:scope.companyGuid||'',companyName:scope.companyName,financialYear:scope.financialYear,view:'messages'})}`,{cache:'no-store'})
      .then(async response=>{const data=await response.json();if(response.ok)setMessages(data.messages??[]);}).catch(()=>undefined);
  };
  const enrollGroups=enrolling?groups.filter(group=>enrolling.names.includes(group.name)):[];
  const previewGroup=enrollGroups.find(group=>group.name===previewName)??enrollGroups[0];
  const missing=enrollGroups.filter(group=>!/^[6-9]\d{9}$/.test(phones[group.name]??''));
  const submit=async()=>{
    if(!enrolling||busy)return;
    if(missing.length){setEnrollError(`Enter a valid 10-digit mobile number for ${missing.slice(0,3).map(group=>group.name).join(', ')}${missing.length>3?'…':''}.`);return;}
    setBusy(true);setEnrollError('');
    try{
      const response=await apiFetch('/api/collections/follow-ups/pipelines',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,action:enrolling.once?'bulk_send_once_customers':'bulk_enroll_customers',
        items:enrollGroups.map(group=>({key:group.name,requestId:crypto.randomUUID(),customer:group.name,recipient:phones[group.name],savePhoneToTally:savePhones&&!group.phone,
          invoices:group.invoices.map(row=>({invoice:row.linkedInvoiceNumber,invoiceDate:row.linkedInvoiceDate}))}))})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not start customer reminders.');
      const list=(result.results||[]) as Array<{key:string;status:string;message?:string}>;
      const done=list.filter(item=>['enrolled','accepted'].includes(item.status));
      const problems=list.filter(item=>!['enrolled','accepted'].includes(item.status)).map(item=>`${item.key}: ${item.message||item.status}`).join(' · ');
      const text=enrolling.once
        ?`${done.length} customer message${done.length===1?'':'s'} submitted to WhatsApp.${problems?` Not sent: ${problems}`:''}`
        :`${done.length} customer reminder${done.length===1?'':'s'} started. Each one appears in Reminders due when it is due; Tally is checked again before sending.${problems?` Skipped: ${problems}`:''}`;
      setEnrolling(null);setSelected(new Set());
      onDone({tone:problems?'info':'success',text},done.length?(enrolling.once?'history':'pipelines'):undefined);
    }catch(reason){setEnrollError(reason instanceof Error?reason.message:'Could not start customer reminders.');}
    finally{setBusy(false);}
  };

  const toggle=(name:string,on:boolean)=>setSelected(current=>{const next=new Set(current);if(on)next.add(name);else next.delete(name);return next;});
  const chosen=groups.filter(group=>selected.has(group.name));
  const startable=chosen.filter(group=>!customerReminder(group));
  const noContact=startable.filter(group=>!group.phone).length;
  const bulkBar=selected.size?<div className={styles.bulkBar}>
    <span className={styles.bulkCount}>{selected.size} selected</span><span className={styles.bulkSeparator}/>
    {allowed('followups.prepare')?<button type="button" className={`${styles.bulkButton} ${styles.bulkPrimary}`} disabled={!startable.length} onClick={()=>openEnroll(startable.map(group=>group.name),false)}>Start reminders<small>{startable.length}</small></button>:null}
    {allowed('followups.export')?<button type="button" className={styles.bulkButton} disabled={!chosen.length} onClick={()=>openEnroll(chosen.map(group=>group.name),true)}>Send once<small>{chosen.length}</small></button>:null}
    {noContact?<span className={`${styles.bulkButton} ${styles.bulkWarn}`}>⚠ {noContact} no contact</span>:null}
    <button type="button" className={styles.bulkClose} aria-label="Clear selection" onClick={()=>setSelected(new Set())}>×</button>
  </div>:null;

  return <>
    {bulkBar?(toolbarTarget?createPortal(bulkBar,toolbarTarget):bulkBar):null}
    <p className="mb-2 mt-3 text-xs text-[#756b60]">One message per customer lists all their unpaid invoices.{leftOut?` ${leftOut} invoice${leftOut===1?' needs':'s need'} review or invoice details and ${leftOut===1?'is':'are'} left out; see By invoice.`:''}</p>
    {error?<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
    :!rows?<p role="status" className="flex items-center gap-2 py-8 text-xs text-[#756b60]"><Loader2 className="size-4 animate-spin"/>{loading||'Reading unpaid invoices…'}</p>
    :<div className={styles.flatTable}>
      <div className={styles.customerGrid} role="table" aria-label="Customers with unpaid invoices">
        <div className={`${styles.customerRow} ${styles.customerHead}`} role="row">
          <input type="checkbox" className="h-4 w-4 accent-[#2d2d2d]" aria-label="Select all customers on this page" checked={pageGroups.length>0&&pageGroups.every(group=>selected.has(group.name))}
            onChange={event=>setSelected(current=>{const next=new Set(current);for(const group of pageGroups){if(event.target.checked)next.add(group.name);else next.delete(group.name);}return next;})}/>
          <span>Customer</span><span className={styles.right}>Invoices</span><span className={styles.right}>Outstanding</span><span>Oldest overdue</span><span>Reminders</span>
        </div>
        {pageGroups.map(group=>{
          const open=opened.has(group.name);
          const reminder=customerReminder(group);
          const info=reminder?reminderLabel(reminder):null;
          return <div key={group.name} className={`${styles.customerGroup} ${open?styles.customerOpen:''}`}>
            <div className={styles.customerRow} role="row">
              <input type="checkbox" className="h-4 w-4 accent-[#2d2d2d]" aria-label={`Select ${group.name}`} checked={selected.has(group.name)} onChange={event=>toggle(group.name,event.target.checked)}/>
              <button type="button" className={styles.customerToggle} aria-expanded={open} aria-label={`${open?'Hide':'Show'} invoices of ${group.name}`}
                onClick={()=>setOpened(current=>{const next=new Set(current);if(open)next.delete(group.name);else next.add(group.name);return next;})}>
                <svg className={styles.chevron} width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span><b title={group.name}>{group.name}</b><small>{group.phone?`+91 ${group.phone}`:'No contact on file'}</small></span>
              </button>
              <span className={`${styles.right} tabular-nums`}>{group.invoices.length}</span>
              <span className={`${styles.right} whitespace-nowrap font-medium tabular-nums text-[#1a1a1a]`}>{money(group.total)}</span>
              <span>{group.maxAge>0?<span className={group.maxAge>30?styles.ageBad:styles.ageWarn}>{group.maxAge} days</span>:'Due today'}<span className={styles.secondary}>oldest invoice {day(group.oldest)}</span></span>
              <span>{!statuses?<span className={styles.secondary}>Checking reminders…</span>
                :reminder&&info?<><span className={`${styles.pill} ${reminder.status==='review'||reminder.status==='uncertain'?styles.pillAmber:styles.pillStone}`}>{info.label}</span><button type="button" className="mt-1 block text-xs underline underline-offset-4" onClick={()=>onShowSchedule(reminder.id)}>{info.action}</button></>
                :allowed('followups.prepare')?<button type="button" className={styles.messageAction} onClick={()=>openEnroll([group.name],false)}>Remind customer</button>:<span className={styles.secondary}>Not scheduled</span>}</span>
            </div>
            {open?<div className={styles.customerInvoices}>
              {group.invoices.map(row=>{const own=statusOf(row);return <button type="button" key={row.id} className={styles.customerInvoice} onClick={()=>onOpenInvoice(row)} title="See payment details">
                <span className={styles.invoiceNumber}>{row.linkedInvoiceNumber}<small>{day(row.linkedInvoiceDate)}</small></span>
                <span className="text-right font-medium tabular-nums">{money(row.outstandingAmount)}</span>
                <span>{(row.ageDays??0)>0?<span className={(row.ageDays??0)>30?styles.ageBad:styles.ageWarn}>{row.ageLabel}</span>:row.ageLabel}{row.amountReceived>0.005?<span className={`${styles.pill} ${styles.pillAmber} ml-2`}>Part paid</span>:null}</span>
                <span className={styles.secondary}>{own?own.kind==='customer'?'In customer reminder':reminderLabel(own).label:''}</span>
              </button>;})}
            </div>:null}
          </div>;
        })}
        {!pageGroups.length?<p className="py-8 text-center text-xs text-[#756b60]">{query?`No customers match "${query}".`:'No customers have unpaid invoices that need a follow-up.'}</p>:null}
      </div>
      <div className="flex flex-col gap-2 border-t border-[#e5ddd0] bg-[#fcfbfa] px-3 py-2.5 text-[11px] font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="tabular-nums">{groups.length?`Showing ${(safePage-1)*pageSize+1}–${Math.min(groups.length,safePage*pageSize)} of ${groups.length} customers`:'No customers'}{loading?` · ${loading}`:''}</span>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <label className="flex items-center gap-2"><span className="hidden sm:inline">Rows</span>
            <select aria-label="Customers per page" className="h-8 rounded-lg border border-[#ddd3c5] bg-white px-2 text-[11px] font-bold text-[#5a5046]" value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);}}>{[25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
          <span className="min-w-[72px] text-center tabular-nums">Page {safePage} of {pageCount}</span>
          <button type="button" aria-label="Previous page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#ddd3c5] bg-white text-[#5a5046] disabled:opacity-35" disabled={safePage<=1} onClick={()=>setPage(safePage-1)}><ChevronLeft className="h-4 w-4"/></button>
          <button type="button" aria-label="Next page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#ddd3c5] bg-white text-[#5a5046] disabled:opacity-35" disabled={safePage>=pageCount} onClick={()=>setPage(safePage+1)}><ChevronRight className="h-4 w-4"/></button>
        </div>
      </div>
    </div>}

    <Dialog open={enrolling!==null} onOpenChange={open=>{if(!open&&!busy)setEnrolling(null);}}>
      <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col overflow-hidden rounded-xl border-[#ded8d0] p-0" showClose={!busy}>
        <div className="shrink-0 border-b border-[#e8e2db] px-5 py-4 pr-14">
          <p className="mb-1 text-[11px] font-medium text-[#756b60]">{enrolling?.once?'Send once':'Customer reminders'}</p>
          <DialogTitle className="text-base">{enrollGroups.length===1?enrollGroups[0].name:`${enrollGroups.length} customers`}</DialogTitle>
          <DialogDescription className="mt-1 text-xs">{enrollGroups.reduce((sum,group)=>sum+group.invoices.length,0)} invoices · Outstanding {money(enrollGroups.reduce((sum,group)=>sum+group.total,0))}</DialogDescription>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-[minmax(0,1fr)_340px]">
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            {enrollGroups.map(group=><label key={group.name} className="flex flex-col gap-1.5 text-xs font-medium text-[#51483f]">
              <span className="flex items-center justify-between gap-2"><button type="button" className={`truncate text-left ${previewGroup?.name===group.name?'font-semibold text-[#1a1a1a]':''}`} onClick={()=>setPreviewName(group.name)} title="Preview this customer’s message">{group.name} · {group.invoices.length} invoice{group.invoices.length===1?'':'s'}</button>{group.phone?<span className="shrink-0 font-normal text-[#8a7f72]">on file</span>:null}</span>
              <input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" className="h-10 w-full max-w-sm rounded-lg border border-[#ded8d0] bg-white px-3 text-sm font-normal outline-none focus:border-[#9e8b78] focus:ring-2 focus:ring-[#e9e0d5]"
                value={phones[group.name]??''} onFocus={()=>setPreviewName(group.name)} onChange={event=>{const value=event.target.value.replace(/\D/g,'').slice(-10);setPhones(current=>({...current,[group.name]:value}));}}/>
            </label>)}
            {enrollGroups.some(group=>!group.phone)&&allowed('connections.manage')?<label className="flex items-start gap-2 text-xs leading-5 text-[#51483f]"><input type="checkbox" className="mt-1 accent-[#332c26]" checked={savePhones} onChange={event=>setSavePhones(event.target.checked)}/>Also save new numbers in the customers’ Tally ledgers</label>:null}
            {!enrolling?.once?<p className="text-[11px] leading-4 text-[#756b60]">Uses your saved reminder sequence from Settings. Invoices that already have their own reminder are not repeated.</p>:null}
            {enrollError?<p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">{enrollError}</p>:null}
          </fieldset>
          <div className="min-w-0">
            <p className="mb-2 text-xs text-[#756b60]">Preview{previewGroup&&enrollGroups.length>1?` · ${previewGroup.name}`:''}</p>
            {previewGroup?<WhatsappBubble name={previewGroup.name} phone={phones[previewGroup.name]} text={messages.length?previewText(messages,previewGroup,scope.companyName):'Loading the message…'}/>:null}
            <p className="mt-2 text-center text-[11px] text-[#8a7f72]">Amounts are checked again in Tally before anything is sent.</p>
          </div>
        </div>
        <DialogFooter className="m-0 shrink-0 border-t border-[#e8e2db] px-5 py-4">
          <button type="button" className={styles.messageAction} disabled={busy} onClick={()=>setEnrolling(null)}>Cancel</button>
          <button type="button" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#2f2924] px-4 py-2 text-xs font-semibold text-white disabled:opacity-45" disabled={busy||!enrollGroups.length} onClick={()=>void submit()}>
            {busy?<><Loader2 className="size-4 animate-spin"/>Checking Tally…</>:enrolling?.once?`Send ${enrollGroups.length} WhatsApp message${enrollGroups.length===1?'':'s'}`:`Start ${enrollGroups.length} customer reminder${enrollGroups.length===1?'':'s'}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
