import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";

function harness() {
  let now = 1000;
  let epoch=0;
  const sockets = [];
  const timers = new Map();
  let nextTimer = 0;
  class Socket {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 1; handlers = new Map(); sent = []; closes = 0;
    constructor() { sockets.push(this); queueMicrotask(() => this.emit("open")); }
    addEventListener(name, handler) { this.handlers.set(name, [...(this.handlers.get(name) || []), handler]); }
    emit(name, data) { for (const handler of this.handlers.get(name) || []) handler(data); }
    message(value) { this.emit("message", { data: JSON.stringify(value) }); }
    send(raw) {
      const message = JSON.parse(raw); this.sent.push(message);
      if (message.type === "authenticate") queueMicrotask(() => this.message({ type: "authenticated",connectorOnline:true }));
    }
    close() { this.closes += 1; this.readyState = 3; this.emit("close"); }
  }
  const exports = {};
  const source = fs.readFileSync(new URL("./cash-discount-live.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, {
    exports, require: () => ({ getApiAccessToken: async () => "token",accessCacheEpoch:()=>epoch,registerAccessCache(){} }),
    sessionStorage:{getItem:()=>''},DOMException,AbortController,setTimeout,clearTimeout,
    WebSocket: Socket, Date: { now: () => now }, crypto: { randomUUID }, URL,
    process: { env: { NEXT_PUBLIC_CASH_DISCOUNT_GATEWAY_URL: "ws://localhost/test" } },
    window: { setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id) => timers.delete(id) },
  });
  return { request: exports.runCashDiscountLiveRequest, watch:exports.watchTallyConnection,sockets, timers, advance: (ms) => { now += ms; },invalidate:()=>epoch++,resume:()=>{const [id,fn]=[...timers].at(-1);timers.delete(id);fn();} };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a second request does not replace a two-minute-old socket with pending work", async () => {
  const h = harness();
  const first = h.request({ connectionId: "pc-A", companyName: "A", operation: "scan" });
  await tick();
  h.advance(125_000);
  const second = h.request({ connectionId: "pc-A", companyName: "A", operation: "company_check" });
  await tick();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.sockets[0].closes, 0);
  for (const message of h.sockets[0].sent.filter((entry) => entry.type === "request")) {
    h.sockets[0].message({ type: "result", requestId: message.requestId, success: true, data: {} });
  }
  await Promise.all([first, second]);
  assert.equal(h.timers.size, 0);
});

test('ledger loading recovers after an offline connector without replaying writes',async()=>{
 const h=harness();const progress=[];
 const result=h.request({connectionId:'pc-A',companyName:'A',operation:'ledger_masters',onProgress:p=>progress.push(p)});
 await tick();const socket=h.sockets[0];
 const first=socket.sent.find(m=>m.type==='request');
 socket.message({type:'result',requestId:first.requestId,success:false,error:'The live Tally connection is unavailable. Keep the Local Agent open; Kalika will reconnect automatically.'});
 await tick();assert.equal(progress.length,1);h.resume();await tick();
 const second=socket.sent.filter(m=>m.type==='request').at(-1);
 assert.notEqual(second.requestId,first.requestId);
 socket.message({type:'result',requestId:second.requestId,success:true,data:{ledgers:['kept']}});
 assert.equal((await result).ledgers[0],'kept');assert.equal(h.timers.size,0);
 const write=h.request({connectionId:'pc-A',companyName:'A',operation:'create_debit_note'});
 const rejected=assert.rejects(write,/unavailable/);await tick();
 socket.message({type:'result',requestId:socket.sent.at(-1).requestId,success:false,error:'The live Tally connection is unavailable.'});
 await rejected;assert.equal(h.timers.size,0);
});

test('permission denial is never retried and cancelling reconnect clears its timer',async()=>{
 const h=harness();const first=h.request({connectionId:'pc-A',companyName:'A',operation:'ledger_masters'});
 const denied=assert.rejects(first,/permission/);await tick();const socket=h.sockets[0];
 socket.message({type:'result',requestId:socket.sent.at(-1).requestId,success:false,error:'No permission to read this company'});
 await denied;assert.equal(h.timers.size,0);
 const controller=new AbortController();const second=h.request({connectionId:'pc-A',companyName:'A',operation:'ledger_masters',signal:controller.signal});
 const cancelled=assert.rejects(second,/stopped/);await tick();
 socket.message({type:'result',requestId:socket.sent.at(-1).requestId,success:false,error:'The live Tally connection is unavailable.'});
 await tick();controller.abort(new Error('stopped'));await cancelled;assert.equal(h.timers.size,0);
});

test('access change during reconnection prevents replay in another company scope',async()=>{
 const h=harness();const result=h.request({connectionId:'pc-A',companyName:'A',operation:'ledger_masters'});
 const rejected=assert.rejects(result,e=>e.name==='AbortError');await tick();const socket=h.sockets[0];
 socket.message({type:'result',requestId:socket.sent.at(-1).requestId,success:false,error:'The live Tally connection is unavailable.'});
 await tick();h.invalidate();h.resume();await rejected;
 assert.equal(socket.sent.filter(m=>m.type==='request').length,1);
});

test('live status follows connector loss and recovery without reading Tally',async()=>{
 const h=harness(),states=[];const stop=h.watch('pc-A',state=>states.push(state));await tick();
 const socket=h.sockets[0];socket.message({type:'connector_status',online:false});socket.message({type:'connector_status',online:true});
 assert.deepEqual(states,[null,true,false,true]);assert.equal(socket.sent.filter(m=>m.type==='request').length,0);stop();
 socket.message({type:'connector_status',online:false});assert.equal(states.length,4);
});

test("aborting a scan relays cancellation and clears its timeout", async () => {
  const h = harness(); const controller = new AbortController();
  const request = h.request({ connectionId: "pc-A", companyName: "A", operation: "scan", signal: controller.signal });
  const rejected = assert.rejects(request, /cancelled/);
  await tick(); controller.abort(new Error("cancelled")); await rejected;
  assert.equal(h.sockets[0].sent.filter((message) => message.type === "cancel").length, 1);
  assert.equal(h.timers.size, 0);
});

test("switching connector cancels reads on the previous socket", async () => {
  const h = harness();
  const first = h.request({ connectionId: "pc-A", companyName: "A", operation: "scan" });
  const rejected = assert.rejects(first, /replaced/);
  await tick();
  const second = h.request({ connectionId: "pc-B", companyName: "B", operation: "company_check" });
  await tick(); await rejected;
  assert.equal(h.sockets[0].sent.at(-1).type, "cancel");
  assert.equal(h.sockets.length, 2);
  const message = h.sockets[1].sent.find((entry) => entry.type === "request");
  h.sockets[1].message({ type: "result", requestId: message.requestId, success: true, data: {} });
  await second;
});
