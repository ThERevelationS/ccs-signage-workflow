// Read-only, conservative review of a potentially committed Automation write.
// Matching content is evidence of a current matching rule, NOT proof of which
// request wrote it. Do not authorize a duplicate retry from this result.
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = normalize(value[key]);
      return result;
    }, {});
  }
  return value;
};

const comparable = (rule) => ({
  name: String(rule?.name || "").trim(),
  enabled: rule?.enabled,
  priority: rule?.priority,
  triggers: rule?.triggers,
  actions: rule?.actions,
});
const sameFields = (left, right) =>
  JSON.stringify(normalize(comparable(left))) === JSON.stringify(normalize(comparable(right)));

export function reviewUncertainAutomationSave({ kind, attempted, originalId, rows } = {}) {
  if (!Array.isArray(rows) || !attempted || !["create", "update"].includes(kind)) {
    return "unverified";
  }
  const candidates = kind === "update"
    ? rows.filter(row => String(row?.id || "") === String(originalId || ""))
    : rows.filter(row => String(row?.name || "").trim().toLowerCase() ===
      String(attempted?.name || "").trim().toLowerCase());
  if (candidates.length > 1) return "ambiguous";
  if (!candidates.length) return "not_found";
  const row = candidates[0];
  if (!row?.id || !String(row.updated_date || "").trim()) return "unverified";
  return sameFields(row, attempted) ? "matching" : "different";
}
