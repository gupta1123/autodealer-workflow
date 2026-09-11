import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import electronUpdater from "electron-updater";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pairBridge, createBridgeRunner, disconnectBridge } from "@autodealer/tally-bridge";
import { consumeSuccessfulUpdate, isNewerVersion, recordDownloadedUpdate } from "./update-state.mjs";
import { pruneLegacyRuntimeBackups } from "./backup-retention.mjs";

// electron-updater publishes CommonJS. Importing autoUpdater as an ESM named
// export works in some development environments but fails in the packaged
// Electron runtime before app startup.
const { autoUpdater } = electronUpdater;

const CONNECTOR_NAME = "Kalika Local Agent";
const PROTOCOL_NAME = "kalika-tally";
const APP_USER_MODEL_ID = "com.kalika.local-agent";

// The status window is plain HTML and does not benefit from GPU acceleration.
// Some Windows graphics drivers leave Electron's renderer alive but entirely
// black, so render this lightweight window in software.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
// Chromium still starts a small GPU subprocess in software mode. On affected
// Windows 10 hosts that subprocess repeatedly exits with EXCEPTION_BREAKPOINT
// and Chromium terminates the whole app. Keeping software GPU work in the
// browser process avoids that broken subprocess.
app.commandLine.appendSwitch("in-process-gpu");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localAgentRoot = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "Kalika",
  "LocalAgent",
);
const runtimeLogDir = path.join(localAgentRoot, "logs");
fs.mkdirSync(runtimeLogDir, { recursive: true });
const logPath = path.join(runtimeLogDir, "bridge.log");
const errPath = path.join(runtimeLogDir, "bridge.err.log");
const WINDOWS_CA_READY = "KALIKA_CONNECTOR_WINDOWS_CA_READY";

let mainWindow = null;
let runner = null;
let pendingProtocolUrl = null;
let safeQuitApproved = false;
let updateInstallTimer = null;
let updatedOnThisLaunch = false;
let acceptedUpdateVersion = null;
let updateState = {
  state: "idle",
  installedVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  message: "Updates are checked automatically.",
};
let lastStatus = {
  title: "Waiting for connection",
  detail: "Open Kalika and click Connect.",
  state: "idle",
};

function hasWindowsCertificateBundle(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").includes("-----BEGIN CERTIFICATE-----");
  } catch {
    return false;
  }
}

function relaunchWithWindowsCertificateStore() {
  if (process.platform !== "win32" || process.env[WINDOWS_CA_READY] === "1") {
    return false;
  }

  try {
    const configDir = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Kalika", "LocalAgent", "config"
    );
    const certificatePath = path.join(configDir, "windows-ca-bundle.pem");
    const powershell = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    const windowsModulePath = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "Modules"
    );
    const exporter = path.join(
      app.isPackaged ? process.resourcesPath : path.resolve(__dirname, ".."),
      "powershell",
      "export-windows-ca.ps1",
    );
    fs.mkdirSync(configDir, { recursive: true });
    // Reuse the previously exported Windows trust store. Importing the
    // certificate provider can take longer than ten seconds on some machines,
    // and making every launch wait for it caused the connector to fall back to
    // Electron's incomplete CA set even when a valid bundle already existed.
    if (!hasWindowsCertificateBundle(certificatePath)) {
      execFileSync(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          exporter,
          "-OutputPath",
          certificatePath,
        ],
        {
          windowsHide: true,
          timeout: 30_000,
          env: {
            ...process.env,
            PSModulePath: [windowsModulePath, process.env.PSModulePath].filter(Boolean).join(";"),
          },
        },
      );
    }
    if (!hasWindowsCertificateBundle(certificatePath)) {
      return false;
    }

    const child = spawn(process.execPath, process.argv.slice(1), {
      detached: true,
      windowsHide: false,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: certificatePath,
        [WINDOWS_CA_READY]: "1",
      },
    });
    child.unref();
    return true;
  } catch (error) {
    try {
      fs.appendFileSync(
        path.join(runtimeLogDir, "bridge.bootstrap.log"),
        `[${new Date().toISOString()}] ${error instanceof Error ? error.stack || error.message : String(error)}\n`
      );
    } catch {
      // The normal connector window remains the fallback error surface.
    }
    // Public certificate authorities remain available if Windows certificate
    // export is restricted. The connector UI will surface any network error.
    return false;
  }
}

function appendLog(filePath, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(filePath, line, () => {});
}

