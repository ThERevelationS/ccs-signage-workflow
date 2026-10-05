import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameStableConfig, stableConfigString } from "../src/components/admin/smartsheetConfigState.mjs";

const ui = readFileSync("src/components/admin/SmartsheetSyncSettings.jsx", "utf8");
const persistence = readFileSync("src/components/admin/smartsheetSyncPersistence.js", "utf8");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
const globalSettingsSchema = readFileSync("base44/entities/GlobalSettings.jsonc", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

check(sameStableConfig(
  { sales: { column_bindings: { a: "1", b: "2" }, mirror_enabled: true }, global_enabled: true },
  { global_enabled: true, sales: { mirror_enabled: true, column_bindings: { b: "2", a: "1" } } },
), "Dirty comparison must ignore object-key order");
same(
  stableConfigString({ z: 1, a: { y: 2, x: 3 } }),
  stableConfigString({ a: { x: 3, y: 2 }, z: 1 }),
  "Stable config serialization must recursively normalize key order",
);

check(globalSettingsSchema.includes('"update"') && globalSettingsSchema.includes('"role": "admin"'),
  "GlobalSettings native update RLS must remain admin-only");
check(!ui.includes("base44.entities.GlobalSettings") &&
      !ui.includes("saveGlobalSettingValueIfUnchanged") &&
      !ui.includes("loadSingleGlobalSetting"),
  "Published Smartsheet settings UI must not read/write GlobalSettings directly");
check(ui.includes("getSmartsheetSyncConfig({ sessionToken })") &&
      ui.includes("saveSmartsheetSyncConfig({") &&
      ui.includes("loadedRecord: record") &&
      ui.includes("settingValue: normalized"),
  "UI must load and save config through the authenticated Smartsheet backend");
check(ui.includes("stableConfigString(mergeConfig(saved))") &&
      ui.includes("stableConfigString(mergeConfig(config))"),
  "Unsaved-changes state must use semantic key-order-independent comparison");
check(ui.includes('checked={Boolean(value[key])}') &&
      ui.includes('onCheckedChange={(checked) => patch({ [key]: checked })}') &&
      ui.includes('disabled={dataset === "orders" && ["push_enabled", "create_base44_from_smartsheet", "create_smartsheet_from_base44"].includes(key)}'),
  "Sales dataset switches remain directly editable while protected Order background-write switches stay locked");

check(persistence.includes('invokeSmartsheet("config_get", sessionToken)') &&
      persistence.includes('invokeSmartsheet("config_save", sessionToken'),
  "Frontend persistence must use the authenticated config_get/config_save backend actions");
check(persistence.includes("expected_updated_date: record.updated_date") &&
      persistence.includes("expected_setting_value: record.setting_value"),
  "Config save must send the exact loaded concurrency baseline");
check(persistence.includes("saved but the result could not be verified"),
  "Frontend save must require a verified saved record response");

const authIndex = backend.indexOf("authenticateSignShopSession(base44, body?.session_token)");
const getIndex = backend.indexOf("if (action === 'config_get')");
const saveIndex = backend.indexOf("if (action === 'config_save')");
check(authIndex >= 0 && getIndex > authIndex && saveIndex > authIndex,
  "Config read/save actions must execute only after authenticated Sign Shop admin authorization");
check(backend.includes("base44.asServiceRole.entities.GlobalSettings.updateMany") &&
      backend.includes("{ id: record.id, updated_date: record.updated_date, setting_key: SETTING_KEY }"),
  "Backend config save must use service-role CAS against the exact loaded record version");
check(backend.includes("sameStableValue(record.setting_value, expectedValue)") &&
      backend.includes("sameStableValue(saved.setting_value, nextValue)"),
  "Backend must compare and verify settings semantically, independent of key order");
check(backend.includes("duplicateCount > 1") &&
      backend.includes("No settings were changed; resolve the duplicate records first."),
  "Duplicate config records must block writes instead of choosing one arbitrarily");
check(backend.includes("supported_actions: ['status', 'config_get', 'config_save'"),
  "Backend status must advertise the authenticated config actions");

console.log("Smartsheet settings persistence: " + checks + "/" + checks + " PASS.");
