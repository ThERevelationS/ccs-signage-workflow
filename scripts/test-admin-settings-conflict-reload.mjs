// Contract: every Admin panel that saves through saveGlobalSettingValueIfUnchanged
// must leave a save conflict actionable. A conditional-write rejection keeps the
// loaded record stale, so "reload before saving" must be backed by either an
// automatic reload in the catch path or a reload button in the error UI —
// otherwise every retry fails identically with no way forward short of a page
// refresh.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// Panels that reload server truth inside the save-error catch path.
const AUTO_RELOAD_PANELS = [
  { file: "src/components/admin/AdminCalendarSettings.jsx", call: "loadData" },
  { file: "src/components/admin/TaskAssignmentRules.jsx", call: "load" },
];

// Panels whose error affordance must include a button wired to their loader.
const RELOAD_BUTTON_PANELS = [
  { file: "src/components/admin/OvertimeRulesManager.jsx", call: "loadSettings" },
  { file: "src/components/admin/JurisdictionMonitoringSettings.jsx", call: "loadSettings" },
  { file: "src/components/admin/JurisdictionAccuracyAudit.jsx", call: "loadData" },
  { file: "src/components/admin/PermittingResearchDispatchSettings.jsx", call: "load" },
];

test("every Admin conditional-save panel routes writes through the conflict-safe helper", () => {
  for (const { file } of [...AUTO_RELOAD_PANELS, ...RELOAD_BUTTON_PANELS]) {
    const src = read(file);
    assert.match(src, /saveGlobalSettingValueIfUnchanged\(\{/, `${file} must save via the conditional helper`);
  }
});

test("auto-reload panels refresh the stored record baseline inside the save catch", () => {
  for (const { file, call } of AUTO_RELOAD_PANELS) {
    const src = read(file);
    // The catch that follows the helper call must reload before returning.
    const saveStart = src.indexOf("saveGlobalSettingValueIfUnchanged({");
    assert.notEqual(saveStart, -1, `${file} helper call not found`);
    const catchStart = src.indexOf("catch", saveStart);
    const catchBlock = src.slice(catchStart, catchStart + 600);
    assert.match(catchBlock, new RegExp(`await ${call}\\(\\)`),
      `${file} save catch must await ${call}() so the next save sees fresh server state`);
  }
});

test("reload-button panels expose an actionable reload inside the settings error UI", () => {
  for (const { file, call } of RELOAD_BUTTON_PANELS) {
    const src = read(file);
    assert.match(src, new RegExp(`await ${call}\\(\\);`),
      `${file} must wire a reload action to ${call}()`);
    assert.match(src, /Reload latest|>Reload</,
      `${file} error UI must offer a reload action, not just an unactionable instruction`);
  }
});

test("the shared helper never silently overwrites a concurrently changed setting", () => {
  const src = read("src/components/shared/globalSettingsPersistence.js");
  // Existing record: conditional update with expected revision + field guard.
  assert.match(src, /expectedUpdatedAt: loadedRecord\.updated_date/);
  assert.match(src, /expectedFields: \{ setting_value: loadedRecord\.setting_value \}/);
  assert.match(src, /guardFields: \{ setting_key: key \}/);
  // Missing record: re-check before create and verify after create; no blind retry.
  assert.match(src, /was created in another session after this dialog loaded/);
  assert.match(src, /was created concurrently with a different value/);
});