function formatConnectorError(error) {
  return String(error instanceof Error ? error.stack || error.message : error)
    .replace(/'data:text\/html[^']*'/gi, "the embedded Local Agent status page")
    .slice(0, 2_000);
}

function isExistingLocalAgentError(error) {
  const message = String(error instanceof Error ? error.message : error);
  return error?.code === "EADDRINUSE" && Number(error?.port) === 17843
    || /EADDRINUSE[\s\S]*127\.0\.0\.1:17843/i.test(message);
}

function closeDuplicateLocalAgent(error) {
  appendLog(
    errPath,
    `A previously started Local Agent already owns the browser handoff port; closing this duplicate process. (${error instanceof Error ? error.message : error})`,
  );
  safeQuitApproved = true;
  setImmediate(() => app.quit());
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
    mainWindow.webContents.send("agent:status", lastStatus);
  }
}

function sendUpdateStatus(status) {
  updateState = { ...updateState, ...status };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent:update-status", updateState);
  }
}

function installDownloadedUpdateWhenSafe() {
  if (!runner?.busy) {
    if (updateInstallTimer) clearInterval(updateInstallTimer);
    updateInstallTimer = null;
    safeQuitApproved = true;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { installing: true };
  }
  sendUpdateStatus({ state: "waiting", message: "Waiting for the active Tally operation to finish safely." });
  if (!updateInstallTimer) {
    updateInstallTimer = setInterval(() => {
      if (!runner?.busy) installDownloadedUpdateWhenSafe();
    }, 500);
    updateInstallTimer.unref();
  }
  return { installing: false, waiting: true };
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
      // Electron's renderer sandbox crashes on some supported Windows hosts.
      // This hidden print surface loads only application-generated HTML and
      // still has Node integration disabled with context isolation enabled.
      sandbox: false,
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
    safeStorage,
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
  archiveVerifiedLegacyRuntime();
}

