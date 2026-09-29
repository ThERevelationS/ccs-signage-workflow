import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSalesPullSnapshot,
  buildSnapshot,
} from "../base44/shared/smartsheetSyncFields.ts";
import {
  salesRecordHasLocalChangesSinceSnapshot,
} from "../base44/shared/smartsheetSalesSafety.mjs";

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
    { column_id: estInvColumn, value: 12345, display_value: "12345" },
    { column_id: assigneeColumn, value: "Brett", display_value: "Brett" },
  ],
}, bindings);
assert.equal(remote[estInvColumn], "12345", "Remote Est / Inv baseline must use the actual Smartsheet cell.");
assert.equal(remote[assigneeColumn], "Brett", "Remote assignee baseline must preserve the actual Smartsheet label.");
assert.equal(remote["4072653460557700"], "", "A bound-but-omitted Smartsheet cell must baseline as blank.");

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
  /newRecord\.smartsheet_sync_snapshot = buildSnapshot\(newRecord, bindings, 'sales'\)/,
  "Sales rows created from Smartsheet must start with a sync snapshot baseline.",
);

console.log("Smartsheet Sales round-trip safety validation passed.");
