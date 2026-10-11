import { salesSnapshotsEqual } from './smartsheetSalesSafety.mjs';
import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';

// Recover a matching Keep App task after the Smartsheet write succeeded but
// its Base44 snapshot commit failed. Never repeat a remote write just because
// an approved conflict remains active after both task values now agree.
export function recoverCompletedApprovedSalesTaskDecisionIds(record, remoteSnapshot, reviews, bindings) {
  const column = String(bindings?.current_task_description ?? '').trim();
  if (!/^\d+$/.test(column) || record?.in_pipeline !== true || !record?.id ||
      !/^\d+$/.test(String(record?.smartsheet_row_id ?? '')) ||
      !/^\d+$/.test(String(record?.smartsheet_sheet_id ?? ''))) return [];
  const stage = mapSalesTaskToStage(record.current_task_description);
  if (stage.kind !== 'stage' || !['lead', 'quoted', 'follow_up', 'on_hold'].includes(stage.status) ||
      stage.status !== String(record.sales_status ?? '').trim().toLowerCase()) return [];
  const prior = record?.smartsheet_sync_snapshot;
  if (!record.smartsheet_last_synced_at || !prior ||
      !Object.prototype.hasOwnProperty.call(prior, column) ||
      !remoteSnapshot || !Object.prototype.hasOwnProperty.call(remoteSnapshot, column)) return [];
  const local = String(record.current_task_description ?? '').trim();
  const before = String(prior[column] ?? '').trim();
  const remote = String(remoteSnapshot[column] ?? '').trim();
  if (!local || !before || local === before || remote !== local) return [];
  return (reviews || []).filter(review =>
    review?.id && review?.dataset === 'sales' && review?.status === 'approved' &&
    review?.decision === 'app' && review?.field_name === 'current_task_description' &&
    String(review.entity_id) === String(record.id) &&
    String(review.sheet_id) === String(record.smartsheet_sheet_id) &&
    String(review.row_id) === String(record.smartsheet_row_id) &&
    String(review.column_id) === column &&
    String(review.local_value ?? '').trim() === local &&
    String(review.remote_value ?? '').trim() === before
  ).map(review => String(review.id));
}

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
