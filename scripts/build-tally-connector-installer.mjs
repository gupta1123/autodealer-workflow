import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installerRoot = path.join(repoRoot, "installer", "tally-bridge");
const sourceRuntime = process.env.KALIKA_CONNECTOR_RUNTIME || "C:\\Autodealer\\tally-bridge";
const payloadDir = path.join(installerRoot, "payload-clean");
const outputDir = path.join(installerRoot, "output");
const outputExe = path.join(outputDir, "KalikaTallyConnectorSetup.exe");
const tempBuildRoot = "C:\\tmp\\kalika-tally-connector-installer";
const stagingDir = path.join(tempBuildRoot, "staging");
const tempOutputDir = path.join(tempBuildRoot, "output");
const tempOutputExe = path.join(tempOutputDir, "KalikaTallyConnectorSetup.exe");
const payloadZip = path.join(stagingDir, "payload.zip");
const electronAppSource = path.join(installerRoot, "electron-app");
const bridgeSource = path.join(repoRoot, "apps", "tally-bridge", "src", "bridge.mjs");
const powerShellSource = path.join(repoRoot, "apps", "tally-bridge", "powershell");
const samplesSource = path.join(repoRoot, "apps", "tally-bridge", "samples");
const tdlSource = path.join(repoRoot, "apps", "tally-bridge", "tdl");

function ensureFile(filePath, label = filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function copyRuntimeFile(name) {
  const source = path.join(runtimeSource, name);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(payloadDir, name));
  }
}

function writeInstallFiles() {
  const installCmd = `@echo off\r\nsetlocal\r\nset SCRIPT_DIR=%~dp0\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"\r\nexit /b %ERRORLEVEL%\r\n`;

  const installPs1 = String.raw`$ErrorActionPreference = "Stop"

$installDir = "C:\Autodealer\tally-bridge"
$configDir = Join-Path $env:USERPROFILE ".autodealer-tally-bridge"
$payloadZip = Join-Path $PSScriptRoot "payload.zip"
$payloadExtract = Join-Path $env:TEMP "kalika-tally-connector-payload"
$nativePdfTdl = Join-Path $installDir "tdl\kalika-native-debit-note-export.tdl"
$tallyInstallDir = Join-Path $env:ProgramFiles "TallyPrime"
$tallyTdl = Join-Path $tallyInstallDir "kalika-native-debit-note-export.tdl"

Write-Host "Closing old Kalika Tally Connector instances..."
Get-Process -Name "Kalika Tally Connector" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Write-Host "Preparing clean install folder..."
if (Test-Path $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
}
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

Write-Host "Extracting connector files..."
if (Test-Path $payloadExtract) {
  Remove-Item -LiteralPath $payloadExtract -Recurse -Force
}
Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadExtract -Force
Copy-Item -Path (Join-Path $payloadExtract "*") -Destination $installDir -Recurse -Force

Write-Host "Preparing the native Tally PDF add-on..."
if (Test-Path $nativePdfTdl) {
  try {
    # This is only a convenience copy for Tally's default file picker. The
    # connector always retains its canonical copy under C:\Autodealer.
    Copy-Item -LiteralPath $nativePdfTdl -Destination $tallyTdl -Force
    Write-Host "TDL available in TallyPrime: $tallyTdl"
  } catch {
    Write-Warning "Could not copy the TDL into TallyPrime. Select it once from: $nativePdfTdl"
  }
}

Write-Host "Registering Kalika connect link..."
$protocolRoot = "HKCU:\Software\Classes\kalika-tally"
New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value "URL:Kalika Tally Protocol"
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$protocolRoot\DefaultIcon" -Force | Out-Null
Set-Item -Path "$protocolRoot\DefaultIcon" -Value "$installDir\Kalika Tally Connector.exe,0"
New-Item -Path "$protocolRoot\shell\open\command" -Force | Out-Null
$openCommand = '"' + (Join-Path $installDir "Kalika Tally Connector.exe") + '" "%1"'
Set-Item -Path "$protocolRoot\shell\open\command" -Value $openCommand

Write-Host "Starting connector..."
Start-Process -FilePath "$installDir\Kalika Tally Connector.exe"
Write-Host "Kalika Tally Connector installed successfully."
`;

  fs.writeFileSync(path.join(stagingDir, "install.cmd"), installCmd);
  fs.writeFileSync(path.join(stagingDir, "install.ps1"), installPs1);
}

function writeSedFile() {
  const sedPath = path.join(stagingDir, "kalika-tally-connector.sed");
  const sed = `[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
FinishMessage=
TargetName=${tempOutputExe}
FriendlyName=Kalika Tally Connector Setup
AppLaunched=install.cmd
FILE0=install.cmd
FILE1=install.ps1
FILE2=payload.zip

[SourceFiles]
SourceFiles0=${stagingDir}

[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
`;
  fs.writeFileSync(sedPath, sed);
  return sedPath;
}

let runtimeSource = sourceRuntime;
if (!fs.existsSync(path.join(runtimeSource, "Kalika Tally Connector.exe"))) {
  const existingCleanPayload = payloadDir;
  const tempRuntimeSeed = path.join(tempBuildRoot, "runtime-seed");
  if (!fs.existsSync(path.join(existingCleanPayload, "Kalika Tally Connector.exe"))) {
    throw new Error(`Missing installed Electron runtime: ${sourceRuntime}`);
  }
  resetDir(tempRuntimeSeed);
  fs.cpSync(existingCleanPayload, tempRuntimeSeed, { recursive: true, force: true });
  runtimeSource = tempRuntimeSeed;
}

ensureFile(path.join(runtimeSource, "Kalika Tally Connector.exe"), "installed Electron runtime");
ensureFile(bridgeSource, "bridge source");
ensureFile(path.join(electronAppSource, "main.mjs"), "Electron wrapper");

resetDir(payloadDir);
resetDir(stagingDir);
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(tempOutputDir, { recursive: true });

for (const name of [
  "Kalika Tally Connector.exe",
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
  copyRuntimeFile(name);
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

fs.writeFileSync(
  path.join(payloadDir, "package.json"),
  `${JSON.stringify(
    {
      name: "@autodealer/tally-bridge-runtime",
      version: "0.1.17",
      private: true,
      type: "module",
    },
    null,
    2
  )}\n`
);

writeInstallFiles();

if (fs.existsSync(payloadZip)) fs.rmSync(payloadZip, { force: true });
execFileSync(
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${payloadDir}\\*' -DestinationPath '${payloadZip}' -Force`,
  ],
  { stdio: "inherit" }
);

const sedPath = writeSedFile();
if (fs.existsSync(outputExe)) fs.rmSync(outputExe, { force: true });
if (fs.existsSync(tempOutputExe)) fs.rmSync(tempOutputExe, { force: true });
execFileSync("C:\\Windows\\System32\\iexpress.exe", ["/N", sedPath], { stdio: "inherit" });

if (!fs.existsSync(tempOutputExe)) {
  const ddfPath = path.join(tempOutputDir, "~KalikaTallyConnectorSetup.DDF");
  if (!fs.existsSync(ddfPath)) {
    throw new Error("IExpress did not create the setup exe or a fallback cabinet definition.");
  }
  execFileSync("C:\\Windows\\System32\\makecab.exe", ["/F", ddfPath], { stdio: "ignore" });
}

if (!fs.existsSync(tempOutputExe)) {
  throw new Error("Setup exe was not created.");
}

fs.copyFileSync(tempOutputExe, outputExe);

console.log(`Installer created: ${outputExe}`);
