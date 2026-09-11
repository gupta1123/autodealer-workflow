// Disposable PostgreSQL measurements only. No hosted URLs or credentials.
import {spawnSync} from 'node:child_process';
const database=process.argv[2];
if(!/^kalika_team_[a-z\d_]+$/.test(database||''))throw new Error('Specify a disposable kalika_team_* database on localhost:55439.');
const sql=`
create temporary table access_benchmark_samples(operation text, elapsed_ms double precision);
do $$ declare started timestamptz; n integer; begin
 for n in 1..550 loop
  started:=clock_timestamp();
  perform public.access_snapshot('11111111-1111-1111-1111-111111111111','org-a');
  if n>50 then insert into access_benchmark_samples values('access_snapshot',extract(epoch from clock_timestamp()-started)*1000);end if;
 end loop;
end $$;
select jsonb_build_object('scope','local database function only; excludes Auth/HTTP/UI/network',
 'operation',operation,'samples',count(*),'meanMs',round(avg(elapsed_ms)::numeric,3),
 'p50Ms',round(percentile_cont(.5) within group(order by elapsed_ms)::numeric,3),
 'p95Ms',round(percentile_cont(.95) within group(order by elapsed_ms)::numeric,3),
 'maxMs',round(max(elapsed_ms)::numeric,3)) from access_benchmark_samples group by operation;`;
const result=spawnSync(process.env.TEST_PSQL||'C:/Program Files/PostgreSQL/17/bin/psql.exe',
 ['-X','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',windowsHide:true,timeout:60000});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(result.stderr);
console.log(result.stdout.trim());
