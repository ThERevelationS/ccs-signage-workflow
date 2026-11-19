const ACCOUNT_FIELDS = /* @__PURE__ */ new Set([
  "full_name",
  "username",
  "role",
  "sales_roles",
  "can_import_export",
  "can_order_export",
  "can_view_resources",
  "employment_type",
  "can_work_pause",
  "can_self_approve_shifts"
]);
export function rejectedAdminAccountField(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  const match = /^Authorized user changed in another session \(([a-z_]+)\)\. Reload before saving\.$/.exec(message);
  return match && ACCOUNT_FIELDS.has(match[1]) ? match[1] : null;
}
