const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const numericId = value => {
  const text = clean(value, 40);
  return /^\d+$/.test(text) && text !== '0' ? text : '';
};

function cellLabel(row, columnId, max = 240) {
  if (!numericId(columnId)) return '';
  const cell = (row?.cells || []).find(item => String(item?.column_id ?? item?.columnId ?? '') === String(columnId));
  if (!cell) return '';
  const display = clean(cell?.display_value ?? cell?.displayValue, max);
  if (display) return display;
  const value = cell?.value;
  if (value == null || value === '') return '';
  if (typeof value === 'object') return clean(value?.name || value?.email || '', max);
  return clean(value, max);
}

const normalizedEvidenceText = value => clean(value, 400).toLowerCase().replace(/\s+/g, ' ');
const placeholderEvidence = value => {
  const text = normalizedEvidenceText(value);
  if (!text) return true;
  return /^(?:test|testing|placeholder|sample|n\/?a|none|-|smartsheet row(?: \d+)?)$/.test(text);
};

function normalizedOrderIdentity(order) {
  return {
    customer_name: normalizedEvidenceText(order?.customer_name),
    description: normalizedEvidenceText(order?.description),
    request_type: normalizedEvidenceText(order?.request_type),
    quantity: normalizedEvidenceText(order?.quantity),
  };
}

export function classifyRemoteUnlinkedOrderRow(summary, activeLinkedOrders = []) {
  const identity = {
    customer_name: normalizedEvidenceText(summary?.customer_name),
    description: normalizedEvidenceText(summary?.description),
    request_type: normalizedEvidenceText(summary?.request_type),
    quantity: normalizedEvidenceText(summary?.quantity),
  };
  const values = Object.values(identity).filter(Boolean);
  if (values.length === 0 || values.every(placeholderEvidence)) {
    return {
      kind: 'blank_or_placeholder',
      reason: 'The unlinked Smartsheet row has no meaningful Order identity fields, or only obvious placeholder/test values. Review only; do not auto-delete it.',
      candidate_links: [],
    };
  }

  // A visible-data match is only a review hint. Require both customer and
  // description to match exactly, and never use this evidence to establish a link.
  const duplicateCandidates = (Array.isArray(activeLinkedOrders) ? activeLinkedOrders : [])
    .filter(order => {
      const candidate = normalizedOrderIdentity(order);
      if (!identity.customer_name || !identity.description ||
          candidate.customer_name !== identity.customer_name ||
          candidate.description !== identity.description) return false;
      if (identity.request_type && candidate.request_type && identity.request_type !== candidate.request_type) return false;
      if (identity.quantity && candidate.quantity && identity.quantity !== candidate.quantity) return false;
      return Boolean(numericId(order?.smartsheet_row_id));
    })
    .slice(0, 3)
    .map(order => ({
      base44_order_id: clean(order?.id, 180),
      linked_smartsheet_row_id: numericId(order?.smartsheet_row_id),
      customer_name: clean(order?.customer_name, 180),
      description: clean(order?.description, 320),
    }));

  if (duplicateCandidates.length > 0) {
    return {
      kind: 'duplicate_looking_historical',
      reason: 'Visible customer and description exactly match an active Base44 Order that is already linked to a different permanent Smartsheet row. This is duplicate-looking evidence only, never proof of identity.',
      candidate_links: duplicateCandidates,
    };
  }

  if (!identity.customer_name || !identity.description) {
    return {
      kind: 'sparse_unlinked_row',
      reason: 'The row contains some Order data but lacks either customer or description. Preserve it for review; there is not enough identity evidence to infer a relationship.',
      candidate_links: [],
    };
  }

  return {
    kind: 'populated_unlinked_order',
    reason: 'The row contains a customer and description but has no active Base44 Order linked to its permanent row ID. Treat it as a genuine unlinked Order candidate until reviewed.',
    candidate_links: [],
  };
}

export function orderRemoteRowIdentitySummary(row, bindings) {
  return {
    row_id: numericId(row?.id),
    row_number: Number.isFinite(Number(row?.row_number)) ? Number(row.row_number) : null,
    customer_name: cellLabel(row, bindings?.customer_name, 180),
    request_type: cellLabel(row, bindings?.request_type, 120),
    description: cellLabel(row, bindings?.description, 320),
    quantity: cellLabel(row, bindings?.quantity, 80),
  };
}

