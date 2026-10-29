import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// messages.ts imports through the app's "@/" alias; load it with that one import supplied.
const source=fs.readFileSync(fileURLToPath(new URL('./messages.ts',import.meta.url)),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const compiled={exports:{}};
new Function('require','module','exports',code)(name=>{if(name==='@/lib/msg91/whatsapp')return {WhatsappRejectedError:class extends Error{}};throw Error(`Unexpected dependency: ${name}`);},compiled,compiled.exports);
const {invoiceListLine,templateForRow,reminderPreview,reminderMessageValues,SUMMARY_MESSAGE}=compiled.exports;

const inv=(n,date,amount)=>({invoice:`INV/${n}`,invoice_date:date,outstanding:amount});

test('the invoice line lists the five oldest on one line and counts the rest',()=>{
 const line=invoiceListLine([inv(7,'2026-09-07',700),inv(1,'2026-08-01',60000),inv(2,'2026-08-02',45000),inv(3,'2026-08-03',300),inv(4,'2026-08-04',400),inv(5,'2026-08-05',500),inv(6,'2026-08-06',600)]);
 assert.ok(line.startsWith('INV/1 ₹60,000 (1 Aug); INV/2 ₹45,000 (2 Aug)'));
 assert.ok(line.endsWith('; and 2 more'));
 assert.ok(!/[\n\t]| {5,}/.test(line),'a WhatsApp variable cannot hold line breaks or long runs of spaces');
});

test('two or more invoices use the summary message; one falls back to the stage message',()=>{
 assert.equal(templateForRow({invoices:[inv(1,null,1),inv(2,null,2)]},'payment_reminder_v2'),SUMMARY_MESSAGE);
 assert.equal(templateForRow({invoices:[inv(1,null,1)]},'payment_reminder_v2'),'payment_reminder_v2');
 assert.equal(templateForRow({invoices:null},'payment_reminder_v2'),'payment_reminder_v2');
});

test('the summary preview carries the count, the total and the list',()=>{
 const row={customer:'Shree Traders',company_name:'Kalika',invoice:'2 invoices',invoice_date:'2026-08-01',outstanding:480000,invoices:[inv(1,'2026-08-01',300000),inv(2,'2026-08-02',180000)]};
 const text=reminderPreview(SUMMARY_MESSAGE,row);
 assert.match(text,/You have 2 unpaid invoices totalling ₹4,80,000\.00:/);
 assert.match(text,/INV\/1 ₹3,00,000 \(1 Aug\); INV\/2 ₹1,80,000 \(2 Aug\)/);
});

test('a customer reminder down to one invoice reads as that invoice',()=>{
 const values=reminderMessageValues({customer:'Shree',company_name:'Kalika',invoice:'1 invoice',invoice_date:'2026-08-01',outstanding:700,invoices:[inv(9,'2026-08-09',700)]});
 assert.equal(values.invoice,'INV/9');
 assert.equal(values.invoice_date,'09 Aug 2026');
});
