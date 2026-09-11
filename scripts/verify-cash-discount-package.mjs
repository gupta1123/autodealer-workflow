import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpacked = path.join(root, 'installer/tally-bridge/output/win-unpacked');
const code = `
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const archive = ${JSON.stringify(path.join(unpacked, 'resources/app.asar'))};
const root = ${JSON.stringify(root)};
for (const file of ['bridge.mjs','open-bill-discovery.mjs','agent/runtime.mjs','agent/storage-worker.mjs','agent/workflow-cache-policy.mjs']) {
  const bundled = fs.readFileSync(path.join(archive,'node_modules/@autodealer/tally-bridge/src',file));
  const source = fs.readFileSync(path.join(root,'apps/tally-bridge/src',file));
  assert.ok(bundled.equals(source), 'Stale packaged source: ' + file);
}
for (const [name, version] of [['ws','8.21.1'],['@firecrawl/anydoc','0.1.9'],['better-sqlite3-multiple-ciphers','12.11.1']]) {
  assert.equal(JSON.parse(fs.readFileSync(path.join(archive,'node_modules',name,'package.json'),'utf8')).version,version);
}
const Database = require(path.join(archive,'node_modules/better-sqlite3-multiple-ciphers'));
const db = new Database(':memory:');
assert.equal(db.prepare('select 1 as ok').get().ok,1); db.close();
console.log('PASS: packaged sources match; dependencies pinned; native SQLite loads. No Tally calls.');
`;
const result = spawnSync(path.join(unpacked, 'Kalika Local Agent.exe'), ['-e', code], {
  windowsHide:true, encoding:'utf8', timeout:30000,
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
});
if (result.error) throw result.error;
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
if (result.status !== 0) throw new Error(`Packaged smoke test failed: ${result.status}`);
