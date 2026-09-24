import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { subscribeBankJobEvents } from '../../api/src/lib/processing/bank-job-events.mjs';
import {scopedCompanyCheck} from './company-scope.mjs';
import {createScopedBankSubscriptions} from './bank-job-subscriptions.mjs';
import {waitForDurableDiscount} from './durable-discount.mjs';

const PORT = Number(process.env.CASH_DISCOUNT_GATEWAY_PORT || 3002);
const HOST = process.env.CASH_DISCOUNT_GATEWAY_HOST || "0.0.0.0";
let apiBaseUrl = (process.env.CASH_DISCOUNT_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const AUTH_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 4 * 60_000;
const SERIAL_OPERATION_WAIT_MS = 20_000;
const MAX_MESSAGE_BYTES = 30 * 1024 * 1024;

const metadata = new WeakMap();
const connectors = new Map();
const pending = new Map();
const activeDebitNotes = new Set();

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function closeWithError(socket, message, code = 1008) {
  send(socket, { type: "error", error: message });
  socket.close(code, message.slice(0, 120));
}

async function apiRequest(path, { accessToken, bridgeToken, organizationId, body, signal, method='POST' }) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (bridgeToken) headers["X-Bridge-Token"] = bridgeToken;
  if (organizationId) headers['X-Kalika-Organization'] = organizationId;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: method==='GET'?undefined:JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Cash Discount API failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function clearPending(requestId) {
  const item = pending.get(requestId);
  if (!item) return null;
  clearTimeout(item.timeout);
  pending.delete(requestId);
  item.controller.abort();
  if (item.debitNoteKey) activeDebitNotes.delete(item.debitNoteKey);
  return item;
}

function recordScanOutcome(item, status, data, error) {
  if (!item || item.operation !== 'scan') return;
  const message = String(error?.message || '');
  // One compact terminal event, never the dataset, narration or customer list.
  void apiRequest('/api/collections/live/scan-event', {
    accessToken:item.accessToken, organizationId:item.organizationId,
    body:{requestId:item.requestId,connectionId:item.connectionId,status,
      companyName:item.authorizationMessage?.companyName,financialYear:item.authorizationMessage?.financialYear,
      elapsedMs:Date.now()-item.startedAt,complete:data?.scanSummary?.complete,
      completed:data?.scanSummary?.completed,total:data?.scanSummary?.total,
      callCount:data?.benchmarkDiagnostics?.connector?.tally?.callCount,
      responseBytes:data?.benchmarkDiagnostics?.connector?.tally?.responseBytes,
      peakRssBytes:data?.benchmarkDiagnostics?.connector?.connector?.peakRssBytes,
      minimumSystemFreeBytes:data?.benchmarkDiagnostics?.connector?.connector?.minimumSystemFreeBytes,
      failureClass:/cancel/i.test(message)?'cancelled':/disconnect|session/i.test(message)?'disconnected':/timeout|timed out|deadline/i.test(message)?'timeout':'other'},
  }).catch(() => console.warn('Cash Discount terminal telemetry could not be persisted.'));
}

function failPending(requestId, error) {
  const active = pending.get(requestId);
  if (active && ["scanning", "revalidating", "company_check", "ledger_suggestions", "verify_bank_transaction", "fetch_customer_open_bills"].includes(active.phase)) {
    send(active.connector, { type: "cancel", requestId });
  }
  const item = clearPending(requestId);
  if (!item) return;
  recordScanOutcome(item, /cancel/i.test(String(error?.message)) ? 'cancelled' : 'failed', null, error);
  send(item.browser, {
    type: "result",
    requestId,
    success: false,
    error: error instanceof Error ? error.message : String(error ?? "The live request failed."),
  });
}

function startPending({ requestId, browser, connector, connectionId, ownerUserId, accessToken, operation, proposal, payload }) {
  const timeout = setTimeout(() => failPending(requestId, new Error("The live Tally request timed out.")), REQUEST_TIMEOUT_MS);
  const item = {
    controller: new AbortController(),
    startedAt: Date.now(),
    requestId,
    browser,
    connector,
    connectionId,
    ownerUserId,
    accessToken,
    operation,
    proposal,
    payload,
    phase: operation === 'test_purchase_document_folder' ? operation : operation === "company_check"
    ? "company_check"
    : operation === "bank_ledgers" || operation === "ledger_masters" || operation === "ledger_suggestions" || operation === "verify_bank_transaction" || operation === "fetch_customer_open_bills"
      ? operation
      : ["scan", "followups_scan", "verify_bank_transaction", "fetch_customer_open_bills"].includes(operation)
        ? "scanning"
        : "revalidating",
    commandPayload: null,
    debitNoteKey: operation === "create_debit_note"
      ? `${connectionId}|${String(proposal?.partyLedgerName ?? "").trim().toLowerCase()}|${String(proposal?.linkedInvoiceNumber ?? "").trim().toLowerCase()}`
      : null,
    timeout,
  };
  pending.set(requestId, item);
  return item;
}

async function authenticate(socket, message) {
  const role = String(message.role ?? "");
  const connectionId = String(message.connectionId ?? "").trim();
  const token = String(message.token ?? "");
  if (!connectionId || !token || !["browser", "connector"].includes(role)) {
    throw new Error("Live-session credentials are incomplete.");
  }
  const session = await apiRequest("/api/collections/live/session", {
    organizationId: role === 'browser' ? String(message.organizationId||'') : null,
    accessToken: role === "browser" ? token : null,
    bridgeToken: role === "connector" ? token : null,
    body: {
      role,
      connectionId,
      companyName: role === "browser" ? String(message.companyName ?? "").trim() : null,
    },
  });
  const meta = {
    authenticated: true,
    role,
    connectionId,
    ownerUserId: session.ownerUserId,
    organizationId: session.organizationId || String(message.organizationId||''),
    teamAccess: session.teamAccess === true,
    installationId:session.installationId,
    sessionGeneration:session.sessionGeneration,
    accessToken: role === "browser" ? token : null,
    bridgeToken: role === "connector" ? token : null,
    alive: true,
    customerScope: session.customerScope ?? null,
    customerScopes: session.customerScopes && typeof session.customerScopes === "object"
      ? session.customerScopes
      : null,
    defaultCustomerScope: session.defaultCustomerScope ?? null,
    bridgeVersion: String(message.bridgeVersion || session.bridgeVersion || ""),
  };
  metadata.set(socket, meta);

  if (role === "connector") {
    const previous = connectors.get(connectionId);
    if (previous && previous !== socket) closeWithError(previous, "A newer connector live session replaced this one.", 1000);
    connectors.set(connectionId, socket);
  }
  if(role==='browser'&&meta.teamAccess&&process.env.BANK_LOCAL_PIPELINE_V2==='true') {
    meta.bankJobs=createScopedBankSubscriptions({
      authorize:jobId=>apiRequest(`/api/bank-statements/jobs/${jobId}/access`,{
        accessToken:meta.accessToken,organizationId:meta.organizationId,body:{connectionId},
      }),subscribe:subscribeBankJobEvents,send:event=>send(socket,event),
    });
  }
  send(socket, { type: "authenticated", role, connectionId, scopedBankJobs:!!meta.bankJobs });
  if (role === 'browser' && !meta.teamAccess && process.env.BANK_LOCAL_PIPELINE_V2 === 'true') {
    meta.unsubscribeBankJobs = subscribeBankJobEvents(meta.ownerUserId, connectionId,
      event => send(socket, event), online => send(socket, { type: 'bank_job_channel', online }));
  }
}

async function authorizeLiveOperation(meta,message,previous) {
  // The backend flag is authoritative, not a separately configured gateway flag.
  const authority=await apiRequest('/api/collections/live/session',{
    accessToken:meta.accessToken,organizationId:meta.organizationId,
    bridgeToken:metadata.get(connectors.get(meta.connectionId))?.bridgeToken,
    body:{role:'browser',connectionId:meta.connectionId,operation:message.operation,
      companyName:message.companyName,companyGuid:message.companyGuid,companyNames:message.companyNames,
      financialYear:message.financialYear,...previous},
  });
  if(authority.ownerUserId!==meta.ownerUserId)throw new Error('The paired connection changed. Reconnect before continuing.');
  const paired=metadata.get(connectors.get(meta.connectionId));
  if(authority.teamAccess&&(!paired||paired.installationId!==authority.installationId||paired.sessionGeneration!==authority.sessionGeneration))throw new Error('The live connector belongs to an older pairing session. Reconnect before continuing.');
  return authority.teamAccess ? authority : null;
}

async function handleBrowserRequest(socket, message, meta) {
  const requestId = String(message.requestId || randomUUID());
  const operation = String(message.operation ?? "");
  if (!['test_purchase_document_folder', 'company_check', 'bank_ledgers', 'ledger_masters', 'ledger_suggestions', 'verify_bank_transaction', 'fetch_customer_open_bills', 'scan', 'followups_scan', 'create_debit_note'].includes(operation)) {
    send(socket, { type: "result", requestId, success: false, error: "Unsupported Cash Discount operation." });
    return;
  }
  if (pending.has(requestId)) {
    send(socket, { type: "result", requestId, success: false, error: "This live request is already running." });
    return;
  }
  let authority;
  try { authority=await authorizeLiveOperation(meta,message); }
  catch(error){send(socket,{type:'result',requestId,success:false,error:error.message});return;}
  // Concurrent duplicate messages may both have waited for authorization.
  if(pending.has(requestId)){send(socket,{type:'result',requestId,success:false,error:'This live request is already running.'});return;}
  const connector = connectors.get(meta.connectionId);
  const connectorMeta = connector ? metadata.get(connector) : null;
  if (!connector || connector.readyState !== WebSocket.OPEN || connectorMeta?.ownerUserId !== meta.ownerUserId) {
    send(socket, {
      type: "result",
      requestId,
      success: false,
      error: "The Tally connector is not on the live Cash Discount channel. Update or restart the connector and try again.",
    });
    return;
  }

  const proposal = message.proposal && typeof message.proposal === "object" ? message.proposal : null;
  if (["scan", "followups_scan", "create_debit_note"].includes(operation)) {
    const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(connectorMeta.bridgeVersion);
    if (!version || (Number(version[1]) === 0 && (Number(version[2]) < 1 || (Number(version[2]) === 1 && Number(version[3]) < 63)))) {
      send(socket, { type: "result", requestId, success: false, error: "Update Kalika Local Agent on the Tally computer before checking Cash Discounts or Payment Follow-ups." });
      return;
    }
    // Only one scan or debit note runs per connector at a time. Scans now take
    // seconds, so wait briefly for the running one instead of failing.
    const busy = () => [...pending.values()].some((item) => item.connectionId === meta.connectionId && ["scan", "followups_scan", "create_debit_note"].includes(item.operation));
    if (busy()) {
      send(socket, { type: "progress", requestId, message: "Waiting for the current check to finish…" });
      const waitUntil = Date.now() + SERIAL_OPERATION_WAIT_MS;
      while (busy() && Date.now() < waitUntil && socket.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      if (busy()) {
        send(socket, { type: "result", requestId, success: false, error: "Another Cash Discount or Payment Follow-up check is still running on this computer. Try again in a moment." });
        return;
      }
    }
  }
  const debitNoteKey = operation === "create_debit_note"
    ? `${meta.connectionId}|${String(proposal?.partyLedgerName ?? "").trim().toLowerCase()}|${String(proposal?.linkedInvoiceNumber ?? "").trim().toLowerCase()}`
    : null;
  if (debitNoteKey && activeDebitNotes.has(debitNoteKey)) {
    send(socket, { type: "result", requestId, success: false, error: "A Debit Note for this invoice is already being created." });
    return;
  }

  const bankIdentity = operation === 'ledger_masters' ? message.payload?.bankDocumentIdentity : null;
  if (bankIdentity && (bankIdentity.ownerUserId !== meta.ownerUserId || bankIdentity.connectionId !== meta.connectionId || message.payload.persist !== false)) {
    send(socket, { type: 'result', requestId, success: false, error: 'The bank ledger request does not belong to this authenticated connection.' });
    return;
  }
  const item = startPending({
    requestId,
    browser: socket,
    connector,
    connectionId: meta.connectionId,
    ownerUserId: meta.ownerUserId,
    accessToken: meta.accessToken,
    operation,
    proposal,
    payload: message.payload && typeof message.payload === "object" ? message.payload : undefined,
  });
  item.organizationId=meta.organizationId;
  item.authority=authority;
  item.authorizationMessage={operation,companyName:message.companyName,companyGuid:message.companyGuid,companyNames:message.companyNames,financialYear:message.financialYear};
  if (item.debitNoteKey) activeDebitNotes.add(item.debitNoteKey);
  const requestedCompanyName = String(message.companyName ?? "").trim();
  const companyKey = requestedCompanyName.toLowerCase().replace(/\s+/g, " ");
  send(connector, {
    type: "operation",
    requestId,
    deadlineAt: Date.now() + 90_000,
      operation: operation === "test_purchase_document_folder" ? operation : operation === "company_check"
        ? "company_check"
        : operation === "bank_ledgers"
          ? "bank_ledgers"
          : operation === "ledger_masters"
            ? "ledger_masters"
            : operation === "ledger_suggestions"
              ? "ledger_suggestions"
            : operation === "verify_bank_transaction"
              ? "verify_bank_transaction"
              : operation === "fetch_customer_open_bills"
                ? "fetch_customer_open_bills"
        : ["scan", "followups_scan", "verify_bank_transaction", "fetch_customer_open_bills"].includes(operation)
        ? "cash_discount_scan"
        : "cash_discount_revalidate",
    companyName: requestedCompanyName,
    agentIdentity: authority || undefined,
    companyNames: Array.isArray(message.companyNames)
      ? message.companyNames.map((value) => String(value || "").trim()).filter(Boolean)
      : undefined,
    financialYear: String(message.financialYear ?? "").trim() || null,
    proposal,
    payload: item.payload,
    customerScope: message.customerScope && typeof message.customerScope === "object"
      ? message.customerScope
      : meta.customerScope ?? meta.customerScopes?.[companyKey] ?? meta.defaultCustomerScope,
  });
}

async function handleConnectorResult(socket, message, meta) {
  const requestId = String(message.requestId ?? "");
  const item = pending.get(requestId);
  if (!item || item.connector !== socket || item.connectionId !== meta.connectionId) return;
  if (message.success !== true) {
    failPending(requestId, new Error(String(message.error ?? "Tally could not complete the live request.")));
    return;
  }
  if(item.authority&&item.phase!=='creating') {
    try {await authorizeLiveOperation({accessToken:item.accessToken,organizationId:item.organizationId,connectionId:item.connectionId,ownerUserId:item.ownerUserId},item.authorizationMessage,item.authority);}
    catch(error){failPending(requestId,error);return;}
    if(!pending.has(requestId))return;
  }

  if (item.phase === "company_check") {
    clearPending(requestId);
    send(item.browser, { type: "result", requestId, success: true, data: scopedCompanyCheck(message.data,item.authority) });
    return;
  }

  if (["test_purchase_document_folder", "bank_ledgers", "ledger_masters", "ledger_suggestions", "verify_bank_transaction", "fetch_customer_open_bills"].includes(item.phase)) {
    clearPending(requestId);
    send(item.browser, { type: "result", requestId, success: true, data: message.data });
    return;
  }

  if (item.phase === "scanning") {
    try {
      const connectorResultAt = Date.now();
      const connectorDiagnostics = message.data?.benchmarkDiagnostics ?? null;
      send(item.browser, { type: "progress", requestId, message: item.operation === 'followups_scan' ? 'Customer dues checked. Preparing payment follow-ups…' : "Customer dues checked. Calculating cash discounts and checking debit-note history…" });
      const analysisStartedAt = Date.now();
      const dashboard = await apiRequest(item.operation === 'followups_scan' ? '/api/collections/follow-ups/analyse' : '/api/collections/live/analyse', {
        organizationId:item.organizationId,
        accessToken: item.accessToken,
        signal: item.controller.signal,
        body: {
          connectionId: item.connectionId,
          companyName: item.authorizationMessage.companyName,
          financialYear: item.authorizationMessage.financialYear,
          scan: message.data,
        },
      });
      if (!pending.has(requestId)) return;
      dashboard.cache = message.data?.cache ?? null;
      dashboard.scanSummary = message.data?.scanSummary ?? dashboard.scanSummary;
      if (connectorDiagnostics) {
        const apiDiagnostics = dashboard.benchmarkDiagnostics?.api ?? null;
        dashboard.benchmarkDiagnostics = {
          connector: connectorDiagnostics,
          api: apiDiagnostics,
          gateway: {
            requestToConnectorResultMs: connectorResultAt - item.startedAt,
            analysisApiMs: Date.now() - analysisStartedAt,
            totalMs: Date.now() - item.startedAt,
            connectorResultBytes: Buffer.byteLength(JSON.stringify(message.data ?? {})),
            browserResultBytes: 0,
          },
        };
        dashboard.benchmarkDiagnostics.gateway.browserResultBytes = Buffer.byteLength(JSON.stringify(dashboard));
      }
      console.log(`Cash Discount scan ${requestId} completed in ${Date.now() - item.startedAt} ms (gateway total).`);
      recordScanOutcome(item, 'completed', dashboard);
      clearPending(requestId);
      send(item.browser, { type: "result", requestId, success: true, data: dashboard });
    } catch (error) {
      failPending(requestId, error);
    }
    return;
  }

  if (item.phase === "revalidating") {
    try {
      const prepared = await apiRequest("/api/collections/live/prepare-debit-note", {
        organizationId:item.organizationId,
        accessToken: item.accessToken,
        signal: item.controller.signal,
        body: {
          connectionId: item.connectionId,
          companyName: message.companyName,
          proposal: item.proposal,
          scan: message.data,
          financialYear:item.authority?.financialYear||item.proposal?.financialYear,
          companyGuid:item.authority?.companyGuid,
          queue:true,
        },
      });
      if(item.authority || prepared.durable) {
        if(!prepared.durable||!prepared.command?.id)throw new Error('The authorized debit note was not durably queued.');
        item.phase='creating';
        // Wake only. The connector still claims the durable authorized command.
        send(item.connector,{type:'command_queued'});
        send(item.browser,{type:'progress',requestId,message:'Debit note queued for the selected Tally company...'});
        await waitForDurableDiscount({commandId:prepared.command.id,connectionId:item.connectionId,signal:item.controller.signal,
          onStatus:status=>{if(status==='claimed')send(item.browser,{type:'progress',requestId,message:'Creating and verifying in Tally…'});},
          read:path=>apiRequest(path,{method:'GET',accessToken:item.accessToken,organizationId:item.organizationId,signal:item.controller.signal})});
        clearPending(requestId);
        send(item.browser,{type:'result',requestId,success:true,data:{proposalId:prepared.proposalId}});
        return;
      }
      item.commandPayload = prepared.commandPayload;
      if(item.authority)await authorizeLiveOperation({accessToken:item.accessToken,organizationId:item.organizationId,connectionId:item.connectionId,ownerUserId:item.ownerUserId},item.authorizationMessage,item.authority);
      if(!pending.has(requestId))return;
      item.phase = "creating";
      send(item.connector, {
        type: "operation",
        requestId,
        operation: "cash_discount_execute_debit_note",
        commandPayload: prepared.commandPayload,
      });
    } catch (error) {
      failPending(requestId, error);
    }
    return;
  }

  if (item.phase === "creating") {
    try {
      const connectorMeta = metadata.get(item.connector);
      const confirmed = await apiRequest("/api/collections/live/confirm-debit-note", {
        organizationId:item.organizationId,
        accessToken: item.accessToken,
        bridgeToken: connectorMeta?.bridgeToken,
        body: {
          connectionId: item.connectionId,
          commandPayload: item.commandPayload,
          tallyOutcome: message.data,
        },
      });
      clearPending(requestId);
      send(item.browser, { type: "result", requestId, success: true, data: confirmed });
    } catch (error) {
      failPending(requestId, error);
    }
  }
}

export function startCashDiscountGateway(options = {}) {
  const attachedServer = options.server;
  const gatewayPath = options.path ?? (attachedServer ? "/agent-live" : "/");
  const acceptedPaths = new Set([gatewayPath, ...(options.legacyPaths || ["/cash-discount-live"])]);
  apiBaseUrl = String(options.apiBaseUrl || process.env.CASH_DISCOUNT_API_BASE_URL || "http://localhost:3001")
    .replace(/\/+$/, "");

  const server = attachedServer
    ? new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
    : new WebSocketServer({
        host: options.host || HOST,
        port: Number(options.port ?? PORT),
        path: gatewayPath,
        maxPayload: MAX_MESSAGE_BYTES,
      });

  if (attachedServer) {
    attachedServer.on("upgrade", (request, socket, head) => {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      if (!acceptedPaths.has(pathname)) return;
      server.handleUpgrade(request, socket, head, (client) => server.emit("connection", client, request));
    });
  }

  server.on("connection", (socket) => {
  metadata.set(socket, { authenticated: false, alive: true });
  const authTimer = setTimeout(() => {
    if (!metadata.get(socket)?.authenticated) closeWithError(socket, "Live-session authentication timed out.");
  }, AUTH_TIMEOUT_MS);

  socket.on("pong", () => {
    const meta = metadata.get(socket);
    if (meta) meta.alive = true;
  });

  socket.on("message", async (buffer) => {
    try {
      const message = JSON.parse(buffer.toString());
      const meta = metadata.get(socket);
      if (!meta?.authenticated) {
        if (!["authenticate", "hello"].includes(message.type)) throw new Error("Send hello before using the agent channel.");
        await authenticate(socket, message);
        clearTimeout(authTimer);
        send(socket, { type: "hello", authenticated: true, protocolVersion: Number(message.protocolVersion || 0) });
        return;
      }
      if(message.type==='bank_job_watch'&&meta.role==='browser') {
        if(meta.bankJobs)await meta.bankJobs.watch(String(message.jobId||''));
      } else if(message.type==='bank_job_unwatch'&&meta.role==='browser') {
        meta.bankJobs?.unwatch(String(message.jobId||''));
      } else if (["request", "wake"].includes(message.type) && meta.role === "browser") {
        await handleBrowserRequest(socket, message, meta);
      } else if (message.type === "cancel" && meta.role === "browser") {
        const item = pending.get(String(message.requestId || ""));
        // Never automatically cancel a financial write with an unknown outcome.
        if (item?.browser === socket && ["scan", "followups_scan", "verify_bank_transaction", "fetch_customer_open_bills"].includes(item.operation)) failPending(item.requestId, new Error("Scan cancelled."));
      } else if (["operation_result", "result"].includes(message.type) && meta.role === "connector") {
        await handleConnectorResult(socket, message, meta);
      } else if (message.type === "progress" && meta.role === "connector") {
        const item = pending.get(String(message.requestId ?? ""));
        if (item?.connector === socket) send(item.browser, item.authority
          ? {type:'progress',requestId:item.requestId,message:'Processing Tally request…'} : message);
      } else if (message.type === "heartbeat") {
        send(socket, { type: "heartbeat", timestamp: new Date().toISOString() });
      }
    } catch (error) {
      const meta = metadata.get(socket);
      if (!meta?.authenticated) closeWithError(socket, error instanceof Error ? error.message : "Authentication failed.");
      else send(socket, { type: "error", error: error instanceof Error ? error.message : "Invalid live-channel message." });
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    const meta = metadata.get(socket);
    meta?.unsubscribeBankJobs?.();
    meta?.bankJobs?.close();
    if (meta?.role === "connector" && connectors.get(meta.connectionId) === socket) connectors.delete(meta.connectionId);
    for (const [requestId, item] of pending) {
      if (item.browser === socket && ["scan", "followups_scan", "verify_bank_transaction", "fetch_customer_open_bills"].includes(item.operation)) failPending(requestId, new Error("Browser disconnected; scan cancelled."));
      else if (item.browser === socket && item.operation !== "create_debit_note") clearPending(requestId);
      else if (item.connector === socket) failPending(requestId, new Error("The Tally connector disconnected during the live request."));
    }
  });
  });

  const heartbeat = setInterval(() => {
    for (const socket of server.clients) {
      const meta = metadata.get(socket);
      if (meta?.alive === false) {
        socket.terminate();
        continue;
      }
      if (meta) meta.alive = false;
      socket.ping();
    }
  }, 30_000);

  server.on("close", () => clearInterval(heartbeat));
  const location = attachedServer
    ? gatewayPath
    : `ws://${options.host || HOST}:${Number(options.port ?? PORT)}${gatewayPath}`;
  console.log(`Cash Discount live gateway listening on ${location}`);
  return server;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) startCashDiscountGateway();
