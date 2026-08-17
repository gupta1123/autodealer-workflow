import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const canary = args.has("--canary");
const bucketArg = process.argv.find((value) => value.startsWith("--bucket="));
const bucket = bucketArg?.slice("--bucket=".length) || "packet-files";
const limitArg = process.argv.find((value) => value.startsWith("--limit-groups="));
const limitGroups = canary ? 1 : Number(limitArg?.slice("--limit-groups=".length) || 0);
const etagArg = process.argv.find((value) => value.startsWith("--etag="));
const normalizeEtag = (value) => String(value || "").toLowerCase().replaceAll('"', "");
const selectedEtag = normalizeEtag(etagArg?.slice("--etag=".length));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function downloadAndHash(path) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const result = await supabase.storage.from(bucket).download(path);
      if (result.error || !result.data) throw result.error || new Error(`Unable to download ${path}`);
      const bytes = new Uint8Array(await result.data.arrayBuffer());
      return { hash: sha256(bytes), size: bytes.byteLength };
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function verifyCanonical(path, expectedHash, expectedSize) {
  const actual = await downloadAndHash(path);
  if (actual.hash !== expectedHash || actual.size !== expectedSize) {
    throw new Error(`Canonical verification failed for ${path}`);
  }
}

async function referencesForAsset(assetId) {
  const [packet, bank] = await Promise.all([
    supabase.from("packet_case_files").select("id", { count: "exact", head: true }).eq("storage_asset_id", assetId),
    supabase.from("bank_statement_imports").select("id", { count: "exact", head: true }).eq("storage_asset_id", assetId),
  ]);
  if (packet.error) throw packet.error;
  if (bank.error) throw bank.error;
  return (packet.count || 0) + (bank.count || 0);
}

async function usageForAsset(assetId) {
  const [packet, bank] = await Promise.all([
    supabase
      .from("packet_case_files")
      .select("id, packet_cases!inner(status, processing_meta)")
      .eq("storage_asset_id", assetId),
    supabase
      .from("bank_statement_imports")
      .select("id, status")
      .eq("storage_asset_id", assetId),
  ]);
  if (packet.error) throw packet.error;
  if (bank.error) throw bank.error;

  let activeReferences = bank.data?.length || 0;
  let completedReferences = (bank.data || []).filter((row) =>
    ["ready_to_review", "ready_to_confirm", "imported"].includes(row.status)
  ).length;
  for (const row of packet.data || []) {
    const caseRow = Array.isArray(row.packet_cases) ? row.packet_cases[0] : row.packet_cases;
    const meta = caseRow?.processing_meta;
    const recycledAt = meta?.recycleBin?.deletedAt;
    if (!recycledAt) activeReferences += 1;
    if (caseRow?.status === "completed") completedReferences += 1;
  }
  return { activeReferences, completedReferences };
}

const duplicateResult = await supabase.rpc("list_storage_duplicate_candidates", { p_bucket: bucket });
if (duplicateResult.error) throw duplicateResult.error;

let groups = duplicateResult.data || [];
if (selectedEtag) {
  groups = groups.filter((group) => normalizeEtag(group.etag) === selectedEtag);
}
if (limitGroups > 0) groups = groups.slice(0, limitGroups);

const report = {
  mode: apply ? "apply" : "dry-run",
  bucket,
  candidateGroups: groups.length,
  verifiedGroups: 0,
  mismatchedGroups: 0,
  plannedRedundantBytes: 0,
  deletedObjects: 0,
  deletedBytes: 0,
  groups: [],
};

for (const group of groups) {
  const objects = Array.isArray(group.objects) ? group.objects : [];
  if (objects.length < 2 || objects.some((object) => !object.assetId)) continue;

  process.stderr.write(`Verifying ${group.etag} (${objects.length} copies)...\n`);
  const verified = await mapWithConcurrency(objects, 2, async (object) => {
    const result = await downloadAndHash(object.storagePath);
    return { ...object, ...result };
  });

  const byHash = new Map();
  for (const object of verified) {
    const key = `${object.hash}:${object.size}`;
    byHash.set(key, [...(byHash.get(key) || []), object]);
  }

  if (byHash.size !== 1) {
    report.mismatchedGroups += 1;
    report.groups.push({ etag: group.etag, result: "hash-mismatch", copies: objects.length });
    continue;
  }

  const [hashKey, exactObjects] = [...byHash.entries()][0];
  const [contentHash] = hashKey.split(":");
  const expectedSize = exactObjects[0].size;
  const withUsage = [];
  for (const object of exactObjects) {
    withUsage.push({ ...object, usage: await usageForAsset(object.assetId) });
  }
  withUsage.sort((left, right) =>
    right.usage.activeReferences - left.usage.activeReferences ||
    right.usage.completedReferences - left.usage.completedReferences ||
    String(left.createdAt).localeCompare(String(right.createdAt))
  );
  const canonical = withUsage[0];
  const duplicates = withUsage.slice(1);
  const redundantBytes = duplicates.reduce((sum, object) => sum + object.size, 0);
  report.verifiedGroups += 1;
  report.plannedRedundantBytes += redundantBytes;

  const groupReport = {
    etag: group.etag,
    sha256: contentHash,
    canonicalPath: canonical.storagePath,
    copies: exactObjects.length,
    redundantBytes,
    duplicatePaths: duplicates.map((object) => object.storagePath),
    result: apply ? "pending" : "verified-dry-run",
  };
  report.groups.push(groupReport);
  if (!apply) continue;

  const consolidation = await supabase.rpc("consolidate_storage_assets", {
    p_canonical_asset_id: canonical.assetId,
    p_duplicate_asset_ids: duplicates.map((object) => object.assetId),
    p_content_sha256: contentHash,
  });
  if (consolidation.error) throw consolidation.error;

  await verifyCanonical(canonical.storagePath, contentHash, expectedSize);
  for (const duplicate of duplicates) {
    const remainingReferences = await referencesForAsset(duplicate.assetId);
    if (remainingReferences !== 0) {
      throw new Error(`Refusing to remove ${duplicate.storagePath}; ${remainingReferences} references remain.`);
    }
  }

  const removal = await supabase.storage
    .from(bucket)
    .remove(duplicates.map((object) => object.storagePath));
  if (removal.error) throw removal.error;

  const assetRemoval = await supabase
    .from("storage_assets")
    .delete()
    .in("id", duplicates.map((object) => object.assetId));
  if (assetRemoval.error) throw assetRemoval.error;

  groupReport.result = "consolidated-and-removed";
  groupReport.databaseResult = consolidation.data;
  report.deletedObjects += duplicates.length;
  report.deletedBytes += redundantBytes;
  process.stderr.write(`Removed ${duplicates.length} redundant objects (${redundantBytes} bytes).\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
