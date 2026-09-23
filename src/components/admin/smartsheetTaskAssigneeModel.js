import { resolveSmartsheetPerson } from "./smartsheetTranslationModel.js";

export const CUSTOM_ASSIGNEE_SETTING_KEY = "smartsheetCustomAssignees";
export function eligibleTaskAssignees(users = []) {
  return users.filter((user) => user?.is_active !== false && String(user?.full_name || "").trim() && user.sales_roles?.includes("Task Assigned"));
}

// Approval is scoped to an exact label and stable sheet/column IDs, never an identity alias.
export function reviewedCustomAssigneeNames(value, sheetId, columnId) {
  if (!sheetId || !columnId) return [];
  return [...new Set((Array.isArray(value?.items) ? value.items : []).filter((item) =>
    item?.kind === "custom_name" && item.confirmed_at &&
    String(item.sheet_id) === String(sheetId) && String(item.column_id) === String(columnId) &&
    typeof item.label === "string" && item.label.trim()
  ).map((item) => item.label.trim()))];
}

export function resolveSmartsheetTaskAssignee(value, users = [], customNames = []) {
  const result = resolveSmartsheetPerson(value, eligibleTaskAssignees(users));
  const label = String(value ?? "").trim();
  if (result.user) return { ...result, name: result.user.full_name, custom: false };
  // Ambiguous real people must still be reviewed, even if a custom approval exists.
  if (result.state === "unresolved" && customNames.includes(label)) {
    return { ...result, state: "confirmed_custom_name", name: label, custom: true };
  }
  return { ...result, name: "", custom: false };
}