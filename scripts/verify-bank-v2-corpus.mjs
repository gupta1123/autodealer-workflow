// Sequential real-PDF corpus verification with deterministic AI responses and
// actual disposable PostgreSQL finalization. Never writes to hosted Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { LocalDocumentService } from '../apps/tally-bridge/src/agent/document-service.mjs';
import { handleLocalBankV2 } from '../apps/api/src/lib/processing/bank-local-v2-http.mjs';
import { readDocumentResultStream } from '../apps/tally-bridge/src/agent/document-result-stream.mjs';
import { contextDigest } from '../apps/api/src/lib/processing/bank-local-v2.mjs';
import { matchBankMarkdown } from '../apps/api/src/lib/processing/bank-markdown-ai.mjs';
import { parseDate } from '../apps/api/src/lib/processing/bank-preview-normalization.mjs';

const [source, database] = process.argv.slice(2);
assert.match(database || '', /^bank_v2_[a-z0-9_]+$/);
const names = (await fs.readdir(source)).filter(n => /\.pdf$/i.test(n)).sort();
assert.equal(names.length, 10);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kalika-v2-corpus-'));
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${q(JSON.stringify(value))}::jsonb`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function sql(statement) {
  return new Promise((resolve,reject) => {
    const child = spawn('C:/Program Files/PostgreSQL/17/bin/psql.exe', ['-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1'], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let output='',error=''; child.stdout.on('data', b=>{output+=b;}); child.stderr.on('data', b=>{error+=b;});
    child.on('error',reject); child.on('exit', code=>code ? reject(new Error(error)) : resolve(output.trim())); child.stdin.end(statement);
  });
}
const money = value => {
  const clean = String(value || '').replaceAll(',', '').trim();
  const found = clean.match(/-?\d+\.\d{2}/);
  return found ? Number(found[0]) : null;
};
function fixtureRows(markdown, prefix) {
  const layout = prefix <= 4 ? [0,1,2,4,5,7] : prefix === 5 ? [1,2,0,5,6,7] : prefix === 6 ? [0,1,2,4,5,6] : [0,4,3,5,6,7];
  return markdown.split('\n').filter(l=>l.startsWith('|')).flatMap(line=>{
    const cells=line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
    const [date,description,reference,debit,credit,balance]=layout.map(i=>cells[i]);
    // Explicit fixture layouts, not a replacement production extraction path.
    const dateOnly = date?.match(/^\d{1,2}[ /-](?:\d{1,2}|[A-Za-z]{3})[ /-]\d{2,4}(?=\s|$)/)?.[0];
    if (!dateOnly) return [];
    const debitAmount=(prefix <= 4 ? money(cells[3]) ?? money(debit) : money(debit))||0,creditAmount=money(credit)||0;
    if (!debitAmount && !creditAmount) return [];
    const fixtureDate = /[A-Za-z]/.test(dateOnly) ? new Date(`${dateOnly} UTC`).toISOString().slice(0,10) : parseDate(dateOnly);
    return [{ markdown:line, transactionDate:fixtureDate,description,referenceNumber:reference || null,
      debitAmount,creditAmount,balanceAmount:money(balance),suggestedLedgerName:null,suggestionConfidence:0 }];
  });
}
process.env.OPENROUTER_API_KEY = 'fixture-only-no-network';
const results=[];
try {
  for (const name of names) {
    const started=performance.now(),bytes=await fs.readFile(path.join(source,name)),sourceHash=hash(bytes);
    const copy=path.join(temp,name); await fs.copyFile(path.join(source,name),copy);
    const parsed=await new LocalDocumentService({temporaryDirectory:temp}).parseFresh({localSourcePath:copy,expectedSha256:sourceHash});
    const prefix=Number(name.slice(0,2)), fixture=fixtureRows(parsed.markdown,prefix);
    const expected=prefix===1 ? 150 : prefix<=4 ? 19 : prefix===5 ? 4 : prefix===6 ? 16 : 20;
    assert.equal(fixture.length,expected,`${name}: fixture coverage changed`);
    const owner=randomUUID(),connection=randomUUID(),job=randomUUID(),imp=randomUUID(),command=randomUUID();
    const identity={organizationId:owner,ownerUserId:owner,connectionId:connection,installationId:'corpus-fixture',sessionGeneration:1,companyGuid:'company',companyName:'Company',financialYear:'2026-2027'};
    const envelope={pipelineVersion:2,identity,jobId:job,commandId:command,sourceHash,markdown:parsed.markdown,ledgerNames:['Bank','Fixture customer'],bankAccountCandidates:[]};
    envelope.contextHash=contextDigest(envelope);
    await sql(`insert into auth.users values(${q(owner)});
      insert into public.tally_connections values(${q(connection)},${q(owner)},${q(owner)},'corpus-fixture',1,null,'[{"guid":"company","companyName":"Company","financialYear":"2026-27"}]');
      select public.bank_local_v2_create(${q(imp)},${q(job)},${q(command)},${json(identity)},${json({name,size:bytes.length,sha256:sourceHash})},
        jsonb_build_object('tokenHash',repeat('b',64),'origin','http://localhost:3000','expiresAt',extract(epoch from now()+interval '2 minutes')*1000),'http://localhost/result','fixture-token');
      update public.tally_bridge_commands set status='claimed' where id=${q(command)};`);
    const rpc=(name,args)=>sql(`select public.${name}(${args.join(',')});`).then(JSON.parse).catch(error=>{console.error('Disposable fixture RPC failed:',name,error.message);throw error;});
    let prepared,providerCalls=0;
    const response=await handleLocalBankV2(new Request('http://localhost/result',{method:'POST',headers:{Authorization:'Bearer fixture'},body:gzipSync(JSON.stringify(envelope))}),{
      verifyToken:()=>({jobId:command,ownerUserId:owner,connectionId:connection}),
      store:{
        claim:()=>rpc('bank_local_v2_claim',[q(job),q(command),json(identity),q(sourceHash),q(envelope.contextHash),'2']),
        finalize:(_e,digest,value)=>{prepared=value;return rpc('bank_local_v2_finalize',[q(job),json(identity),q(digest),json(value)]);},
        fail:()=>rpc('bank_local_v2_fail',[q(job),json(identity),q('ANALYSIS_FAILED')]),
      },
      analyze:args=>matchBankMarkdown({...args,logger:{info(){}},fetchImpl:async(_url,options)=>{
        providerCalls++;
        const prompt=JSON.parse(JSON.parse(options.body).messages.at(-1).content);
        assert.deepEqual(prompt.tallyLedgers,envelope.ledgerNames);
        const rows=prompt.sourceRows ? prompt.sourceRows.map(s=>{
          const row=fixture.find(r=>r.markdown===s.markdown);assert.ok(row,'unrecognized fixture source');return {...row,sourceRowId:s.id};
        }) : fixture;
        const transactions=rows.map(({markdown,...row})=>row);
        return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({account:{},transactions})}}]});
      }}).catch(error=>{console.error('Fixture analysis failed:',error.message);throw error;}),
    });
    const done=await readDocumentResultStream(response);
    assert.equal(done.state,'completed',name);
    const saved=JSON.parse(await sql(`select jsonb_build_object('rows',(select count(*) from public.bank_statement_import_preview_transactions where import_id=${q(imp)}),'status',status,'sourceStored',processing_meta::text like '%statementMarkdown%') from public.bank_statement_imports where id=${q(imp)};`));
    assert.equal(saved.rows,expected);assert.equal(saved.sourceStored,false);
    assert.equal(saved.status,prepared.extractionIncomplete ? 'manual_review_required' : 'ready_to_review');
    assert.equal(hash(await fs.readFile(path.join(source,name))),sourceHash);
    const result={name,rows:saved.rows,manualReview:prepared.extractionIncomplete,providerFixtureCalls:providerCalls,parseMs:parsed.parseMs,wallMs:Math.round(performance.now()-started),timings:done.timings,originalUnchanged:true};
    results.push(result);console.log(JSON.stringify(result));
  }
  await fs.mkdir('output/bank-local-v2-corpus-verification',{recursive:true});
  await fs.writeFile('output/bank-local-v2-corpus-verification/results.json',JSON.stringify(results,null,2));
} finally {
  assert.equal(path.dirname(temp),os.tmpdir());assert.ok(path.basename(temp).startsWith('kalika-v2-corpus-'));
  await fs.rm(temp,{recursive:true,force:true});
}
