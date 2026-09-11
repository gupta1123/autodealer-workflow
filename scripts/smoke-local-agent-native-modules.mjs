import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("Native Local Agent smoke test must run on Windows.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = path.join(root, "installer", "tally-bridge", "electron-app");
const electronVersion = JSON.parse(fs.readFileSync(path.join(appDirectory, "package.json"), "utf8")).devDependencies.electron;
if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) throw new Error("Electron must be pinned to an exact version.");
const command = process.env.ComSpec || "cmd.exe";
const windowsPowerShellDirectory = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0");
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--use-system-ca"].filter(Boolean).join(" "),
  PATH: [process.env.PATH, windowsPowerShellDirectory].filter(Boolean).join(path.delimiter),
};
execFileSync(command, ["/d", "/s", "/c", "npm install --include=optional --ignore-scripts"], { cwd: appDirectory, stdio: "inherit", env });
execFileSync(command, ["/d", "/s", "/c", `npm exec electron-rebuild -- --force --only better-sqlite3-multiple-ciphers --version ${electronVersion} --module-dir .`], { cwd: appDirectory, stdio: "inherit", env });
const require = createRequire(path.join(appDirectory, "package.json"));
for (const moduleName of ["better-sqlite3-multiple-ciphers", "@firecrawl/anydoc", "@zvec/zvec"]) {
  require.resolve(moduleName);
  console.log(`Resolved ${moduleName}`);
}
