import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import fs from 'node:fs';import ts from 'typescript';import React from 'react';import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const code=ts.transpileModule(fs.readFileSync(new URL('./TallyConnectionPill.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(online){
 const component=({children})=>React.createElement('span',null,children);
 const exports={},imports={react:{useEffect(){},useState:()=>[{id:'pc',online},()=>{}]},'react/jsx-runtime':jsx,'next/link':{default:component},'lucide-react':{AlertTriangle:()=>React.createElement('i',null,'warning'),Loader2:()=>React.createElement('i',null,'checking'),RefreshCw:component},'@/lib/cash-discount-live':{watchTallyConnection(){}},'@/components/ui/company-avatar':{CompanyAvatar:()=>React.createElement('i',null,'green verified')}};
 vm.runInNewContext(code,{exports,require:name=>imports[name]});
 return renderToStaticMarkup(exports.TallyConnectionPill({connectionId:'pc',title:'Tally company verified',subtitle:'Kalika',status:'verified',onRefresh(){}}));
}
test('a recent green heartbeat cannot hide a lost live connection',()=>{
 assert.match(render(false),/Live Tally connection unavailable/);assert.doesNotMatch(render(false),/green verified|Tally company verified/);
 assert.match(render(null),/Checking live Tally connection/);assert.doesNotMatch(render(null),/green verified/);
 assert.match(render(true),/green verified/);
});
