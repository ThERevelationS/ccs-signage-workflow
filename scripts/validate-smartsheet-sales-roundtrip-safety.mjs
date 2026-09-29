import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSalesPullSnapshot,
  buildSnapshot,
} from "../base44/shared/smartsheetSyncFields.ts";
import {
  salesRecordHasLocalChangesSinceSnapshot,
} from "../base44/shared/smartsheetSalesSafety.mjs";
import {
  findUnverifiedSyncMetadata,
} from "../base44/shared/smartsheetOrderMetadataVerification.mjs";

const assigneeColumn = "3326787726927748";
const estInvColumn = "4624329576763268";
const bindings = {
  client_name: "3087579177346948",
  lead_source: "4072653460557700",
  est_inv_at: estInvColumn,
  estimate_amount: "5655853885876100",
  current_task_description: "4783818077955972",
  current_task_assigned_to: assigneeColumn,
  notes_serialized: "2555898341156740",
};

const prior = {
  "3087579177346948": "Example Client",
  "4072653460557700": "Web",
  "5655853885876100": 450,
  "4783818077955972": "Complete Estimate for Review",
  [assigneeColumn]: "Brett",
  "2555898341156740": "",
};
const base = {
  client_name: "Example Client",
  lead_source: "Web",
  est_inv_at: "12345",
  estimate_amount: 450,
  current_task_description: "Complete Estimate for Review",
  current_task_assigned_to: "Brett Heinlein",
  work_notes: [],
  smartsheet_last_synced_at: "2026-09-24T15:00:00Z",
  smartsheet_sync_snapshot: prior,
};

assert.equal(
  salesRecordHasLocalChangesSinceSnapshot(
    base,
    buildSnapshot(base, bindings, "sales"),
    assigneeColumn,
  ),
  false,
  "A newly bound Est / Inv column missing from the old snapshot must not be mistaken for a local edit.",
);

assert.equal(
  salesRecordHasLocalChangesSinceSnapshot(
    { ...base, current_task_assigned_to: "Kay Valentine" },
    buildSnapshot({ ...base, current_task_assigned_to: "Kay Valentine" }, bindings, "sales"),
    assigneeColumn,
  ),
  true,
  "A real local assignee change must be preserved from pull until push/conflict checking.",
);

assert.equal(
  salesRecordHasLocalChangesSinceSnapshot(
    {
      ...base,
      current_task_assigned_to: "Twyla Heinlein",
      smartsheet_sync_snapshot: { ...prior, [assigneeColumn]: "Twyla Heinlein" },
    },
    buildSnapshot({ ...base, current_task_assigned_to: "Twyla Heinlein" }, bindings, "sales"),
    assigneeColumn,
  ),
  false,
  "Legacy full-name snapshots and the same first-name Smartsheet label must compare as one assignee.",
);

assert.equal(
  salesRecordHasLocalChangesSinceSnapshot(
    { ...base, estimate_amount: 451 },
    buildSnapshot({ ...base, estimate_amount: 451 }, bindings, "sales"),
    assigneeColumn,
  ),
  true,
  "A local estimate change must remain pending instead of being erased by pull.",
);

const remote = buildSalesPullSnapshot({
  cells: [
    { column_id: "3087579177346948", value: "Example Client", display_value: "Example Client" },
    { column_id: estInvColumn, value: 12345, display_value: "12,345" },
    { column_id: "5655853885876100", value: 450, display_value: "$450.00" },
    { column_id: assigneeColumn, value: "Brett Heinlein", display_value: "Brett Heinlein" },
  ],
}, bindings);
assert.equal(remote[estInvColumn], "12345", "Remote Est / Inv baseline must prefer the canonical raw identifier over formatted display text.");
assert.equal(remote["5655853885876100"], 450, "Remote numeric snapshots must use canonical numeric values instead of currency display text.");
assert.equal(remote[assigneeColumn], "Brett", "Remote assignee baseline must normalize to the same first-name representation used by push snapshots.");
assert.equal(remote["4072653460557700"], null, "A bound-but-omitted ordinary Sales cell must baseline with the same null representation used by push snapshots.");
assert.equal(remote["2555898341156740"], "", "A bound-but-omitted notes cell must retain the canonical empty serialized-notes representation.");

