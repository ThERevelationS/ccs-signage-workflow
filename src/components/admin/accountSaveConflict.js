// Only a precise server-side precondition rejection proves that an Account
// write did not start. Other errors (including HTTP 409 for duplicate usernames,
// final-administrator safeguards, and lost acknowledgments) remain uncertain.
const ACCOUNT_FIELDS = new Set([
  "full_name", "username", "role", "sales_roles",
  "can_import_export", "can_order_export", "can_view_resources",
  "employment_type", "can_work_pause"
]);

export function rejectedAdminAccountField(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  const match = /^Authorized user changed in another session \(([a-z_]+)\)\. Reload before saving\.$/.exec(message);
  return match && ACCOUNT_FIELDS.has(match[1]) ? match[1] : null;
}
