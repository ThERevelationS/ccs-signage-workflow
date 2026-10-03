// Seed script for Permitting Intelligence Mega-Chunk 2 — locality queue expansion.
// Run via exec_tool (CommonJS) — this file documents the canonical logic.
//
// Steps:
// 1. Load all existing SourceCollectionQueue rows (county rows from Mega 1).
// 2. Build a dedup key set: jurisdiction_name|state|jurisdiction_type.
// 3. Load LOCALITY_QUEUE_SEED from localityQueueSeed.mjs (KY cities + OH cities/villages).
// 4. Filter to rows whose key does not already exist, dedup within the seed list
//    (first occurrence wins — border cities keep the first-listed parent county).
// 5. bulkCreate the new locality rows (status not_started, missing_next standard text).
//
// Idempotent: re-running produces zero new rows. Never duplicates existing county rows.

import { LOCALITY_QUEUE_SEED } from "../base44/shared/localityQueueSeed.mjs";

export const LOCALITY_MISSING_NEXT = "Sign regulation source discovery not yet started.";

export function buildLocalitySeedRows(existingRows) {
  const existingKeys = new Set(
    (existingRows || []).map(
      (r) => `${r.jurisdiction_name}|${r.state}|${r.jurisdiction_type}`
    )
  );
  const seen = new Set();
  const newRows = [];
  let skippedDuplicate = 0;
  for (const loc of LOCALITY_QUEUE_SEED) {
    const key = `${loc.jurisdiction_name}|${loc.state}|${loc.jurisdiction_type}`;
    if (existingKeys.has(key) || seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    newRows.push({
      jurisdiction_name: loc.jurisdiction_name,
      state: loc.state,
      jurisdiction_type: loc.jurisdiction_type,
      parent_county_name: loc.parent_county_name || undefined,
      source_category: "sign_regulations",
      status: "not_started",
      missing_next: LOCALITY_MISSING_NEXT,
    });
  }
  return { newRows, skippedDuplicate };
}