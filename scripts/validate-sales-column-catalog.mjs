import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_TABLE_COLUMNS,
  getSalesColumnLayout,
  normalizeSalesColumnSettings,
  preserveLegacySalesColumnEntries,
  getUnavailableSalesColumns,
  salesPresetColumnVisible,
  getVisibleSalesColumnIds,
  moveVisibleSalesColumn,
} from "../src/components/sales/salesColumnCatalog.mjs";

const read = (path) => readFileSync(path, "utf8");
const row = read("src/components/sales/SalesPipelineRow.jsx");
const spreadsheet = read("src/components/sales/SalesPipelineSpreadsheet.jsx");
const editor = read("src/components/sales/CustomFilterDialog.jsx");
const headers = spreadsheet.split("<thead className=")[1]?.split("</thead>")[0];
assert.ok(headers, "Sales table headers must be inspectable.");
const columnCases = (source) => Array.from(source.matchAll(/case "([^"]+)": return \(/g), ([, id]) => id);
const catalogIds = SALES_TABLE_COLUMNS.map((col) => col.id);
const headerIds = columnCases(headers);
const rowIds = columnCases(row);
assert.equal(new Set(catalogIds).size, catalogIds.length, "Catalog must have unique field IDs.");
assert.deepEqual(headerIds, catalogIds, "The compact editor must expose every rendered header in actual table order.");
assert.deepEqual(rowIds, catalogIds, "The compact editor must expose every rendered row cell in actual table order.");
assert.equal((headers.match(/<th key=\{columnId\}/g) || []).length, catalogIds.length,
  "All dynamically ordered header cells must have stable React keys.");
assert.equal((row.match(/<td key=\{columnId\}/g) || []).length, catalogIds.length,
  "All dynamically ordered row cells must have stable React keys.");
