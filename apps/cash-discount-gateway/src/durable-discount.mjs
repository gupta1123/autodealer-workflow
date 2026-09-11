import {setTimeout as sleep} from 'node:timers/promises';
/** Notification wait only: no retry here can execute a second ERP write. */
export async function waitForDurableDiscount({commandId,connectionId,signal,read,onStatus,wait=(ms)=>sleep(ms,undefined,{signal})}) {
 if(!/^[a-f\d-]{36}$/i.test(commandId)||!/^[a-f\d-]{36}$/i.test(connectionId))throw new Error('Invalid queued debit note identity.');
 let lastStatus;
 for(let attempt=0;attempt<120;attempt++) {
  signal?.throwIfAborted();
  const {command}=await read(`/api/tally/connections/${connectionId}/commands/${commandId}`);
  if(!command)throw new Error('The queued debit note is not available in your current access scope.');
  if(command.status!==lastStatus){lastStatus=command.status;onStatus?.(lastStatus);}
  if(command.status==='succeeded')return command;
  if(['failed','cancelled'].includes(command.status))throw new Error(command.error||'Verify the existing debit note before retrying.');
  await wait(2000);
 }
 throw new Error('The debit note is still queued or awaiting confirmation. Refresh its status; do not create it again.');
}
