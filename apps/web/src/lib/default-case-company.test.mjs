import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCaseCompany} from './default-case-company.ts';
const now=new Date('2026-10-17T05:00:00Z');
const companies=[{id:'old',name:'Kalika Steel - 2025-26'},{id:'current',name:'Kalika Steel - 2026-27'}];
test('defaults a single business to current Indian financial year and keeps explicit choices',()=>{
 assert.equal(defaultCaseCompany(companies,'',now),'current');
 assert.equal(defaultCaseCompany(companies,'old',now),'old');
 assert.equal(defaultCaseCompany(companies,'forbidden',now),'current');
 assert.equal(defaultCaseCompany([companies[0]],'',now),'old');
 assert.equal(defaultCaseCompany([{id:'old',name:'Kalika Steel Alloys Pvt Ltd - (25-26)'},{id:'current',name:'Kalika Steel Alloys Pvt Ltd - (26-27)'}],'',now),'current');
});
test('never guesses between different businesses or duplicate current years',()=>{
 assert.equal(defaultCaseCompany([...companies,{id:'nyx',name:'Solution Nyx - 2026-27'}],'',now),'');
 assert.equal(defaultCaseCompany([...companies,{id:'duplicate',name:'Kalika Steel - 2026-27'}],'',now),'');
 assert.equal(defaultCaseCompany([],'forbidden',now),'');
});
test('uses the financial year boundary in IST',()=>{
 assert.equal(defaultCaseCompany(companies,'',new Date('2026-03-31T18:29:59Z')),'old');
 assert.equal(defaultCaseCompany(companies,'',new Date('2026-03-31T18:30:00Z')),'current');
});