function remoteRowSummary(row, bindings, activeLinkedOrders = []) {
  const summary = orderRemoteRowIdentitySummary(row, bindings);
  const evidence = classifyRemoteUnlinkedOrderRow(summary, activeLinkedOrders);
  return { ...summary, evidence_kind: evidence.kind, evidence_reason: evidence.reason,
    candidate_links: evidence.candidate_links };
}

export function classifyOrderUnlinkedReviewHint(order) {
  const customer = clean(order?.customer_name, 180).toLowerCase();
  const description = clean(order?.description, 320).toLowerCase();
  const createdBy = clean(order?.created_by || order?.created_by_id, 180).toLowerCase();
  const hasSyncEvidence = Boolean(
    clean(order?.smartsheet_sheet_id, 40) ||
    clean(order?.smartsheet_row_id, 40) ||
    order?.smartsheet_sync_snapshot ||
    clean(order?.smartsheet_last_synced_at, 80) ||
    order?.smartsheet_create_attempt ||
    order?.smartsheet_pending_local_sync === true
  );
  const hasBusinessRelationship = Boolean(clean(order?.customer_id, 180) || clean(order?.work_order_id, 180));
  const obviousTestText = customer.includes('test') && description.includes('test');
  if (!hasSyncEvidence && !hasBusinessRelationship && createdBy === 'anonymous' && obviousTestText) {
    return {
      kind: 'likely_historical_test_artifact',
      reason: 'Anonymous unlinked Order with no customer/job relationship or sync evidence and explicit test-only customer/description text. Review before hiding or retiring; no automatic cleanup is performed.',
    };
  }
  return { kind: 'unlinked_order', reason: '' };
}

function orderSummary(order) {
  const reviewHint = classifyOrderUnlinkedReviewHint(order);
  return {
    base44_order_id: clean(order?.id, 180),
    customer_name: clean(order?.customer_name, 180),
    description: clean(order?.description, 320),
    status: clean(order?.status, 80),
    smartsheet_sheet_id: clean(order?.smartsheet_sheet_id, 40),
    smartsheet_row_id: clean(order?.smartsheet_row_id, 40),
    pending_local_sync: order?.smartsheet_pending_local_sync === true,
    create_attempt_status: clean(order?.smartsheet_create_attempt?.status, 80),
    created_date: clean(order?.created_date, 80),
    updated_date: clean(order?.updated_date, 80),
    created_by: clean(order?.created_by || order?.created_by_id, 180),
    review_hint: reviewHint.kind,
    review_hint_reason: reviewHint.reason,
  };
}

