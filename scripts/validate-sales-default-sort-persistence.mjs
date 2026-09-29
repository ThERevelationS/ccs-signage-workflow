import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/admin/SalesPipelineDefaultSort.jsx", "utf8");
const persistence = readFileSync("src/components/sales/salesFilterPersistence.js", "utf8");
const backend = readFileSync("base44/functions/manageSalesFilters/entry.ts", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(ui.includes("useAuth") && ui.includes("sessionToken"),
  "Default Sort UI must use the authenticated Sign Shop session");
check(!ui.includes("base44.entities.GlobalSettings") &&
      !ui.includes("loadSingleGlobalSetting") &&
      !ui.includes("saveGlobalSettingValueIfUnchanged"),
  "Default Sort UI must not read/write protected GlobalSettings directly");
check(ui.includes("loadSalesDefaultSortSafely({ sessionToken })") &&
      ui.includes("saveSalesDefaultSortSafely({"),
  "Default Sort UI must use authenticated Sales persistence");

check(persistence.includes('action: "default_sort_get"') &&
      persistence.includes('action: "default_sort_set"'),
  "Frontend persistence must expose authenticated default-sort get/set actions");
check(persistence.includes("expected_updated_date: record?.updated_date ||"),
  "Default-sort update must send its loaded concurrency version");

check(backend.includes("const SALES_SORT_COLUMNS = new Set"),
  "Backend must allowlist sortable Sales columns");
check(backend.includes("function cleanDefaultSort") &&
      backend.includes("SALES_SORT_COLUMNS.has(column)") &&
      backend.includes("direction === 'asc' ? 'asc' : 'desc'"),
  "Backend must sanitize sort column and direction");
check(backend.includes("if (action === 'default_sort_get')") &&
      backend.includes("if (action === 'default_sort_set')"),
  "Backend must expose dedicated default-sort actions");
check((backend.match(/actor\?\.role !== 'admin'/g) || []).length >= 2,
  "Default-sort read/write actions must require Sign Shop admin access");
check(backend.includes("GlobalSettings.create({ setting_key: 'salesPipelineDefaultSort'"),
  "Missing default-sort setting must be created only through service role");
check(backend.includes("updated_date: current.updated_date") &&
      backend.includes("Sales Pipeline default sort changed while saving"),
  "Existing setting updates must use optimistic concurrency");
check(backend.includes("duplicate settings records"),
  "Duplicate default-sort records must fail closed");
check(backend.includes("saved but could not be verified"),
  "Backend must re-read and verify the saved default sort");

console.log("Sales default-sort persistence: " + checks + "/" + checks + " PASS.");
