import { base44 } from "@/api/base44Client";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { getSmartsheetColumns } from "@/components/admin/smartsheetSyncPersistence";
import { CUSTOM_ASSIGNEE_SETTING_KEY, reviewedCustomAssigneeNames, resolveSmartsheetTaskAssignee } from "@/components/admin/smartsheetTaskAssigneeModel";
import { validateCustomAssigneeName } from "@/components/sales/customAssigneeName";

export async function confirmSmartsheetCustomAssignee({ label, sheetId, column, loadedRecord, sessionToken }) {
  const name = validateCustomAssigneeName(label);
  const [setting, metadata, users] = await Promise.all([
    loadSingleGlobalSetting({ entity: base44.entities.GlobalSettings, settingKey: "smartsheetSyncConfig" }),
    getSmartsheetColumns({ sessionToken, sheetId }),
    loadAllEntityRows({ entity: base44.entities.AuthorizedEmail, sort: "full_name", pageSize: 200, maxRows: 1000, label: "Task-assignee review" }),
  ]);
  const config = setting?.setting_value;
  const flags = ["mirror_enabled", "importer_enabled", "pull_enabled", "push_enabled", "create_base44_from_smartsheet", "create_smartsheet_from_base44"];
  if (config?.global_enabled !== false || config.observation_mode !== true || config.backup_before_write !== true ||
      ["sales", "orders"].some((dataset) => flags.some((flag) => config?.[dataset]?.[flag] !== false)) ||
      String(config?.sales?.smartsheet_sheet_id) !== String(sheetId)) {
    throw new Error("Review is blocked: keep all sync/import/create switches OFF, observation and backup ON, and the saved target unchanged.");
  }
  const fresh = metadata.columns?.find((item) => String(item.id) === String(column?.id));
  if (!fresh || fresh.type !== "PICKLIST" || fresh.title !== column.title ||
      JSON.stringify(fresh.options) !== JSON.stringify(column.options) || fresh.validation !== column.validation ||
      !fresh.options?.includes(name)) {
    throw new Error("Smartsheet choices changed. Re-run Analyze Live Mapping before confirming this name.");
  }
  if (resolveSmartsheetTaskAssignee(name, users).state !== "unresolved") {
    throw new Error("This name now matches or ambiguously matches an eligible user. Re-analyze instead of treating it as custom.");
  }
  const value = loadedRecord?.setting_value || {};
  if (value.items !== undefined && !Array.isArray(value.items)) throw new Error("Custom-name review settings are invalid; no changes were made.");
  if (reviewedCustomAssigneeNames(value, sheetId, column.id).includes(name)) return loadedRecord;
  const nextValue = { ...value, items: [...(value.items || []), {
    kind: "custom_name", label: name, sheet_id: String(sheetId), column_id: String(column.id), confirmed_at: new Date().toISOString(),
  }] };
  const saved = await saveGlobalSettingValueIfUnchanged({
    entity: base44.entities.GlobalSettings, loadedRecord, settingKey: CUSTOM_ASSIGNEE_SETTING_KEY,
    nextValue, label: "Confirmed Smartsheet custom assigned names",
  });
  if (!reviewedCustomAssigneeNames(saved?.setting_value, sheetId, column.id).includes(name)) {
    throw new Error("The confirmation could not be verified. Reload before retrying.");
  }
  return saved;
}