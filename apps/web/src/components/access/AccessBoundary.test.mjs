import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {canAccess} from '../../../../../packages/shared/src/lib/access.ts';
import * as routes from '../../../../../packages/shared/src/lib/access-routes.ts';

const code=ts.transpileModule(await readFile(new URL('./AccessBoundary.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function fixture({path='/',module='bank',loading=false}={}){
 const snapshot={organizationId:'org',revision:1,member:{user_id:'bank-user',status:'active',must_change_password:false,is_owner:false,modules:[module],all_companies:false,company_ids:['kalika']},role:{archived:false,permissions:[`${module}.view`]}};
 const effects=[],redirects=[],exports={};let mounted=0;
 const imports={react:{useEffect:fn=>effects.push(fn)},'react/jsx-runtime':awaitImportJSX,
  'next/navigation':{usePathname:()=>path,useRouter:()=>({replace:p=>redirects.push(p)})},
  '@autodealer/shared/lib/access':{canAccess},'@autodealer/shared/lib/access-routes':routes,
  './AccessProvider':{useAccess:()=>({snapshot:loading?null:snapshot,loading,error:null,refresh(){},enforcementRequired:true})},
 };
 vm.runInNewContext(code,{exports,require:name=>{if(!imports[name])throw Error(name);return imports[name];}});
 const child=React.createElement(()=>{mounted++;return React.createElement('p',null,'Private page');});
 const html=renderToStaticMarkup(exports.AccessBoundary({children:child}));effects.forEach(fn=>fn());
 return {html,redirects,mounted};
}
const awaitImportJSX=await import('react/jsx-runtime');

test('Bank-only home navigation redirects without mounting the Cases dashboard',()=>{
 const f=fixture();assert.deepEqual(f.redirects,['/bank-statements']);assert.equal(f.mounted,0);assert.match(f.html,/Opening your workspace/);
});
test('wait for the membership before mounting any home dashboard',()=>{
 const f=fixture({loading:true});assert.equal(f.mounted,0);assert.deepEqual(f.redirects,[]);assert.match(f.html,/Checking access/);
});
test('Bank Statements and a permitted Cases dashboard remain usable',()=>{
 assert.equal(fixture({path:'/bank-statements'}).mounted,1);
 const cases=fixture({module:'purchases'});assert.equal(cases.mounted,1);assert.deepEqual(cases.redirects,[]);
});
test('direct navigation to a forbidden page shows denial without redirecting to login',()=>{
 const f=fixture({path:'/cases'});assert.equal(f.mounted,0);assert.deepEqual(f.redirects,[]);assert.match(f.html,/don’t have access/);
});

test('all financial workflows can open the Tally connection page',()=>{
 for(const module of ['purchases','bank','discounts','followups']) {
  const f=fixture({path:'/tally-prime',module});
  assert.equal(f.mounted,1);assert.deepEqual(f.redirects,[]);
 }
});
