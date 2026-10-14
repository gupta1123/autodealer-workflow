import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { WebSocket } from "ws";

import { startCashDiscountGateway } from "./server.mjs";

function nextMessage(socket, predicate = () => true, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), timeoutMs);
    const onMessage = (buffer) => {
      const message = JSON.parse(buffer.toString());
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

test("live scan relays browser to connector and returns analysed dashboard", async t => {
  const requests = [];
  const httpServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    requests.push({ url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/collections/live/session") {
      response.end(JSON.stringify({
        authenticated: true,
        ownerUserId: "user-1",
        connectionId: "connection-1",
        customerScope: null,
        customerScopes: body.role === "browser"
          ? { "solution nyx": { mode: "strict", selectedGroupNames: ["Dealers"] } }
          : null,
        defaultCustomerScope: { mode: "automatic", selectedGroupNames: ["Sundry Debtors"] },
      }));
      return;
    }
    if (request.url === "/api/collections/live/analyse") {
      response.end(JSON.stringify({ setupRequired: false, tabs: { cashDiscountTracker: [] } }));
      return;
    }
    if (request.url === "/api/collections/live/analyse-preview") {
      response.end(JSON.stringify({ setupRequired: false, preview: true, tabs: { cashDiscountTracker: [] } }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const gateway = startCashDiscountGateway({
    server: httpServer,
    path: "/cash-discount-live",
    apiBaseUrl: baseUrl,
  });
  t.after(async () => {
    for (const socket of gateway.clients) socket.terminate();
    await new Promise(resolve => gateway.close(resolve));
    await new Promise(resolve => httpServer.close(resolve));
  });

  const connector = new WebSocket(`${baseUrl.replace("http", "ws")}/cash-discount-live`);
  await new Promise((resolve, reject) => {
    connector.once("open", resolve);
    connector.once("error", reject);
  });
  connector.send(JSON.stringify({
    type: "authenticate",
    role: "connector",
    connectionId: "connection-1",
    token: "bridge-token",
    bridgeVersion: "1.2.28",
  }));
  await nextMessage(connector, (message) => message.type === "authenticated");

  const browser = new WebSocket(`${baseUrl.replace("http", "ws")}/cash-discount-live`);
  await new Promise((resolve, reject) => {
    browser.once("open", resolve);
    browser.once("error", reject);
  });
  browser.send(JSON.stringify({
    type: "authenticate",
    role: "browser",
    connectionId: "connection-1",
    companyName: "",
    token: "access-token",
  }));
  await nextMessage(browser, (message) => message.type === "authenticated");

  browser.send(JSON.stringify({
    type: "request",
    requestId: "company-check-1",
    operation: "company_check",
    companyName: "",
  }));
  const companyOperation = await nextMessage(
    connector,
    (message) => message.type === "operation" && message.requestId === "company-check-1"
  );
  assert.equal(companyOperation.operation, "company_check");
  connector.send(JSON.stringify({
    type: "operation_result",
    requestId: "company-check-1",
    success: true,
    data: {
      activeCompany: "Solution Nyx",
      selectedCompany: "Solution Nyx",
      companies: [{ companyName: "Solution Nyx", isActive: true }],
    },
  }));
  const companyResult = await nextMessage(
    browser,
    (message) => message.type === "result" && message.requestId === "company-check-1"
  );
  assert.equal(companyResult.data.activeCompany, "Solution Nyx");

  browser.send(JSON.stringify({
    type: "request",
    requestId: "bank-check-1",
    operation: "verify_bank_transaction",
    companyName: "Solution Nyx",
    payload: {
      bankLedgerName: "State Bank of India - 42861007319",
      transactions: [{ transactionId: "transaction-1", amount: 100 }],
    },
  }));
  const bankCheckOperation = await nextMessage(
    connector,
    (message) => message.type === "operation" && message.requestId === "bank-check-1"
  );
  assert.equal(bankCheckOperation.operation, "verify_bank_transaction");
  assert.equal(bankCheckOperation.payload.bankLedgerName, "State Bank of India - 42861007319");
  connector.send(JSON.stringify({
    type: "operation_result",
    requestId: "bank-check-1",
    success: true,
    data: { transactions: [{ transactionId: "transaction-1", verificationStatus: "missing" }] },
  }));
  const bankCheckResult = await nextMessage(
    browser,
    (message) => message.type === "result" && message.requestId === "bank-check-1"
  );
  assert.equal(bankCheckResult.success, true);
  assert.equal(bankCheckResult.data.transactions[0].transactionId, "transaction-1");

  browser.send(JSON.stringify({
    type: "request",
    requestId: "request-1",
    operation: "scan",
    companyName: "Solution Nyx",
    financialYear: "2026-27",
    payload: {paged:true},
  }));
  const operation = await nextMessage(connector, (message) => message.type === "operation");
  assert.equal(operation.operation, "cash_discount_scan");
  assert.equal(operation.analysisContext,undefined,'An older connector must send raw evidence for the new backend RTGS rules.');
  assert.deepEqual(operation.customerScope, { mode: "strict", selectedGroupNames: ["Dealers"] });
  connector.send(JSON.stringify({
    type: "operation_result",
    requestId: "request-1",
    success: true,
    companyName: "Solution Nyx",
    data: {
      financialYear: "2026-27",
      ledgers: [],
      openBillsResult: {},
      benchmarkDiagnostics: { requestId: "request-1", totalMs: 125, tally: { callCount: 2 } },
    },
  }));

  const result = await nextMessage(browser, (message) => message.type === "result");
  assert.equal(result.success, true);
  assert.deepEqual(result.data.tabs.cashDiscountTracker, []);
  assert.equal(result.data.benchmarkDiagnostics.connector.requestId, "request-1");
  assert.equal(result.data.benchmarkDiagnostics.connector.tally.callCount, 2);
  assert.ok(result.data.benchmarkDiagnostics.gateway.totalMs >= 0);
  assert.ok(result.data.benchmarkDiagnostics.gateway.browserResultBytes > 0);

  browser.send(JSON.stringify({
    type: "request",
    requestId: "request-2",
    operation: "scan",
    companyName: "Solution Nyx",
    financialYear: "2026-27",
  }));
  const secondOperation = await nextMessage(
    connector,
    (message) => message.type === "operation" && message.requestId === "request-2"
  );
  assert.equal(secondOperation.operation, "cash_discount_scan");
  connector.send(JSON.stringify({
    type: "operation_result",
    requestId: "request-2",
    success: true,
    companyName: "Solution Nyx",
    data: { financialYear: "2026-27", ledgers: [], openBillsResult: {} },
  }));
  const secondResult = await nextMessage(
    browser,
    (message) => message.type === "result" && message.requestId === "request-2"
  );
  assert.equal(secondResult.success, true);

  // The socket is authenticated once per role, and every live operation is
  // authorized again so revoked permissions or pairings cannot keep reading.
  const sessions = requests.filter((request) => request.url === "/api/collections/live/session");
  assert.equal(sessions.filter(request => !request.body.operation).length, 2);
  assert.deepEqual(sessions.filter(request => request.body.operation).map(request => request.body.operation),
    ['company_check', 'verify_bank_transaction', 'scan', 'scan']);
  assert.equal(requests.filter((request) => request.url === "/api/collections/live/analyse").length, 2);
  assert.equal(requests.filter((request) => request.url === "/api/collections/live/analyse-preview").length, 0);

  browser.send(JSON.stringify({ type: "request", requestId: "cancel-1", operation: "scan", companyName: "Solution Nyx" }));
  await nextMessage(connector, (message) => message.requestId === "cancel-1");
  browser.send(JSON.stringify({ type: "request", requestId: "duplicate", operation: "scan", companyName: "Solution Nyx" }));
  const duplicate = await nextMessage(browser, (message) => message.requestId === "duplicate");
  assert.equal(duplicate.type, 'progress');
  assert.match(duplicate.message, /Waiting for the current check/);
  const cancelledOnConnector = nextMessage(connector, (message) => message.type === "cancel" && message.requestId === "cancel-1");
  const cancelledOnBrowser = nextMessage(browser, (message) => message.type === "result" && message.requestId === "cancel-1");
  browser.send(JSON.stringify({ type: "cancel", requestId: "cancel-1" }));
  await cancelledOnConnector;
  assert.match((await cancelledOnBrowser).error, /cancelled/);

  await nextMessage(connector, message => message.type === 'operation' && message.requestId === 'duplicate');
  const duplicateCancelled = nextMessage(browser, message => message.type === 'result' && message.requestId === 'duplicate');
  browser.send(JSON.stringify({ type: 'cancel', requestId: 'duplicate' }));
  assert.match((await duplicateCancelled).error, /cancelled/);

  browser.close();
  connector.close();
});

test('background RTGS reminder checks Tally without a browser connection',async t=>{
  const requests=[]; let complete=false;
  const context={connectionId:'auto-connection',companyName:'Company',companyGuid:'guid',financialYear:'2026-27',installationId:'install',sessionGeneration:1,initiatingUserId:'owner',organizationId:'org'};
  const httpServer=createServer(async(request,response)=>{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');requests.push({body,bridgeToken:request.headers['x-bridge-token']});response.setHeader('content-type','application/json');
    if(request.url==='/api/collections/live/session'){response.end(JSON.stringify({authenticated:true,ownerUserId:'owner',installationId:'install',sessionGeneration:1}));return;}
    if(body.action==='context'){response.end(JSON.stringify({contexts:complete?[]:[context]}));return;}
    if(body.action==='reconcile'){response.end(JSON.stringify({tasks:[{id:'auto-row',customer:'Customer',invoice:'INV',invoiceDate:'2026-10-10'}]}));return;}
    if(body.action==='deliver'){complete=true;response.end(JSON.stringify({status:'accepted'}));return;}
    response.statusCode=404;response.end('{}');
  });
  await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${httpServer.address().port}`;
  const gateway=startCashDiscountGateway({server:httpServer,path:'/agent-live',apiBaseUrl:url,followupAutomationIntervalMs:100});
  t.after(async()=>{for(const client of gateway.clients)client.terminate();await new Promise(resolve=>gateway.close(resolve));await new Promise(resolve=>httpServer.close(resolve));});
  const connector=new WebSocket(url.replace('http','ws')+'/agent-live');
  await new Promise((resolve,reject)=>{connector.once('open',resolve);connector.once('error',reject);});
  connector.send(JSON.stringify({type:'authenticate',role:'connector',connectionId:context.connectionId,token:'auto-bridge',bridgeVersion:'1.2.29'}));
  await nextMessage(connector,message=>message.type==='authenticated');
  const scan=await nextMessage(connector,message=>message.type==='operation'&&message.operation==='cash_discount_scan');
  assert.equal(scan.payload.requireFresh,true);assert.equal(scan.payload.automaticDiscovery,true);assert.equal(scan.agentIdentity.companyGuid,'guid');
  const freshRequest=nextMessage(connector,message=>message.type==='operation'&&message.operation==='fetch_customer_open_bills');
  connector.send(JSON.stringify({type:'operation_result',requestId:scan.requestId,success:true,data:{companyName:'Company',companyGuid:'guid',financialYear:'2026-27',scanSummary:{complete:true}}}));
  const check=await freshRequest;assert.equal(check.payload.forceLive,true);assert.equal(check.payload.verificationInvoice.invoice,'INV');
  const evidence={complete:true,byLedger:{Customer:{openBills:[{referenceName:'INV',invoiceDate:'2026-10-10',pendingAmount:123}]}}};
  connector.send(JSON.stringify({type:'operation_result',requestId:check.requestId,success:true,data:evidence}));
  for(let attempts=0;!complete&&attempts<50;attempts++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(complete,true);
  const delivery=requests.find(request=>request.body.action==='deliver');assert.equal(delivery.bridgeToken,'auto-bridge');assert.deepEqual(delivery.body.evidence,evidence);
});
