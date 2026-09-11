import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LocalDocumentService } from '../apps/tally-bridge/src/agent/document-service.mjs';

const source = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: true });
const temporaryDirectory = await fs.mkdtemp(path.join(output, 'temporary-'));
const service = new LocalDocumentService({ temporaryDirectory });
const results = [];
for (const name of (await fs.readdir(source)).filter(n => /\.pdf$/i.test(n)).sort()) {
  const bytes = await fs.readFile(path.join(source, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const copy = path.join(temporaryDirectory, name);
  await fs.copyFile(path.join(source, name), copy);
  const start = performance.now();
  let row;
  try {
    const result = await service.parseFresh({ localSourcePath: copy, originalName: name, expectedSha256: sha256 });
    await fs.writeFile(path.join(output, name + '.md'), result.markdown);
    row = { name, bytes: bytes.length, sha256, success: true, wallMs: Math.round(performance.now() - start), parseMs: result.parseMs, estimatedPages: result.pageCount, markdownBytes: result.markdownBytes };
  } catch (error) {
    row = { name, bytes: bytes.length, sha256, success: false, wallMs: Math.round(performance.now() - start), code: error.code, error: error.message };
  } finally {
    await fs.rm(copy, { force: true });
  }
  row.originalUnchanged = createHash('sha256').update(await fs.readFile(path.join(source, name))).digest('hex') === sha256;
  results.push(row);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}
await fs.rmdir(temporaryDirectory);
