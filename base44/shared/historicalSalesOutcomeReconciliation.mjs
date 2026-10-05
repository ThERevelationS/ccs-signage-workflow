const clean = (value) => String(value ?? '').trim();

export const HISTORICAL_SALES_RECONCILIATION = Object.freeze({
  DETERMINISTIC_WON: 'deterministic_won',
  MANUAL_REVIEW: 'manual_review',
  NOT_CONFLICT: 'not_conflict',
});

export function historicalTerminalTaskFamily(value) {
  const task = clean(value);
  if (/^completed sales?(?:$|\s*-)/i.test(task)) return 'completed_sale';
  if (/^lost(?:$|\s*-)/i.test(task)) return 'lost';
  if (/^closed(?:$|\s*-)/i.test(task)) return 'closed';
  return '';
}

export function historicalTerminalTaskSubtype(value) {
  const task = clean(value).toLowerCase();
  if (/^completed sales?\b/.test(task)) return task === 'completed sale' ? 'completed_sale' : 'completed_sale_variant';
  if (/^lost\s*-\s*we took too long\b/.test(task)) return 'lost_too_long';
  if (/^lost\b/.test(task)) return 'lost';
  if (/^closed\s*-\s*did not lose\b/.test(task)) return 'closed_did_not_lose';
  if (/^closed\s*-\s*attempted follow-up\/no response\b/.test(task)) return 'closed_no_response';
  if (/^closed\b/.test(task)) return 'closed_other';
  return '';
}

export function isValidHistoricalDate(value) {
  const raw = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}

export function isHistoricalSalesStatusConflict(workOrder = {}) {
  const family = historicalTerminalTaskFamily(workOrder?.current_task_description);
  const status = clean(workOrder?.sales_status).toLowerCase();
  return workOrder?.in_pipeline === true &&
    !['won', 'lost'].includes(status) &&
    Boolean(family);
}

export function hasModernSalesWorkflowEvidence(workOrder = {}) {
  const modernTextFields = [
    'opportunity_id',
    'sales_stage_changed_at',
    'sales_last_activity_at',
    'sales_last_follow_up_completed_at',
    'sales_last_follow_up_outcome',
    'close_date',
    'lost_reason',
    'follow_up_date',
    'expected_close_date',
  ];
  if (modernTextFields.some((field) => clean(workOrder?.[field]))) return true;
  const probability = workOrder?.probability;
  return probability !== undefined && probability !== null && clean(probability) !== '';
}

export function isLegacyTerminalSmartsheetSalesRecord(workOrder = {}) {
  if (!isHistoricalSalesStatusConflict(workOrder)) return false;
  const sheetId = clean(workOrder?.smartsheet_sheet_id);
  const rowId = clean(workOrder?.smartsheet_row_id);
  if (!/^\d+$/.test(sheetId) || !/^\d+$/.test(rowId)) return false;
  return !hasModernSalesWorkflowEvidence(workOrder);
}

export function historicalSalesOutcomeEvidence(workOrder = {}) {
  const rawOrderDate = clean(workOrder?.date_order_created);
  const validOrderDate = isValidHistoricalDate(rawOrderDate);
  const weak = [];

  if (clean(workOrder?.est_inv_at)) weak.push('est_inv_at');
  if (Number.isFinite(Number(workOrder?.estimate_amount)) && Number(workOrder.estimate_amount) !== 0) weak.push('estimate_amount');
  if (clean(workOrder?.date_estimate_sent)) weak.push('date_estimate_sent');
  if (clean(workOrder?.project_install_date)) weak.push('project_install_date');
  if (clean(workOrder?.site_survey_date)) weak.push('site_survey_date');
  if (clean(workOrder?.permit_number) || clean(workOrder?.permit_approved_date) || clean(workOrder?.permit_receipt_confirmed_date)) {
    weak.push('permit_evidence');
  }

  return {
    order_created_raw: rawOrderDate,
    valid_order_created: validOrderDate,
    invalid_order_created: Boolean(rawOrderDate) && !validOrderDate,
    weak_context_fields: weak,
  };
}