const metadataExpected = [{
  id: "wo-1",
  smartsheet_sync_snapshot: remote,
  smartsheet_last_synced_at: "2026-09-29T20:00:00Z",
}];
assert.equal(findUnverifiedSyncMetadata(metadataExpected, [{
  id: "wo-1",
  smartsheet_sync_snapshot: { ...remote },
  smartsheet_last_synced_at: "2026-09-29T20:00:00Z",
}]).length, 0, "Sales metadata read-back must accept an exact persisted snapshot/timestamp.");
assert.equal(findUnverifiedSyncMetadata(metadataExpected, [{
  id: "wo-1",
  smartsheet_sync_snapshot: { ...remote, [estInvColumn]: "99999" },
  smartsheet_last_synced_at: "2026-09-29T20:00:00Z",
}])[0]?.reason, "snapshot_mismatch", "Sales metadata read-back must fail closed when a snapshot was silently dropped or changed.");

const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
assert.match(
  backend,
  /query: \{ in_pipeline: true \}[\s\S]*?label: 'Sales Pipeline full Smartsheet push WorkOrders'/,
  "Full Sales push must page through the whole in-pipeline dataset.",
);
assert.doesNotMatch(
  backend,
  /WorkOrder\.filter\(\{ in_pipeline: true \}, '-updated_date', 500\)/,
  "Full Sales push must not silently stop after 500 WorkOrders.",
);
assert.match(
  backend,
  /salesRecordHasLocalChangesSinceSnapshot\([\s\S]*?salesLocalPendingPreserved\.push\(existing\.id\)[\s\S]*?continue;/,
  "Pull must preserve locally changed linked Sales records instead of overwriting them.",
);
assert.match(
  backend,
  /salesPendingSnapshotRepairs\.push\([\s\S]*?smartsheet_sync_snapshot: repairedSnapshot/,
  "Locally pending rows must be able to receive only newly bound remote snapshot columns.",
);
assert.match(
  backend,
  /label: 'Sales Smartsheet pull linked WorkOrders'/,
  "Sales pull must page through every linked WorkOrder instead of stopping at a fixed 5,000-record window.",
);
assert.doesNotMatch(
  backend,
  /WorkOrder\.filter\(\{ smartsheet_sheet_id: sheetId \}, '-updated_date', 5000\)/,
  "Sales pull must not silently cap linked WorkOrders at 5,000.",
);
assert.match(
  backend,
  /salesSnapshotOnlyUpdates\.push\([\s\S]*?smartsheet_sync_snapshot: remoteSnapshot/,
  "Unchanged Sales business fields with stale snapshots must use metadata-only reconciliation.",
);
assert.match(
  backend,
  /return \{ id, \.\.\.withoutUnverifiedTimestamp \};/,
  "Sales business-field bulk updates must not advance the sync timestamp before metadata verification.",
);
assert.match(
  backend,
  /verifiedMetadataExpected\.push\(\.\.\.batch\)[\s\S]*?Sales Smartsheet sync metadata verification[\s\S]*?findUnverifiedSyncMetadata/,
  "Sales snapshot/timestamp writes must be re-read and verified before the pull is healthy.",
);
assert.match(
  backend,
  /dataset === 'sales'[\s\S]*?buildSalesPullSnapshot\(\{ cells: currentSmartsheetCells \}, bindings\)[\s\S]*?return false;/,
  "Sales push conflict detection must compare canonical remote snapshots instead of formatted display values.",
);
assert.match(
  backend,
  /snapshot_write_failures: snapshotWriteFailures/,
  "Sales pull results must expose snapshot write failures to the coordinator/UI.",
);
assert.match(
  backend,
  /newRecord\.smartsheet_sync_snapshot = salesRemoteSnapshot \|\| buildSalesPullSnapshot\(row, bindings\)/,
  "Sales rows created from Smartsheet must start from the canonical remote snapshot baseline.",
);
assert.match(
  backend,
  /const newRowId = String\(result\?\.body\?\.result\?\.id \|\| result\?\.body\?\.id \|\| ''\)\.trim\(\);[\s\S]*?if \(!\/\^\\d\+\$\/\.test\(newRowId\)\) \{[\s\S]*?Sales Smartsheet create returned no usable permanent row ID/,
  "Sales create must fail closed when Smartsheet acknowledges POST without a usable permanent row ID.",
);
const salesCreateGuardIndex = backend.indexOf("Sales Smartsheet create returned no usable permanent row ID");
const salesCreatedIndex = backend.indexOf("created.push(record.id);", salesCreateGuardIndex);
const salesSnapshotIndex = backend.indexOf("const snapshot = buildSnapshot(record, bindings, dataset);", salesCreateGuardIndex);
assert.ok(salesCreateGuardIndex >= 0 && salesCreatedIndex > salesCreateGuardIndex && salesSnapshotIndex > salesCreatedIndex,
  "Sales create must validate the permanent row ID before counting creation or advancing snapshot metadata.");

console.log("Smartsheet Sales round-trip safety validation passed.");
