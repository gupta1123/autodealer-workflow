import assert from "node:assert/strict";
import test from "node:test";
import { WebSocketServer } from "ws";

import { startCashDiscountLiveChannel } from "./bridge.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the live channel asks the gateway every interval and reconnects when nothing comes back", async (t) => {
  // A gateway that answers heartbeats until told to go silent, like a
  // connection lost to a network drop that never reported closing.
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise((resolve) => server.once("listening", resolve));
  const connections = [];
  let answering = true;
  server.on("connection", (socket) => {
    const received = [];
    connections.push(received);
    socket.on("message", (buffer) => {
      const message = JSON.parse(buffer.toString());
      received.push(message);
      if (message.type === "authenticate") socket.send(JSON.stringify({ type: "authenticated" }));
      else if (message.type === "heartbeat" && answering) socket.send(JSON.stringify({ type: "heartbeat" }));
    });
  });
  process.env.CASH_DISCOUNT_GATEWAY_URL = `ws://127.0.0.1:${server.address().port}`;
  const logs = [];
  const stop = startCashDiscountLiveChannel({ apiBase: "https://kalika.example", connectionId: "c-1", bridgeToken: "t" }, async () => {},
    { onLog: (entry) => logs.push(entry.message), liveKeepaliveMs: 30, liveStaleAfterMs: 100 });
  t.after(async () => {
    stop();
    delete process.env.CASH_DISCOUNT_GATEWAY_URL;
    for (const client of server.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  });

  // While the gateway answers, the same connection is kept.
  await wait(400);
  assert.equal(connections.length, 1, "no reconnect while the gateway answers");
  assert.equal(connections[0][0].type, "authenticate");
  assert.ok(connections[0].filter((message) => message.type === "heartbeat").length >= 5, "asks the gateway every interval");

  // Silence: the agent drops the connection and opens a new one (first retry after 3 s).
  answering = false;
  await wait(3_500);
  assert.ok(logs.some((message) => /stopped answering/.test(message)));
  assert.equal(connections.length, 2, "a new connection replaces the silent one");
  assert.equal(connections[1][0].type, "authenticate");
});
