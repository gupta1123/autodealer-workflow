import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTallyConnection} from './tally-connection-choice.ts';
const connections=[{id:'nilesh',pairedAt:'2026-10-17T07:24:00Z'},{id:'old-aditya',pairedAt:'2026-10-17T13:05:00Z',revoked:true},{id:'aditya',pairedAt:'2026-10-17T13:07:00Z'}];
test('the PC paired in this browser wins over an old shared-PC selection',()=>{
 assert.equal(chooseTallyConnection(connections,{previousId:'nilesh',locallyPairedIds:['old-aditya','aditya']}),'aditya');
});
test('a deliberate selection is retained when it is still authorized',()=>{
 assert.equal(chooseTallyConnection(connections,{explicitId:'nilesh',locallyPairedIds:['aditya']}),'nilesh');
});
test('a removed or unauthorized saved ID cannot become a connection choice',()=>{
 assert.equal(chooseTallyConnection(connections,{explicitId:'private',previousId:'private',locallyPairedIds:['private','aditya']}),'aditya');
});
test('an old pairing cannot replace the newer local pairing',()=>{
 assert.equal(chooseTallyConnection(connections,{locallyPairedIds:['old-aditya','aditya','nilesh']}),'aditya');
});
test('existing selection and empty-state behavior remain when local pairing evidence is absent',()=>{
 assert.equal(chooseTallyConnection(connections,{previousId:'nilesh',locallyPairedIds:[]}),'nilesh');
 assert.equal(chooseTallyConnection([],{previousId:'nilesh',locallyPairedIds:[]}),'');
});

test('a stale shared selection recovers to the only live PC when an earlier failed poll lost local pairing evidence',()=>{
 const pcs=[{id:'nilesh',bridgeConnected:false},{id:'aditya',bridgeConnected:true}];
 assert.equal(chooseTallyConnection(pcs,{previousId:'nilesh',locallyPairedIds:[]}),'aditya');
 assert.equal(chooseTallyConnection(pcs,{explicitId:'nilesh',locallyPairedIds:[]}),'nilesh');
});
