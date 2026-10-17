import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('./route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(denied=false){
 const mappings=[{connection_id:'operator-pc',owner_user_id:'aditya',company_name:'Kalika (26-27)',mapping_type:'item_hsn',source_key:'7204',target_master_name:'Scrap',status:'active'},
 {connection_id:'owner-pc',owner_user_id:'owner',company_name:'Kalika (26-27)',mapping_type:'item_hsn',source_key:'7204',target_master_name:'Old scrap',status:'active'},
 {connection_id:'owner-pc',owner_user_id:'owner',company_name:'Kalika (25-26)',mapping_type:'item_hsn',source_key:'7204',target_master_name:'Prior FY',status:'active'},
 {connection_id:'foreign-pc',owner_user_id:'other',company_name:'Kalika (26-27)',mapping_type:'item_hsn',source_key:'7204',target_master_name:'Other org',status:'active'}];
 const calls=[];
 const db={from(table){assert.equal(table,'tally_mapping_settings');let mutation=null,filters=[];const q={delete(){mutation='delete';return q;},insert(row){mutation=row;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},ilike(k,v){filters.push(r=>r[k].toLowerCase()===v.toLowerCase());return q;},then(resolve,reject){if(mutation==='delete'){for(let i=mappings.length-1;i>=0;i--)if(filters.every(f=>f(mappings[i])))mappings.splice(i,1);}else if(mutation)mappings.push(mutation);return Promise.resolve({error:null}).then(resolve,reject);}};return q;}};
 const exports={};const scope={organizationId:'org',companyId:'kalika26'};
 vm.runInNewContext(code,{exports,URL,process:{env:{TEAM_ACCESS_ENFORCEMENT:'true'}},require:name=>({
 '@/lib/access/route-boundary':{withTeamAccess:handler=>handler},
 '@/lib/api/cors':{jsonWithCors:(_r,data,options)=>({data,status:options?.status||200}),optionsWithCors:()=>({})},
 '@/lib/api/request-auth':{requireRequestUser:async()=>({id:'owner'})},
 '@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},
 '@/lib/access/dataset':{requireDataset:async(_r,id,selection,permission)=>{calls.push({id,selection,permission});if(denied)throw {status:403,message:'Outside your company'};return {access:{organizationId:'org'},link:{company_id:'kalika26'}};}},
 '@/lib/access/failures':{accessFailureResponse:(_r,e)=>e.status?{status:e.status}:null},
 '@/lib/tally/company-mappings':{companyMappingConnectionIds:async()=>['operator-pc','owner-pc'],readCompanyMappings:async(_db,p)=>{assert.deepEqual({...p.scope},scope);return mappings.filter(m=>m.company_name==='Kalika (26-27)'&&m.connection_id==='operator-pc');}},
 })[name]||(()=>{throw Error(name);})()});
 const request=body=>({url:'https://api/api/settings/purchase-posting-defaults?connectionId=operator-pc&companyName=Kalika%20(26-27)',json:async()=>({connectionId:'operator-pc',companyName:'Kalika (26-27)',...body})});
 return {get:()=>exports.GET(request()),put:body=>exports.PUT(request(body)),mappings,calls};
}
test('settings manager reads shared purchase defaults on another member’s connector',async()=>{const f=fixture();const r=await f.get();assert.equal(r.status,200);assert.equal(r.data.materials.find(m=>m.hsn==='7204').stockItem,'Scrap');assert.equal(f.calls[0].permission,'settings.manage');});
test('clearing a company default removes every same-FY copy without touching another company',async()=>{const f=fixture();const r=await f.put({material:{hsn:'7204',field:'stockItem',value:''}});assert.equal(r.status,200);assert.equal(f.mappings.length,2);assert(f.mappings.some(m=>m.target_master_name==='Prior FY'));assert(f.mappings.some(m=>m.target_master_name==='Other org'));});
test('saving a default replaces same-company copies and preserves actor attribution',async()=>{const f=fixture();const r=await f.put({material:{hsn:'7204',field:'stockItem',value:{name:'Confirmed current stock',guid:'live-guid'}}});assert.equal(r.status,200);const row=f.mappings.find(m=>m.target_master_name==='Confirmed current stock');assert.equal(row.owner_user_id,'owner');assert.equal(row.connection_id,'operator-pc');assert.equal(f.mappings.length,3);});
test('unauthorized company requests cannot read or change defaults',async()=>{const f=fixture(true);assert.equal((await f.get()).status,403);assert.equal((await f.put({material:{hsn:'7204',field:'stockItem',value:''}})).status,403);assert.equal(f.mappings.length,4);});
