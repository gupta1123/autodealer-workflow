import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.argv[2];
if (!root) throw Error("Supply a private output directory.");
const start = "2026-11-16T00:00:00+05:30";
const end = "2026-11-23T00:00:00+05:30";
const company = "f0a17661-4598-4a10-9806-4e822023c71f";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const store = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const manifest = path.join(root, "manifest.json");
await fs.mkdir(path.join(root, "files"), { recursive: true });
await fs.access(manifest).then(() => { throw Error("Archive already exists. Choose a new directory."); }, error => {
  if (error.code !== "ENOENT") throw error;
});
await db.connect();
let cases;
try {
  await db.query("begin isolation level repeatable read read only");
  cases = (await db.query(
    "select id,status,display_name,created_at from packet_cases where access_company_id=$1 and deleted_at is null and created_at >= $2 and created_at < $3 order by created_at,id",
    [company, start, end]
  )).rows;
  const ids = cases.map(c => c.id);
  const queries = {
    documents: "select case_id,id,document_type,source_file_name,source_hint,title,extracted_fields,markdown from packet_documents where case_id=any($1) order by created_at,id",
    files: "select case_id,id,original_name,storage_bucket,storage_path,size_bytes,content_sha256 from packet_case_files where case_id=any($1) order by id",
    postings: "select p.case_id,p.review_patch,p.revision,p.status,c.payload,c.status as command_status from purchase_invoice_tally_postings p left join tally_bridge_commands c on c.id=p.command_id where p.case_id=any($1) order by p.revision desc",
  };
  for (const [key, query] of Object.entries(queries)) {
    const { rows } = await db.query(query, [ids]);
    for (const c of cases) c[key] = rows.filter(r => r.case_id === c.id);
  }
  await db.query("commit");
} finally {
  await db.end();
}

function verify(file, bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if ((file.size_bytes != null && Number(file.size_bytes) !== bytes.length) ||
      (file.content_sha256 && file.content_sha256 !== hash)) throw Error("Size or hash mismatch.");
  return hash;
}

const queue = cases.flatMap(c => c.files);
const failures = [];
async function download() {
  while (queue.length) {
    const f = queue.shift();
    f.localPath = "files/" + f.id + path.extname(f.original_name).replace(/[^a-z0-9.]/gi, "");
    const dest = path.join(root, f.localPath);
    try {
      f.sha256 = verify(f, await fs.readFile(dest));
      continue;
    } catch (error) {
      if (error.code && error.code !== "ENOENT") throw error;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await store.storage.from(f.storage_bucket).download(f.storage_path);
        if (error) throw error;
        const bytes = Buffer.from(await data.arrayBuffer());
        f.sha256 = verify(f, bytes);
        await fs.writeFile(dest + ".part", bytes);
        await fs.rename(dest + ".part", dest);
        break;
      } catch (error) {
        if (attempt === 3) failures.push([f.id, error.message]);
      }
    }
  }
}
await Promise.all(Array.from({ length: 5 }, download));
if (failures.length) throw Error(JSON.stringify(failures));
await fs.writeFile(manifest, JSON.stringify({ start, end, cases, failures }, null, 2), { flag: "wx" });
console.log({ cases: cases.length, files: cases.flatMap(c => c.files).length });
