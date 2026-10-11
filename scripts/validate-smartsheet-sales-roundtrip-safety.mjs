import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSalesPullSnapshot,
  buildSnapshot,
} from "../base44/shared/smartsheetSyncFields.ts";
import {
  salesRecordHasLocalChangesSinceSnapshot,
  salesSnapshotsEqual,
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
assert.equal(salesSnapshotsEqual(
  buildSnapshot(base, bindings, "sales"),
  buildSalesPullSnapshot({
    cells: [
      { column_id: "3087579177346948", value: "Example Client", display_value: "Example Client" },
      { column_id: "4072653460557700", value: "Web", display_value: "Web" },
      { column_id: estInvColumn, value: 12345, display_value: "12,345" },
      { column_id: "5655853885876100", value: 450, display_value: "$450.00" },
      { column_id: "4783818077955972", value: "Complete Estimate for Review", display_value: "Complete Estimate for Review" },
      { column_id: assigneeColumn, value: "Brett", display_value: "Brett" },
    ],
  }, bindings),
  assigneeColumn,
), true, "Sales PUT read-back must accept canonically equal remote values despite display formatting.");
assert.equal(salesSnapshotsEqual(
  buildSnapshot(base, bindings, "sales"),
  { ...buildSnapshot(base, bindings, "sales"), "5655853885876100": 451 },
  assigneeColumn,
), false, "Sales PUT read-back must reject a silently different persisted value.");

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
  /planSalesFieldPull\(existing, fieldValues, salesRemoteSnapshot, bindings\)[\s\S]*?if \(plan\.held\.length\)[\s\S]*?salesLocalPendingPreserved\.push\(existing\.id\)/,
  "Pull must preserve held locally changed Sales fields instead of overwriting them.",
);
assert.match(
  backend,
  /salesRemoteSnapshot = plan\.snapshot;[\s\S]*?toUpdate\.push\(\{ id: existing\.id,[\s\S]*?_remoteSnapshot: salesRemoteSnapshot/,
  "Reconciled Sales pull snapshots must flow through the verified metadata path after held fields are preserved.",
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
  /const sheetPageGuard = createSmartsheetOrderPageGuard\([\s\S]*?datasetLabel: dataset === 'sales' \? 'Sales Pipeline' : 'Order Form'[\s\S]*?sheetPageGuard\.assertComplete\(\)/,
  "Sales pull must fail closed unless every Smartsheet page is complete and stable.",
);
assert.doesNotMatch(
  backend,
  /orderPageGuard = dataset === 'orders'/,
  "Pagination completeness must not remain Order-only.",
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
  /label: 'Sales pull business-field verification'[\s\S]*?salesPulledFieldsUnchanged\(persisted, item\.expectedFields\)[\s\S]*?Snapshot\/timestamp not advanced[\s\S]*?updatedCount\+\+;[\s\S]*?snapshotUpdates\.push/,
  "Sales pull must read back and canonically verify WorkOrder business fields before counting the update or advancing sync metadata.",
);
assert.match(
  backend,
  /business_field_write_failures: salesBusinessWriteFailureIds\.length[\s\S]*?business_field_write_failure_ids: salesBusinessWriteFailureIds\.slice\(0, 20\)/,
  "Sales pull results must expose business-field persistence failures for review.",
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
  /createSalesSmartsheetRowWithGuard\(\{[\s\S]*?smartsheetWriteNoTimeoutRetry\('POST'[\s\S]*?verifyCreatedRow: async/,
  "Sales create must fail closed when Smartsheet acknowledges POST without a usable permanent row ID.",
);
assert.match(
  backend,
  /deferredSalesVerification\.set\([\s\S]*?expectedSnapshot: batchSnapshot[\s\S]*?requiresRemoteWrite: fieldPlan\.outgoing\.length > 0/,
  "Existing Sales-row plans must retain the permanent row ID and exact expected snapshot for later read-back.",
);
assert.match(
  backend,
  /const salesRemoteVerifiedIds = new Set<string>\(\)[\s\S]*?verificationResult = await smartsheetGet\([\s\S]*?salesSnapshotsEqual\(verification\.expectedSnapshot, actualSnapshot, assigneeColumnId\)[\s\S]*?Sales Smartsheet update could not be verified by read-back/,
  "Existing Sales-row batch PUTs must be re-read and canonically verified.",
);
assert.match(
  backend,
  /const verifiedSalesUpdates = deferredBase44Updates\.filter[\s\S]*?salesRemoteVerifiedIds\.has\(String\(update\.id\)\)[\s\S]*?bulkUpdate\(ordinaryUpdates\)[\s\S]*?WorkOrder\.updateMany\([\s\S]*?updated_date: planned\.updated_date[\s\S]*?findUnverifiedSyncMetadata\(verifiedSalesUpdates, verifiedRecords\)[\s\S]*?updated\.push\(recordId\)/,
  "Sales Base44 metadata may advance and count updated only after remote and metadata read-back verification.",
);
const salesPutVerificationIndex = backend.indexOf("Sales Smartsheet update could not be verified by read-back");
const salesVerifiedUpdateIndex = backend.indexOf("const verifiedSalesUpdates = deferredBase44Updates.filter", salesPutVerificationIndex);
const salesMetadataIndex = backend.indexOf("Sales Base44 sync metadata could not be verified after the Smartsheet write", salesVerifiedUpdateIndex);
const salesUpdatedIndex = backend.indexOf("updated.push(recordId);", salesMetadataIndex);
assert.ok(
  salesPutVerificationIndex >= 0 &&
  salesVerifiedUpdateIndex > salesPutVerificationIndex &&
  salesMetadataIndex > salesVerifiedUpdateIndex &&
  salesUpdatedIndex > salesMetadataIndex,
  "Sales PUT success accounting must occur only after Smartsheet and Base44 metadata verification."
);

const salesCreateSafety = readFileSync('base44/shared/smartsheetSalesCreateSafety.mjs', 'utf8');
const salesCreateGuardIndex = backend.indexOf("createSalesSmartsheetRowWithGuard({");
const salesLinkVerificationIndex = backend.indexOf("verifyCreatedRow: async ({rowId,expectedSnapshot}: any)", salesCreateGuardIndex);
const salesLinkFailureIndex = salesCreateSafety.indexOf('Sales permanent Smartsheet link could not be verified after create');
const salesCreateMetadataIndex = salesCreateSafety.indexOf("smartsheet_last_synced_at: syncedAt");
const salesCreatedIndex = backend.indexOf("created.push(record.id);", salesLinkVerificationIndex);
assert.ok(
  salesCreateGuardIndex >= 0 &&
  salesLinkVerificationIndex > salesCreateGuardIndex &&
  salesLinkFailureIndex >= 0 && salesCreateMetadataIndex >= 0 &&
  salesCreatedIndex > salesLinkVerificationIndex,
  "Sales create must verify its permanent Base44 row/sheet link and metadata before counting creation.",
);
assert.match(
  backend,
  /verifyCreatedRow: async \(\{rowId,expectedSnapshot\}: any\)[\s\S]*?normalizeSheetRows\(remote\.body\)[\s\S]*?salesSnapshotsEqual\(expectedSnapshot,buildSalesPullSnapshot/,
  "Sales create must read back and verify both permanent link IDs before advancing sync metadata.",
);
assert.match(
  backend,
  /label: 'Sales push sync metadata verification'[\s\S]*?findUnverifiedSyncMetadata\(\[expectedMetadata\], verifiedMetadataRows\)[\s\S]*?Sales Base44 sync metadata could not be verified/,
  "Sales push must read back Base44 snapshot/timestamp metadata and fail closed when persistence cannot be verified.",
);

console.log("Smartsheet Sales round-trip safety validation passed.");
