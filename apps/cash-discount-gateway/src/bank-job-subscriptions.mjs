// One authorized statement per subscription. Notifications are only hints:
// current durable state is read with the user's current membership each time.
export function createScopedBankSubscriptions({authorize,subscribe,send,setTimer=setInterval,clearTimer=clearInterval}) {
 const jobs=new Map();let closed=false;
 const remove=id=>{const entry=jobs.get(id);if(!entry)return;jobs.delete(id);entry.stopped=true;entry.unsubscribe?.();if(entry.timer)clearTimer(entry.timer);};
 const watch=async id=>{
  if(closed||jobs.has(id))return;
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||jobs.size>=4)throw new Error('Invalid or excessive bank-job subscriptions.');
  const entry={stopped:false,running:false,dirty:false,revision:0};jobs.set(id,entry);
  const refresh=async()=>{
   if(entry.stopped||closed)return;
   if(entry.running){entry.dirty=true;return;}
   entry.running=true;
   try {
    const status=await authorize(id);
    if(entry.stopped||closed)return;
    if(status.jobId!==id||!Number.isSafeInteger(status.revision)||status.revision<1)throw new Error('Invalid job status');
    if(!entry.unsubscribe){
     entry.unsubscribe=subscribe(status.ownerUserId,status.connectionId,
      event=>{if(event.jobId===id)void refresh();},online=>{if(!entry.stopped)send({type:'bank_job_channel',jobId:id,online});});
    }
    if(status.revision>entry.revision){
     entry.revision=status.revision;
     const type={completed:'bank_job_completed',failed:'bank_job_failed',cancelled:'bank_job_cancelled'}[status.state]||'bank_job_progress';
     send({type,jobId:id,importId:status.importId,revision:status.revision,state:status.state});
     if(type!=='bank_job_progress')remove(id);
    }
   }catch {
    if(!entry.stopped&&!closed)send({type:'bank_job_channel',jobId:id,online:false});
    remove(id);
   }finally{entry.running=false;if(entry.dirty&&!entry.stopped){entry.dirty=false;void refresh();}}
  };
  // Revalidation also expires an idle revoked subscription. No financial rows
  // are sent, and no authorization result is cached across notifications.
  entry.timer=setTimer(()=>void refresh(),30000);
  await refresh();
 };
 return {watch,unwatch:remove,close(){closed=true;for(const id of jobs.keys())remove(id);}};
}
