import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import {renderToStaticMarkup} from 'react-dom/server';
import {canAccess} from '../../../../../packages/shared/src/lib/access.ts';

const code=ts.transpileModule(await readFile(new URL('./TallyPrimeDashboard.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;

function fixture({module='bank',manager=false,allCompanies=false,connected=true,empty=false,view='connection'}={}) {
 const snapshot={member:{status:'active',must_change_password:false,is_owner:false,modules:[module],all_companies:allCompanies,company_ids:['kalika']},role:{archived:false,permissions:[`${module}.view`,...(manager?['connections.manage']:[])]}};
 const connection={id:'connector',displayName:'Office Tally',status:'company_loaded',bridgeConnected:connected,companyLoaded:connected,tallyReachable:connected,pairedAt:'2026-10-16T10:00:00Z',lastCompanyName:'Kalika Steel'};
 let stateIndex=0;
 const container=({children})=>React.createElement('div',null,children);
 const button=({children,...props})=>React.createElement('button',props,children);
 const imports={
  react:{useState:initial=>{
   const index=stateIndex++;
   return [index===1?(empty?[]:[connection]):index===4?false:initial,()=>{}];
  },useEffect:()=>{},useCallback:fn=>fn,useRef:()=>({current:false})},
  'react/jsx-runtime':jsx,'lucide-react':icons,'next/navigation':{useRouter:()=>({push(){}})},
  '@/lib/api-client':{apiFetch:()=>{throw Error('Unexpected API call during render');}},
  '@/components/dashboard/PageHeader':{PageHeader:({title})=>React.createElement('h1',null,title)},
  '@/components/ui/badge':{Badge:container},'@/components/ui/button':{Button:button},
  '@/components/ui/input':{Input:()=>React.createElement('input')},
  '@/components/ui/popover':{Popover:container,PopoverContent:container,PopoverTrigger:container},
  '@/components/tally/LocalAgentPanel':{LocalAgentPanel:()=>React.createElement('p',null,'Agent data status')},
  '@/components/tally/TallyCompanyLinkingPanel':{TallyCompanyLinkingPanel:()=>React.createElement('p',null,'Company mapping controls')},
  '@/components/cases/CaseConfirmDialog':{CaseConfirmDialog:()=>null},
  '@/components/access/AccessProvider':{useAccess:()=>({snapshot,enforcementRequired:true})},
  '@autodealer/shared/lib/access':{canAccess},
 };
 const exports={};
 vm.runInNewContext(code,{exports,process:{env:{}},require:name=>{if(!imports[name])throw Error(name);return imports[name];}});
 return renderToStaticMarkup(exports.TallyPrimeDashboard({initialView:view}));
}

test('Cases and Bank users see connection and agent status without management controls',()=>{
 for(const module of ['purchases','bank','discounts','followups']) {
  const html=fixture({module});
  assert.match(html,/Tally Connection/);assert.match(html,/Office Tally/);
  assert.match(html,/Agent data status/);
  assert.doesNotMatch(html,/Company mapping controls|Open connection menu|Disconnect…|Reconnect|Connection location/);
 }
});

test('offline and missing connections do not offer pairing to workflow-only users',()=>{
 assert.doesNotMatch(fixture({connected:false}),/Pair this PC again|Reconnect|Connection location/);
 const html=fixture({empty:true});
 assert.match(html,/Ask your administrator to connect Tally Prime/);
 assert.doesNotMatch(html,/Connect Tally Prime<\/button>/);
});

test('connection managers retain management, while company mapping needs all-company access',()=>{
 assert.match(fixture({manager:true}),/Open connection menu/);
 assert.doesNotMatch(fixture({manager:true}),/Company mapping controls/);
 assert.match(fixture({manager:true,allCompanies:true}),/Company mapping controls/);
 assert.match(fixture({manager:true,empty:true}),/Connect Tally Prime<\/button>/);
});

test('the integration hub only offers Bank Statements to users with Bank access',()=>{
 assert.doesNotMatch(fixture({view:'home',module:'purchases'}),/Bank Statements/);
 assert.match(fixture({view:'home',module:'bank'}),/Bank Statements/);
});
