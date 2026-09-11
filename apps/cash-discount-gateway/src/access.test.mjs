import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocket} from 'ws';
import {startCashDiscountGateway} from './server.mjs';

function receive(socket,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('message',listener);reject(Error('Socket timeout'));},3000);function listener(raw){const value=JSON.parse(raw.toString());if(predicate(value)){clearTimeout(timer);socket.off('message',listener);resolve(value);}}socket.on('message',listener);});}

test('every scoped operation rechecks authority even when the initial owner socket uses legacy mode',async t=>{
 let denied=false,checks=0,delivered=0;
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString());
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/collections/follow-ups/analyse') {
   assert.equal(body.companyName,'Company A'); assert.equal(body.financialYear,'2026-27');
   res.end(JSON.stringify({tabs:{paymentFollowUps:[{outstandingAmount:10}],debitNoteQueue:[]}})); return;
  }
  if(body.role==='browser')assert.equal(req.headers['x-kalika-organization'],'org-a');
  if(body.operation){checks++;if(denied){res.statusCode=403;res.end(JSON.stringify({error:'Access revoked'}));return;}}
  res.end(JSON.stringify({authenticated:true,teamAccess:Boolean(body.operation),ownerUserId:'paired-user',initiatingUserId:'operator-user',organizationId:'org-a',connectionId:'conn-a',companyName:'Company A',companyGuid:'guid-a',financialYear:'2026-27',installationId:'installation-a',sessionGeneration:2}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 const gateway=startCashDiscountGateway({server,path:'/test',apiBaseUrl:url});
 const sockets=[];
 t.after(async()=>{for(const socket of sockets)socket.terminate();for(const socket of gateway.clients)socket.terminate();await new Promise(resolve=>gateway.close(resolve));await new Promise(resolve=>server.close(resolve));});
 async function connect(role){const socket=new WebSocket(url.replace('http','ws')+'/test');sockets.push(socket);await new Promise(resolve=>socket.once('open',resolve));const ready=receive(socket,m=>m.type==='authenticated');socket.send(JSON.stringify({type:'authenticate',role,connectionId:'conn-a',token:'fixture',organizationId:'org-a',bridgeVersion:'1.0.0'}));await ready;return socket;}
 const connector=await connect('connector'),browser=await connect('browser');
 connector.on('message',raw=>{if(JSON.parse(raw).type==='operation')delivered++;});
 const operation=receive(connector,m=>m.type==='operation');
 browser.send(JSON.stringify({type:'request',requestId:'first',operation:'bank_ledgers',companyName:'Company A',financialYear:'2026-27'}));
 const command=await operation;assert.equal(command.agentIdentity.companyGuid,'guid-a');assert.equal(command.agentIdentity.initiatingUserId,'operator-user');assert.equal(checks,1);
 denied=true;
 const result=receive(browser,m=>m.type==='result'&&m.requestId==='first');
 connector.send(JSON.stringify({type:'operation_result',requestId:'first',success:true,data:{secretLedger:'never return this'}}));
 const rejected=await result;assert.equal(rejected.success,false);assert.equal(rejected.data,undefined);assert.equal(checks,2);
 const next=receive(browser,m=>m.type==='result'&&m.requestId==='second');
 browser.send(JSON.stringify({type:'request',requestId:'second',operation:'bank_ledgers',companyName:'Company A'}));
 assert.equal((await next).success,false);assert.equal(checks,3);assert.equal(delivered,1);
 denied=false;
 const followOperation=receive(connector,m=>m.type==='operation'&&m.requestId==='follow');
 browser.send(JSON.stringify({type:'request',requestId:'follow',operation:'followups_scan',companyName:'Company A',financialYear:'2026-27'}));
 const followCommand=await followOperation;
 assert.equal(followCommand.operation,'cash_discount_scan');
 const followResult=receive(browser,m=>m.type==='result'&&m.requestId==='follow');
 connector.send(JSON.stringify({type:'operation_result',requestId:'follow',success:true,companyName:'Untrusted response name',data:{}}));
 const completed=await followResult;
 assert.equal(completed.success,true); assert.equal(completed.data.tabs.paymentFollowUps.length,1);
 assert.deepEqual(completed.data.tabs.debitNoteQueue,[]);
});
