import { orderSmartsheetCreateNeedsReview, recoverableOrderSmartsheetCreate } from './smartsheetOrderCreateSafety.mjs';

// Order Form only. Call with a fully verified, single-version Smartsheet sheet download.
// Row existence is evidence, never proof of which unlinked POST created a row.
const id = (value) => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};
const label = (value, max = 180) => String(value ?? '').trim().slice(0, max);

// Row-count and version checks alone cannot prove which sheet supplied the evidence.
// Reject an absent or mismatched permanent sheet identity on every response page.
export function verifyOrderCreateAuditSheetIdentity(body, configuredSheetId) {
  const expectedId = id(configuredSheetId);
  if (!expectedId || id(body?.id) !== expectedId) {
    throw new Error('Smartsheet did not confirm the configured permanent Order Request sheet ID.');
  }
  return expectedId;
}

export function auditOrderCreateAttempts(orders, sheetRows, configuredSheetId) {
  const sheetId = id(configuredSheetId);
  if (!sheetId || !Array.isArray(orders) || !Array.isArray(sheetRows)) {
    throw new Error('A configured permanent sheet ID and complete Order/Smartsheet arrays are required.');
  }
  const remoteIds = new Set();
  for (const row of sheetRows) {
    const rowId = id(row?.id);
    if (!rowId || remoteIds.has(rowId)) {
      throw new Error('Create-attempt audit received an invalid or repeated permanent Smartsheet row ID.');
    }
    remoteIds.add(rowId);
  }

  // Count all active links, including Orders that have no create-attempt marker.
  const linkCounts = new Map();
  for (const order of orders) {
    if (order?.deleted || id(order?.smartsheet_sheet_id) !== sheetId) continue;
    const rowId = id(order?.smartsheet_row_id);
    if (rowId) linkCounts.set(rowId, (linkCounts.get(rowId) || 0) + 1);
  }

  const categories = ['verified_link', 'ambiguous', 'missing_row'];
  const counts = Object.fromEntries(categories.map((category) => [category, 0]));
  const records = Object.fromEntries(categories.map((category) => [category, []]));
  let unresolvedMarkers = 0;
  let totalMarkers = 0;
  let retrySyncRecoverable = 0;
  let manualInvestigationRequired = 0;

  for (const order of orders) {
    const marker = order?.smartsheet_create_attempt;
    if (!marker) continue;
    totalMarkers++;
    if (orderSmartsheetCreateNeedsReview(order)) unresolvedMarkers++;

    const markerSheetId = id(marker?.sheet_id);
    const orderSheetId = id(order?.smartsheet_sheet_id);
    const markerRowId = id(marker?.row_id);
    const orderRowId = id(order?.smartsheet_row_id);
    const knownRowId = markerRowId || orderRowId;
    const duplicate = (markerRowId && (linkCounts.get(markerRowId) || 0) > 1)
      || (orderRowId && (linkCounts.get(orderRowId) || 0) > 1);
    let category;
    let reason;
    let recoveryState = 'manual_investigation';
    let recommendedAction = 'Manual Smartsheet investigation required. Do not retry creation until permanent-ID evidence is reconciled.';

    if (markerSheetId !== sheetId || (orderSheetId && orderSheetId !== sheetId)) {
      category = 'ambiguous';
      reason = 'The stored marker or Order sheet ID does not match the configured Order Request sheet.';
    } else if (markerRowId && orderRowId && markerRowId !== orderRowId) {
      category = 'ambiguous';
      reason = 'The marker and Order contain different permanent row IDs.';
    } else if (duplicate) {
      category = 'ambiguous';
      reason = 'Multiple active Base44 Orders link to this permanent Smartsheet row.';
    } else if (!knownRowId) {
      category = 'ambiguous';
      reason = 'No permanent row ID was recorded. A successful POST cannot be ruled out by searching names or row positions.';
    } else if (!remoteIds.has(knownRowId)) {
      category = 'missing_row';
      reason = 'The known permanent row ID was absent from the verified complete Order Request sheet download.';
    } else if (
      marker?.status === 'linked' &&
      markerRowId && markerRowId === orderRowId &&
      markerSheetId === sheetId && orderSheetId === sheetId &&
      !order?.deleted
    ) {
      category = 'verified_link';
      reason = 'The marker, active Base44 Order and existing Smartsheet row share the same permanent sheet and row IDs.';
      recoveryState = 'none';
      recommendedAction = 'No recovery action is required.';
    } else {
      category = 'ambiguous';
      reason = 'A row with the recorded permanent ID exists, but the creation marker or Base44 link is not fully verified.';
    }

    const structurallyRecoverable = Boolean(recoverableOrderSmartsheetCreate(order, sheetId));
    if (
      category === 'ambiguous' &&
      structurallyRecoverable &&
      order?.smartsheet_pending_local_sync === true &&
      remoteIds.has(markerRowId)
    ) {
      recoveryState = 'retry_sync_recoverable';
      recommendedAction = 'Retry Sync can safely attempt recovery. It will re-read this exact permanent Smartsheet row and verify the durable create snapshot before linking; it will not send another POST.';
      retrySyncRecoverable++;
    } else if (category !== 'verified_link') {
      manualInvestigationRequired++;
    }

    counts[category]++;
    if (records[category].length < 100) {
      records[category].push({
        base44_record_id: label(order?.id),
        customer_name: label(order?.customer_name),
        description: label(order?.description, 300),
        deleted: order?.deleted === true,
        marker_status: label(marker?.status, 60) || 'Unknown',
        attempt_id: label(marker?.attempt_id, 160),
        started_at: label(marker?.started_at, 60),
        linked_at: label(marker?.linked_at, 60),
        marker_sheet_id: label(marker?.sheet_id, 40),
        marker_row_id: label(marker?.row_id, 40),
        base44_sheet_id: label(order?.smartsheet_sheet_id, 40),
        base44_row_id: label(order?.smartsheet_row_id, 40),
        remote_row_present: markerSheetId === sheetId && knownRowId
          ? remoteIds.has(knownRowId) : null,
        marker_needs_review: orderSmartsheetCreateNeedsReview(order),
        recovery_state: recoveryState,
        recommended_action: recommendedAction,
        retry_sync_recoverable: recoveryState === 'retry_sync_recoverable',
        reason,
      });
    }
  }

  return {
    read_only: true,
    sheet_id: sheetId,
    total_orders_examined: orders.length,
    total_markers: totalMarkers,
    unresolved_markers: unresolvedMarkers,
    retry_sync_recoverable: retrySyncRecoverable,
    manual_investigation_required: manualInvestigationRequired,
    smartsheet_rows_examined: sheetRows.length,
    counts,
    records_by_category: records,
    record_lists_truncated: Object.fromEntries(categories.map((category) =>
      [category, counts[category] > records[category].length])),
  };
}
