import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('./route.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
const functions=['connectionSortTime','pickRelevantConnections'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name).getText(ast)).join('\n');
const code=ts.transpileModule(functions+'\nexports.list=pickRelevantConnections;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(code,{exports,RESUMABLE_REVOKE_REASONS:['Disconnected by user.','Disconnected by connector.','Disconnected from another device by user.'],serializeTallyConnectionStatus:r=>({...r,lastHeartbeatAt:null,createdAt:'2026-10-17T00:00:00Z'})});
test('paused PCs survive list refresh, removed PCs stay hidden, newer active pairing wins',()=>{
 const paused={id:'paused',installation_id:'one',revoked_at:'2026-10-17',revoked_reason:'Disconnected by user.',status:'waiting_for_bridge'};
 assert.equal(exports.list([paused])[0].id,'paused');
 assert.equal(exports.list([{...paused,revoked_reason:'Removed by user.'}]).length,0);
 const active={...paused,id:'active',revoked_at:null,bridge_token_hash:'active'};
 assert.equal(exports.list([paused,active]).length,1);assert.equal(exports.list([paused,active])[0].id,'active');
 assert.equal(exports.list([{...paused,installation_id:null}]).length,0);
});
