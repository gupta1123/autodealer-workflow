import {test} from 'node:test';
import assert from 'node:assert/strict';
import {purchaseFinancialDigest} from './purchase-digest.ts';
test('purchase digest is stable for field and document ordering',()=>{
 const a={id:'a',document_type:'Invoice',extracted_fields:{amount:10,tax:1}};
 const b={id:'b',document_type:'PO',extracted_fields:{amount:10}};
 assert.equal(purchaseFinancialDigest([a,b],{ledger:'A',amount:11},null),purchaseFinancialDigest([b,{...a,extracted_fields:{tax:1,amount:10}}],{amount:11,ledger:'A'},null));
});
test('amounts, ledger choices and routing all invalidate the approved digest',()=>{
 const docs=[{id:'a',document_type:'Invoice',extracted_fields:{amount:10}}];
 const baseline=purchaseFinancialDigest(docs,{ledger:'A'},{company:'A',connection:'1'});
 assert.notEqual(baseline,purchaseFinancialDigest(docs,{ledger:'B'},{company:'A',connection:'1'}));
 assert.notEqual(baseline,purchaseFinancialDigest(docs,{ledger:'A'},{company:'A',connection:'2'}));
 assert.notEqual(baseline,purchaseFinancialDigest([{...docs[0],extracted_fields:{amount:11}}],{ledger:'A'},{company:'A',connection:'1'}));
});

test('copy evidence is bound to the approval for a multipage invoice',()=>{
  const doc={id:'a',document_type:'Tax Invoice',extracted_fields:{subtotal:100}};
  const old=purchaseFinancialDigest([doc],{},null);
  const copy={...doc,markdown:'### Page 1\noriginal\n### Page 2\ncopy'};
  assert.notEqual(purchaseFinancialDigest([copy],{},null),old);
  assert.notEqual(purchaseFinancialDigest([copy],{},null),purchaseFinancialDigest([{...copy,markdown:copy.markdown+' corrected'}],{},null));
});
