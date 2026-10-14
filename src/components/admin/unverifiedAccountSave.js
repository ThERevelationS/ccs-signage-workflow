// Read-only reconciliation of an unverified Admin Account write.
// Inspect only editable account fields; never retain Time Clock passwords.
import { createAdminAccountDraft } from "./adminAccountDraft.js";

const FIELDS = [
  "full_name", "username", "role", "sales_roles", "can_import_export",
  "can_order_export", "can_view_resources", "employment_type", "can_work_pause"
];
const same = (field, a, b) => field === "sales_roles"
  ? JSON.stringify([...new Set(a || [])].sort()) === JSON.stringify([...new Set(b || [])].sort())
  : Object.is(a, b);

// When the attempted values are observed in the verified record, retain only
// new edits made after the submit began. Preserve all verified remote-only
// changes. Password is always a local draft, never part of the Account read.
export function rebaseAppliedAccountDraft({ latest, attempted, current }) {
  const result = createAdminAccountDraft(latest);
  for (const field of FIELDS) {
    if (!same(field, current?.[field], attempted?.[field])) {
      result[field] = current?.[field];
    }
  }
  result.password_hash = current?.password_hash || "";
  return result;
}

export function compareUnverifiedAccountSave({ baseline, attempted, latest }) {
  if (![baseline, attempted, latest].every(value =>
    value && typeof value === "object" && !Array.isArray(value))) {
    throw new Error("Account verification requires complete records.");
  }
  const oldFields = createAdminAccountDraft(baseline);
  const latestFields = createAdminAccountDraft(latest);
  // Attempted must be an independent immutable snapshot from before the write.
  if (!FIELDS.every(field => Object.prototype.hasOwnProperty.call(attempted, field))) {
    throw new Error("Account write snapshot is incomplete.");
  }
  const edited = FIELDS.filter(field => !same(field, oldFields[field], attempted[field]));
  const applied = edited.filter(field => same(field, latestFields[field], attempted[field]));
  const unchanged = edited.filter(field => same(field, latestFields[field], oldFields[field]));
  const diverged = edited.filter(field =>
    !same(field, latestFields[field], oldFields[field]) &&
    !same(field, latestFields[field], attempted[field]));
  const status = diverged.length || (applied.length && unchanged.length)
    ? "mixed" : applied.length === edited.length
      ? "applied" : "unchanged";
  return {
    status, editedCount: edited.length,
    appliedCount: applied.length, unchangedCount: unchanged.length,
    divergentCount: diverged.length,
    // Field labels only, no HR/account values or passwords.
    fields: edited.map(field => ({
      key: field, label: field.replaceAll("_", " "),
      outcome: diverged.includes(field) ? "different" :
        applied.includes(field) ? "applied" : "unchanged"
    }))
  };
}
