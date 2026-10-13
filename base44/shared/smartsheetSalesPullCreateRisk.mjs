import { loadAllEntityRows } from './pagedEntityRows.ts';
import { salesSmartsheetCreateNeedsReview } from './smartsheetSalesCreateSafety.mjs';

const id = (value) => String(value ?? '').trim();

// A complete configured-sheet linked read must never pick an arbitrary Sales
// WorkOrder when multiple records own the same permanent Smartsheet row.
// Include soft-deleted records: their old permanent IDs remain ownership
// evidence. This is a prewrite safety gate, NOT database-enforced uniqueness.
export function classifySalesPullDuplicateLinkedRowRisks(records = [], sheetId = '') {
  const sheet = id(sheetId);
  if (!/^\d+$/.test(sheet) || sheet === '0' || !Array.isArray(records)) {
    throw new Error('Sales duplicate-link review requires a numeric sheet ID and complete linked WorkOrders.');
  }
  const ownersByRow = new Map();
  for (const record of records) {
    const rowId = id(record?.smartsheet_row_id);
    if (!/^\d+$/.test(rowId) || rowId === '0' ||
        id(record?.smartsheet_sheet_id) !== sheet) continue;
    const ownerId = id(record?.id);
    if (!ownerId) throw new Error('Sales linked WorkOrder ownership is missing an ID. No pull is safe.');
    if (!ownersByRow.has(rowId)) ownersByRow.set(rowId, new Set());
    ownersByRow.get(rowId).add(ownerId);
  }
  const duplicates = [...ownersByRow.entries()].filter(([,owners]) => owners.size > 1)
    .sort(([a],[b]) => a.localeCompare(b, undefined, {numeric:true}));
  return {
    count: duplicates.length,
    permanent_row_ids: duplicates.map(([rowId]) => rowId).slice(0,20),
    workorder_ids: [...new Set(duplicates.flatMap(([,owners]) => [...owners]))].slice(0,20),
    rows_truncated: duplicates.length > 20,
  };
}

// Unresolved Sales POSTs cannot be matched to Smartsheet rows by customer,
// title, Notes, row position, or cell values. A reservation may have NO
// top-level smartsheet_sheet_id or smartsheet_row_id, so the normal linked
// WorkOrder query cannot find it. Only the durable attempt records count.
export function classifySalesPullCreateAttemptRisks(records = [], sheetId = '') {
  const sheet = id(sheetId);
  if (!/^\d+$/.test(sheet)) throw new Error('A verified Sales Smartsheet sheet ID is required.');
  const review = [];
  for (const record of records || []) {
    if (!record?.smartsheet_create_attempt ||
        !salesSmartsheetCreateNeedsReview(record)) continue;
    const markerSheet = id(record.smartsheet_create_attempt?.sheet_id);
    const linkedSheet = id(record.smartsheet_sheet_id);
    // A malformed/missing marker sheet identity cannot prove the attempt
    // belongs to a DIFFERENT sheet; conservatively hold imports for review.
    if (/^\d+$/.test(markerSheet) && markerSheet !== sheet) continue;
    if (!/^\d+$/.test(markerSheet) && /^\d+$/.test(linkedSheet) && linkedSheet !== sheet) continue;
    review.push({
      workorder_id: id(record.id),
      status: id(record.smartsheet_create_attempt?.status) || 'unknown',
      row_id: /^\d+$/.test(id(record.smartsheet_create_attempt?.row_id))
        ? id(record.smartsheet_create_attempt.row_id) : '',
    });
  }
  return {
    count: review.length,
    workorder_ids: review.map((item) => item.workorder_id).filter(Boolean).slice(0, 20),
    attempt_states: review.reduce((out, item) => {
      out[item.status] = (out[item.status] || 0) + 1;
      return out;
    }, {}),
    known_permanent_row_ids: review.map((item) => item.row_id).filter(Boolean).slice(0, 20),
  };
}

export function classifySalesPullLinkedRowRisks(records = [], sheetId = '', plannedRowIds = []) {
  const sheet = id(sheetId);
  if (!/^\d+$/.test(sheet) || !Array.isArray(records) || !Array.isArray(plannedRowIds) ||
      plannedRowIds.some(row => !/^\d+$/.test(id(row)) || id(row) === '0')) {
    throw new Error('Sales import requires complete linked records and exact permanent row IDs.');
  }
  const planned = new Set(plannedRowIds.map(id));
  const claims = new Map();
  for (const record of records) {
    const row = id(record?.smartsheet_row_id);
    if (!planned.has(row)) continue;
    const owner = id(record?.id);
    if (!owner) throw new Error('Unidentified WorkOrder owns a planned Sales import row.');
    const linkedSheet = id(record?.smartsheet_sheet_id);
    if (/^\d+$/.test(linkedSheet) && linkedSheet !== sheet) continue;
    claims.set(owner + ':' + row, {workorder_id:owner,row_id:row});
  }
  const review = [...claims.values()];
  return {
    count: review.length,
    workorder_ids: [...new Set(review.map(item => item.workorder_id))].slice(0,20),
    known_permanent_row_ids: [...new Set(review.map(item => item.row_id))].slice(0,20),
  };
}

