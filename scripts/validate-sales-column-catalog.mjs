import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_TABLE_COLUMNS,
  normalizeSalesColumnSettings,
  preserveLegacySalesColumnEntries,
  getUnavailableSalesColumns,
  salesPresetColumnVisible,
  moveVisibleSalesColumn,
} from "../src/components/sales/salesColumnCatalog.mjs";

const read = (path) => readFileSync(path, "utf8");
const row = read("src/components/sales/SalesPipelineRow.jsx");
const spreadsheet = read("src/components/sales/SalesPipelineSpreadsheet.jsx");
const editor = read("src/components/sales/CustomFilterDialog.jsx");
const headers = spreadsheet.split("<thead className=")[1]?.split("</thead>")[0];
assert.ok(headers, "Sales table headers must be inspectable.");
const visibleIds = (source) => Array.from(source.matchAll(/isColumnVisible\("([^"]+)"\)/g), ([, id]) => id);
const catalogIds = SALES_TABLE_COLUMNS.map((col) => col.id);
const headerIds = visibleIds(headers);
const rowIds = visibleIds(row);
assert.equal(new Set(catalogIds).size, catalogIds.length, "Catalog must have unique field IDs.");
assert.deepEqual(headerIds, catalogIds, "The compact editor must expose every rendered header in actual table order.");
assert.deepEqual(rowIds, catalogIds, "The compact editor must expose every rendered row cell in actual table order.");
assert.match(editor, /const ALL_COLUMNS = SALES_TABLE_COLUMNS;/);
assert.match(spreadsheet, /salesPresetColumnVisible\(activeColumnPreset, columnId\)/);

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
assert.equal(moveVisibleSalesColumn(reordered, "description", -1), reordered,
  "Moving past the left edge must be a no-op.");
console.log("Sales column catalog, legacy preservation, strict visibility and visible reordering: PASS.");
