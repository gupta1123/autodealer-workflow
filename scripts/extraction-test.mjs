// Sends PDFs/images to the API's test-only extraction endpoint and saves each response as JSON.
// Nothing is saved in Supabase.
//
//   node --env-file=apps/api/.env scripts/extraction-test.mjs <file-or-folder> [more...] [options]
//
// Options:
//   --out=<folder>               where to write results (default: extraction-test-results)
//   --label=<name>               run name, used in the output file names (default: baseline)
//   --mode=smart_split|standard  analysis mode (default: smart_split, same as cases)
//   --review                     also run the extraction review step
//   --model=<model id>           override the model for every AI call
//   --append=<text>              append text to every system prompt
//   --append-file=<path>         same, reading the text from a file
//   --replace-file=<path>        JSON array of {find, replace} for the system prompts
//   --no-trace                   leave out per-call prompts and raw responses
//
// Needs WORKER_SECRET, and APP_BASE_URL for a non-local API (default http://localhost:3001).
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);
const inputs = args.filter((arg) => !arg.startsWith("--"));

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const secret = process.env.WORKER_SECRET;
if (!secret) throw new Error("WORKER_SECRET is not set.");
if (!inputs.length) throw new Error("Give at least one PDF/image file or folder.");

const outDir = path.resolve(flag("out") || "extraction-test-results");
const label = (flag("label") || "baseline").replace(/[^\w.-]+/g, "_");
const append = flag("append-file") ? await fs.readFile(flag("append-file"), "utf8") : flag("append");
const replace = flag("replace-file") ? await fs.readFile(flag("replace-file"), "utf8") : "";

const files = [];
for (const input of inputs) {
  const stat = await fs.stat(input);
  if (stat.isDirectory()) {
    for (const name of (await fs.readdir(input)).sort()) {
      if (/\.(pdf|png|jpe?g|webp)$/i.test(name)) files.push(path.join(input, name));
    }
  } else {
    files.push(input);
  }
}

const mimeFor = (name) =>
  /\.pdf$/i.test(name) ? "application/pdf" : /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";

await fs.mkdir(outDir, { recursive: true });
for (const file of files) {
  const name = path.basename(file);
  const form = new FormData();
  form.append("files", new Blob([await fs.readFile(file)], { type: mimeFor(name) }), name);
  form.append("analysisMode", flag("mode") || "smart_split");
  if (has("review")) form.append("review", "true");
  if (flag("model")) form.append("model", flag("model"));
  if (append) form.append("systemAppend", append);
  if (replace) form.append("systemReplace", replace);
  if (has("no-trace")) form.append("trace", "false");

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/internal/extract-test`, {
    method: "POST",
    headers: { "x-worker-secret": secret },
    body: form,
  });
  let payload = { error: `HTTP ${response.status}` };
  if (response.ok) {
    // Newline-delimited JSON: progress lines, then one result or error line.
    let buffer = "";
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.event === "progress") {
          console.log(`  [${Math.round(event.elapsedMs / 1000)}s] ${event.stage} (${event.aiCalls} AI calls)`);
        } else {
          payload = event;
        }
      }
    }
    if (buffer.trim()) payload = JSON.parse(buffer);
    if (payload.event !== "result" && !payload.error) payload = { error: "The stream ended without a result." };
  } else {
    payload = await response.json().catch(() => payload);
  }
  const target = path.join(outDir, `${path.parse(name).name}.${label}.json`);
  await fs.writeFile(target, JSON.stringify(payload, null, 2));

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (payload.error) {
    console.log(`${name}: FAILED after ${seconds}s - ${payload.error}`);
    continue;
  }
  console.log(`${name}: ${payload.documents.length} documents, ${payload.mismatches.length} mismatches, ${payload.aiCalls} AI calls, ${seconds}s -> ${target}`);
  for (const doc of payload.documents) {
    const fields = Object.entries(doc.fields || {})
      .filter(([key, value]) => key !== "__lineItems" && value !== "" && value != null)
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    console.log(`  - ${doc.type} (${doc.title || ""}): ${fields.join(" | ").slice(0, 400)}`);
  }
}
