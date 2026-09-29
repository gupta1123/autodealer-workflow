// Generates the connector's copy of the Cash Discount / Payment Follow-ups
// analysis from the API's TypeScript source, so the connector calculates the
// dashboard with exactly the server's code. Only types are removed and
// "@/lib/..." imports are pointed at the generated files.
//
//   node scripts/build-connector-collections-analysis.mjs          write files
//   node scripts/build-connector-collections-analysis.mjs --check  fail if stale
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "apps/api/src/lib");
const outputDirectory = path.join(root, "apps/tally-bridge/src/collections-analysis");
const modules = [
  "business-date",
  "collections",
  "payment-follow-up",
  "cash-discount-narration",
  "collections-dashboard",
  "cash-discount-live-analysis",
  "access/followups-dashboard",
  "cash-discount-live-dashboard",
];

function generate(name) {
  const source = fs.readFileSync(path.join(sourceDirectory, `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
    fileName: `${name}.ts`,
  });
  const javascript = outputText.replace(/from\s+(["'])@\/lib\/([^"']+)\1/g, (match, quote, target) => {
    if (!modules.includes(target)) throw new Error(`${name}.ts imports @/lib/${target}, which is not part of the connector analysis.`);
    return `from ${quote}./${path.basename(target)}.mjs${quote}`;
  });
  if (/from\s+["'](?!\.\/)/.test(javascript)) throw new Error(`${name}.ts imports a package; the connector analysis must stay dependency-free.`);
  return `// GENERATED from apps/api/src/lib/${name}.ts by scripts/build-connector-collections-analysis.mjs.\n// Do not edit: change the API source and run the script.\n${javascript.replace(/\r\n/g, "\n")}`;
}

const check = process.argv.includes("--check");
const stale = [];
if (!check) fs.mkdirSync(outputDirectory, { recursive: true });
for (const name of modules) {
  const target = path.join(outputDirectory, `${path.basename(name)}.mjs`);
  const content = generate(name);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) stale.push(path.relative(root, target));
  } else {
    fs.writeFileSync(target, content);
  }
}
if (check && stale.length) {
  console.error(`Connector analysis is out of date with the API source: ${stale.join(", ")}. Run node scripts/build-connector-collections-analysis.mjs`);
  process.exit(1);
}
console.log(check ? "Connector analysis matches the API source." : `Generated ${modules.length} connector analysis modules in ${path.relative(root, outputDirectory)}.`);
