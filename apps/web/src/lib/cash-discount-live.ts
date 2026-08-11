"use client";

import { getApiAccessToken } from "@/lib/api-client";

type LiveRequest = {
  connectionId: string;
  companyName: string;
  operation: "scan" | "create_debit_note";
  proposal?: Record<string, unknown>;
  onProgress?: (message: string) => void;
};

type LiveResult<T> = {
  type?: string;
  requestId?: string;
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

function gatewayUrl() {
  const configured = String(process.env.NEXT_PUBLIC_CASH_DISCOUNT_GATEWAY_URL || "").trim();
  if (configured) return configured;
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    url.port = "3002";
    url.pathname = "/";
  } else {
    url.pathname = "/cash-discount-live";
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function runCashDiscountLiveRequest<T>(request: LiveRequest) {
  const accessToken = await getApiAccessToken();
  const localMode = process.env.NEXT_PUBLIC_LOCAL_DB_MODE === "true";
  if (!accessToken && !localMode) throw new Error("Your session has expired. Sign in and try again.");

  return new Promise<T>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const socket = new WebSocket(gatewayUrl());
    let settled = false;
    const finish = (error?: Error, data?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve(data as T);
    };
    const timeout = window.setTimeout(
      () => finish(new Error("The live Tally request timed out. Check the connector and try again.")),
      4 * 60_000
    );

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "authenticate",
        role: "browser",
        connectionId: request.connectionId,
        token: accessToken || "local-development",
      }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data ?? "{}")) as LiveResult<T>;
        if (message.type === "authenticated") {
          socket.send(JSON.stringify({
            type: "request",
            requestId,
            operation: request.operation,
            companyName: request.companyName,
            proposal: request.proposal,
          }));
        } else if (message.type === "progress" && message.requestId === requestId) {
          request.onProgress?.(message.message || "Reading live Tally data...");
        } else if (message.type === "result" && message.requestId === requestId) {
          if (message.success === true) finish(undefined, message.data);
          else finish(new Error(message.error || "The live Tally request failed."));
        } else if (message.type === "error") {
          finish(new Error(message.error || "The live Cash Discount channel failed."));
        }
      } catch {
        finish(new Error("The live Cash Discount channel returned an invalid response."));
      }
    });
    socket.addEventListener("error", () => {
      finish(new Error("Could not connect to the live Cash Discount channel. Start the gateway and connector, then try again."));
    });
    socket.addEventListener("close", () => {
      if (!settled) finish(new Error("The live Cash Discount channel closed before the request completed."));
    });
  });
}
