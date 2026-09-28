import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { smartsheetProfileTargetLocked } from "../src/components/admin/smartsheetMappingFreshnessModel.js";

const ui = readFileSync("src/components/admin/SmartsheetSyncSettings.jsx", "utf8");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(smartsheetProfileTargetLocked({ rollout_baseline: { captured_at: "2026-09-23T10:00:00.000Z" } }),
  "Captured rollout baseline must lock the target");
check(!smartsheetProfileTargetLocked({ rollout_baseline: null }),
  "Missing rollout baseline must not lock the target");

check(ui.includes("smartsheetProfileTargetLocked"),
  "Settings UI must use the shared target-lock model");
check(ui.includes("const targetLocked = smartsheetProfileTargetLocked(value);"),
  "Each dataset card must derive its target lock from the persisted baseline");
check((ui.match(/disabled=\{targetLocked\}/g) || []).length >= 2,
  "Sheet name and sheet ID must both be disabled when a baseline exists");
check(ui.includes("Target locked by the captured rollout baseline."),
  "Locked target state must be explained in the UI");

check(!ui.includes("sales: { ...DEFAULT_CONFIG.sales, ...(saved?.sales || {}), rollout_baseline: null }") &&
      !ui.includes("orders: { ...DEFAULT_CONFIG.orders, ...(saved?.orders || {}), rollout_baseline: null }"),
  "Config merge must preserve stored rollout baselines instead of nulling them");

check(backend.includes("function assertRolloutBaselinesPreserved"),
  "Backend config save must define a rollout-baseline immutability guard");
check(backend.includes("assertRolloutBaselinesPreserved(record.setting_value, nextValue);"),
  "Backend config save must execute the baseline guard before writing");
check(backend.includes("!sameStableValue(baseline, nextProfile?.rollout_baseline)"),
  "Backend must reject removal or mutation of a captured baseline");
check(backend.includes("Smartsheet target is locked by its rollout baseline."),
  "Backend must reject changing the locked sheet ID");
check(backend.includes("Smartsheet target name is locked by its rollout baseline."),
  "Backend must reject changing the locked sheet name");

const guardIndex = backend.indexOf("assertRolloutBaselinesPreserved(record.setting_value, nextValue);");
const writeIndex = backend.indexOf("base44.asServiceRole.entities.GlobalSettings.updateMany", guardIndex);
check(guardIndex >= 0 && writeIndex > guardIndex,
  "Baseline guard must execute before the GlobalSettings write");

console.log("Smartsheet rollout-baseline settings safety: " + checks + "/" + checks + " PASS.");
