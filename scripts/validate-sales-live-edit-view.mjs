import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createOrExtendSalesLiveEditPin,
  projectSalesRowForLiveView,
  reconcileSalesLiveEditPinWithRemote,
} from "../src/components/sales/salesLiveEditView.mjs";

const original = {
  id: "wo-1",
  sales_rep: "Carl Example",
  follow_up_date: "2026-10-03",
  lead_source: "Referral",
};

const firstPin = createOrExtendSalesLiveEditPin(null, original, {
  sales_rep: "Brett Example",
});
const edited = { ...original, sales_rep: "Brett Example" };
assert.equal(projectSalesRowForLiveView(edited, firstPin).sales_rep, "Carl Example",
  "A local assignee edit must render Brett but continue filtering/sorting as Carl until commit.");

const extendedPin = createOrExtendSalesLiveEditPin(firstPin, edited, {
  follow_up_date: "2026-10-10",
});
assert.equal(extendedPin.baselineValues.sales_rep, "Carl Example",
  "The first filter baseline must survive later edits to the same row.");
assert.equal(extendedPin.baselineValues.follow_up_date, "2026-10-03",
  "A newly edited field must capture its own pre-edit view baseline.");

const unrelatedRemote = reconcileSalesLiveEditPinWithRemote(
  extendedPin,
  { lead_source: "Web" },
  {},
);
assert.deepEqual(unrelatedRemote, extendedPin,
  "A remote edit to another field must not release this user's protected filter/sort values.");

const ownEcho = reconcileSalesLiveEditPinWithRemote(
  extendedPin,
  { sales_rep: "Brett Example", follow_up_date: "2026-10-10" },
  {},
);
assert.deepEqual(ownEcho, extendedPin,
  "Realtime echoes of this user's autosaved values must not release the view pin.");

const remoteSameField = reconcileSalesLiveEditPinWithRemote(
  extendedPin,
  { sales_rep: "Kyle Example" },
  {},
);
assert.equal(remoteSameField.baselineValues.sales_rep, undefined,
  "A later remote edit to the same protected field must release that field so live filtering can react.");
assert.equal(remoteSameField.baselineValues.follow_up_date, "2026-10-03",
  "A remote conflict on one field must not release unrelated locally edited fields.");

const pendingConflict = reconcileSalesLiveEditPinWithRemote(
  firstPin,
  { sales_rep: "Kyle Example" },
  { sales_rep: "Brett Example" },
);
assert.deepEqual(pendingConflict, firstPin,
  "While the local save is still pending, a remote event must not erase the local view protection before conflict-safe save resolves.");

const fullyRemote = reconcileSalesLiveEditPinWithRemote(
  firstPin,
  { sales_rep: "Kyle Example" },
  {},
);
assert.equal(fullyRemote, null,
  "Once a true remote edit replaces the only protected field, the row must return to fully live filtering/sorting.");

const source = fs.readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
assert.match(source, /WorkOrder\.subscribe\(\(event\) =>/,
  "Sales Pipeline must subscribe to WorkOrder realtime updates.");
assert.match(source, /projectSalesRowForLiveView\(view|projectSalesRowForLiveView\(wo|viewRowFor/,
  "Sales filters/sorts must use the live-edit view projection.");
assert.match(source, /releaseLiveEditPins\(\);[\s\S]*?No new Sales changes need Smartsheet sync/,
  "Save & Sync must release view pins even when no Smartsheet work remains.");
assert.match(source, /clearSyncedWorkOrderIds\(syncTargets\);[\s\S]*?releaseLiveEditPins\(\);/,
  "Successful Save & Sync must release view pins after verified sync.");
assert.match(source, /background reload must not make one of this user's actively edited rows[\s\S]*?salesRecordBelongsToLoadedScope/,
  "Background polling must preserve a locally pinned row that autosave moved outside the server query.");
assert.match(source, /liveViewSessionKey[\s\S]*?releaseLiveEditPins\(\)/,
  "Changing filter/search/workspace/view context must release the edit session.");

console.log("Sales live-edit filter/sort stability and realtime reconciliation: PASS.");
