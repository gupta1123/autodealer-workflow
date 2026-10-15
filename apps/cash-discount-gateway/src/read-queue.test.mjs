import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {WebSocket} from 'ws';
import {startCashDiscountGateway} from './server.mjs';

function next(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', receive); reject(Error('Expected gateway message was not received')); }, 5000);
    function receive(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', receive); resolve(message);
    }
    socket.on('message', receive);
  });
}

async function setup(t) {
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({authenticated:true, ownerUserId:'owner', connectionId:body.connectionId}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const gateway = startCashDiscountGateway({server, path:'/live', apiBaseUrl:base, followupAutomation:false});
  t.after(async () => {
    for (const socket of gateway.clients) socket.terminate();
    await new Promise(resolve => gateway.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  async function open(role, connectionId = 'connection') {
    const socket = new WebSocket(base.replace('http', 'ws')+'/live');
    await new Promise((resolve,reject) => { socket.once('open',resolve);socket.once('error',reject); });
    const authenticated = next(socket, message => message.type === 'authenticated');
    socket.send(JSON.stringify({type:'authenticate',role,connectionId,token:role+'-token',bridgeVersion:'1.2.36'}));
    await authenticated;
    return socket;
  }
  const connector = await open('connector'), browser = await open('browser');
  const operations = [];
  connector.on('message', raw => { const message=JSON.parse(raw.toString());if(message.type==='operation')operations.push(message); });
  const request = (requestId, operation='ledger_masters', payload={}) => browser.send(JSON.stringify({type:'request',requestId,operation,companyName:'Company',payload}));
  const complete = requestId => connector.send(JSON.stringify({type:'operation_result',requestId,success:true,data:{source:'held catalogue'}}));
  return {connector,browser,operations,request,complete,open};
}

test('cached and fresh purchase master reads queue in order; cancelled waiting reads never reach the connector', async t => {
  const h = await setup(t);
  let forwarded = next(h.connector, m => m.type==='operation' && m.requestId==='cached');
  h.request('cached','ledger_masters',{requestedMasterTypes:['ledger','group','stock_item']}); await forwarded;
  let waiting = next(h.browser,m=>m.type==='progress'&&m.requestId==='fresh');
  h.request('fresh','ledger_masters',{requireFresh:true,requestedMasterTypes:['ledger','group','stock_item','unit','gst_ledger','tax_ledger']}); await waiting;
  waiting = next(h.browser,m=>m.type==='progress'&&m.requestId==='discarded');
  h.request('discarded'); await waiting;
  const cancelled = next(h.browser,m=>m.type==='result'&&m.requestId==='discarded');
  h.browser.send(JSON.stringify({type:'cancel',requestId:'discarded'}));
  assert.match((await cancelled).error,/cancelled/);
  assert.deepEqual(h.operations.map(m=>m.requestId),['cached']);
  forwarded = next(h.connector,m=>m.type==='operation'&&m.requestId==='fresh');
  h.complete('cached'); await forwarded;
  assert.equal(h.operations[1].payload.requireFresh,true);
  const result=next(h.browser,m=>m.type==='result'&&m.requestId==='fresh');
  h.complete('fresh'); assert.equal((await result).success,true);
  assert.deepEqual(h.operations.map(m=>m.requestId),['cached','fresh']);
});

test('bank verification waits for a master read, while another connector remains available', async t => {
  const h = await setup(t);
  let forwarded=next(h.connector,m=>m.type==='operation'&&m.requestId==='masters');
  h.request('masters');await forwarded;
  const waiting=next(h.browser,m=>m.type==='progress'&&m.requestId==='bank');
  h.request('bank','verify_bank_transaction');await waiting;
  const otherConnector=await h.open('connector','other'),otherBrowser=await h.open('browser','other');
  const otherForwarded=next(otherConnector,m=>m.type==='operation'&&m.requestId==='independent');
  otherBrowser.send(JSON.stringify({type:'request',requestId:'independent',operation:'ledger_masters',companyName:'Company'}));
  await otherForwarded;
  assert.deepEqual(h.operations.map(m=>m.requestId),['masters']);
  forwarded=next(h.connector,m=>m.type==='operation'&&m.requestId==='bank');
  h.complete('masters');await forwarded;
  const result=next(h.browser,m=>m.type==='result'&&m.requestId==='bank');
  h.complete('bank');assert.equal((await result).success,true);
  otherConnector.send(JSON.stringify({type:'operation_result',requestId:'independent',success:true,data:{}}));
});
