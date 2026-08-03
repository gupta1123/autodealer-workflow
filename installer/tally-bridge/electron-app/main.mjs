import { app, BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pairBridge, createBridgeRunner, disconnectBridge } from "./src/bridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const installDir = path.resolve(__dirname, "..", "..");
const logPath = path.join(installDir, "bridge.log");
const errPath = path.join(installDir, "bridge.err.log");

let mainWindow = null;
let runner = null;
let pendingProtocolUrl = null;
let lastStatus = {
  title: "Waiting for connection",
  detail: "Open Kalika and click Connect.",
  state: "idle",
};

function appendLog(filePath, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(filePath, line, () => {});
}

function parseConnectUrl(value) {
  const url = new URL(value);
  return {
    "api-base": url.searchParams.get("apiBase") || url.searchParams.get("api-base") || "",
    "connection-id": url.searchParams.get("connectionId") || url.searchParams.get("connection-id") || "",
    "pairing-code": url.searchParams.get("pairingCode") || url.searchParams.get("pairing-code") || "",
    "control-token": url.searchParams.get("controlToken") || url.searchParams.get("control-token") || "",
    "tally-url": url.searchParams.get("tallyUrl") || url.searchParams.get("tally-url") || "http://localhost:9000",
    "bridge-name": "Kalika Tally Connector",
  };
}

