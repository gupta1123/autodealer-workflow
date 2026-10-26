import test from "node:test";
import assert from "node:assert/strict";
import { automaticCatalogueSyncPlan, datasetOpenInTally } from "./sync-policy.mjs";

test("a ready fallback catalogue never triggers automatic Tally scans", () => {
  assert.deepEqual(automaticCatalogueSyncPlan({
    status: "ready",
    cacheHealth: { watermarkReliable: false, highestAlterId: 0 },
  }), {
    probeCapabilities: false,
    sync: false,
    reason: "cached_fallback_catalogue",
  });
});

test("reliable catalogues synchronize only after the global watermark changes", () => {
  const dataset = { status: "ready", cacheHealth: { watermarkReliable: true, highestAlterId: 42 } };
  assert.equal(automaticCatalogueSyncPlan(dataset).probeCapabilities, true);
  assert.equal(automaticCatalogueSyncPlan(dataset, { version: 1, highestAlterId: 42 }).sync, false);
  assert.deepEqual(automaticCatalogueSyncPlan(dataset, { version: 1, highestAlterId: 43 }), {
    probeCapabilities: true,
    sync: true,
    reason: "alter_id_watermark_changed",
  });
});

test("an unreliable capability response never starts a fallback scan", () => {
  const dataset = { status: "syncing", cacheHealth: { watermarkReliable: true, highestAlterId: 42 } };
  assert.deepEqual(automaticCatalogueSyncPlan(dataset, {
    version: 0,
    highestAlterId: 0,
    fallback: true,
  }), {
    probeCapabilities: false,
    sync: false,
    reason: "unreliable_global_watermark",
  });
});

test("a sync runs only for a company year that is open in Tally", () => {
  const open = [{ guid: "g-1", companyName: "Kalika Steel Alloys Pvt Ltd - (26-27)", financialYear: "2026-27", isActive: true }];
  assert.equal(datasetOpenInTally(open, { companyGuid: "g-1", financialYear: "2026-27" }), true);
  // Same Tally company, other year: not open, so the agent refuses instead of waiting on Tally.
  assert.equal(datasetOpenInTally(open, { companyGuid: "g-1", financialYear: "2025-26" }), false);
  assert.equal(datasetOpenInTally(open, { companyGuid: "g-2", financialYear: "2026-27" }), false);
  assert.equal(datasetOpenInTally([], { companyGuid: "g-1", financialYear: "2026-27" }), null, "unknown before the first company check");
});
