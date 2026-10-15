import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(process.env.KALIKA_TEST_PACKAGED_MAIN || new URL('./main.mjs',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture({ledgerCount=12015,vectorCount=12015}={}){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{hidden:id==='homeSetupBtn',textContent:'',className:'',style:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}});}return nodes.get(id);};
 const connection={state:'connected',companyName:'Solution Nyx'};
 const status={datasets:[{identity:{companyName:'Solution Nyx'},status:'ready',metrics:{ledgerCount,vectorCount}}]};
 const scope={document:{getElementById:node,querySelector:node},card:node('card'),localPanel:node('localPanel'),updatesPanel:node('updatesPanel'),duesPanel:node('duesPanel'),
   window:{kalikaAgent:{getStatus:async()=>status,getConnectionStatus:async()=>connection}},closeMenu(){},showError(error){throw error;},renderDues(){},duesBusy:false,friendlyPhase:()=>'',Date};
 vm.runInNewContext(section('      let homeLedgerStatusLoaded=', '      function closeMenu(')+'\n'+section('      async function refreshVisible(){','      function friendlyPhase(')+'\n'+section('function showMatching(){','function showUpdatesPage(){')+"\ndocument.getElementById('homeSetupBtn').onclick=showMatching;this.refresh=refreshVisible;this.statusEvent=renderConnection;",scope);
 return {node,scope,connection,status};
}
test('connection events do not expose the home action before ledger state loads',()=>{
 const f=fixture();f.scope.statusEvent(f.connection);assert.equal(f.node('homeSetupBtn').hidden,true);
});
test('a ready index keeps Open ledger status visible across polling and heartbeat events',async()=>{
 const f=fixture();await f.scope.refresh();
 for(let i=0;i<3;i++){f.scope.statusEvent(f.connection);assert.equal(f.node('homeSetupBtn').hidden,false);await f.scope.refresh();assert.equal(f.node('homeSetupBtn').hidden,false);assert.equal(f.node('homeSetupBtn').textContent,'Open ledger status');}
});
test('the visible home action opens the ledger matching panel',async()=>{
 const f=fixture();await f.scope.refresh();f.node('homeSetupBtn').onclick();assert.equal(f.node('localPanel').classList.contains('open'),true);
});
test('initial setup and disconnected states retain the appropriate home action',async()=>{
 const f=fixture({ledgerCount:0,vectorCount:0});await f.scope.refresh();assert.equal(f.node('homeSetupBtn').hidden,false);assert.equal(f.node('homeSetupBtn').textContent,'Set up ledger matching');f.connection.state='error';f.scope.statusEvent(f.connection);assert.equal(f.node('homeSetupBtn').hidden,true);
});
