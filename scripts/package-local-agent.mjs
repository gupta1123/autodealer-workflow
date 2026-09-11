import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'installer/tally-bridge/electron-app');
const require = createRequire(path.join(app, 'package.json'));
const builderVersion = require('electron-builder/package.json').version;
if (builderVersion !== '26.15.3') throw new Error('Review the Windows npm collector adapter before upgrading electron-builder.');
// The pinned collector invokes npm via PowerShell on Windows. Avoid the
// PowerShell/npm shim failure that produces an empty dependency JSON file:
// invoke the real npm CLI with Node. Keep the builder's parser, dependency
// validation, output flushing and credential stripping unchanged.
if (process.platform === 'win32') {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npmCli) || !npmCli.endsWith('npm-cli.js')) throw new Error('A real npm-cli.js is required for packaging.');
  const { NpmNodeModulesCollector } = require('app-builder-lib/out/node-module-collector/npmNodeModulesCollector.js');
  const original = NpmNodeModulesCollector.prototype.streamCollectorCommandToFile;
  // Limit adaptation to npm's collector; no application runtime code is patched.
  NpmNodeModulesCollector.prototype.streamCollectorCommandToFile = async function (_command, args, cwd, output) {
    const { spawn } = await import('node:child_process');
    const { stripSensitiveEnvVars } = require('builder-util');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [npmCli, ...args], { cwd, windowsHide: true, env: stripSensitiveEnvVars(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
      const stream = fs.createWriteStream(output);
      let stderr = ''; let code; let closed = false; let flushed = false;
      const finish = () => {
        if (!closed || !flushed) return;
        if (code !== 0 && code !== 1) reject(new Error(`npm dependency collection failed (${code}): ${stderr.slice(-2000)}`));
        else resolve(); // npm list may return 1 with usable dependency JSON.
      };
      child.stdout.pipe(stream);
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
      child.on('error', error => { stream.destroy(); reject(error); });
      stream.on('error', error => { child.kill(); reject(error); });
      stream.on('finish', () => { flushed = true; finish(); });
      child.on('close', value => { code = value; closed = true; finish(); });
    });
  };
  if (typeof original !== 'function') throw new Error('Unsupported electron-builder collector.');
}
const { build, Platform, Arch } = require('electron-builder');
await build({ projectDir: app, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never' });
