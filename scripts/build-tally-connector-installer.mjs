import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = path.join(repoRoot, "installer", "tally-bridge", "electron-app");
const required = [
  path.join(appDirectory, "main.mjs"),
  path.join(appDirectory, "preload.cjs"),
  path.join(appDirectory, "package.json"),
  path.join(repoRoot, "installer", "tally-bridge", "nsis", "local-agent.nsh"),
  path.join(repoRoot, "apps", "tally-bridge", "tdl", "kalika-agent-sync-reports.tdl"),
  path.join(repoRoot, "apps", "tally-bridge", "powershell", "install-managed-tdl.ps1"),
];
for (const filePath of required) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing Local Agent installer source: ${filePath}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(appDirectory, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version || "") || packageJson.productName !== "Kalika Local Agent") {
  throw new Error("Local Agent installer metadata must contain a valid release version and product name.");
}
if (process.argv.includes("--validate")) {
  console.log("Kalika Local Agent installer sources are valid.");
  process.exit(0);
}
if (process.platform !== "win32") throw new Error("Kalika Local Agent must be packaged on Windows.");
const electronVersion = packageJson.devDependencies?.electron;
if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) throw new Error("Electron must be pinned to an exact version.");

const windowsPowerShellDirectory = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0");
const childEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--use-system-ca"].filter(Boolean).join(" "),
  PATH: [process.env.PATH, windowsPowerShellDirectory].filter(Boolean).join(path.delimiter),
};
const executable = process.env.ComSpec || "cmd.exe";
execFileSync(executable, ["/d", "/s", "/c", "npm install --include=optional --ignore-scripts"], { cwd: appDirectory, stdio: "inherit", env: childEnv });
execFileSync(executable, ["/d", "/s", "/c", `npm exec electron-rebuild -- --force --only better-sqlite3-multiple-ciphers --version ${electronVersion} --module-dir .`], { cwd: appDirectory, stdio: "inherit", env: childEnv });
execFileSync(process.execPath, ["--use-system-ca", path.join(repoRoot, "scripts", "package-local-agent.mjs")], { cwd: appDirectory, stdio: "inherit", env: childEnv });
console.log(`Kalika Local Agent artifacts are in ${path.join(repoRoot, "installer", "tally-bridge", "output")}`);
