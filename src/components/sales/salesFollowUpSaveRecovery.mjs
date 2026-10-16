// A lost reply is not evidence that a follow-up was not saved. Read-only
// reconciliation protects against reissuing a completed follow-up. Never
// perform a second business write here or manufacture history.
const equal = (a, b) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  ((a == null || a === "") && (b == null || b === ""));

export async function readBackUncertainSalesFollowUpSave({
  workOrderId, changes, getLatest,
} = {}) {
  if (!workOrderId || !changes?.sales_last_follow_up_completed_at ||
    !String(changes.sales_last_follow_up_outcome || "").trim() ||
    typeof getLatest !== "function") {
    return { verified: false, reason: "invalid_intent" };
  }
  try {
    const record = await getLatest(workOrderId);
    if (!record || record.id !== workOrderId || record.deleted === true) {
      return { verified: false, reason: "missing_record" };
    }
    if (!Object.entries(changes).every(([field, value]) => equal(record[field], value))) {
      return { verified: false, reason: "unmatched_fields" };
    }
    return { verified: true, record };
  } catch {
    return { verified: false, reason: "read_failed" };
  }
}
