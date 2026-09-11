// Mechanical replacement of reviewed packet_cases owner predicates only.
import {readFile,writeFile} from 'node:fs/promises';
const files=['route.ts','files/route.ts','analysis/route.ts','analysis/status/route.ts','mismatches/route.ts','mismatches/[mismatchId]/route.ts'];
for(const name of files){
 const file=new URL(`../apps/api/src/app/api/cases/[id]/${name}`,import.meta.url);
 let source=await readFile(file,'utf8');
 const pattern=/\.eq\("owner_user_id", user\.id\)/g;
 if(!pattern.test(source))continue;
 source=source.replace(pattern,".or(await listAccessPredicate(request, user.id, 'purchases.view'))");
 if(!source.includes('import { listAccessPredicate }'))source="import { listAccessPredicate } from '@/lib/access/list-scope';\n"+source;
 await writeFile(file,source);
 console.log(`Scoped packet_cases predicates: ${name}`);
}
