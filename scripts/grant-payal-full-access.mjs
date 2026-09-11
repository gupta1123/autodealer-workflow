// Explicit user-authorized Kalika account setup. No schema or policy changes.
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(new URL(url).hostname!=='ktpaupxmlbtpjgvigmpb.supabase.co')throw Error('Wrong project');
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const user='9046f797-9f18-428f-ac1c-0e3427a3387e',connection='29adcd99-6460-4698-92e7-a06e0142954d';
const get=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
let snapshot=await get(db.rpc('access_snapshot',{p_user:user,p_org:user}));
if(snapshot.member.email!=='guptapayal8820@gmail.com'||!snapshot.member.is_owner)throw Error('Account mismatch');
const conn=await get(db.from('tally_connections').select('id,owner_user_id,organization_id,installation_id,last_companies_snapshot').eq('id',connection).is('revoked_at',null).single());
if(conn.owner_user_id!==user||conn.organization_id!==user)throw Error('Connection ownership mismatch');
const company=conn.last_companies_snapshot.filter(c=>c.companyName==='Solution Nyx'&&c.guid==='6a1e6251-3050-4d46-8ccf-847e223ac92d'&&c.financialYear==='2026-27');
if(company.length!==1)throw Error('Company evidence mismatch');
const permissions=(await get(db.from('access_permissions').select('key'))).map(p=>p.key);
if(!process.argv.includes('--execute')){console.log('Dry run: Payal, all permissions and modules, all companies; map verified Solution Nyx.');process.exit(0);}
let role=await get(db.from('access_roles').select('id,permissions').eq('organization_id',user).eq('name','Administrator — Full access').maybeSingle());
if(!role)role=await get(db.rpc('access_change',{p_actor:user,p_org:user,p_action:'role.create',p_target:null,p_expected:0,p_data:{name:'Administrator — Full access',cloneId:snapshot.role.id,permissions,_accessRevision:snapshot.revision}}));
else if(permissions.some(p=>!role.permissions.includes(p)))throw Error('Existing role differs; review required');
snapshot=await get(db.rpc('access_snapshot',{p_user:user,p_org:user}));
await get(db.rpc('access_change',{p_actor:user,p_org:user,p_action:'member.update',p_target:user,p_expected:snapshot.member.revision,p_data:{roleId:role.id,allCompanies:true,companyIds:[],modules:['purchases','bank','discounts','followups'],_accessRevision:snapshot.revision}}));
const identity=JSON.stringify(['tally',connection,conn.installation_id,company[0].guid]);
let registered=await get(db.from('access_companies').select('id').eq('organization_id',user).eq('erp_identity',identity).maybeSingle());
if(!registered)registered=await get(db.from('access_companies').insert({organization_id:user,name:company[0].companyName,erp_identity:identity}).select('id').single());
const existing=await get(db.from('access_company_links').select('company_id').eq('organization_id',user).eq('connection_id',connection).eq('installation_id',conn.installation_id).eq('company_guid',company[0].guid).eq('financial_year',company[0].financialYear).maybeSingle());
if(existing&&existing.company_id!==registered.id)throw Error('Mapping conflict');
if(!existing)await get(db.from('access_company_links').insert({organization_id:user,company_id:registered.id,connection_id:connection,installation_id:conn.installation_id,company_guid:company[0].guid,financial_year:company[0].financialYear,verified_at:new Date().toISOString(),evidence:'User-authorized setup from paired connector company GUID snapshot'}));
snapshot=await get(db.rpc('access_snapshot',{p_user:user,p_org:user}));
await get(db.from('access_audit').insert({organization_id:user,actor_id:user,action:'company.mapping_verified',target_id:registered.id,revision:snapshot.revision,details:{connectionId:connection,companyGuid:company[0].guid,financialYear:company[0].financialYear}}));
console.log(JSON.stringify({email:snapshot.member.email,role:snapshot.role.name,permissionCount:snapshot.role.permissions.length,modules:snapshot.member.modules,allCompanies:snapshot.member.all_companies,companies:snapshot.companies,selfApproval:snapshot.allowSelfApproval}));
