const clean = value => String(value ?? '').trim();
const numericId = value => {
  const text = clean(value);
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};

export const MAX_ORDER_IMPORT_AUDIT_ROW_IDS = 25;

export function validateOrderImportAuditRowIds(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_ORDER_IMPORT_AUDIT_ROW_IDS) {
    throw new Error(`Provide between 1 and ${MAX_ORDER_IMPORT_AUDIT_ROW_IDS} permanent Smartsheet row IDs per audit.`);
  }
  const ids = values.map(numericId);
  if (ids.some(id => !id)) throw new Error('Every audit row ID must be a positive numeric permanent Smartsheet row ID.');
  if (new Set(ids).size !== ids.length) throw new Error('Repeated row IDs are not allowed in one audit batch.');
  return ids;
}

function normalizedValue(value) {
  if (value == null || value === '') return '';
  return typeof value === 'number' ? String(value) : String(value).trim();
}

function compareSnapshots(left, right, bindings = {}) {
  const columns = [...new Set(Object.values(bindings || {}).map(numericId).filter(Boolean))];
  const mismatchedColumns = columns.filter(columnId =>
    normalizedValue(left?.[columnId]) !== normalizedValue(right?.[columnId]));
  const fieldsByColumn = new Map();
  for (const [field, value] of Object.entries(bindings || {})) {
    const columnId = numericId(value);
    if (!columnId) continue;
    const fields = fieldsByColumn.get(columnId) || [];
    fields.push(field);
    fieldsByColumn.set(columnId, fields);
  }
  return {
    matches: mismatchedColumns.length === 0,
    mismatched_fields: mismatchedColumns.map(columnId => ({
      column_id: columnId,
      fields: fieldsByColumn.get(columnId) || [],
    })),
  };
}

function markerState(order) {
  if (!Object.prototype.hasOwnProperty.call(order || {}, 'smartsheet_pending_local_sync')) return 'absent';
  if (order.smartsheet_pending_local_sync === true) return 'true';
  if (order.smartsheet_pending_local_sync === false) return 'false';
  return 'other';
}

function isSnapshot(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function buildOrderHistoricalImportEvidence({
  orders, rowIds, remoteRows, configuredSheetId, bindings, localSnapshots,
}) {
  const ids = validateOrderImportAuditRowIds(rowIds);
  const sheetId = numericId(configuredSheetId);
  if (!sheetId || !Array.isArray(orders) || !Array.isArray(remoteRows)) {
    throw new Error('A configured Order sheet and complete local/remote audit inputs are required.');
  }

  const remoteById = new Map();
  for (const row of remoteRows) {
    const id = numericId(row?.id);
    if (!id || remoteById.has(id)) throw new Error('The remote audit contains a missing or repeated permanent row ID.');
    remoteById.set(id, row);
  }

  const localMarkerCounts = { true: 0, false: 0, absent: 0, other: 0 };
  const missingPermanentIdOrders = [];
  const invalidPermanentIdOrders = [];
  const claimsByRowId = new Map();
  for (const order of orders) {
    if (!order || order.deleted === true) {
      // Deleted rows still participate in identity ownership and marker counts.
    }
    localMarkerCounts[markerState(order)]++;
    const orderSheet = clean(order?.smartsheet_sheet_id);
    const rowText = clean(order?.smartsheet_row_id);
    if (!rowText) {
      if (orderSheet === sheetId) missingPermanentIdOrders.push(clean(order?.id));
      continue;
    }
    const rowId = numericId(rowText);
    if (!rowId) {
      if (orderSheet === sheetId) invalidPermanentIdOrders.push(clean(order?.id));
      continue;
    }
    if (orderSheet !== sheetId) continue;
    const claims = claimsByRowId.get(rowId) || [];
    claims.push(order);
    claimsByRowId.set(rowId, claims);
  }

  const rows = ids.map(rowId => {
    const remoteRow = remoteById.get(rowId) || null;
    const remoteSnapshot = remoteRow?.remote_snapshot || {};
    const claims = claimsByRowId.get(rowId) || [];
    const summaries = claims.map(order => {
      const storedSnapshot = isSnapshot(order.smartsheet_sync_snapshot) ? order.smartsheet_sync_snapshot : null;
      const localSnapshot = localSnapshots?.[clean(order.id)] || {};
      const localComparison = compareSnapshots(localSnapshot, remoteSnapshot, bindings);
      const savedComparison = storedSnapshot
        ? compareSnapshots(storedSnapshot, remoteSnapshot, bindings)
        : { matches: false, mismatched_fields: [] };
      return {
        order_id: clean(order.id),
        deleted: order.deleted === true,
        marker_state: markerState(order),
        last_synced_at: clean(order.smartsheet_last_synced_at) || null,
        snapshot_available: Boolean(storedSnapshot),
        local_matches_remote: localComparison.matches,
        local_mismatched_fields: localComparison.mismatched_fields,
        saved_snapshot_matches_remote: savedComparison.matches,
        saved_snapshot_mismatched_fields: savedComparison.mismatched_fields,
      };
    });

    let classification = 'ambiguous';
    if (!remoteRow) classification = 'remote_row_missing';
    else if (claims.length === 0) classification = 'no_local_claim';
    else if (claims.length > 1) classification = 'duplicate_permanent_id_claims';
    else if (claims[0].deleted === true) classification = 'soft_deleted_claim';
    else if (markerState(claims[0]) === 'true') classification = 'pending_local_sync';
    else if (summaries[0].local_matches_remote && summaries[0].saved_snapshot_matches_remote &&
        summaries[0].snapshot_available && summaries[0].last_synced_at) {
      classification = 'currently_aligned_with_remote';
    }

    return {
      row_id: rowId,
      remote_found: Boolean(remoteRow),
      remote_modified_at: clean(remoteRow?.modified_at) || null,
      classification,
      review_required: classification !== 'currently_aligned_with_remote',
      claims: summaries,
    };
  });

  const counts = {
    requested_rows: rows.length,
    currently_aligned_with_remote: rows.filter(row => row.classification === 'currently_aligned_with_remote').length,
    pending_local_sync: rows.filter(row => row.classification === 'pending_local_sync').length,
    duplicate_permanent_id_claims: rows.filter(row => row.classification === 'duplicate_permanent_id_claims').length,
    soft_deleted_claims: rows.filter(row => row.classification === 'soft_deleted_claim').length,
    no_local_claim: rows.filter(row => row.classification === 'no_local_claim').length,
    remote_row_missing: rows.filter(row => row.classification === 'remote_row_missing').length,
    ambiguous: rows.filter(row => row.classification === 'ambiguous').length,
    missing_permanent_id_orders: missingPermanentIdOrders.length,
    invalid_permanent_id_orders: invalidPermanentIdOrders.length,
    local_marker_true: localMarkerCounts.true,
    local_marker_false: localMarkerCounts.false,
    local_marker_absent: localMarkerCounts.absent,
    local_marker_other: localMarkerCounts.other,
  };

  return {
    read_only: true,
    writes_attempted: false,
    sheet_id: sheetId,
    counts,
    missing_permanent_id_order_ids: missingPermanentIdOrders.slice(0, 50),
    invalid_permanent_id_order_ids: invalidPermanentIdOrders.slice(0, 50),
    missing_id_list_truncated: missingPermanentIdOrders.length > 50,
    invalid_id_list_truncated: invalidPermanentIdOrders.length > 50,
    rows,
    interpretation: 'Currently aligned means the unique active local record, saved snapshot, and remote mapped values agree at read time. It does not prove that a historical Excel import was the source or that a marker was ever written. Missing markers remain non-evidence of sync.',
  };
}
