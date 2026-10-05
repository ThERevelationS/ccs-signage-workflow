import {
  OPPORTUNITY_BRIDGE_DECISIONS,
  buildOpportunityBridgeAudit,
} from './opportunityBridgeAudit.mjs';
import {
  HISTORICAL_SALES_RECONCILIATION,
  reconcileHistoricalSalesOutcome,
} from './historicalSalesOutcomeReconciliation.mjs';
import { bridgeSourceSnapshot, opportunityBridgeReceiptKey } from './opportunityBridgeExecutionPlan.mjs';

const clean = (value) => String(value ?? '').trim();
const unique = (values = []) => [...new Set(values.filter(Boolean))];

export const OPPORTUNITY_BRIDGE_DRY_RUN = Object.freeze({
  PROPOSE_CREATE: 'proposed_create',
  PROPOSE_RECOVER_LINK: 'proposed_recover_link',
  HOLD: 'hold',
  ALREADY_LINKED: 'already_linked',
  EXCLUDED: 'excluded',
});

const mapById = (rows = []) => new Map(
  (Array.isArray(rows) ? rows : [])
    .filter((row) => clean(row?.id))
    .map((row) => [clean(row.id), row]),
);

export function bridgeSourceSnapshotsEqual(expected = {}, currentWorkOrder = {}) {
  const current = bridgeSourceSnapshot(currentWorkOrder);
  return Object.keys(current).every((field) => expected?.[field] === current?.[field]);
}

export function opportunityBridgeReceiptState(opportunities = [], workOrderId = '') {
  const id = clean(workOrderId);
  const receiptKey = opportunityBridgeReceiptKey(id);
  if (!id || !receiptKey) {
    return { state:'invalid_source_identity', opportunity:null, receipt_key:receiptKey, matching_ids:[] };
  }
  const rows = Array.isArray(opportunities) ? opportunities : [];
  const byReceipt = rows.filter((row) => clean(row?.creation_request_key) === receiptKey);
  const byCompatibility = rows.filter((row) => clean(row?.compatibility_work_order_id) === id);
  const matchingIds = unique([
    ...byReceipt.map((row) => clean(row?.id)),
    ...byCompatibility.map((row) => clean(row?.id)),
  ]);
  const base = {
    receipt_key: receiptKey,
    matching_ids: matchingIds,
    receipt_match_count: byReceipt.length,
    compatibility_match_count: byCompatibility.length,
  };
  if (byReceipt.length > 1 || byCompatibility.length > 1) {
    return { ...base, state:'duplicate_identity', opportunity:null };
  }
  if (matchingIds.length > 1) return { ...base, state:'identity_conflict', opportunity:null };
  if (matchingIds.length === 0) return { ...base, state:'clear', opportunity:null };
  const opportunity = rows.find((row) => clean(row?.id) === matchingIds[0]) || null;
  if (clean(opportunity?.creation_request_key) !== receiptKey ||
      clean(opportunity?.compatibility_work_order_id) !== id) {
    return { ...base, state:'incomplete_existing_identity', opportunity };
  }
  return { ...base, state:'matched_existing', opportunity };
}

function reconciledOpportunity(proposed, reconciliation) {
  if (reconciliation?.decision !== HISTORICAL_SALES_RECONCILIATION.DETERMINISTIC_WON) return proposed || {};
  return {
    ...(proposed || {}),
    stage:'won',
    source_summary:{
      ...(proposed?.source_summary || {}),
      historical_reconciliation:{
        version:1,
        decision:reconciliation.decision,
        proposed_stage:reconciliation.proposed_stage,
        family:reconciliation.family,
        subtype:reconciliation.subtype,
        reasons:[...(reconciliation.reasons || [])],
        evidence:reconciliation.evidence || {},
      },
    },
  };
}

function expectedSnapshotFor(source, id) {
  if (!source) return null;
  if (source instanceof Map) return source.get(id) || null;
  if (typeof source === 'object') return source[id] || null;
  return null;
}

