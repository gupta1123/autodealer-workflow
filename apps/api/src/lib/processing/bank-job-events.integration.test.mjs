import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { subscribeBankJobEvents } from './bank-job-events.mjs';

// Exercise the actual Supabase client and a separate publishing process against
// a local protocol fixture. This is NOT a substitute for deployed Realtime/RLS QA.
test('private broker transport carries cross-process completion to only its scoped subscribers', { timeout: 10000 }, async t => {
  const original = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const sockets = new Map();
  let posted;
  const server = http.createServer(async (req, res) => {
    const match = req.url.match(/^\/realtime\/v1\/api\/broadcast\/([^/]+)\/events\/bank_job\?private=true$/);
    if (!match || req.headers.authorization !== 'Bearer local-fixture-key') { res.writeHead(403); res.end(); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    posted = JSON.parse(Buffer.concat(chunks).toString());
    const topic = `realtime:${decodeURIComponent(match[1])}`;
    for (const [socket, topics] of sockets) if (topics.has(topic)) socket.send(JSON.stringify([null, null, topic, 'broadcast', { event: 'bank_job', payload: posted }]));
    res.writeHead(202); res.end('{}');
  });
  const ws = new WebSocketServer({ server });
  ws.on('connection', socket => {
    sockets.set(socket, new Set());
    socket.on('close', () => sockets.delete(socket));
    socket.on('message', bytes => {
      const [join, ref, topic, event, payload] = JSON.parse(bytes.toString());
      if (event === 'phx_join') {
        assert.equal(payload.config.private, true);
        sockets.get(socket).add(topic);
      } else if (event === 'phx_leave') sockets.get(socket).delete(topic);
      socket.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-fixture-key';
  const stops = [];
  t.after(async () => {
    await Promise.all(stops.map(stop => stop()));
    for (const socket of sockets.keys()) socket.terminate();
    await new Promise(resolve => ws.close(resolve));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (original.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
    if (original.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
  });
  let receivedResolve;
  const received = new Promise(resolve => { receivedResolve = resolve; });
  let otherEvents = 0;
  await Promise.all(['connection-a', 'connection-b'].map(connection => new Promise(resolve => {
    stops.push(subscribeBankJobEvents('owner', connection,
      event => connection === 'connection-a' ? receivedResolve(event) : otherEvents++,
      online => { if (online) resolve(); }));
  })));
  const moduleUrl = new URL('./bank-job-events.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { publishBankJobEvent } from ${JSON.stringify(moduleUrl)};
    const ok = await publishBankJobEvent({ownerUserId:'owner',connectionId:'connection-a'}, 'bank_job_completed',
      {jobId:'job',importId:'import',revision:3,state:'completed',markdown:'never transmit',ledgerNames:['never transmit']});
    process.exit(ok ? 0 : 1);
  `], { env: process.env, stdio: 'ignore', windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Fixture publisher failed'))); });
  const [event] = await Promise.all([received, exited]);
  assert.equal(event.jobId, 'job'); assert.equal(event.revision, 3);
  assert.equal(otherEvents, 0);
  assert.equal(JSON.stringify(posted).includes('never transmit'), false);
});
