import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const compiled=ts.transpileModule(await readFile(new URL('./case-persistence.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(status,payload){
 const redirects=[];const exports={};
 const imports={
  '@/lib/api-client':{apiFetch:async()=>Response.json(payload,{status})},
  './protected-preview':{},'@/lib/upload-groups':{},
 };
 vm.runInNewContext(compiled,{exports,require:name=>{if(!imports[name])throw Error(name);return imports[name];},URL,URLSearchParams,window:{location:{origin:'https://app.example',pathname:'/bank-statements',search:'',assign:path=>redirects.push(path)}}});
 return {load:()=>exports.fetchRecentCases(),redirects};
}

test('Cases permission denials do not log a Bank-only user out',async()=>{
 for(const error of ['You do not have permission for this action.','Forbidden','Access verification is unavailable.','Session is not active']){
  const f=fixture(403,{error});await assert.rejects(f.load(),e=>e.status===403&&!e.isAuthError&&e.message===error);assert.equal(f.redirects.length,0);
 }
});
test('an expired session still redirects to login with the intended return path',async()=>{
 const f=fixture(401,{error:'Unauthorized'});await assert.rejects(f.load(),e=>e.isAuthError&&e.status===401);
 assert.equal(f.redirects.length,1);const redirect=new URL(f.redirects[0]);assert.equal(redirect.pathname,'/login');assert.equal(redirect.searchParams.get('next'),'/bank-statements');
});
test('server outages mentioning authorization do not end a valid session',async()=>{
 const f=fixture(503,{error:'Access authorization is temporarily unavailable.'});await assert.rejects(f.load(),e=>e.status===503&&!e.isAuthError);assert.equal(f.redirects.length,0);
});
