import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  newSalesColumnDraft, salesColumnDraftReducer, salesEditorSnapshot, salesEditorHasChanges,
} from "../src/components/sales/salesColumnEditorDraft.mjs";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const visible = (state, id) => state.present.find((column) => column.id === id)?.visible;

let state = newSalesColumnDraft([
  { id: "client_name", visible: true },
  { id: "lead_source", visible: false },
  { id: "description", visible: true },
  { id: "quote_date", visible: true },
]);
check(state.past.length === 0 && state.future.length === 0, "Opening a preset starts a fresh history.");
check(visible(state, "stage_age") === false, "Existing presets retain missing columns as hidden.");
check(!state.present.some((column) => column.id === "quote_date"), "Retired columns cannot be rearranged.");
const baseline = salesEditorSnapshot({ name: "Brett's", columns: state.present });
check(!salesEditorHasChanges("columns", baseline, { name: "Brett's", columns: state.present }),
  "Opening an older normalized preset must not appear dirty.");

const original = state.present.map((column) => column.id);
state = salesColumnDraftReducer(state, { type: "toggle", id: "lead_source" });
check(visible(state, "lead_source") && state.past.length === 1, "Checkbox toggles must create one undo step.");
state = salesColumnDraftReducer(state, { type: "move", id: "description", direction: -1 });
check(state.present[1].id === "description" && state.present[2].id === "lead_source",
  "Preview move must skip hidden columns and follow visible neighbors.");
check(state.past.length === 2 && state.future.length === 0, "Move creates one independent undo step.");
state = salesColumnDraftReducer(state, { type: "undo" });
check(state.present[1].id === "lead_source", "First undo restores the previous column order.");
state = salesColumnDraftReducer(state, { type: "undo" });
check(!visible(state, "lead_source"), "Second undo restores the previous checkbox state.");
check(state.past.length === 0 && state.future.length === 2, "Undo history boundaries must be correct.");
const unchanged = salesColumnDraftReducer(state, { type: "undo" });
check(unchanged === state, "Undo at the start of history must be a no-op.");
state = salesColumnDraftReducer(state, { type: "redo" });
check(visible(state, "lead_source"), "Redo restores the checkbox change.");
state = salesColumnDraftReducer(state, { type: "redo" });
check(state.present[1].id === "description", "Second redo restores the preview order.");
state = salesColumnDraftReducer(state, { type: "undo" });
state = salesColumnDraftReducer(state, { type: "toggle", id: "designer" });
check(state.future.length === 0, "Editing after undo must invalidate the old redo history.");
check(salesEditorHasChanges("columns", baseline, { name: "Brett's", columns: state.present }),
  "Column visibility or ordering changes must mark the editor dirty.");
check(salesEditorHasChanges("columns", baseline, { name: "A new name", columns: baseline.columns }),
  "Renaming a preset must count as an unsaved edit.");
check(!salesEditorHasChanges("columns", baseline,
  { name: "Brett's", columns: newSalesColumnDraft(baseline.columns).present }),
  "Returning to the saved layout must clear the dirty state.");
state = salesColumnDraftReducer(state, { type: "reset", columns: baseline.columns });
check(state.past.length === 0 && state.future.length === 0 && state.present[0].id === original[0],
  "Switching or saving presets must reset undo and redo history.");

const blankConditions = [{ field: "", operator: "equals", value: "" }];
const filterBaseline = salesEditorSnapshot({ name: "Filter", conditions: blankConditions });
const modifiedConditions = [{ field: "sales_status", operator: "equals", value: "quoted" }];
check(salesEditorHasChanges("filters", filterBaseline,
  { name: "Filter", conditions: modifiedConditions }), "Filter edits also require discard confirmation.");
check(!salesEditorHasChanges("filters", filterBaseline,
  { name: "Filter", conditions: blankConditions }), "Unmodified filters may close without a warning.");

const ui = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
check(ui.includes('dispatchColumnDraft({ type: "undo" })') &&
      ui.includes('dispatchColumnDraft({ type: "redo" })'),
  "Compact layout must expose working Undo/Redo buttons.");
check(ui.includes("if (closeAfterSave) onClose();") &&
      ui.indexOf("await loadData();\n      resetForm();") < ui.indexOf("if (closeAfterSave) onClose();"),
  "Save & Close must wait for verified persistence and reload.");
check(ui.includes('onOpenChange={(open) => { if (!open) requestClose(); }}') &&
      ui.includes('requestNavigation(resetForm)'),
  "Escape, Close, tab switching and Cancel must use the unsaved edit guard.");
check(ui.includes("Keep editing") && ui.includes("Discard changes"),
  "Unsaved changes must use an explicit in-app confirmation.");
check(ui.includes('overflow-x-auto rounded-lg border bg-white') &&
      ui.includes('className="flex flex-wrap gap-1"'),
  "Existing horizontal preview and compact always-visible checkbox strip must remain.");

console.log(`Sales column Undo/Redo, Save & Close and unsaved navigation: ${checks}/${checks} PASS.`);
