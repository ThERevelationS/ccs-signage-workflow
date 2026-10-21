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

// A create response is a verified receipt only when the server explicitly
// identifies a newly created, versioned rule with all attempted fields.
// "recovered" and existing-name statuses are not proof that this request
// created the rule: keep the local draft fenced for read-only review.
export function classifyAutomationCreateReceipt(receipt, attempted) {
  const status = String(receipt?.status || "").trim();
  if (["existing", "recovered", "concurrent_duplicate_discarded"].includes(status)) {
    return status;
  }
  if (status !== "created" || !receipt?.record?.id ||
      !String(receipt.record.updated_date || "").trim() ||
      !sameFields(receipt.record, attempted)) return "unverified";
  return "created";
}

function matchingRows({ kind, attempted, originalId, rows }) {
  if (!Array.isArray(rows) || !attempted ||
      !["create", "update"].includes(kind) ||
      (kind === "create" && !String(attempted?.name || "").trim()) ||
      (kind === "update" && !String(originalId || "").trim())) return null;
  return kind === "update"
    ? rows.filter(row => String(row?.id || "") === String(originalId))
    : rows.filter(row => String(row?.name || "").trim().toLowerCase() ===
      String(attempted.name).trim().toLowerCase());
}

export function reviewUncertainAutomationSave(context = {}) {
  const candidates = matchingRows(context);
  if (!candidates) return "unverified";
  if (candidates.length > 1) return "ambiguous";
  if (!candidates.length) return "not_found";
  const row = candidates[0];
  if (!row?.id || !String(row.updated_date || "").trim()) return "unverified";
  return sameFields(row, context.attempted) ? "matching" : "different";
}

// Frozen read-only evidence, scoped to the attempted rule ID or normalized
// create name. Includes identity, version and fields for every candidate,
// including collisions. Sorting tolerates pagination/order differences; it
// never interprets missing IDs or versions as trustworthy evidence.
export function snapshotUncertainAutomationReview(context = {}) {
  const candidates = matchingRows(context);
  const status = reviewUncertainAutomationSave(context);
  if (!candidates || status === "unverified" ||
      candidates.some(row => !row?.id || !String(row.updated_date || "").trim())) return null;
  const fingerprint = JSON.stringify(candidates
    .map(row => normalize({
      id: row.id,
      updated_date: row.updated_date,
      created_date: row.created_date,
      name: row.name,
      enabled: row.enabled,
      priority: row.priority,
      triggers: row.triggers,
      actions: row.actions,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id))));
  return { status, fingerprint };
}

// Comparison never grants write permission. A second complete read must
// reproduce the prior status and candidate identities/versions/fields before
// the user may discard the local draft. This is point-in-time only.
export function reviewedAutomationSnapshotIsCurrent(reviewed, context = {}) {
  if (!reviewed) return false;
  const latest = snapshotUncertainAutomationReview(context);
  return !!latest && latest.status === reviewed.status &&
    latest.fingerprint === reviewed.fingerprint;
}