assert.match(editor, /const ALL_COLUMNS = SALES_TABLE_COLUMNS;/);
assert.match(spreadsheet, /getVisibleSalesColumnIds\(activeColumnPreset\)/);
assert.match(spreadsheet, /visibleColumnIds\.map\(\(columnId\) =>/);
assert.match(row, /visibleColumnIds\.map\(\(columnId\) =>/);
assert.match(read("src/components/sales/SalesPipelineTableBody.jsx"), /visibleColumnIds=\{visibleColumnIds\}/);

// The real table and the horizontal preview must consume identical header
// wording and minimum widths from one catalog, while preserving the dense
// all-visible column controls and never inventing production data in the preview.
assert.equal((headers.match(/getSalesColumnLayout\(columnId\)\.headerLabel/g) || []).length,
  catalogIds.length, "Every live header must display its shared catalog label.");
assert.equal((headers.match(/getSalesColumnLayout\(columnId\)\.minWidth/g) || []).length,
  catalogIds.length, "Every live header must use its shared catalog minimum width.");
assert.match(editor, /getSalesColumnLayout\(column\.id\)\.headerLabel/);
assert.equal((editor.match(/getSalesColumnLayout\(column\.id\)\.minWidth/g) || []).length, 2,
  "Preview headers and sample cells must share the table's minimum widths.");
assert.match(editor, /visiblePreviewColumns = columnSettings\.filter/);
assert.match(editor, /className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"/,
  "Compact, always-visible all-column grid must remain.");
assert.match(editor, /overflow-x-auto.*aria-label="Horizontal Sales Pipeline column preview"/);
assert.match(editor, /aria-label=\{`Move \$\{column\.label\} left`\}/);
assert.match(editor, /aria-label=\{`Move \$\{column\.label\} right`\}/);
assert.match(editor, /minWidth: "32px"/);
assert.match(editor, /minWidth: "60px"/);
const sampleSource = editor.split("const SALES_COLUMN_PREVIEW_SAMPLE = Object.freeze({")[1]?.split("});")[0];
assert.ok(sampleSource, "Preview sample must be a plainly marked static example.");
const sampleIds = Array.from(sampleSource.matchAll(/\b([a-z][a-z0-9_]*):\s*"/g), ([, id]) => id);
assert.equal(sampleIds.length, catalogIds.length, "Sample must have exactly one value for every supported column.");
assert.deepEqual(new Set(sampleIds), new Set(catalogIds), "Every selected column must have a sample cell.");
for (const id of catalogIds) {
  const layout = getSalesColumnLayout(id);
  assert.ok(layout && layout.headerLabel.trim() && Number.isInteger(layout.minWidth) && layout.minWidth >= 60,
    `Column ${id} requires a real table header label and width.`);
}
assert.equal(getSalesColumnLayout("client_name").minWidth, 120);
assert.equal(getSalesColumnLayout("description").minWidth, 150);
assert.equal(getSalesColumnLayout("date_estimate_sent").headerLabel, "Date Estimate Sent to Customer");
assert.equal(getSalesColumnLayout("title"), null, "Obsolete Notes must not reappear in preview.");


const legacy = [
  { id: "client_name", label: "Customer", visible: true },
  { id: "description", label: "Job Description", visible: true },
  { id: "lead_source", label: "Source", visible: false },
  { id: "quote_date", label: "Quote", visible: true },
  { id: "title", label: "Notes", visible: false },
  { id: "probability", label: "Prob", visible: true },
];
const normalized = normalizeSalesColumnSettings(legacy);
assert.deepEqual(normalized.slice(0, 3).map((col) => col.id), [
  "client_name", "description", "lead_source",
], "Older preset order must be preserved.");
assert.equal(normalized.length, catalogIds.length, "Every supported column appears exactly once.");
assert.equal(normalized.find((col) => col.id === "lead_source").visible, false);
for (const missing of ["sales_status", "stage_age", "sales_rep", "quote_age", "expected_close_date"]) {
  assert.equal(normalized.find((col) => col.id === missing)?.visible, false,
    "New columns must not automatically appear in an older selected preset.");
  assert.equal(salesPresetColumnVisible({ column_settings: legacy }, missing), false,
    "Missing entries must not leak into the live table.");
}
assert.equal(salesPresetColumnVisible(null, "sales_status"), true,
  "No selected preset retains default full-table behavior.");
assert.equal(salesPresetColumnVisible({ column_settings: legacy }, "lead_source"), false);
assert.equal(salesPresetColumnVisible({ column_settings: legacy }, "client_name"), true);
assert.equal(salesPresetColumnVisible({ column_settings: legacy }, "quote_date"), false,
  "Unavailable columns must never render.");
assert.deepEqual(getVisibleSalesColumnIds({ column_settings: legacy }),
  ["client_name", "description"],
  "The table must match the editor's checked column order, skipping hidden and retired fields.");
assert.deepEqual(getVisibleSalesColumnIds(null), catalogIds,
  "Default View retains the established complete column order.");
assert.deepEqual(getVisibleSalesColumnIds({ column_settings: [] }), [],
  "An explicitly empty saved preset must not silently display extra data columns.");
assert.deepEqual(getUnavailableSalesColumns(legacy).map((col) => col.id),
  ["quote_date", "title", "probability"]);
assert.deepEqual(preserveLegacySalesColumnEntries(normalized, legacy).slice(-3), legacy.slice(-3),
  "Unsupported saved entries must survive editing for later reviewed migration.");

const reordered = moveVisibleSalesColumn([
  { id: "client_name", visible: true },
  { id: "lead_source", visible: false },
  { id: "description", visible: true },
  { id: "sales_status", visible: true },
], "description", -1);
assert.deepEqual(reordered.map((col) => col.id),
  ["description", "lead_source", "client_name", "sales_status"],
  "Preview arrows must swap only visible neighbors.");
assert.deepEqual(getVisibleSalesColumnIds({ column_settings: reordered }),
  ["description", "client_name", "sales_status"],
  "After the preview is reordered, the live table must render the same checked columns in the same order.");
assert.equal(moveVisibleSalesColumn(reordered, "description", -1), reordered,
  "Moving past the left edge must be a no-op.");
console.log("Sales column catalog, legacy preservation, strict visibility and visible reordering: PASS.");
