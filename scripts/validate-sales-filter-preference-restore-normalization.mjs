import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRestoredSalesFilterModes } from "../src/components/sales/salesFilterPreferenceRestore.mjs";

const page = readFileSync("src/pages/SalesPipeline.jsx", "utf8");
const persistence = readFileSync("src/components/sales/salesFilterPersistence.js", "utf8");
const backend = readFileSync("base44/functions/manageSalesFilters/entry.ts", "utf8");

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

assert.deepEqual(
  resolveRestoredSalesFilterModes("lead", "due"),
  { informationFilter: "lead", attentionFilter: "all", hadConflict: true },
  "Legacy conflict must keep the newer Information selection and discard stale Attention.",
);
checks += 1;

assert.deepEqual(
  resolveRestoredSalesFilterModes("custom_abc", "needs_attention"),
  { informationFilter: "custom_abc", attentionFilter: "all", hadConflict: true },
  "Valid custom Information filters must also win legacy conflicts.",
);
checks += 1;

assert.deepEqual(
  resolveRestoredSalesFilterModes("all", "due"),
  { informationFilter: "all", attentionFilter: "due", hadConflict: false },
  "Attention-only preferences must restore unchanged.",
);
checks += 1;

assert.deepEqual(
  resolveRestoredSalesFilterModes("quoted", "all"),
  { informationFilter: "quoted", attentionFilter: "all", hadConflict: false },
  "Information-only preferences must restore unchanged.",
);
checks += 1;

assert.deepEqual(
  resolveRestoredSalesFilterModes("all", "all"),
  { informationFilter: "all", attentionFilter: "all", hadConflict: false },
  "All/All preferences must restore unchanged.",
);
checks += 1;

check(page.includes("resolveRestoredSalesFilterModes(restoredInformation, restoredAttention)"),
  "Login restore uses the tested mutual-exclusion resolver.");
check(page.includes("const hasLegacyFilterConflict = restoredModes.hadConflict;"),
  "Repair is attempted only for an actual legacy conflict.");
check(page.includes("setFilterStatus(restoredModes.informationFilter);") &&
  page.includes("setAttentionFilter(restoredModes.attentionFilter);"),
  "Normalized modes are applied before any repair result is required.");
check(page.includes("preferenceSaveChainRef.current = preferenceSaveChainRef.current"),
  "Legacy repair is serialized with normal preference writes.");
check(page.includes("if (preferenceIdentityRef.current !== repairIdentity) return undefined;"),
  "Queued repair is discarded if browser identity/session changes before it begins.");
check(page.includes("expectedPreferences,") &&
  page.includes('label: "Sales Pipeline legacy filter preference repair"'),
  "Legacy repair sends the exact preference snapshot it originally read.");

check(persistence.includes("expectedPreferences !== undefined") &&
  persistence.includes("payload.expected_preferences = expectedPreferences"),
  "Frontend helper sends the expected snapshot only for guarded writes.");

check(backend.includes("const expected = expectedValue === undefined ? null : cleanSalesPipelinePreferences(expectedValue);"),
  "Backend treats the expected snapshot as optional and sanitizes it consistently.");
check(backend.includes("const currentPreferences = cleanSalesPipelinePreferences(current.sales_pipeline_preferences);"),
  "Backend reloads current preferences before guarded repair.");
check(backend.includes("JSON.stringify(currentPreferences) !== JSON.stringify(expected)"),
  "Guarded repair compares current preferences with the exact expected snapshot.");
check(backend.includes("Sales Pipeline preferences changed in another session. Reload before retrying."),
  "Cross-tab preference changes block stale repair with a conflict.");
check(
  backend.indexOf("JSON.stringify(currentPreferences) !== JSON.stringify(expected)") <
    backend.indexOf("AuthorizedEmail.updateMany("),
  "Expected-state guard runs before the preference write.",
);

console.log("Sales legacy filter preference restore normalization: " + checks + "/" + checks + " PASS.");
