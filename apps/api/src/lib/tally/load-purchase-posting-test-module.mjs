import { readFileSync } from "node:fs";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

export async function loadPurchasePostingModule() {
  const sharedCalculatorSource = readFileSync(
    new URL("../../../../../packages/shared/src/lib/purchase-voucher.ts", import.meta.url),
    "utf8"
  );
  const sharedCalculatorUrl = dataUrl(transpile(sharedCalculatorSource));
  const lineItemsSource = readFileSync(new URL("../line-items.ts", import.meta.url), "utf8");
  const lineItemsUrl = dataUrl(transpile(lineItemsSource));
  const commercialFieldsSource = readFileSync(
    new URL("../invoice-commercial-fields.ts", import.meta.url),
    "utf8"
  );
  const commercialFieldsUrl = dataUrl(transpile(commercialFieldsSource));
  const postingSource = readFileSync(new URL("./purchase-posting.ts", import.meta.url), "utf8")
    .replace('from "@/lib/line-items"', `from "${lineItemsUrl}"`)
    .replace(
      'from "@/lib/invoice-commercial-fields"',
      `from "${commercialFieldsUrl}"`
    )
    .replace(
      'from "@autodealer/shared/lib/purchase-voucher"',
      `from "${sharedCalculatorUrl}"`
    );
  return { ...await import(dataUrl(transpile(postingSource))), ...await import(lineItemsUrl) };
}
