// Mechanical migration of user-authenticated route exports. Run once; idempotent.
// Does not touch protocol callbacks, internal jobs or the independently guarded access API.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../apps/api/src/app/api/',import.meta.url));
async function walk(dir){const out=[];for(const ent of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())out.push(...await walk(p));else if(ent.name==='route.ts')out.push(p);}return out;}
for(const file of await walk(root)){
  let source=await readFile(file,'utf8');
  if(!source.includes('requireRequestUser')||source.includes('withTeamAccess')||file.includes(`${path.sep}access${path.sep}`))continue;
  const names=[];
  source=source.replace(/export async function (GET|POST|PATCH|PUT|DELETE)\(/g,(_,name)=>{names.push(name);return `async function ${name}Handler(`;});
  if(!names.length)continue;
  source=`import { withTeamAccess } from '@/lib/access/route-boundary';\n${source}\n${names.map(name=>`export const ${name} = withTeamAccess(${name}Handler);`).join('\n')}\n`;
  await writeFile(file,source);
  console.log(path.relative(root,file),names.join(','));
}
