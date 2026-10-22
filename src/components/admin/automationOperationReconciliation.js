// Read-only evidence for ordinary Automation operations. Absence is meaningful
// only in a complete, validated list; never infer deletion from a failed get.
export function reviewAutomationOperation(operation, rows) {
  if (!Array.isArray(rows) || rows.some(row => !row?.id) ||
      new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error("Automation list could not be verified.");
  }
  const record = rows.find(row => row.id === operation.id);
  if (record && (!record.updated_date || typeof record.enabled !== "boolean")) {
    throw new Error("Automation rule snapshot could not be verified.");
  }
  return {
    status: !record ? "absent" : operation.kind === "delete" ? "present" :
      record.enabled === operation.enabled ? "matching" : "different",
    snapshot: JSON.stringify(record || null),
  };
}
