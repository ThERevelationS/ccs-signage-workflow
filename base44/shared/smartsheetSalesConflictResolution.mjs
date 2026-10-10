// Approval is intent, not completion. A Sales conflict decision may leave the
// review queue only for a WorkOrder whose Smartsheet reconciliation AND Base44
// snapshot metadata both passed the existing read-back verification gates.
// Failed, held, timed-out or unverified rows retain their previous reviews.
export function verifiedSalesConflictResolutionTargets({
  verifiedWorkOrderIds = [],
  approvedDecisionsByWorkOrder = new Map(),
  openReviewWorkOrderIds = [],
} = {}) {
  const verified = new Set((verifiedWorkOrderIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const decisions = new Set();
  for (const [workOrderId, ids] of approvedDecisionsByWorkOrder || []) {
    if (!verified.has(String(workOrderId || '').trim())) continue;
    for (const id of ids || []) {
      const value = String(id || '').trim();
      if (value) decisions.add(value);
    }
  }
  const openRecords = new Set();
  for (const id of openReviewWorkOrderIds || []) {
    const value = String(id || '').trim();
    if (value && verified.has(value)) openRecords.add(value);
  }
  return {
    approvedDecisionIds: [...decisions],
    openReviewWorkOrderIds: [...openRecords],
  };
}
