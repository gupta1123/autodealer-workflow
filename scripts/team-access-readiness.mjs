// Read-only source inventory. No database credentials, queries or mutations.
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../apps/api/src/app/api/',import.meta.url));
async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())out.push(...await walk(p));else if(item.name==='route.ts')out.push(p);}return out;}
const routes=[];
for(const file of await walk(root)){const source=await readFile(file,'utf8');routes.push({route:path.relative(root,file).replaceAll('\\','/').replace(/\/route.ts$/,''),containsOwnerReferences:source.includes('owner_user_id'),hasAccessImports:/lib\/access\//.test(source),hasBoundary:/withTeamAccess\(/.test(source)});}
const checklist=await readFile(new URL('../docs/team-access-todo.md',import.meta.url),'utf8');
const remaining=checklist.split(/\r?\n/).filter(line=>/^- \[ \]/.test(line)).map(line=>line.slice(6));
console.log(JSON.stringify({ready:false,activation:'awaiting-manual-setup-and-acceptance',note:'Static inventory only, not a security certification. Prepared activation SQL does not enable sharing automatically. Apply reviewed Kalika schema/mappings and complete full-stack acceptance before activation. Owner references may be legacy compatibility; wrappers alone do not prove authorization.',routes:routes.length,ownerReferenceReview:routes.filter(r=>r.containsOwnerReferences),remaining},null,2));
process.exitCode=2;