export function reconcileHistoricalSalesOutcome(workOrder = {}) {
  if (!isHistoricalSalesStatusConflict(workOrder)) {
    return {
      work_order_id: clean(workOrder?.id),
      decision: HISTORICAL_SALES_RECONCILIATION.NOT_CONFLICT,
      proposed_stage: '',
      safe_for_bridge: false,
      family: historicalTerminalTaskFamily(workOrder?.current_task_description),
      subtype: historicalTerminalTaskSubtype(workOrder?.current_task_description),
      reasons: [],
      evidence: historicalSalesOutcomeEvidence(workOrder),
    };
  }

  const family = historicalTerminalTaskFamily(workOrder.current_task_description);
  const subtype = historicalTerminalTaskSubtype(workOrder.current_task_description);
  const evidence = historicalSalesOutcomeEvidence(workOrder);
  const reasons = [];

  // Existing CCS conversion semantics set BOTH sales_status=won and date_order_created
  // at approved Estimate -> WorkOrder conversion. For historical rows, terminal task
  // text alone is not authoritative; Completed Sale + a valid Order Created date gives
  // two independent captured business facts pointing in the same direction.
  if (family === 'completed_sale' && evidence.valid_order_created) {
    return {
      work_order_id: clean(workOrder?.id),
      decision: HISTORICAL_SALES_RECONCILIATION.DETERMINISTIC_WON,
      proposed_stage: 'won',
      safe_for_bridge: true,
      family,
      subtype,
      reasons: ['completed_sale_plus_valid_order_created'],
      evidence,
    };
  }

  if (evidence.invalid_order_created) reasons.push('invalid_order_created_date');

  if (family === 'completed_sale') {
    reasons.push('completed_sale_task_not_authoritative_without_valid_order_created');
  } else if (family === 'lost') {
    reasons.push(
      evidence.valid_order_created
        ? 'lost_task_conflicts_with_order_created'
        : 'lost_task_lacks_authoritative_loss_evidence'
    );
  } else if (family === 'closed') {
    reasons.push(
      evidence.valid_order_created
        ? 'closed_task_ambiguous_with_order_created'
        : 'closed_task_has_no_authoritative_outcome'
    );
  }

  return {
    work_order_id: clean(workOrder?.id),
    decision: HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW,
    proposed_stage: '',
    safe_for_bridge: false,
    family,
    subtype,
    reasons: [...new Set(reasons)],
    evidence,
  };
}

export function summarizeTerminalTaskReversals(historyRows = []) {
  const rows = Array.isArray(historyRows) ? historyRows : [];
  const reversals = rows.filter((row) =>
    clean(row?.entity_type) === 'WorkOrder' &&
    clean(row?.field_name) === 'current_task_description' &&
    historicalTerminalTaskFamily(row?.old_value) &&
    !historicalTerminalTaskFamily(row?.new_value)
  );
  const byOldFamily = {};
  for (const row of reversals) {
    const family = historicalTerminalTaskFamily(row.old_value);
    byOldFamily[family] = (byOldFamily[family] || 0) + 1;
  }
  return { count: reversals.length, by_old_family: byOldFamily, reversals };
}

export function buildHistoricalSalesReconciliationAudit(workOrders = [], historyRows = []) {
  const reconciliations = (Array.isArray(workOrders) ? workOrders : [])
    .filter(isHistoricalSalesStatusConflict)
    .map(reconcileHistoricalSalesOutcome);

  const countBy = (selector) => {
    const out = {};
    for (const item of reconciliations) {
      const key = selector(item) || '(blank)';
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };

  const reviewReasonCounts = {};
  for (const item of reconciliations) {
    for (const reason of item.reasons || []) {
      reviewReasonCounts[reason] = (reviewReasonCounts[reason] || 0) + 1;
    }
  }

  return {
    rows: reconciliations,
    summary: {
      conflicts: reconciliations.length,
      deterministic_won: reconciliations.filter((item) => item.decision === HISTORICAL_SALES_RECONCILIATION.DETERMINISTIC_WON).length,
      manual_review: reconciliations.filter((item) => item.decision === HISTORICAL_SALES_RECONCILIATION.MANUAL_REVIEW).length,
      by_family: countBy((item) => item.family),
      by_subtype: countBy((item) => item.subtype),
      review_reason_counts: reviewReasonCounts,
      terminal_task_reversals: summarizeTerminalTaskReversals(historyRows),
    },
  };
}
