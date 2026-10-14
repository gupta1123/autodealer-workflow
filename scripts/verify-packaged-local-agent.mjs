import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Run with the unpacked Electron executable and ELECTRON_RUN_AS_NODE=1.
// This never opens the agent UI, pairs a connection or queries Tally/cloud APIs.
assert.ok(process.versions.electron, 'Use the packaged Electron executable');
const archive = path.resolve(process.argv[2]);
const pdf = path.resolve(process.argv[3]);
assert.equal(path.basename(archive), 'app.asar');
const require = createRequire(path.join(archive, 'package.json'));
const Database = require('better-sqlite3-multiple-ciphers');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kalika-packaged-smoke-'));
const databasePath = path.join(folder, 'smoke.db');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const packagedSourceFiles = [
  'bridge.mjs',
  ...['protocol.mjs', 'runtime.mjs', 'storage-worker.mjs', 'storage.mjs', 'sync-engine.mjs', 'tally-gateway.mjs', 'vector-service.mjs', 'vector-worker.mjs']
    .map((name) => path.join('agent', name)),
];
for (const relative of packagedSourceFiles) {
  const packaged = fs.readFileSync(path.join(archive, 'node_modules', '@autodealer', 'tally-bridge', 'src', relative));
  const workspace = fs.readFileSync(path.resolve('apps/tally-bridge/src', relative));
  assert.equal(sha(packaged), sha(workspace), `Packaged ${relative} differs from the current workspace source`);
}
const sourceHash = sha(fs.readFileSync(pdf));
let db;
let vectors;
let masterServer;
try {
  db = new Database(databasePath);
  db.pragma("cipher='sqlcipher'"); db.pragma('legacy=4'); db.key(Buffer.from('01'.repeat(32), 'hex'));
  db.exec('create table smoke(value text)'); db.prepare('insert into smoke values(?)').run('ENCRYPTION_SMOKE_MARKER'); db.close();
  assert.equal(fs.readFileSync(databasePath).includes(Buffer.from('ENCRYPTION_SMOKE_MARKER')), false);
  const copiedPdf = path.join(folder, 'source.pdf'); fs.copyFileSync(pdf, copiedPdf);
  const modulePath = path.join(archive, 'node_modules', '@autodealer', 'tally-bridge', 'src', 'agent', 'document-service.mjs');
  const { LocalDocumentService } = await import(pathToFileURL(modulePath).href);
  const service = new LocalDocumentService({ temporaryDirectory: folder });
  const result = await service.parseFresh({ localSourcePath: copiedPdf, originalName: 'source.pdf', expectedSha256: sourceHash,
    pipelineVersion: 2, documentDeadlineAt: Date.now()+120000 });
  assert.ok(result.markdown?.length > 100); assert.equal(result.uploaded, false);
  assert.equal(sha(fs.readFileSync(pdf)), sourceHash, 'Original PDF changed');
  assert.equal(fs.existsSync(copiedPdf), false, 'Temporary source retained');
  // Exercise the packaged bank master's HTTP/XML path without contacting Tally.
  const { resolveBankVoucherLedgerPayloads } = await import(pathToFileURL(path.join(archive, 'node_modules', '@autodealer', 'tally-bridge', 'src', 'bridge.mjs')).href);
  masterServer = createServer(async (request, response) => {
    let requestXml = ''; for await (const chunk of request) requestXml += chunk;
    assert.match(requestXml, /KalikaBankVoucherLedgerIdentity/);
    assert.doesNotMatch(requestXml, /<IMPORTDATA>/);
    response.end('<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><COLLECTION><LEDGER NAME="Bank"><GUID>bank-guid</GUID></LEDGER><LEDGER NAME="Customer"><GUID>party-guid</GUID></LEDGER></COLLECTION></BODY></ENVELOPE>');
  });
  await new Promise(resolve => masterServer.listen(0, '127.0.0.1', resolve));
  const resolvedMasters = await resolveBankVoucherLedgerPayloads(`http://127.0.0.1:${masterServer.address().port}`,
    [{ bankLedgerName: 'Bank', counterpartyLedgerName: 'Customer', voucherType: 'Receipt', amount: 100 }], 'Smoke company');
  assert.equal(resolvedMasters[0].counterpartyLedgerGuid, 'party-guid');
  await new Promise(resolve => masterServer.close(resolve)); masterServer = null;
  const vectorModulePath = path.join(archive, 'node_modules', '@autodealer', 'tally-bridge', 'src', 'agent', 'vector-service.mjs');
  const { LocalVectorService, localLedgerEmbedding, LOCAL_LEDGER_VECTOR_DIMENSIONS: dimensions } = await import(pathToFileURL(vectorModulePath).href);
  vectors = new LocalVectorService({ vectorsDirectory: path.join(folder, 'vectors'), enabled: true });
  await vectors.upsert({ datasetKey: 'packaged-smoke', dimensions, documents: [
    { id: 'surya', embedding: localLedgerEmbedding('Surya Steel Trading Company') },
    { id: 'charges', embedding: localLedgerEmbedding('Bank Charges and Commission') },
  ] });
  const vectorHits = await vectors.query({ datasetKey: 'packaged-smoke', dimensions,
    embedding: localLedgerEmbedding('Surya Steel Trading Co'), topK: 2 });
  assert.equal(vectorHits[0]?.id, 'surya', 'Packaged local vector search returned the wrong ledger');
  await vectors.delete({ datasetKey: 'packaged-smoke', dimensions, ids: ['charges'] });
  await vectors.stop(); vectors = null;
  console.log(JSON.stringify({ electron: process.versions.electron, encryptedSQLite: true,
    packagedParser: true, packagedBankMasterValidation: true, packagedVectorSearch: true, packagedSourceFiles: packagedSourceFiles.length,
    bridgeSourceMatches: true, parseMs: result.parseMs, markdownBytes: result.markdownBytes, originalUnchanged: true }));
} finally {
  if (masterServer) await new Promise(resolve => masterServer.close(resolve));
  await vectors?.stop().catch(() => {});
  if (db?.open) db.close();
  // The only recursive removal is the fresh mkdtemp test directory above.
  assert.equal(path.dirname(folder), os.tmpdir());
  assert.ok(path.basename(folder).startsWith('kalika-packaged-smoke-'));
  fs.rmSync(folder, { recursive: true, force: true });
}
