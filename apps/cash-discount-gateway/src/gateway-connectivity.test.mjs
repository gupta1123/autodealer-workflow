import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { startCashDiscountGateway } from './server.mjs';

function message(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No gateway response')), 5000);
    const receive = buffer => {
      const payload = JSON.parse(buffer.toString());
      if (payload.type !== type) return;
      clearTimeout(timer);
      socket.off('message', receive);
      resolve(payload);
    };
    socket.on('message', receive);
  });
}

test('standalone gateway accepts IPv4 and IPv6 localhost', async t => {
  const gateway = startCashDiscountGateway({ port: 0 });
  t.after(async () => {
    for (const client of gateway.clients) client.terminate();
    await new Promise(resolve => gateway.close(resolve));
  });
  await new Promise(resolve => gateway.once('listening', resolve));
  for (const host of ['127.0.0.1', '[::1]']) {
    const socket = new WebSocket(`ws://${host}:${gateway.address().port}/`);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.close();
  }
});

test('offline connector is reported before a missing bridge token becomes a pairing error', async t => {
  let operationChecks = 0;
  const api = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    response.setHeader('Content-Type', 'application/json');
    if (body.operation) {
      operationChecks++;
      response.writeHead(409);
      response.end(JSON.stringify({ error: 'The connector pairing changed.' }));
    } else response.end(JSON.stringify({ authenticated: true, ownerUserId: 'owner' }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const gateway = startCashDiscountGateway({ server: api, apiBaseUrl: `http://127.0.0.1:${api.address().port}` });
  const socket = new WebSocket(`ws://127.0.0.1:${api.address().port}/agent-live`);
  t.after(async () => {
    socket.terminate();
    for (const client of gateway.clients) client.terminate();
    await new Promise(resolve => gateway.close(resolve));
    await new Promise(resolve => api.close(resolve));
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let reply = message(socket, 'authenticated');
  socket.send(JSON.stringify({ type: 'authenticate', role: 'browser', connectionId: 'offline', token: 'browser-token' }));
  assert.equal((await reply).type, 'authenticated');
  reply = message(socket, 'result');
  socket.send(JSON.stringify({ type: 'request', requestId: 'settings', operation: 'ledger_masters', companyName: 'Company' }));
  const result = await reply;
  assert.equal(result.success, false);
  assert.match(result.error, /not on the live Cash Discount channel/);
  assert.equal(operationChecks, 0);
});
