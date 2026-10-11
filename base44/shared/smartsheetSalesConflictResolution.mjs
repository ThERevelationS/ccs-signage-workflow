import { salesSnapshotsEqual } from './smartsheetSalesSafety.mjs';

// A human approved the values seen when planning the write. A newer remote
// snapshot requires fresh review, even when the Base44 WorkOrder is unchanged.
// This is a pre-write check, not an atomic Smartsheet conditional update.
export function approvedSalesRemoteSnapshotStillCurrent(planned, freshlyRead, assigneeColumnId = '') {
  return salesSnapshotsEqual(planned, freshlyRead, assigneeColumnId);
}

// The approval is for particular Sales values, not permission to overwrite
// a newer WorkOrder revision. A batched preflight checks the planned record
// before remote writes; an exact version CAS checks again on Base44 commit.
export function approvedSalesRecordStillCurrent(planned, latest) {
  return Boolean(planned?.id && latest?.id && String(planned.id) === String(latest.id) &&
    planned.updated_date && latest.updated_date === planned.updated_date &&
    latest.deleted !== true &&
    String(latest.smartsheet_sheet_id ?? '') === String(planned.smartsheet_sheet_id ?? '') &&
    String(latest.smartsheet_row_id ?? '') === String(planned.smartsheet_row_id ?? '') &&
    String(latest.sales_status ?? '') === String(planned.sales_status ?? '') &&
    String(latest.current_task_description ?? '') === String(planned.current_task_description ?? ''));
}

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
