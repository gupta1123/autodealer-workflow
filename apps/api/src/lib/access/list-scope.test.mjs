import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {canAccess} from '../../../../../packages/shared/src/lib/access.ts';

const source=await readFile(new URL('./list-scope.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class AccessError extends Error {constructor(message,status=403){super(message);this.status=status;}}
function setup({enabled=true,allCompanies=false,companyIds=['kalika-25','kalika-26'],modules=['purchases'],sharing=true}={}) {
 const snapshot={organizationId:'org',sharingEnabled:sharing,member:{status:'active',must_change_password:false,is_owner:false,all_companies:allCompanies,company_ids:companyIds,modules},role:{archived:false,permissions:['purchases.view','bank.view']}};
 let legacyQueries=0;
 const exports={};
 const imports={
  '@autodealer/shared/lib/access':{canAccess},
  './server':{AccessError,requireAccessContext:async()=>snapshot},
  '@/lib/supabase/admin':{createSupabaseAdminClient:()=>{legacyQueries++;return {from:()=>({select:()=>({eq:()=>({eq:async()=>({data:[{user_id:'original-owner'}]})})})})};}},
 };
 vm.runInNewContext(compiled,{exports,require:name=>{if(!imports[name])throw Error(`Unexpected dependency ${name}`);return imports[name];},process:{env:{TEAM_ACCESS_ENFORCEMENT:enabled?'true':'false'}}});
 return {predicate:permission=>exports.listAccessPredicate(new Request('http://localhost'),'self',permission),get legacyQueries(){return legacyQueries;}};
}

test('enforced Cases list uses both organization and explicit company scope',async()=>{
 const h=setup();
 assert.equal(await h.predicate('purchases.view'),'and(access_organization_id.eq."org",access_company_id.in.("kalika-25","kalika-26"))');
 assert.equal(h.legacyQueries,0);
});
test('no company scope exposes no Cases and another module is denied',async()=>{
 assert.equal(await setup({companyIds:[]}).predicate('purchases.view'),'id.is.null');
 await assert.rejects(setup({modules:['bank']}).predicate('purchases.view'),e=>e.status===403);
});
test('all-company access preserves only the requesting user’s own unclassified history',async()=>{
 assert.equal(await setup({allCompanies:true}).predicate('purchases.view'),'or(and(access_organization_id.eq."org",access_company_id.not.is.null),and(owner_user_id.eq."self",access_organization_id.is.null,access_company_id.is.null))');
 await assert.rejects(setup({sharing:false}).predicate('purchases.view'),e=>e.status===503);
});
test('enforced bank lists follow the same company boundary',async()=>{
 assert.equal(await setup({modules:['bank']}).predicate('bank.view'),'and(access_organization_id.eq."org",access_company_id.in.("kalika-25","kalika-26"))');
});
test('disabled enforcement preserves existing Cases membership and bank ownership',async()=>{
 const h=setup({enabled:false});
 assert.equal(await h.predicate('purchases.view'),'owner_user_id.in.("original-owner")');
 assert.equal(h.legacyQueries,1);
 assert.equal(await h.predicate('bank.view'),'owner_user_id.eq."self"');
});
