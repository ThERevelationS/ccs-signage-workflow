// Compare only editable Admin account fields against the values that opened
// the editor. Never obtain or retain an existing password from server records.
const ACCOUNT_FIELDS = [
  "full_name", "username", "role", "sales_roles",
  "can_import_export", "can_order_export", "can_view_resources",
  "employment_type", "can_work_pause"
];
const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const stableRoles = value => Array.isArray(value)
  ? [...new Set(value)].sort()
  : value;

export function createAdminAccountDraft(record) {
  return {
    full_name: record.full_name || "",
    username: record.username || "",
    password_hash: "",
    role: record.role || "user",
    sales_roles: record.sales_roles || ["Task Assigned"],
    can_import_export: record.can_import_export || false,
    can_order_export: record.role === "admin" && record.can_order_export === true,
    can_view_resources: record.role === "admin" || record.can_view_resources || false,
    employment_type: record.employment_type || "hourly",
    can_work_pause: record.can_work_pause === true
  };
}

export function hasUnsavedAdminAccountDraft(baseline, draft) {
  if (!baseline || !draft || typeof baseline !== "object" ||
      typeof draft !== "object" || Array.isArray(baseline) || Array.isArray(draft)) return true;
  // Any new Time Clock password is a draft. The previous password is never
  // included in the baseline or compared to a server field.
  if (String(draft.password_hash || "").length > 0) return true;
  return ACCOUNT_FIELDS.some(field => {
    if (!own(baseline, field) || !own(draft, field)) return true;
    const before = field === "sales_roles" ? stableRoles(baseline[field]) : baseline[field];
    const after = field === "sales_roles" ? stableRoles(draft[field]) : draft[field];
    return JSON.stringify(before) !== JSON.stringify(after);
  });
}