function sendStatus(status) {
  lastStatus = { ...lastStatus, ...status };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status", lastStatus);
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

function printableTallyHtml(html) {
  const withoutReportCaption = String(html ?? "").replace(
    /<TABLE[^>]*bgcolor="#2a67b1"[^>]*>[\s\S]*?<\/TABLE>/i,
    ""
  );
  const printStyles = `
    <meta charset="utf-8">
    <style>
      @page { size: A4; margin: 12mm; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body { color: #000; font-family: Arial, sans-serif; }
      table { max-width: 100%; }
    </style>`;
  if (/<head[^>]*>/i.test(withoutReportCaption)) {
    return `<!doctype html>${withoutReportCaption.replace(/<head[^>]*>/i, (head) => `${head}${printStyles}`)}`;
  }
  return `<!doctype html><html><head>${printStyles}</head><body>${withoutReportCaption}</body></html>`;
}

async function renderTallyPrintToPdf({ html, fileName }) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printableTallyHtml(html))}`);
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      landscape: false,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      margins: { marginType: "default" },
    });
    if (!pdf?.length) throw new Error(`Could not render ${fileName || "the Tally Debit Note"}.`);
    return pdf;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

async function startRunner() {
  if (runner && !runner.stopped) {
    runner.stop("restarting");
  }

  runner = createBridgeRunner({
    renderTallyPrintToPdf,
    onLog(entry) {
      appendLog(entry.level === "error" ? errPath : logPath, entry.message);
      if (entry.level === "error") {
        const expired = /invalid bridge token|401|403/i.test(entry.message);
        sendStatus({
          title: expired ? "Reconnect required" : "Connector warning",
          detail: expired ? "Open Kalika and click Connect again." : entry.message,
          state: expired ? "expired" : "warning",
        });
        return;
      }
      sendStatus({ title: "Connector running", detail: entry.message, state: "running" });
    },
    onStatus(cycle) {
      const result = cycle?.result || {};
      if (result.companyName) {
        sendStatus({ title: `Connected to ${result.companyName}`, detail: "Keep this app open while using Tally.", state: "connected" });
      } else if (result.tallyReachable) {
        sendStatus({ title: "Tally reachable", detail: "Open a company in Tally Prime.", state: "warning" });
      }
    },
    onStop(event) {
      sendStatus({ title: "Connector stopped", detail: event.reason || "Stopped", state: "stopped" });
    },
  });

  await runner.start();
}

async function handleConnectUrl(value) {
  try {
    const args = parseConnectUrl(value);
    if (!args["api-base"] || !args["connection-id"] || !args["pairing-code"] || !args["control-token"]) {
      throw new Error("Connect link is missing pairing details.");
    }
    showWindow();
    sendStatus({ title: "Pairing connector", detail: "Checking Tally and connecting to Kalika.", state: "running" });
    await pairBridge(args);
    sendStatus({ title: "Connector paired", detail: "Starting live sync.", state: "running" });
    await startRunner();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(errPath, message);
    sendStatus({ title: "Connection failed", detail: message, state: "error" });
    showWindow();
    dialog.showErrorBox("Kalika Tally Connector", message);
  }
}

async function handleDisconnectUrl(value) {
  try {
    const url = new URL(value);
    if (runner && !runner.stopped) runner.stop("disconnect");
    await disconnectBridge({ "connection-id": url.searchParams.get("connectionId") || "" });
    sendStatus({ title: "Disconnected", detail: "Connector stopped.", state: "stopped" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(errPath, message);
  }
}

function handleProtocolUrl(value) {
  if (!value || !value.startsWith("kalika-tally://")) return;
  if (value.startsWith("kalika-tally://connect")) {
    void handleConnectUrl(value);
    return;
  }
  if (value.startsWith("kalika-tally://disconnect")) {
    void handleDisconnectUrl(value);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 260,
    show: true,
    resizable: false,
    backgroundColor: "#f8f5ef",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <body style="font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f8f5ef;color:#24140c">
        <div style="padding:24px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
            <div style="width:34px;height:34px;border-radius:10px;background:#24140c;color:white;display:grid;place-items:center;font-weight:700">K</div>
            <div>
              <h2 style="margin:0;font-size:18px">Kalika Tally Connector</h2>
              <div style="font-size:12px;color:#6c5c4f">Desktop bridge for Tally Prime</div>
            </div>
          </div>
          <div id="card" style="border:1px solid #ded1c3;border-radius:12px;background:#fffaf5;padding:16px">
            <div id="title" style="font-size:15px;font-weight:650">Waiting for connection</div>
            <div id="detail" style="margin-top:6px;color:#6c5c4f;font-size:13px;line-height:1.4">Open Kalika and click Connect.</div>
          </div>
          <div style="margin-top:14px;color:#8a7b6f;font-size:12px">Do not close this window while posting entries to Tally.</div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const card = document.getElementById('card');
          ipcRenderer.on('status', (_event, data) => {
            document.getElementById('title').textContent = data.title || 'Connector';
            document.getElementById('detail').textContent = data.detail || '';
            const state = data.state || 'idle';
            card.style.borderColor = state === 'connected' ? '#86efac' : state === 'error' || state === 'expired' ? '#fda4af' : '#ded1c3';
            card.style.background = state === 'connected' ? '#f0fdf4' : state === 'error' || state === 'expired' ? '#fff1f2' : '#fffaf5';
          });
        </script>
      </body>
    </html>
  `)}`);

  mainWindow.webContents.once("did-finish-load", () => sendStatus(lastStatus));
  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient("kalika-tally");
  app.on("second-instance", (_event, argv) => {
    const protocolArg = argv.find((entry) => entry.startsWith("kalika-tally://"));
    if (protocolArg) {
      handleProtocolUrl(protocolArg);
    }
    showWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow) handleProtocolUrl(url);
    else pendingProtocolUrl = url;
  });
  app.whenReady().then(() => {
    createWindow();
    const protocolArg = process.argv.find((entry) => entry.startsWith("kalika-tally://")) || pendingProtocolUrl;
    if (protocolArg) {
      handleProtocolUrl(protocolArg);
    } else {
      startRunner().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(errPath, message);
        sendStatus({ title: "Waiting for connection", detail: "Open Kalika and click Connect.", state: "idle" });
      });
    }
  });
  app.on("window-all-closed", (event) => {
    event.preventDefault();
  });
}
