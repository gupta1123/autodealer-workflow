import {AccessError} from './server';
function text(v:unknown){return typeof v==='string'&&v.trim()?v.trim().slice(0,500):null;}
export function bankCompletion(type:string,success:boolean,result:Record<string,unknown>,error:string|null) {
 const verification=text(result.verificationStatus);
 const voucherId=text(result.voucherId)||text(result.masterId)||text(result.voucherNumber);
 const matched=success&&['found','matched','verified'].includes(verification||'');
 const posted=success&&!result.possibleDuplicateInTally&&Boolean(voucherId);
 const status=type==='create_ledger'?(success?'created':'needs_tally_review'):type==='post_bank_voucher'?(posted?'posted':'needs_tally_review'):
  matched?'verified':success&&verification==='ambiguous'?'needs_tally_review':success?'missing_in_tally':'verification_failed';
 return {success:type==='post_bank_voucher'?posted:success,status,voucherId,
  error:status==='needs_tally_review'?(error||'Verify the existing Tally entry before retrying.').slice(0,2000):error?.slice(0,2000)||null,
  result:{verificationStatus:verification,voucherId,alreadyInTally:result.alreadyInTally===true,possibleDuplicateInTally:result.possibleDuplicateInTally===true}};
}
export async function completeTeamBank(input:{db:{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
 commandId:string;connectionId:string;bridgeTokenHash:string;type:string;success:boolean;result:Record<string,unknown>;error:string|null}) {
 const {data,error}=await input.db.rpc('access_complete_bank_command',{p_command:input.commandId,p_connection:input.connectionId,
  p_token_hash:input.bridgeTokenHash,p_result:bankCompletion(input.type,input.success,input.result,input.error)});
 if(error)throw error;
 if(!data||typeof data!=='object'||!('id' in data))throw new AccessError('Bank result could not be recorded.',503);
 return data;
}
