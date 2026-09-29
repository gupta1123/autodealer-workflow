import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { WebSocket } from "ws";

import { startCashDiscountGateway } from "./server.mjs";

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), 5_000);
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

async function withGateway(bridgeVersion, run) {
  const requests = [];
  const httpServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ url: request.url, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/collections/live/session") return response.end(JSON.stringify({ authenticated: true, ownerUserId: "user-1", connectionId: "connection-1" }));
    if (request.url === "/api/collections/live/analysis-context") return response.end(JSON.stringify({ proposalRows: [{ id: "dn-1" }], connectionStatus: "company_loaded", lastHeartbeatAt: "2026-09-29T10:00:00Z" }));
    if (request.url === "/api/collections/live/analyse") return response.end(JSON.stringify({ setupRequired: false, from: "api" }));
    if (request.url === "/api/collections/live/scan-event") return response.end("{}");
    response.statusCode = 404; response.end("{}");
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  const gateway = startCashDiscountGateway({ server: httpServer, path: "/live", apiBaseUrl: baseUrl });
  const open = async (auth) => {
    const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/live`, { perMessageDeflate: true });
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "authenticate", connectionId: "connection-1", ...auth }));
    await nextMessage(socket, (message) => message.type === "authenticated");
    return socket;
  };
  const connector = await open({ role: "connector", token: "bridge-token", bridgeVersion });
  const browser = await open({ role: "browser", token: "access-token", companyName: "Solution Nyx" });
  try {
    await run({ connector, browser, requests, open });
  } finally {
    browser.close(); connector.close();
    for (const socket of gateway.clients) socket.terminate();
    await new Promise((resolve) => gateway.close(resolve));
    httpServer.closeAllConnections?.();
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

test("scans are compressed, and the API analyses unless connector analysis is switched on", async () => {
  await withGateway("1.2.24", async ({ connector, browser, requests }) => {
    assert.ok(connector.extensions.includes("permessage-deflate"), "the connector connection is compressed");
    assert.ok(browser.extensions.includes("permessage-deflate"), "the browser connection is compressed");
    browser.send(JSON.stringify({ type: "request", requestId: "scan-0", operation: "scan", companyName: "Solution Nyx", financialYear: "2026-27" }));
    const operation = await nextMessage(connector, (message) => message.type === "operation" && message.requestId === "scan-0");
    assert.equal(operation.analysisContext, undefined, "off by default");
    connector.send(JSON.stringify({ type: "operation_result", requestId: "scan-0", success: true, data: { financialYear: "2026-27", ledgers: [], openBillsResult: {} } }));
    const result = await nextMessage(browser, (message) => message.type === "result" && message.requestId === "scan-0");
    assert.equal(result.data.from, "api");
    assert.equal(requests.filter((request) => request.url === "/api/collections/live/analysis-context").length, 0);
  });
});

test("with connector analysis switched on, a 1.2.24 connector's dashboard goes straight to the browser", async (t) => {
  process.env.CASH_DISCOUNT_CONNECTOR_ANALYSIS = "true";
  t.after(() => { delete process.env.CASH_DISCOUNT_CONNECTOR_ANALYSIS; });
  await withGateway("1.2.24", async ({ connector, browser, requests }) => {
    assert.ok(connector.extensions.includes("permessage-deflate"), "the connector connection is compressed");
    browser.send(JSON.stringify({ type: "request", requestId: "scan-1", operation: "scan", companyName: "Solution Nyx", financialYear: "2026-27" }));
    const operation = await nextMessage(connector, (message) => message.type === "operation" && message.requestId === "scan-1");
    assert.deepEqual(operation.analysisContext, { proposalRows: [{ id: "dn-1" }], connectionStatus: "company_loaded", lastHeartbeatAt: "2026-09-29T10:00:00Z", followUps: false });
    connector.send(JSON.stringify({ type: "operation_result", requestId: "scan-1", success: true,
      data: { analysed: true, dashboard: { setupRequired: false, from: "connector" }, cache: { source: "prepared_customer_dues" }, scanSummary: { complete: true } } }));
    const result = await nextMessage(browser, (message) => message.type === "result" && message.requestId === "scan-1");
    assert.equal(result.data.from, "connector");
    assert.deepEqual(result.data.scanSummary, { complete: true });
    assert.equal(requests.filter((request) => request.url === "/api/collections/live/analyse").length, 0, "no server analysis");
  });
});

test("a paged scan: 1.2.25 connector keeps the dashboard, and only the browser that scanned can read its pages", async () => {
  await withGateway("1.2.25", async ({ connector, browser, requests, open }) => {
    browser.send(JSON.stringify({ type: "request", requestId: "scan-p", operation: "scan", companyName: "Solution Nyx", financialYear: "2026-27", payload: { paged: true } }));
    const operation = await nextMessage(connector, (message) => message.type === "operation" && message.requestId === "scan-p");
    assert.ok(operation.analysisContext, "paged scans get the context without the switch");
    assert.equal(operation.payload.paged, true);
    connector.send(JSON.stringify({ type: "operation_result", requestId: "scan-p", success: true,
      data: { analysed: true, dashboard: { paged: true, dashboardId: "connection-1|solutionnyx|2026-27|discounts|r1", summary: { followUps: { total: 9071 } } }, scanSummary: { complete: true } } }));
    const shell = await nextMessage(browser, (message) => message.type === "result" && message.requestId === "scan-p");
    assert.equal(shell.data.dashboardId, "connection-1|solutionnyx|2026-27|discounts|r1");

    browser.send(JSON.stringify({ type: "request", requestId: "page-1", operation: "collections_query",
      payload: { dashboardId: "connection-1|solutionnyx|2026-27|discounts|r1", query: { view: "followUps", page: 2, pageSize: 25 } } }));
    const forwarded = await nextMessage(connector, (message) => message.requestId === "page-1");
    assert.equal(forwarded.operation, "collections_query");
    assert.deepEqual(forwarded.payload.query, { view: "followUps", page: 2, pageSize: 25 });
    connector.send(JSON.stringify({ type: "operation_result", requestId: "page-1", success: true, data: { total: 9071, page: 2, rows: [{ id: "fu-26" }] } }));
    const page = await nextMessage(browser, (message) => message.type === "result" && message.requestId === "page-1");
    assert.deepEqual(page.data.rows, [{ id: "fu-26" }]);
    assert.equal(requests.filter((request) => request.url === "/api/collections/live/session" && request.body.operation === "collections_query").length, 0, "pages are not re-authorized each time");

    browser.send(JSON.stringify({ type: "request", requestId: "page-x", operation: "collections_query", payload: { dashboardId: "connection-1|other|r9", query: { view: "followUps" } } }));
    assert.match((await nextMessage(browser, (message) => message.requestId === "page-x")).error, /expired|Refresh/);

    const otherBrowser = await open({ role: "browser", token: "other-token", companyName: "Solution Nyx" });
    otherBrowser.send(JSON.stringify({ type: "request", requestId: "page-o", operation: "collections_query",
      payload: { dashboardId: "connection-1|solutionnyx|2026-27|discounts|r1", query: { view: "followUps" } } }));
    const refused = await nextMessage(otherBrowser, (message) => message.requestId === "page-o");
    assert.equal(refused.success, false, "another browser connection cannot read this dashboard");
    otherBrowser.close();
  });
});

test("an older connector gets no context and the API analyses its open bills, as before", async (t) => {
  process.env.CASH_DISCOUNT_CONNECTOR_ANALYSIS = "true";
  t.after(() => { delete process.env.CASH_DISCOUNT_CONNECTOR_ANALYSIS; });
  await withGateway("1.2.23", async ({ connector, browser, requests }) => {
    browser.send(JSON.stringify({ type: "request", requestId: "scan-2", operation: "scan", companyName: "Solution Nyx", financialYear: "2026-27" }));
    const operation = await nextMessage(connector, (message) => message.type === "operation" && message.requestId === "scan-2");
    assert.equal(operation.analysisContext, undefined);
    connector.send(JSON.stringify({ type: "operation_result", requestId: "scan-2", success: true, data: { financialYear: "2026-27", ledgers: [], openBillsResult: {} } }));
    const result = await nextMessage(browser, (message) => message.type === "result" && message.requestId === "scan-2");
    assert.equal(result.data.from, "api");
    assert.equal(requests.filter((request) => request.url === "/api/collections/live/analysis-context").length, 0);
  });
});
