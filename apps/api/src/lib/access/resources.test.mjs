import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {canAccess} from '../../../../../packages/shared/src/lib/access.ts';
import {CONNECTION_STATUS_PERMISSIONS} from './route-policy.ts';

const compiled=ts.transpileModule(await readFile(new URL('./resources.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
class AccessError extends Error {constructor(message,status=403){super(message);this.status=status;}}
function setup({allCompanies=false,scope=null,owner='self',organization=null,company=null,isOwner=false,error=false,connection=false,manager=false,allowedConnection=true}={}) {
 const access={organizationId:'org',member:{user_id:'self',status:'active',must_change_password:false,is_owner:isOwner,all_companies:allCompanies,company_ids:['kalika'],modules:['purchases','bank','discounts']},role:{archived:false,permissions:['purchases.view','purchases.prepare','bank.view','discounts.view']}};
 if(manager){access.member.modules.push('connections');access.role.permissions.push('connections.manage');}
 let legacyReads=0;
 const db={from:table=>{
  const filters={};
  const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},is:(k,v)=>{filters[k]=v;return q;},limit:async()=>({data:[{organization_id:'org',company_id:'kalika'},{organization_id:'org',company_id:'nyx'}]}),maybeSingle:async()=>{
   if(table==='access_resource_scopes')return {data:scope};
   legacyReads++;
   const row={id,owner_user_id:owner,access_organization_id:organization,access_company_id:company};
   return {data:Object.entries(filters).every(([k,v])=>row[k]===v)?{id}:null,error:error?{}:null};
  }};return q;
 }};
 const exports={};const imports={
  '@autodealer/shared/lib/access':{canAccess},
  '@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},
  './server':{AccessError,requireAccessContext:async()=>access},
  './connection-scope':{permittedConnections:async()=>{assert(connection);return {access,links:allowedConnection?[{connection_id:id,company_id:'kalika'}]:[],rows:allowedConnection?[{id,owner_user_id:'self',installation_id:'pc'}]:[]};}},
  './route-policy':{CONNECTION_STATUS_PERMISSIONS},
 };
 vm.runInNewContext(compiled,{exports,require:name=>{if(!imports[name])throw Error(`Unexpected dependency ${name}`);return imports[name];}});
 return {read:(permission='purchases.view',type='case')=>exports.requireResourceAccess(new Request('http://localhost'),type,id,permission),get legacyReads(){return legacyReads;}};
}

test('restricted users, including an owner, cannot read unclassified records they created',async()=>{
 for(const isOwner of [false,true]){const h=setup({isOwner});await assert.rejects(h.read(),e=>e.status===404);assert.equal(h.legacyReads,0);}
});
test('unrestricted users retain only their own unmapped read access',async()=>{
 for(const [type,permission] of [['case','purchases.view'],['bank_import','bank.view'],['bank_account','bank.view'],['proposal','discounts.view']]){
  const h=setup({allCompanies:true});assert.equal((await h.read(permission,type)).scope.company_id,null);assert.equal(h.legacyReads,1);
 }
 for(const options of [{owner:'another-user'},{organization:'another-org'},{company:'another-company'}])await assert.rejects(setup({allCompanies:true,...options}).read(),e=>e.status===404);
});
test('unmapped writes and explicitly unclassified or wrong-company mappings remain denied',async()=>{
 await assert.rejects(setup({allCompanies:true}).read('purchases.prepare'),e=>e.status===404);
 await assert.rejects(setup({allCompanies:true,scope:{organization_id:'org',company_id:null}}).read(),e=>e.status===404);
 await assert.rejects(setup({scope:{organization_id:'org',company_id:'nyx'}}).read(),e=>e.status===404);
});
test('reviewed company grants work without original ownership and failures stay closed',async()=>{
 const h=setup({scope:{organization_id:'org',company_id:'kalika'},owner:'another-user'});
 assert.equal((await h.read()).scope.company_id,'kalika');assert.equal(h.legacyReads,0);
 await assert.rejects(setup({allCompanies:true,error:true}).read(),e=>e.status===503);
});

test('Kalika-only manager can read status on a PC also mapped to Nyx, while managing it stays restricted',async()=>{
 const r=setup({connection:true,manager:true});
 assert.equal((await r.read('@connection-status','connection')).scope.company_id,'kalika');
 await assert.rejects(r.read('connections.manage','connection'),e=>e.status===403&&/outside your access/.test(e.message));
});

test('status authority still requires a verified permitted connection and does not apply to case resources',async()=>{
 await assert.rejects(setup({connection:true,manager:true,allowedConnection:false}).read('@connection-status','connection'),e=>e.status===404);
 await assert.rejects(setup({manager:true}).read('@connection-status','case'),e=>e.status===403);
});