// Legacy linked rows may have no sheet ID, so scan permanent row links
// independently of the normal sheet-scoped Sales lookup before import.
export async function readSalesPullLinkedRowRisks(entity, sheetId, plannedRowIds) {
  if (!Array.isArray(plannedRowIds) || !plannedRowIds.length) {
    return classifySalesPullLinkedRowRisks([], sheetId, plannedRowIds);
  }
  const linked = await loadAllEntityRows({
    entity,
    query: { smartsheet_row_id: { $exists: true } },
    sort: 'id',
    label: 'Sales pull permanent row ownership pre-import verification',
  });
  return classifySalesPullLinkedRowRisks(linked, sheetId, plannedRowIds);
}

// Sales push must not PUT into a row owned by another WorkOrder, even if that
// other record is outside Current Pipeline, soft-deleted, or missing a sheet ID.
// This is a complete read preflight; without a database unique index it narrows
// but cannot eliminate a concurrent cross-record claim race.
export function classifySalesPushRowOwnershipRisks(linkedRecords = [], sheetId = '', selectedRecords = []) {
  const sheet = id(sheetId);
  if (!/^\d+$/.test(sheet) || sheet === '0' ||
      !Array.isArray(linkedRecords) || !Array.isArray(selectedRecords)) {
    throw new Error('Sales push ownership review requires a numeric sheet and complete records.');
  }
  const planned = new Map();
  for (const record of selectedRecords) {
    const rowId = id(record?.smartsheet_row_id);
    if (id(record?.smartsheet_sheet_id) !== sheet || !/^\d+$/.test(rowId) || rowId === '0') continue;
    const ownerId = id(record?.id);
    if (!ownerId) throw new Error('Sales push candidate lacks a permanent WorkOrder ID.');
    if (!planned.has(rowId)) planned.set(rowId, new Set());
    planned.get(rowId).add(ownerId);
  }
  const found = new Map([...planned.keys()].map(rowId => [rowId, new Set()]));
  for (const record of linkedRecords) {
    const rowId = id(record?.smartsheet_row_id);
    if (!planned.has(rowId)) continue;
    const linkedSheet = id(record?.smartsheet_sheet_id);
    // A known different sheet is independent. Unknown or malformed sheet
    // identity remains competing evidence, including deleted WorkOrders.
    if (/^\d+$/.test(linkedSheet) && linkedSheet !== sheet) continue;
    const ownerId = id(record?.id);
    if (!ownerId) throw new Error('Sales push row claim lacks a WorkOrder ID.');
    found.get(rowId).add(ownerId);
  }
  const conflicts = [...planned.entries()].filter(([rowId, owners]) => {
    const observed = found.get(rowId);
    return owners.size !== 1 || observed.size !== 1 ||
      ![...owners].every(owner => observed.has(owner));
  });
  return {
    count: conflicts.length,
    permanent_row_ids: conflicts.map(([rowId]) => rowId).slice(0, 20),
    workorder_ids: [...new Set(conflicts.flatMap(([rowId, owners]) =>
      [...owners, ...found.get(rowId)]))].slice(0, 20),
    rows_truncated: conflicts.length > 20,
  };
}

export async function readSalesPushRowOwnershipRisks(entity, sheetId, selectedRecords) {
  if (!Array.isArray(selectedRecords)) throw new Error('Sales push selected records are incomplete.');
  const plannedRowIds = [...new Set(selectedRecords
    .filter(record => id(record?.smartsheet_sheet_id) === id(sheetId))
    .map(record => id(record?.smartsheet_row_id))
    .filter(rowId => /^\d+$/.test(rowId) && rowId !== '0'))];
  if (!plannedRowIds.length) return classifySalesPushRowOwnershipRisks([], sheetId, selectedRecords);
  // Scope to exact permanent rows; still includes off-pipeline and deleted
  // claimants. Paged reader rejects incomplete response windows.
  const linked = await loadAllEntityRows({
    entity, query: { smartsheet_row_id: { $in: plannedRowIds } },
    sort: 'id', label: 'Sales push permanent row ownership prewrite verification',
  });
  return classifySalesPushRowOwnershipRisks(linked, sheetId, selectedRecords);
}

export async function readSalesPullCreateAttemptRisks(entity, sheetId) {
  // Server-scoped indexed-style filtering, not a legacy WorkOrder archive
  // download. A failed/incomplete paged read fails closed before bulkCreate.
  const attempts = await loadAllEntityRows({
    entity,
    query: { smartsheet_create_attempt: { $exists: true } },
    sort: 'id',
    label: 'Sales pull durable Smartsheet create attempt review',
  });
  return classifySalesPullCreateAttemptRisks(attempts, sheetId);
}