export function buildOpportunityBridgeDryRunPlan({
  workOrders = [],
  customers = [],
  estimates = [],
  opportunities = [],
  expectedSourceSnapshots = null,
} = {}) {
  const sourceRows = Array.isArray(workOrders) ? workOrders : [];
  const workOrderById = mapById(sourceRows);
  const audit = buildOpportunityBridgeAudit({ workOrders:sourceRows, customers, estimates, opportunities });

  const rows = audit.rows.map((auditRow) => {
    const id = clean(auditRow?.work_order_id);
    const workOrder = workOrderById.get(id) || null;
    const receipt = opportunityBridgeReceiptState(opportunities, id);
    const base = {
      work_order_id:id,
      sales_scope:auditRow?.sales_scope || '',
      source_snapshot:bridgeSourceSnapshot(workOrder || {}),
      receipt_key:opportunityBridgeReceiptKey(id),
      receipt_state:receipt.state,
      audit_decision:auditRow?.decision || '',
      evidence_strength:auditRow?.evidence_strength || 'none',
      anchors:auditRow?.anchors || {},
    };

    if (auditRow?.decision === OPPORTUNITY_BRIDGE_DECISIONS.NOT_SALES_SCOPE) {
      return { ...base, action:OPPORTUNITY_BRIDGE_DRY_RUN.EXCLUDED, reasons:['not_sales_scope'] };
    }
    if (auditRow?.decision === OPPORTUNITY_BRIDGE_DECISIONS.SMARTSHEET_SHELL) {
      return {
        ...base,
        action:OPPORTUNITY_BRIDGE_DRY_RUN.EXCLUDED,
        reasons:unique([...(auditRow?.review_reasons || []), 'smartsheet_import_shell']),
      };
    }
    if (!workOrder) {
      return { ...base, action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD, reasons:['source_work_order_missing'] };
    }

    const expectedSnapshot = expectedSnapshotFor(expectedSourceSnapshots, id);
    if (expectedSnapshot && !bridgeSourceSnapshotsEqual(expectedSnapshot, workOrder)) {
      return { ...base, action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD, reasons:['stale_source_snapshot'] };
    }

    let reconciliation = null;
    let allowed = auditRow?.decision === OPPORTUNITY_BRIDGE_DECISIONS.SAFE_AUTO;
    let reasons = [...(auditRow?.review_reasons || [])];

    if (auditRow?.decision === OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW) {
      reconciliation = reconcileHistoricalSalesOutcome(workOrder);
      const nonHistoricalBlockers = reasons.filter((reason) =>
        !['open_status_terminal_task_conflict', 'legacy_smartsheet_terminal_task_requires_review'].includes(reason)
      );
      if (reconciliation.safe_for_bridge && nonHistoricalBlockers.length === 0) {
        allowed = true;
        reasons = [];
      } else {
        reasons = unique([...reasons, ...(reconciliation.reasons || [])]);
      }
    }
    if (auditRow?.decision === OPPORTUNITY_BRIDGE_DECISIONS.ALREADY_LINKED) allowed = true;

    if (!allowed) {
      return {
        ...base,
        action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD,
        reasons:reasons.length ? reasons : ['bridge_candidate_not_safe'],
        historical_reconciliation:reconciliation,
      };
    }

    if (['duplicate_identity','identity_conflict','incomplete_existing_identity','invalid_source_identity'].includes(receipt.state)) {
      return {
        ...base,
        action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD,
        reasons:[`receipt_${receipt.state}`],
        receipt_matching_ids:receipt.matching_ids || [],
        historical_reconciliation:reconciliation,
      };
    }

    const proposed = reconciledOpportunity(auditRow?.proposed_opportunity || {}, reconciliation);
    const proposal = {
      ...proposed,
      creation_request_key:opportunityBridgeReceiptKey(id),
      compatibility_work_order_id:id,
    };

    if (receipt.state === 'matched_existing') {
      const existingId = clean(receipt.opportunity?.id);
      const linkedId = clean(workOrder?.opportunity_id);
      if (linkedId && linkedId !== existingId) {
        return {
          ...base,
          action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD,
          reasons:['work_order_opportunity_link_conflict'],
          existing_opportunity_id:existingId,
          historical_reconciliation:reconciliation,
        };
      }
      return {
        ...base,
        action:linkedId === existingId ? OPPORTUNITY_BRIDGE_DRY_RUN.ALREADY_LINKED : OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_RECOVER_LINK,
        reasons:[],
        existing_opportunity_id:existingId,
        historical_reconciliation:reconciliation,
        proposed_opportunity:proposal,
      };
    }

    if (clean(workOrder?.opportunity_id)) {
      return {
        ...base,
        action:OPPORTUNITY_BRIDGE_DRY_RUN.HOLD,
        reasons:['work_order_already_links_unmatched_opportunity'],
        historical_reconciliation:reconciliation,
      };
    }

    return {
      ...base,
      action:OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE,
      reasons:[],
      historical_reconciliation:reconciliation,
      proposed_opportunity:proposal,
    };
  });

  const summary = {
    total_work_orders_examined:rows.length,
    sales_candidates:audit.summary.sales_candidates,
    proposed_create:rows.filter((row) => row.action === OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE).length,
    proposed_recover_link:rows.filter((row) => row.action === OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_RECOVER_LINK).length,
    already_linked:rows.filter((row) => row.action === OPPORTUNITY_BRIDGE_DRY_RUN.ALREADY_LINKED).length,
    held:rows.filter((row) => row.action === OPPORTUNITY_BRIDGE_DRY_RUN.HOLD).length,
    excluded:rows.filter((row) => row.action === OPPORTUNITY_BRIDGE_DRY_RUN.EXCLUDED).length,
    historical_deterministic_won:rows.filter((row) =>
      row?.historical_reconciliation?.decision === HISTORICAL_SALES_RECONCILIATION.DETERMINISTIC_WON &&
      [OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE,OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_RECOVER_LINK,OPPORTUNITY_BRIDGE_DRY_RUN.ALREADY_LINKED].includes(row.action)
    ).length,
    hold_reason_counts:{},
  };
  for (const row of rows) {
    if (row.action !== OPPORTUNITY_BRIDGE_DRY_RUN.HOLD) continue;
    for (const reason of row.reasons || []) {
      summary.hold_reason_counts[reason] = (summary.hold_reason_counts[reason] || 0) + 1;
    }
  }
  return { rows, summary, source_audit:audit.summary };
}