export function auditOrderPermanentLinks(orders, sheetRows, configuredSheetId, bindings = {}) {
  const sheetId = numericId(configuredSheetId);
  if (!sheetId || !Array.isArray(orders) || !Array.isArray(sheetRows)) {
    throw new Error('A configured permanent Order Request sheet ID and complete Order/Smartsheet arrays are required.');
  }

  const remoteById = new Map();
  for (const row of sheetRows) {
    const rowId = numericId(row?.id);
    if (!rowId || remoteById.has(rowId)) {
      throw new Error('Order link audit received an invalid or repeated permanent Smartsheet row ID.');
    }
    remoteById.set(rowId, row);
  }

  const activeOrders = orders.filter(order => order && order.deleted !== true);
  const configuredLinks = new Map();
  const categories = {
    base44_unlinked: [],
    invalid_base44_row_id: [],
    wrong_sheet_link: [],
    duplicate_base44_row_link: [],
    linked_row_missing_remote: [],
    unlinked_smartsheet_row: [],
  };
  const counts = {
    active_base44_orders: activeOrders.length,
    linked_to_configured_sheet: 0,
    matched_permanent_links: 0,
    base44_unlinked: 0,
    base44_unlinked_likely_test_artifacts: 0,
    invalid_base44_row_id: 0,
    wrong_sheet_link: 0,
    duplicate_base44_row_ids: 0,
    duplicate_base44_link_records: 0,
    linked_row_missing_remote: 0,
    smartsheet_rows_examined: sheetRows.length,
    unlinked_smartsheet_rows: 0,
    remote_blank_or_placeholder: 0,
    remote_duplicate_looking_historical: 0,
    remote_sparse_unlinked: 0,
    remote_populated_unlinked: 0,
  };

  for (const order of activeOrders) {
    const rowRaw = clean(order?.smartsheet_row_id, 40);
    const orderSheet = clean(order?.smartsheet_sheet_id, 40);
    if (!rowRaw) {
      counts.base44_unlinked++;
      const summary = orderSummary(order);
      if (summary.review_hint === 'likely_historical_test_artifact') counts.base44_unlinked_likely_test_artifacts++;
      if (categories.base44_unlinked.length < 100) categories.base44_unlinked.push(summary);
      continue;
    }
    const rowId = numericId(rowRaw);
    if (!rowId) {
      counts.invalid_base44_row_id++;
      if (categories.invalid_base44_row_id.length < 100) categories.invalid_base44_row_id.push(orderSummary(order));
      continue;
    }
    if (orderSheet !== sheetId) {
      counts.wrong_sheet_link++;
      if (categories.wrong_sheet_link.length < 100) categories.wrong_sheet_link.push(orderSummary(order));
      continue;
    }
    counts.linked_to_configured_sheet++;
    const linked = configuredLinks.get(rowId) || [];
    linked.push(order);
    configuredLinks.set(rowId, linked);
  }

  for (const [rowId, linked] of configuredLinks) {
    if (linked.length > 1) {
      counts.duplicate_base44_row_ids++;
      counts.duplicate_base44_link_records += linked.length;
      if (categories.duplicate_base44_row_link.length < 100) {
        categories.duplicate_base44_row_link.push({
          row_id: rowId,
          remote_row_present: remoteById.has(rowId),
          orders: linked.slice(0, 10).map(orderSummary),
        });
      }
      continue;
    }
    if (!remoteById.has(rowId)) {
      counts.linked_row_missing_remote++;
      if (categories.linked_row_missing_remote.length < 100) {
        categories.linked_row_missing_remote.push({ ...orderSummary(linked[0]), remote_row_present: false });
      }
      continue;
    }
    counts.matched_permanent_links++;
  }

  const activeLinkedOrders = activeOrders.filter(order =>
    clean(order?.smartsheet_sheet_id, 40) === sheetId && numericId(order?.smartsheet_row_id));
  for (const [rowId, row] of remoteById) {
    if (!configuredLinks.has(rowId)) {
      counts.unlinked_smartsheet_rows++;
      const summary = remoteRowSummary(row, bindings, activeLinkedOrders);
      if (summary.evidence_kind === 'blank_or_placeholder') counts.remote_blank_or_placeholder++;
      else if (summary.evidence_kind === 'duplicate_looking_historical') counts.remote_duplicate_looking_historical++;
      else if (summary.evidence_kind === 'sparse_unlinked_row') counts.remote_sparse_unlinked++;
      else if (summary.evidence_kind === 'populated_unlinked_order') counts.remote_populated_unlinked++;
      if (categories.unlinked_smartsheet_row.length < 100) {
        categories.unlinked_smartsheet_row.push(summary);
      }
    }
  }

  const actionRequired =
    counts.base44_unlinked +
    counts.invalid_base44_row_id +
    counts.wrong_sheet_link +
    counts.duplicate_base44_row_ids +
    counts.linked_row_missing_remote +
    counts.unlinked_smartsheet_rows;

  return {
    read_only: true,
    sheet_id: sheetId,
    counts,
    link_health: {
      action_required: actionRequired,
      clean: actionRequired === 0,
    },
    records_by_category: categories,
    record_lists_truncated: Object.fromEntries(
      Object.entries(categories).map(([key, rows]) => {
        const total = key === 'base44_unlinked' ? counts.base44_unlinked
          : key === 'invalid_base44_row_id' ? counts.invalid_base44_row_id
          : key === 'wrong_sheet_link' ? counts.wrong_sheet_link
          : key === 'duplicate_base44_row_link' ? counts.duplicate_base44_row_ids
          : key === 'linked_row_missing_remote' ? counts.linked_row_missing_remote
          : counts.unlinked_smartsheet_rows;
        return [key, total > rows.length];
      })
    ),
  };
}
