import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {canAccess} from '../../../../../packages/shared/src/lib/access.ts';

// Exercise the real catalogue-loading effect, including its asynchronous calls.
const source=await readFile(new URL('./TallyPurchasePostingPanel.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('automaticLiveRefreshRef.current === caseId'))effect=node.arguments[0].getText(ast);
 ts.forEachChild(node,visit);
}
visit(ast);assert(effect,'Catalogue effect must exist.');
const code=ts.transpileModule(`exports.run = ${effect}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

async function run({workflow=null,prepare=true,loading=false,error=null,enabled=true}={}){
 const calls=[];
 const snapshot={member:{status:'active',must_change_password:false,modules:['purchases']},role:{archived:false,permissions:prepare?['purchases.view','purchases.prepare']:['purchases.view']}};
 const next={selectedConnectionId:'kalika-connector',selectedCompanyName:'Kalika Steel',connection:{bridgeConnected:true,tallyReachable:true,companyLoaded:true},review:{supplierName:'Supplier',supplierLedgerName:''}};
 const noop=()=>{};
 const context={exports:{},caseId:'new-case',approval:{enabled,loading,error,workflow,snapshot},canAccess,
  automaticLiveRefreshRef:{current:null},liveMasterResultRef:{current:null},liveMasterOptionsRef:{current:null},
  load:async()=>{calls.push('load-review');return next;},
  runCashDiscountLiveRequest:async request=>{calls.push(request.operation);return {validation:{mode:'incremental_alter_id'}};},
  prepareLiveTallyCatalogue:()=>({compactResult:{},masterOptions:{ledgers:[{name:'Supplier ledger'}]}}),
  prepareTallyPurchasePostingFromLive:async()=>{calls.push('prepare-catalogue');return next;},
  withLiveMasterOptions:value=>value,
  setLiveMastersReady:noop,setPayload:noop,setReview:noop,setSupplierLedgerMatch:noop,setLineMasterMatches:noop,
  setSupplierLedgerMatchError:noop,setLineMasterMatchError:noop,setNotice:noop,setRefreshingMasters:noop,setError:noop,
 };
 vm.runInNewContext(code,context);context.exports.run();
 for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
 return calls;
}

test('a new case without an approval record loads ledgers and prepares the saved catalogue',async()=>{
 assert.deepEqual(await run(),['load-review','ledger_masters','prepare-catalogue']);
});
test('an existing draft and the legacy workflow still load ledgers',async()=>{
 for(const options of [{workflow:{state:'draft'}},{enabled:false}])assert((await run(options)).includes('ledger_masters'));
});
test('submitted, approved, posting and posted purchases do not auto-prepare a catalogue',async()=>{
 for(const state of ['awaiting_approval','approved','posting','posted'])assert.deepEqual(await run({workflow:{state}}),['load-review']);
});
test('read-only access and failed approval checks do not start catalogue preparation',async()=>{
 assert.deepEqual(await run({prepare:false}),['load-review']);
 assert.deepEqual(await run({error:'Approval unavailable.'}),['load-review']);
 assert.deepEqual(await run({loading:true}),[]);
});
