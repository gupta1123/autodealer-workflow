import {createClient} from '@supabase/supabase-js';
import readline from 'node:readline';
import {Writable} from 'node:stream';
import {DEFAULT_ROLES} from '../packages/shared/src/lib/access.ts';

const args=process.argv.slice(2);
function option(name){const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:undefined;}
if(args.includes('--help')){
 console.log('Kalika internal provisioning (dry-run by default)\n--org ID --org-name NAME --email EMAIL --name NAME --role administrator|approver|operator|viewer [--owner] [--execute]\nUse SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment. Existing accounts are linked without changing their password. New accounts prompt for a temporary password and must change it at first login. No invitation email is sent. New memberships have no company/module scope until an owner assigns it.');process.exit(0);
}
if(args.some(a=>/password|token|secret/i.test(a)))throw Error('Do not pass secrets on the command line.');
const org=option('org'),orgName=option('org-name'),email=option('email')?.trim().toLowerCase(),name=option('name'),role=option('role');
if(!org||!orgName||!email?.includes('@')||!name||!DEFAULT_ROLES.some(r=>r.key===role))throw Error('Missing or invalid options. Use --help.');
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Protected environment configuration required.');
const host=new URL(url).hostname;
if(host!=='ktpaupxmlbtpjgvigmpb.supabase.co'&&!['localhost','127.0.0.1'].includes(host))throw Error('Refusing non-Kalika project.');
const execute=args.includes('--execute');
console.log(JSON.stringify({mode:execute?'execute':'dry-run',project:host,organization:org,email,role,owner:args.includes('--owner'),companyScope:'none',modules:[],sendsInvitation:false}));
if(!execute)process.exit(0);
if(host==='ktpaupxmlbtpjgvigmpb.supabase.co'&&process.env.TEAM_ACCESS_ENFORCEMENT!=='true')throw Error('Hosted provisioning is blocked until TEAM_ACCESS_ENFORCEMENT=true is configured for the client release.');
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
// Check schema before creating an Auth account, reducing partial failures.
const preflight=await db.from('access_organizations').select('id').limit(1);if(preflight.error)throw Error('Access schema unavailable; no account created.');
if(host==='ktpaupxmlbtpjgvigmpb.supabase.co') {
 const readiness=await db.rpc('access_client_release_readiness',{p_org:org});
 if(readiness.error||readiness.data?.schemaReady!==true)throw Error('Client release migrations are incomplete; no account created.');
}
let user=null;
for(let page=1;;page++){const r=await db.auth.admin.listUsers({page,perPage:100});if(r.error)throw Error('Could not inspect existing accounts.');user=r.data.users.find(u=>u.email?.toLowerCase()===email);if(user||r.data.users.length<100)break;}
let created=false;
if(!user){
 if(!process.stdin.isTTY)throw Error('Use an interactive terminal for masked password input.');
 let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
 const rl=readline.createInterface({input:process.stdin,output,terminal:true});
 const password=await new Promise(resolve=>{rl.question('Temporary password (minimum 12 characters): ',value=>{rl.close();process.stdout.write('\n');resolve(value);});muted=true;});
 if(typeof password!=='string'||password.length<12)throw Error('Password must contain at least 12 characters.');
 const r=await db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{kalika_password_change_required:true}});
 if(r.error||!r.data.user)throw Error('Account creation failed. No membership was added.');user=r.data.user;created=true;
}
const r=await db.rpc('access_provision',{p_org:org,p_org_name:orgName,p_user:user.id,p_name:name,p_email:email,p_role:role,p_owner:args.includes('--owner'),p_new_account:created||user.app_metadata?.kalika_password_change_required===true,p_templates:DEFAULT_ROLES});
if(r.error){console.error(JSON.stringify({status:'membership-failed',accountCreated:created,userId:user.id,recovery:'Correct the membership error and rerun with the same email. The account will be reused, not deleted or reset.',code:r.error.code}));process.exitCode=1;}else console.log(JSON.stringify(r.data));
