import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
if(!url)throw new Error('Load the Kalika backend environment first.');
const host=new URL(url).hostname;
const local=['localhost','127.0.0.1'].includes(host);
if(!local&&host!=='ktpaupxmlbtpjgvigmpb.supabase.co')throw new Error('Wrong project: this report is only for Kalika or a disposable local database.');
if(!process.argv.includes('--read')){
 console.log(JSON.stringify({mode:'dry-run',project:host,operation:'Read access_mapping_report; no rows or accounts are changed',next:'Add --read to query the report.'},null,2));
}else{
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new Error('Protected backend service credentials are required.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc('access_mapping_report');
 if(error)throw new Error('Mapping report is unavailable. Verify the unapplied schema against the disposable database first.');
 console.log(JSON.stringify({project:host,...data},null,2));
 if(data.resources.some(r=>r.unresolved>0))process.exitCode=2;
}
