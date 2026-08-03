import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

const rootDir = path.resolve(".");
const desktopDir = path.join(rootDir, "apps", "tally-desktop");
const unpackedDir = path.join(desktopDir, "dist", "win-unpacked");
const payloadDir = path.join(rootDir, "installer", "tally-bridge", "payload");

console.log("=== Step 0: Closing Running Instances ===");
try {
  if (process.platform === "win32") {
    execSync("taskkill /F /IM electron.exe", { stdio: "ignore" });
    execSync("taskkill /F /IM \"Kalika Tally Connector.exe\"", { stdio: "ignore" });
  }
} catch {
  // Ignore if no instances were running
}

console.log("\n=== Step 1: Unpacking Electron Desktop App ===");
execSync("npx electron-builder --dir", { cwd: desktopDir, stdio: "inherit" });

console.log("\n=== Step 2: Syncing to Inno Setup Payload ===");
if (fs.existsSync(payloadDir)) {
  fs.rmSync(payloadDir, { recursive: true, force: true });
}
fs.mkdirSync(payloadDir, { recursive: true });

fs.cpSync(unpackedDir, payloadDir, { recursive: true });
console.log(`Copied ${unpackedDir} -> ${payloadDir}`);

console.log("\n=== Step 3: Compiling Setup .exe ===");
execSync("npm run installer:tally-bridge", { cwd: rootDir, stdio: "inherit" });

console.log("\n=== Step 4: Restoring Dev Dependencies ===");
execSync("npm install", { cwd: desktopDir, stdio: "inherit" });

console.log("\n✅ SUCCESS! Unified Connector Setup created at:");
console.log(path.join(rootDir, "installer", "tally-bridge", "output", "KalikaTallyBridgeSetup.exe"));
