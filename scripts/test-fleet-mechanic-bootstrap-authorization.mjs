import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../base44/functions/fleetMechanicPortal/entry.ts", import.meta.url), "utf8");

test("mechanic bootstrap revalidates the live grant after Fleet data loads and before scope projection", () => {
  const start = source.indexOf("async function portalPayload");
  const end = source.indexOf("\nfunction decodePhotos", start);
  assert.ok(start >= 0 && end > start, "portalPayload source block must be present");
  const block = source.slice(start, end);

  const loadBoundary = block.indexOf("await Promise.all([");
  const currentGrantRead = block.indexOf("requireCurrentMechanicActionGrant(Access,String(grant?.id || ''),'bootstrap')");
  const freshScope = block.indexOf("scopeForGrant(currentGrant)");
  const freshEstimateCapability = block.indexOf("currentGrant.allowed_actions.includes('estimate_submit')");

  assert.ok(loadBoundary >= 0, "bootstrap must load Fleet data");
  assert.ok(currentGrantRead > loadBoundary, "live grant must be re-read after the asynchronous Fleet data load");
  assert.ok(freshScope > currentGrantRead, "scope projection must use the revalidated grant");
  assert.ok(freshEstimateCapability > currentGrantRead, "estimate capability must use the revalidated grant");
  assert.equal(block.includes("scopeForGrant(grant)"), false, "stale grant scope must not shape the bootstrap response");
  assert.match(block, /if \(ownedByGrant && canEstimate\) repairEstimates\.push\(\{\.\.\.sanitizeEstimate\(estimate\),visibility:'mechanic'\}\)/, "full mechanic estimate details must require the fresh estimate permission");
  assert.match(block, /ownedByGrant \? 'permission_removed' : 'other_mechanic'/, "permission removal must downgrade estimate data to a non-financial placeholder");
});

test("bootstrap passes the access entity into portal payload revalidation", () => {
  assert.match(source, /action === 'bootstrap'\) return json\(await portalPayload\(base44,grant,Access\)\)/);
});
