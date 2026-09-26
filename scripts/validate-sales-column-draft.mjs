import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  newSalesColumnDraft, salesColumnDraftReducer, salesEditorSnapshot, salesEditorHasChanges,
  salesColumnSettingsEqual, SALES_ESSENTIAL_COLUMN_IDS,
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

// Bulk layout shortcuts are one undoable edit each, never overwrite the
// saved preset, and preserve all column positions unless Reset is requested.
const savedLayout = newSalesColumnDraft([
  { id: "description", visible: true },
  { id: "client_name", visible: true },
  { id: "lead_source", visible: false },
  { id: "quote_date", visible: true },
]);
const savedColumns = savedLayout.present.map(({ id, visible: isVisible }) => ({ id, visible: isVisible }));
const savedOrder = savedLayout.present.map(({ id }) => id);
const essentials = new Set(SALES_ESSENTIAL_COLUMN_IDS);
check(essentials.size === 4 && [...essentials].every((id) => savedOrder.includes(id)),
  "Hide Optional retains four supported Sales scanning columns.");
let bulk = salesColumnDraftReducer(savedLayout, { type: "show_all" });
check(bulk.present.every((column) => column.visible) && bulk.past.length === 1,
  "Show All selects every supported field in one undoable step.");
check(bulk.present.map(({ id }) => id).join() === savedOrder.join(),
  "Show All preserves the user's column order.");
check(salesColumnDraftReducer(bulk, { type: "show_all" }) === bulk,
  "Show All is a no-op when all columns are already selected.");
bulk = salesColumnDraftReducer(bulk, { type: "undo" });
check(salesColumnSettingsEqual(bulk.present, savedColumns),
  "Undo restores the exact saved visibility after Show All.");
bulk = salesColumnDraftReducer(bulk, { type: "redo" });
check(bulk.present.every((column) => column.visible),
  "Redo restores all selected columns.");
bulk = salesColumnDraftReducer(bulk, { type: "hide_optional" });
check(bulk.present.filter((column) => column.visible).length === essentials.size &&
    bulk.present.every((column) => column.visible === essentials.has(column.id)),
  "Hide Optional selects exactly Customer, Sales Status, Task Description and Follow Up.");
check(bulk.present.map(({ id }) => id).join() === savedOrder.join(),
  "Hide Optional does not reorder either visible or hidden columns.");
check(salesColumnDraftReducer(bulk, { type: "hide_optional" }) === bulk,
  "Hide Optional does not add redundant undo history when already applied.");
bulk = salesColumnDraftReducer(bulk, { type: "undo" });
check(bulk.present.every((column) => column.visible),
  "Undo of Hide Optional restores all previous selections.");
bulk = salesColumnDraftReducer(bulk, { type: "redo" });
check(bulk.present.filter((column) => column.visible).length === 4,
  "Redo of Hide Optional restores the focused view.");
bulk = salesColumnDraftReducer(bulk, { type: "toggle", id: "client_name" });
check(!visible(bulk, "client_name"),
  "Hide Optional is a shortcut, not an enforced mandatory checkbox restriction.");
bulk = salesColumnDraftReducer(bulk, { type: "move", id: "follow_up_date", direction: -1 });
const beforeRestore = bulk.present;
bulk = salesColumnDraftReducer(bulk, { type: "restore", columns: savedColumns });
check(salesColumnSettingsEqual(bulk.present, savedColumns) && bulk.past.length > 0,
  "Reset restores the opened saved preset's original order and visibility without clearing history.");
check(salesColumnDraftReducer(bulk, { type: "restore", columns: savedColumns }) === bulk,
  "Reset is a no-op when the column layout is unchanged.");
bulk = salesColumnDraftReducer(bulk, { type: "undo" });
check(salesColumnSettingsEqual(bulk.present, beforeRestore),
  "Undo of Reset restores the exact prior layout and visibility.");
bulk = salesColumnDraftReducer(bulk, { type: "redo" });
check(salesColumnSettingsEqual(bulk.present, savedColumns) &&
    savedColumns[0].id === "description" && savedColumns[2].visible === false,
  "Redo restores the original preset without mutating its baseline snapshot.");
const resetHistory = salesColumnDraftReducer(bulk, { type: "reset", columns: savedColumns });
check(resetHistory.past.length === 0 && resetHistory.future.length === 0,
  "Opening another preset still clears old history, unlike the undoable Reset button.");

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
check(ui.includes('dispatchColumnDraft({ type: "show_all" })') &&
      ui.includes('dispatchColumnDraft({ type: "hide_optional" })') &&
      ui.includes('dispatchColumnDraft({ type: "restore", columns: editorBaseline.columns })'),
  "Show All, Hide Optional and Reset must operate on the existing compact editor.");
check(ui.includes('disabled={columnLayoutMatchesBaseline || isSaving}') &&
      ui.includes('disabled={optionalColumnsHidden || isSaving}') &&
      ui.includes('disabled={allColumnsShown || isSaving}'),
  "Bulk buttons must disable redundant actions and block changes during a save.");
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
