import { createHash } from 'node:crypto';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

/** Includes financial inputs, not changing transport timestamps or processing status. */
export function purchaseFinancialDigest(documents: Array<{ id: string; document_type: string; markdown?: string | null; extracted_fields: unknown }>, review: unknown, routing: unknown) {
  const invoices = documents.filter(doc => /invoice/i.test(doc.document_type));
  const copyOrChain = invoices.length > 1 || invoices.some(doc => /^### Page (?:[2-9]|[1-9]\d+)\b/m.test(doc.markdown ?? ""));
  // The revised split-GST rounding also applies to single-page purchase drafts.
  // Include the calculation revision whenever the supplier reports GST.
  const usesRevisedTax = invoices.some(doc => {
    const fields = doc.extracted_fields as Record<string, unknown> | null;
    return Boolean(fields?.taxAmount || fields?.__lineItems);
  });
  const inputs = documents.map(({markdown, ...doc}) =>
    copyOrChain && /invoice/i.test(doc.document_type) ? {...doc, markdown: markdown ?? ""} : doc);
  return createHash('sha256').update(stable({ version: copyOrChain || usesRevisedTax ? 2 : 1, documents: inputs.sort((a, b) => a.id.localeCompare(b.id)), review, routing })).digest('hex');
}