function archiveVerifiedLegacyRuntime() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const legacy = path.resolve("C:\\Autodealer\\tally-bridge");
  const current = path.resolve(process.resourcesPath, "..");
  const migratedConfig = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Kalika", "LocalAgent", "config", "config.json");
  const legacyMarker = path.join(legacy, "resources", "app", "package.json");
  if (current.startsWith(legacy) || !fs.existsSync(migratedConfig)) return;
  try {
    const backupRoot = path.join(path.dirname(path.dirname(migratedConfig)), "migration-backups");
    fs.mkdirSync(backupRoot, { recursive: true });
    if (fs.existsSync(legacyMarker)) {
      const target = path.join(backupRoot, `legacy-runtime-${Date.now()}`);
      fs.renameSync(legacy, target);
    }
    pruneLegacyRuntimeBackups(backupRoot, 1);
  } catch (error) {
    appendLog(errPath, `Legacy runtime cleanup deferred: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleConnectUrl(value) {
  try {
    const args = parseConnectUrl(value);
    if (
      !args["api-base"] ||
      !args["connection-id"] ||
      !args["pairing-code"] ||
      !args["control-token"]
    ) {
      throw new Error("Connect link is missing pairing details.");
    }
    showWindow();
    sendStatus({ title: "Pairing connector", detail: "Checking Tally and connecting to Kalika.", state: "running" });
    await pairBridge(args);
    sendStatus({ title: "Connector paired", detail: "Starting live sync.", state: "running" });
    await startRunner();
  } catch (error) {
    // A build installed before the single-instance lock may still be running
    // during an upgrade. Its loopback listener proves that another Local Agent
    // owns the browser handoff channel, so never show a raw EADDRINUSE failure
    // or leave a second command consumer alive.
    if (isExistingLocalAgentError(error)) {
      closeDuplicateLocalAgent(error);
      return;
    }
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
    title: CONNECTOR_NAME,
    width: 440,
    height: 430,
    show: false,
    resizable: false,
    backgroundColor: "#f8f5ef",
    webPreferences: {
      // Sandboxed preload scripts execute as plain CommonJS in Electron. Keep
      // this bridge in a .cjs file; an ESM import here silently leaves the
      // renderer without window.kalikaAgent.
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      // Keep the isolated preload bridge, but avoid the Windows renderer
      // sandbox failure that otherwise leaves this window entirely black.
      sandbox: false,
    },
  });

  const connectorPage = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html><html><head><meta charset="utf-8"><title>${CONNECTOR_NAME}</title>
    <style>
      :root{font-family:"Segoe UI",Arial,sans-serif;color:#251810;background:#f7f3ec;font-size:13px}
      *{box-sizing:border-box}body{margin:0}.shell{padding:22px}.top{display:flex;align-items:center;gap:11px}.brand{width:36px;height:36px;border-radius:11px;background:#251810;color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px}.heading{min-width:0;flex:1}.heading h1{font-size:17px;line-height:1.2;margin:0;font-weight:750}.heading p{margin:3px 0 0;color:#75675b;font-size:11.5px}.menu-wrap{position:relative}.icon-button{width:34px;height:34px;border:1px solid #ded4c7;border-radius:10px;background:#fff;cursor:pointer;font-size:20px;line-height:1;color:#54463b}.icon-button:hover,.icon-button:focus-visible{background:#f1ebe2;outline:2px solid #c7ab85;outline-offset:1px}.menu{display:none;position:absolute;right:0;top:42px;width:270px;padding:8px;border:1px solid #d9cebf;border-radius:14px;background:#fff;box-shadow:0 16px 44px rgba(47,34,23,.18);z-index:5}.menu.open{display:block}.menu-title{padding:8px 9px 6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#948273;font-weight:800}.setting{display:flex;align-items:center;justify-content:space-between;padding:8px 9px;border-radius:8px}.setting:hover{background:#f8f4ee}.setting span{font-size:12px;font-weight:600}.divider{height:1px;background:#eee6dc;margin:6px}.menu button.action{width:100%;border:0;background:transparent;text-align:left;padding:9px;border-radius:8px;color:#3b2c22;font:600 12px inherit;cursor:pointer}.menu button.action:hover{background:#f8f4ee}.menu button.danger{color:#b42318}.menu button.danger:hover{background:#fff1f0}.status{margin-top:22px;border:1px solid #ded4c7;border-radius:16px;background:#fff;padding:19px}.status-row{display:flex;gap:12px;align-items:flex-start}.state-dot{width:10px;height:10px;border-radius:999px;background:#b8aa9d;margin-top:5px;box-shadow:0 0 0 5px #f1ece5}.status.connected{border-color:#9bd9b0;background:#f4fcf6}.status.connected .state-dot{background:#159455;box-shadow:0 0 0 5px #dcf5e5}.status.error,.status.expired{border-color:#f1aaa7;background:#fff7f6}.status.error .state-dot,.status.expired .state-dot{background:#d92d20;box-shadow:0 0 0 5px #fee4e2}.status.running .state-dot{background:#147db3;box-shadow:0 0 0 5px #dff2fb}.status.warning .state-dot{background:#d48700;box-shadow:0 0 0 5px #fff0cd}.status-title{font-size:15px;font-weight:750}.status-detail{margin-top:4px;color:#706156;font-size:12.5px;line-height:1.45}.meta{margin-top:14px;padding-top:14px;border-top:1px solid #eee6dc;display:flex;justify-content:space-between;gap:10px;color:#817267;font-size:11px}.meta strong{color:#4b3b30}.update{display:none;margin-top:10px;border:1px solid #b9d9ed;border-radius:12px;background:#f2f9fd;padding:11px 12px;color:#22536d;font-size:11.5px}.update.show{display:flex;align-items:center;justify-content:space-between;gap:10px}.update button{border:0;border-radius:8px;background:#173d52;color:#fff;padding:7px 10px;font:700 11px inherit;cursor:pointer;white-space:nowrap}.update button:disabled{opacity:.55;cursor:default}.note{display:flex;align-items:center;gap:7px;margin-top:16px;color:#817267;font-size:11.5px}.note:before{content:"";width:5px;height:5px;border-radius:50%;background:#b5a697}.toast{min-height:18px;margin-top:12px;color:#7b5b2d;font-size:11.5px}.busy{opacity:.58;pointer-events:none}
    </style></head><body><main class="shell">
      <header class="top"><div class="brand">K</div><div class="heading"><h1>Kalika Local Agent</h1><p>Secure local connection to Tally Prime</p></div>
        <div class="menu-wrap"><button id="menu-button" class="icon-button" aria-label="Open agent menu" aria-expanded="false">⋯</button>
          <div id="menu" class="menu" role="menu">
            <div class="menu-title">Preferences</div>
            <label class="setting"><span>Parse documents locally</span><input id="anydoc" type="checkbox"></label>
            <label class="setting"><span>Local ledger suggestions</span><input id="zvec" type="checkbox"></label>
            <label class="setting"><span>Start with Windows</span><input id="startup" type="checkbox"></label>
            <div class="divider"></div><div class="menu-title">Maintenance</div>
            <button id="updates" class="action" role="menuitem">Check for updates</button><button id="diagnostics" class="action" role="menuitem">Export diagnostics</button><button id="clear" class="action" role="menuitem">Clear rebuildable cache</button>
            <div class="divider"></div><button id="reset" class="action danger" role="menuitem">Factory reset…</button>
          </div>
        </div>
      </header>
      <section id="card" class="status"><div class="status-row"><span class="state-dot"></span><div><div id="title" class="status-title">Starting Local Agent…</div><div id="detail" class="status-detail">Checking the saved Kalika connection.</div></div></div>
        <div class="meta"><span id="version">Agent 1.1.0</span><strong id="metrics">Loading local cache…</strong></div>
      </section>
      <section id="update-card" class="update"><span id="update-message"></span><button id="install-update" type="button">Restart &amp; update</button></section>
      <div class="note">Keep this app running while Kalika uses Tally.</div><div id="toast" class="toast" aria-live="polite"></div>
    </main><script>
      const card=document.getElementById('card'), menu=document.getElementById('menu'), menuButton=document.getElementById('menu-button'), toast=document.getElementById('toast');
      const anydoc=document.getElementById('anydoc'),zvec=document.getElementById('zvec'),startup=document.getElementById('startup');
      function renderConnection(data={}){document.getElementById('title').textContent=data.title||'Local Agent';document.getElementById('detail').textContent=data.detail||'';card.className='status '+(data.state||'idle')}
      function closeMenu(){menu.classList.remove('open');menuButton.setAttribute('aria-expanded','false')}
      menuButton.onclick=(event)=>{event.stopPropagation();const open=menu.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open))};
      document.addEventListener('click',(event)=>{if(!menu.contains(event.target)&&event.target!==menuButton)closeMenu()});document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu()});
      window.kalikaAgent.onStatus(renderConnection);
      const updateCard=document.getElementById('update-card'),updateMessage=document.getElementById('update-message'),installUpdate=document.getElementById('install-update'),updates=document.getElementById('updates');
      function renderUpdate(data={}){const visible=['checking','available','downloading','ready','waiting','failed','unavailable','installed'].includes(data.state);updateCard.className='update'+(visible?' show':'');updateMessage.textContent=data.message||'';installUpdate.style.display=data.state==='ready'||data.state==='waiting'?'block':'none';installUpdate.disabled=data.state==='waiting';updates.textContent=data.state==='downloading'?'Downloading update…':data.state==='ready'?'Update ready':'Check for updates'}
      window.kalikaAgent.onUpdateStatus(renderUpdate);installUpdate.onclick=()=>action(()=>window.kalikaAgent.installUpdate(),'Restarting to install update…');window.kalikaAgent.getUpdateStatus().then(renderUpdate).catch(()=>{});
      async function refreshConnection(){renderConnection(await window.kalikaAgent.getConnectionStatus())}
      async function loadAgent(){await refreshConnection();const [settings,status]=await Promise.all([window.kalikaAgent.getSettings(),window.kalikaAgent.getStatus()]);anydoc.checked=settings.localAnydocEnabled!==false;zvec.checked=settings.localZvecEnabled===true;startup.checked=settings.startWithWindows!==false;const storage=status.storage||{};document.getElementById('version').textContent='Agent '+(status.agentVersion||'Loading…');document.getElementById('metrics').textContent=Math.round((storage.sizeBytes||0)/1024)+' KB · '+(storage.queuedJobs||0)+' queued'}
      for(const [element,key] of [[anydoc,'localAnydocEnabled'],[zvec,'localZvecEnabled'],[startup,'startWithWindows']])element.addEventListener('change',()=>window.kalikaAgent.updateSettings({[key]:element.checked}).then(loadAgent).catch(showError));
      function showError(error){toast.textContent=error?.message||'The action could not be completed.'}
      async function action(work,success){closeMenu();toast.textContent='Working…';try{await work();toast.textContent=success;await loadAgent()}catch(error){showError(error)}}
      document.getElementById('clear').onclick=()=>action(()=>window.kalikaAgent.clearCache(),'Rebuildable cache cleared.');document.getElementById('diagnostics').onclick=()=>action(()=>window.kalikaAgent.exportDiagnostics(),'Diagnostics exported.');updates.onclick=()=>action(()=>window.kalikaAgent.checkForUpdates(),'Update check complete.');document.getElementById('reset').onclick=()=>{closeMenu();window.kalikaAgent.factoryReset().catch(showError)};
      refreshConnection().catch(showError);setInterval(()=>refreshConnection().catch(()=>{}),2000);loadAgent().catch(showError);
    </script></body></html>
  `)}`;

  let rendererRecoveryAttempts = 0;
  mainWindow.once("ready-to-show", () => showWindow());
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    appendLog(errPath, `Local Agent status page failed to load (${code}: ${description}).`);
    showWindow();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    appendLog(errPath, `Local Agent renderer stopped (${details.reason || "unknown"}).`);
    if (mainWindow?.isDestroyed() || rendererRecoveryAttempts >= 3) return;
    rendererRecoveryAttempts += 1;
    setTimeout(() => {
      if (!mainWindow?.isDestroyed()) {
        void mainWindow.loadURL(connectorPage).catch((error) => {
          appendLog(errPath, `Local Agent status page recovery failed: ${formatConnectorError(error)}`);
          showWindow();
        });
      }
    }, 250);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    rendererRecoveryAttempts = 0;
    sendStatus(lastStatus);
    sendUpdateStatus(updateState);
  });
  void mainWindow.loadURL(connectorPage).catch((error) => {
    appendLog(errPath, `Local Agent status page could not be opened: ${formatConnectorError(error)}`);
    showWindow();
  });
  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function startApplication() {
  app.setName(CONNECTOR_NAME);
  app.setAppUserModelId(APP_USER_MODEL_ID);

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  ipcMain.handle("agent:get-connection-status", () => lastStatus);
  ipcMain.handle("agent:get-status", async () => {
    const status = await runner?.getAgentStatus?.() ?? { connected: false };
    return { ...status, agentVersion: status.agentVersion || app.getVersion(), connectionStatus: lastStatus };
  });
  ipcMain.handle("agent:get-settings", () => runner?.getAgentSettings?.() ?? {});
  ipcMain.handle("agent:update-settings", async (_event, settings) => {
    const next = await runner?.updateAgentSettings?.(settings && typeof settings === "object" ? settings : {});
    if (typeof settings?.startWithWindows === "boolean") app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, openAsHidden: true });
    return next || {};
  });
  ipcMain.handle("agent:clear-cache", () => runner?.clearAgentCache?.() ?? { cleared: false });
  ipcMain.handle("agent:check-updates", async () => {
    if (!app.isPackaged) return { available: false, reason: "development" };
    sendUpdateStatus({ state: "checking", message: "Checking for a newer Local Agent…" });
    await autoUpdater.checkForUpdates();
    return updateState;
  });
  ipcMain.handle("agent:get-update-status", () => updateState);
  ipcMain.handle("agent:install-update", () => {
    if (updateState.state !== "ready" && updateState.state !== "waiting") {
      throw new Error("The update has not finished downloading yet.");
    }
    return installDownloadedUpdateWhenSafe();
  });
  ipcMain.handle("agent:export-diagnostics", async () => {
    const diagnostics = await runner?.exportAgentDiagnostics?.() || [];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export sanitized Local Agent diagnostics",
      defaultPath: `kalika-local-agent-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), diagnostics }, null, 2), { mode: 0o600 });
    return { saved: true, path: result.filePath };
  });
  ipcMain.handle("agent:factory-reset", async () => {
    const answer = await dialog.showMessageBox(mainWindow, {
      type: "warning", buttons: ["Cancel", "Factory reset"], defaultId: 0, cancelId: 0,
      title: "Factory reset Kalika Local Agent",
      message: "Remove pairing, cache, managed attachments and local secrets?",
      detail: "This cannot be undone. Tally vouchers are not deleted.",
    });
    if (answer.response !== 1) return { reset: false };
    const localBase = path.resolve(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"));
    const target = path.resolve(localBase, "Kalika", "LocalAgent");
    if (!target.startsWith(`${localBase}${path.sep}`) || path.basename(target) !== "LocalAgent") throw new Error("Factory reset target validation failed.");
    runner?.stop("factory reset");
    fs.rmSync(target, { recursive: true, force: true });
    safeQuitApproved = true;
    app.relaunch();
    app.quit();
    return { reset: true };
  });
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
    const completedUpdate = consumeSuccessfulUpdate(localAgentRoot, app.getVersion());
    if (completedUpdate) {
      updatedOnThisLaunch = true;
      sendUpdateStatus({ state: "installed", percent: 100, availableVersion: app.getVersion(), message: completedUpdate.message });
    }
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
    if (app.isPackaged) {
      runner?.getAgentSettings?.().then((settings) => {
        autoUpdater.channel = settings?.updateChannel === "beta" ? "beta" : "latest";
      }).catch((error) => appendLog(errPath, error.message));
      // Check metadata first. Starting an automatic download before comparing
      // versions allowed an older cached GitHub release to appear as an update
      // after a newer installer had been installed manually.
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("checking-for-update", () => sendUpdateStatus({ state: "checking", message: "Checking for a newer Local Agent…" }));
      autoUpdater.on("update-available", (info) => {
        if (!isNewerVersion(info.version, app.getVersion())) {
          acceptedUpdateVersion = null;
          void autoUpdater.downloadedUpdateHelper?.clear?.().catch((error) => appendLog(errPath, `Stale updater cache: ${error.message}`));
          sendUpdateStatus({ state: "current", availableVersion: null, percent: 0, message: "Local Agent is up to date." });
          return;
        }
        acceptedUpdateVersion = info.version;
        sendUpdateStatus({ state: "available", availableVersion: info.version, message: `Version ${info.version} is available. Downloading automatically…` });
        void autoUpdater.downloadUpdate().catch((error) => {
          acceptedUpdateVersion = null;
          appendLog(errPath, `Updater download: ${error.message}`);
          sendUpdateStatus({ state: "failed", message: "The update download failed. You can retry from the menu." });
        });
      });
      autoUpdater.on("update-not-available", () => {
        acceptedUpdateVersion = null;
        void autoUpdater.downloadedUpdateHelper?.clear?.().catch((error) => appendLog(errPath, `Stale updater cache: ${error.message}`));
        sendUpdateStatus({ state: "current", availableVersion: null, percent: 0, message: "Local Agent is up to date." });
      });
      autoUpdater.on("download-progress", (progress) => {
        if (!acceptedUpdateVersion) return;
        sendUpdateStatus({ state: "downloading", percent: Math.round(progress.percent || 0), message: `Downloading update… ${Math.round(progress.percent || 0)}%` });
      });
      autoUpdater.on("update-downloaded", (info) => {
        if (!isNewerVersion(info.version, app.getVersion()) || (acceptedUpdateVersion && acceptedUpdateVersion !== info.version)) {
          acceptedUpdateVersion = null;
          void autoUpdater.downloadedUpdateHelper?.clear?.().catch((error) => appendLog(errPath, `Stale updater cache: ${error.message}`));
          sendUpdateStatus({ state: "current", availableVersion: null, percent: 0, message: "Local Agent is up to date." });
          return;
        }
        try {
          recordDownloadedUpdate(localAgentRoot, { fromVersion: app.getVersion(), toVersion: info.version });
        } catch (error) {
          appendLog(errPath, `Updater marker: ${error instanceof Error ? error.message : error}`);
        }
        sendUpdateStatus({ state: "ready", availableVersion: info.version, percent: 100, message: `Version ${info.version} is ready to install.` });
      });
      autoUpdater.on("error", (error) => {
        appendLog(errPath, `Updater: ${error.message}`);
        const noPublishedRelease = /no published versions/i.test(error.message);
        sendUpdateStatus(noPublishedRelease
          ? { state: "unavailable", message: "No Local Agent update has been published yet." }
          : { state: "failed", message: "The update check failed. You can retry from the menu." });
      });
      setTimeout(() => autoUpdater.checkForUpdates().catch((error) => appendLog(errPath, error.message)), updatedOnThisLaunch ? 60_000 : 15_000).unref();
    }
  });
  app.on("window-all-closed", (event) => {
    event.preventDefault();
  });
  app.on("before-quit", (event) => {
    if (safeQuitApproved || !runner?.busy) return;
    event.preventDefault();
    sendStatus({ title: "Finishing Tally work", detail: "The agent will close after the active financial operation reaches a safe boundary.", state: "running" });
    const waitForSafeExit = setInterval(() => {
      if (runner?.busy) return;
      clearInterval(waitForSafeExit);
      safeQuitApproved = true;
      app.quit();
    }, 500);
  });
}

if (relaunchWithWindowsCertificateStore()) {
  app.exit(0);
} else {
  startApplication();
}
