import { salesSnapshotsEqual } from './smartsheetSalesSafety.mjs';
import { salesSmartsheetCreateNeedsReview } from './smartsheetSalesCreateSafety.mjs';

const str = value => String(value ?? '').trim();
const numeric = value => /^\d+$/.test(str(value)) && str(value) !== '0';

export function summarizeSalesCreateAttempts(records = [], sheetId = '') {
  if (!numeric(sheetId)) throw new Error('Sales sheet ID must be numeric.');
  const cases = [];
  for (const record of records) {
    if (!record?.smartsheet_create_attempt || !salesSmartsheetCreateNeedsReview(record)) continue;
    const attempt = record.smartsheet_create_attempt;
    if (numeric(attempt.sheet_id) && str(attempt.sheet_id) !== str(sheetId)) continue;
    if (!numeric(attempt.sheet_id) && numeric(record.smartsheet_sheet_id) &&
        str(record.smartsheet_sheet_id) !== str(sheetId)) continue;
    cases.push({
      workorder_id: str(record.id),
      status: str(attempt.status) || 'unknown',
      recorded_row_id: numeric(attempt.row_id) ? str(attempt.row_id) : '',
    });
  }
  return { count: cases.length, cases: cases.slice(0, 40), truncated: cases.length > 40 };
}

export function classifySalesCreateReview({record, sheetId, rowId, bindings,
    remoteSnapshot, remoteVerified, otherLinkedRecords = [], otherAttempts = []} = {}) {
  if (!numeric(sheetId) || !numeric(rowId)) throw new Error('An explicit numeric sheet ID and permanent row ID are required.');
  if (!record?.id || !record.smartsheet_create_attempt ||
      !salesSmartsheetCreateNeedsReview(record)) throw new Error('No unresolved Sales creation marker exists.');
  if (record.deleted === true) throw new Error('Deleted Sales records cannot be linked.');
  const attempt = record.smartsheet_create_attempt;
  if (numeric(attempt.sheet_id) && str(attempt.sheet_id) !== str(sheetId)) throw new Error('Creation attempt belongs to a different sheet.');
  if (numeric(record.smartsheet_sheet_id) && str(record.smartsheet_sheet_id) !== str(sheetId)) throw new Error('WorkOrder belongs to another sheet.');
  if (numeric(record.smartsheet_row_id)) throw new Error('WorkOrder already has a permanent row ID.');
  const otherIds = [...new Set([...otherLinkedRecords, ...otherAttempts]
    .map(r => str(r?.id)).filter(id => id && id !== str(record.id)))];
  const expected = attempt.expected_snapshot;
  const columns = [...new Set(Object.values(bindings || {}).map(str).filter(numeric))];
  const complete = !!expected && typeof expected === 'object' &&
    !Array.isArray(expected) && columns.length > 0 &&
    columns.every(column => Object.hasOwn(expected,column));
  const match = !!remoteVerified && complete &&
    salesSnapshotsEqual(expected, remoteSnapshot, str(bindings?.current_task_assigned_to));
  const recordedRowId = numeric(attempt.row_id) ? str(attempt.row_id) : '';
  const classification = otherIds.length ? 'competing_claim' :
    recordedRowId && recordedRowId !== str(rowId) ? 'recorded_id_mismatch' :
    !remoteVerified ? 'remote_unverified' :
    !complete ? 'snapshot_incomplete' :
    !match ? 'values_mismatch' :
    attempt.status !== 'created_unlinked' || !recordedRowId ? 'uncertain_attempt' :
    'verified_candidate';
  return {
    workorder_id: str(record.id), workorder_version: str(record.updated_date),
    sheet_id: str(sheetId), entered_row_id: str(rowId),
    attempt_status: str(attempt.status), attempt_id: str(attempt.attempt_id),
    recorded_row_id: recordedRowId, remote_row_verified: !!remoteVerified,
    snapshot_complete: complete, values_match: !!match,
    competing_workorder_ids: otherIds.slice(0,10),
    competing_claim_count: otherIds.length,
    classification,
    eligible_for_future_guarded_recovery: classification === 'verified_candidate',
    read_only: true, writes_attempted: false,
  };
}
