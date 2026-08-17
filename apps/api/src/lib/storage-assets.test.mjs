import assert from "node:assert/strict";
import test from "node:test";

import { ensureStorageAsset, getContentSha256 } from "./storage-assets.ts";

const ownerUserId = "9046f797-9f18-428f-ac1c-0e3427a3387e";
const storageBucket = "bank-statement-files";
const bytes = new TextEncoder().encode("bank statement bytes");
const contentSha256 = getContentSha256(bytes);
const storagePath = `${ownerUserId}/sha256/${contentSha256}`;

function mockClient({ objectExists, uploadError = null }) {
  const calls = { exists: [], uploads: [] };
  const existingAsset = {
    id: "asset-1",
    storage_bucket: storageBucket,
    storage_path: storagePath,
  };
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: existingAsset, error: null }; },
  };
  const client = {
    from(table) {
      assert.equal(table, "storage_assets");
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, storageBucket);
        return {
          async exists(path) {
            calls.exists.push(path);
            return objectExists instanceof Error || (objectExists && typeof objectExists === "object")
              ? { data: false, error: objectExists }
              : { data: objectExists, error: null };
          },
          async upload(path, body, options) {
            calls.uploads.push({ path, body, options });
            return uploadError
              ? { data: null, error: uploadError }
              : { data: { path }, error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

test("reuses healthy content-addressed objects without uploading again", async () => {
  const { client, calls } = mockClient({ objectExists: true });

  const asset = await ensureStorageAsset({
    supabase: client,
    ownerUserId,
    storageBucket,
    bytes,
    contentType: "application/pdf",
  });

  assert.equal(asset.id, "asset-1");
  assert.equal(asset.storagePath, storagePath);
  assert.equal(asset.createdObject, false);
  assert.deepEqual(calls.exists, [storagePath]);
  assert.equal(calls.uploads.length, 0);
});

test("recreates a missing object when matching storage metadata already exists", async () => {
  const { client, calls } = mockClient({ objectExists: false });

  const asset = await ensureStorageAsset({
    supabase: client,
    ownerUserId,
    storageBucket,
    bytes,
    contentType: "application/pdf",
  });

  assert.equal(asset.createdObject, true);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].path, storagePath);
  assert.deepEqual(calls.uploads[0].body, bytes);
  assert.deepEqual(calls.uploads[0].options, {
    contentType: "application/pdf",
    upsert: false,
  });
});

test("uploads when Supabase returns Bad Request for a missing object exists check", async () => {
  const { client, calls } = mockClient({
    objectExists: { status: 400, statusCode: "400", message: "Bad Request" },
  });

  const asset = await ensureStorageAsset({
    supabase: client,
    ownerUserId,
    storageBucket,
    bytes,
    contentType: "application/pdf",
  });

  assert.equal(asset.createdObject, true);
  assert.deepEqual(calls.exists, [storagePath]);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].path, storagePath);
});

test("accepts a concurrent upload that wins after the existence check", async () => {
  const { client, calls } = mockClient({
    objectExists: false,
    uploadError: { statusCode: 409, message: "The resource already exists" },
  });

  const asset = await ensureStorageAsset({
    supabase: client,
    ownerUserId,
    storageBucket,
    bytes,
    contentType: "application/pdf",
  });

  assert.equal(asset.createdObject, false);
  assert.equal(calls.uploads.length, 1);
});
