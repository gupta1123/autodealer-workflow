import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const connector = {
  brandName: "Kalika",
  connectorName: "Kalika Tally Connector",
  executableName: "Kalika Tally Connector.exe",
  setupName: "KalikaTallyConnectorSetup.exe",
  protocolName: "kalika-tally",
  configFolderName: ".autodealer-tally-bridge",
  installDir: "C:\\Autodealer\\tally-bridge",
  runtimeEnvironmentVariable: "KALIKA_CONNECTOR_RUNTIME",
  runtimePackageName: "@autodealer/tally-bridge-runtime",
  version: "0.1.43",
  tdlFileNames: [
    "kalika-native-debit-note-export.tdl",
    "kalika-purchase-document-attachment.tdl",
  ],
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installerRoot = path.join(repoRoot, "installer", "tally-bridge");
const electronAppSource = path.join(installerRoot, "electron-app");
const payloadDir = path.join(installerRoot, "payload-clean");
const outputDir = path.join(installerRoot, "output");
const outputExe = path.join(outputDir, connector.setupName);
const innoDefinition = path.join(installerRoot, "kalika-tally-bridge.iss");
const bridgeRoot = path.join(repoRoot, "apps", "tally-bridge");
const bridgeSource = path.join(bridgeRoot, "src", "bridge.mjs");
const powerShellSource = path.join(bridgeRoot, "powershell");
const samplesSource = path.join(bridgeRoot, "samples");
const tdlSource = path.join(bridgeRoot, "tdl");
const dashboardSource = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "components",
  "tally",
  "TallyPrimeDashboard.tsx"
);
const wsPackageSource = path.join(repoRoot, "node_modules", "ws");

function ensureFile(filePath, label = filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function ensureContains(filePath, expected, label) {
  ensureFile(filePath, label);
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.includes(expected)) {
    throw new Error(`${label} does not contain ${JSON.stringify(expected)}: ${filePath}`);
  }
}

function validateSources() {
  ensureFile(bridgeSource, "Tally bridge source");
  ensureFile(path.join(electronAppSource, "main.mjs"), "Electron wrapper");
  ensureFile(path.join(electronAppSource, "package.json"), "Electron wrapper package");
  ensureFile(path.join(wsPackageSource, "package.json"), "ws runtime package");
  for (const fileName of connector.tdlFileNames) {
    ensureFile(path.join(tdlSource, fileName), `Kalika TDL ${fileName}`);
  }
  ensureContains(dashboardSource, `${connector.protocolName}://connect`, "Kalika web connector protocol");
  ensureContains(bridgeSource, connector.configFolderName, "Kalika bridge configuration folder");
  ensureContains(innoDefinition, connector.connectorName, "Inno Setup product name");
  ensureContains(innoDefinition, connector.protocolName, "Inno Setup protocol");
  ensureContains(path.join(electronAppSource, "main.mjs"), connector.connectorName, "Electron product name");
  console.log(`Installer sources validated for ${connector.connectorName} (${connector.protocolName}://).`);
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, destination) {
  if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true, force: true });
}

function findRuntimeExecutable(runtimeSource) {
  const preferredNames = [connector.executableName, "electron.exe"];
  for (const name of preferredNames) {
    const candidate = path.join(runtimeSource, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (!fs.existsSync(runtimeSource)) return null;
  const candidates = fs
    .readdirSync(runtimeSource, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .filter((entry) => !/(setup|unins|update|squirrel)/i.test(entry.name));
  return candidates.length === 1 ? path.join(runtimeSource, candidates[0].name) : null;
}

function findRuntime() {
  const candidates = [
    process.env[connector.runtimeEnvironmentVariable],
    connector.installDir,
  ].filter(Boolean);
  for (const runtimeSource of candidates) {
    const executable = findRuntimeExecutable(runtimeSource);
    if (executable) return { runtimeSource, executable };
  }
  throw new Error(
    `Missing Electron runtime. Set ${connector.runtimeEnvironmentVariable} to an Electron runtime directory.`
  );
}

function findInnoCompiler() {
  const candidates = [
    process.env.INNO_SETUP_COMPILER,
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  ].filter(Boolean);
  const compiler = candidates.find((candidate) => fs.existsSync(candidate));
  if (!compiler) {
    throw new Error("Inno Setup 6 compiler was not found. Install Inno Setup 6 or set INNO_SETUP_COMPILER.");
  }
  return compiler;
}

function copyOptionalRuntimeFile(runtimeSource, name) {
  const source = path.join(runtimeSource, name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(payloadDir, name));
}

validateSources();
if (process.argv.includes("--validate")) process.exit(0);
if (process.platform !== "win32") {
  throw new Error("The setup executable must be built on Windows because it uses Inno Setup.");
}

const { runtimeSource, executable: runtimeExecutable } = findRuntime();
const innoCompiler = findInnoCompiler();
resetDir(payloadDir);
fs.mkdirSync(outputDir, { recursive: true });

fs.copyFileSync(runtimeExecutable, path.join(payloadDir, connector.executableName));
for (const name of [
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "d3dcompiler_47.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE.electron.txt",
  "LICENSES.chromium.html",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll",
]) {
  copyOptionalRuntimeFile(runtimeSource, name);
}

copyDir(path.join(runtimeSource, "locales"), path.join(payloadDir, "locales"));
copyDir(powerShellSource, path.join(payloadDir, "powershell"));
copyDir(samplesSource, path.join(payloadDir, "samples"));
copyDir(tdlSource, path.join(payloadDir, "tdl"));

const appDir = path.join(payloadDir, "resources", "app");
fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
fs.copyFileSync(path.join(electronAppSource, "main.mjs"), path.join(appDir, "main.mjs"));
fs.copyFileSync(path.join(electronAppSource, "package.json"), path.join(appDir, "package.json"));
fs.copyFileSync(bridgeSource, path.join(appDir, "src", "bridge.mjs"));
copyDir(wsPackageSource, path.join(appDir, "node_modules", "ws"));
fs.writeFileSync(
  path.join(payloadDir, "package.json"),
  `${JSON.stringify(
    { name: connector.runtimePackageName, version: connector.version, private: true, type: "module" },
    null,
    2
  )}\n`
);

if (fs.existsSync(outputExe)) fs.rmSync(outputExe, { force: true });
execFileSync(innoCompiler, [innoDefinition], { cwd: installerRoot, stdio: "inherit" });
if (!fs.existsSync(outputExe)) throw new Error("Inno Setup did not create the setup executable.");
console.log(`Installer created: ${outputExe}`);
