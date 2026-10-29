// Compare only editable Admin account fields against the values that opened
// the editor. Never obtain or retain an existing password from server records.
const ACCOUNT_FIELDS = [
  "full_name", "username", "role", "sales_roles",
  "can_import_export", "can_order_export", "can_view_resources",
  "employment_type", "can_work_pause", "force_password_reset", "is_deactivated",
  "notification_prefs"
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
    can_work_pause: record.can_work_pause === true,
    force_password_reset: record.force_password_reset === true,
    is_deactivated: record.is_deactivated === true,
    notification_prefs: record.notification_prefs && typeof record.notification_prefs === "object"
      ? { automation_emails: record.notification_prefs.automation_emails !== false }
      : { automation_emails: true }
  };
}

// Only fields edited from this verified Account version belong in a write.
// Role/order-export/resources dependencies are still enforced by the backend.
// Passwords are never part of Account writes or account field reconciliation.
export function getChangedAdminAccountFields(record, draft) {
  if (!record?.id || !record?.email || !record?.updated_date ||
      !draft || typeof draft !== "object" || Array.isArray(draft) ||
      ACCOUNT_FIELDS.some(field => !own(draft, field))) {
    throw new Error("Account edits require a verified employee and complete draft.");
  }
  const baseline = createAdminAccountDraft(record);
  const patch = {};
  for (const field of ACCOUNT_FIELDS) {
    const before = field === "sales_roles" ? stableRoles(baseline[field]) : baseline[field];
    const after = field === "sales_roles" ? stableRoles(draft[field]) : draft[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      patch[field] = field === "sales_roles" && Array.isArray(draft[field])
        ? [...new Set(draft[field])]
        : draft[field];
    }
  }
  return patch;
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
