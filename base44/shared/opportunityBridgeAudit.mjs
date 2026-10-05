import { isSmartsheetSalesImportShell } from './smartsheetSalesImportEligibility.mjs';
import { isLegacyTerminalSmartsheetSalesRecord } from './historicalSalesOutcomeReconciliation.mjs';

const clean = (value) => String(value ?? '').trim();
const normalizedAlias = (value) => clean(value).toLowerCase();
const numericId = (value) => /^\d+$/.test(clean(value));
const LEGACY_TERMINAL_TASK_PATTERN = /^(lost\b|completed sale\b|closed\b)/i;

export const OPPORTUNITY_BRIDGE_DECISIONS = Object.freeze({
  SAFE_AUTO: 'safe_auto_bridge',
  MANUAL_REVIEW: 'manual_review',
  ALREADY_LINKED: 'already_linked',
  NOT_SALES_SCOPE: 'not_sales_scope',
  SMARTSHEET_SHELL: 'smartsheet_shell',
});

export function classifyWorkOrderSalesScope(workOrder = {}) {
  if (workOrder?.deleted === true || workOrder?.is_rider === true) return 'excluded';
  const modern = workOrder?.in_pipeline === true;
  if (modern && !['won', 'lost'].includes(workOrder?.sales_status) && isSmartsheetSalesImportShell(workOrder)) {
    return 'smartsheet_shell';
  }
  if (modern && !['won', 'lost'].includes(workOrder?.sales_status) && isLegacyTerminalSmartsheetSalesRecord(workOrder)) {
    return 'legacy_history';
  }
  if (modern && !['won', 'lost'].includes(workOrder?.sales_status)) return 'current';
  if (modern && ['won', 'lost'].includes(workOrder?.sales_status)) return 'outcome';
  if (!modern && LEGACY_TERMINAL_TASK_PATTERN.test(clean(workOrder?.current_task_description))) {
    return 'legacy_history';
  }
  if (workOrder?.completed === false) return 'all_records_only';
  return 'other';
}

export function legacyTerminalTaskKind(workOrder = {}) {
  const task = clean(workOrder?.current_task_description).toLowerCase();
  if (/^lost\b/.test(task)) return 'lost';
  if (/^completed sale\b/.test(task)) return 'won';
  if (/^closed\b/.test(task)) return 'closed';
  return '';
}

export function opportunityStageFromWorkOrder(workOrder = {}, scope = classifyWorkOrderSalesScope(workOrder)) {
  const status = clean(workOrder?.sales_status).toLowerCase();
  const modernMap = {
    lead: 'new',
    quoted: 'quoted',
    follow_up: 'follow_up',
    on_hold: 'on_hold',
    won: 'won',
    lost: 'lost',
  };
  if (scope === 'current' || scope === 'outcome') return modernMap[status] || 'new';
  if (scope === 'legacy_history') {
    const terminal = legacyTerminalTaskKind(workOrder);
    if (terminal === 'won' || terminal === 'lost') return terminal;
  }
  return '';
}

function completeSmartsheetKey(workOrder = {}) {
  const sheet = clean(workOrder?.smartsheet_sheet_id);
  const row = clean(workOrder?.smartsheet_row_id);
  return numericId(sheet) && numericId(row) ? `${sheet}:${row}` : '';
}

function hasPartialOrMalformedSmartsheetIdentity(workOrder = {}) {
  const sheet = clean(workOrder?.smartsheet_sheet_id);
  const row = clean(workOrder?.smartsheet_row_id);
  if (!sheet && !row) return false;
  return !(numericId(sheet) && numericId(row));
}

function mapById(rows = []) {
  return new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => clean(row?.id))
    .map((row) => [clean(row.id), row]));
}

function countIndex(rows, getKey) {
  const counts = new Map();
  for (const row of rows) {
    const key = clean(getKey(row));
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function approvedAliasIndex(customers = []) {
  const aliases = new Map();
  for (const customer of customers) {
    const id = clean(customer?.id);
    if (!id) continue;
    for (const aliasValue of Array.isArray(customer?.legacy_client_names) ? customer.legacy_client_names : []) {
      const alias = normalizedAlias(aliasValue);
      if (!alias) continue;
      if (!aliases.has(alias)) aliases.set(alias, new Set());
      aliases.get(alias).add(id);
    }
  }
  return aliases;
}

function resolveCustomerAnchor(workOrder, customerById, aliasIndex) {
  const directId = clean(workOrder?.customer_id);
  if (directId) {
    return customerById.has(directId)
      ? { customer_id: directId, source: 'work_order_customer_id', error: '' }
      : { customer_id: '', source: '', error: 'missing_customer_id_target' };
  }

  const alias = normalizedAlias(workOrder?.client_name);
  const approvedIds = alias ? [...(aliasIndex.get(alias) || [])] : [];
  if (approvedIds.length === 1) {
    return { customer_id: approvedIds[0], source: 'approved_legacy_client_name', error: '' };
  }
  if (approvedIds.length > 1) {
    return { customer_id: '', source: '', error: 'ambiguous_approved_customer_alias' };
  }
  return { customer_id: '', source: 'unresolved_allowed', error: '' };
}

function requirementFromFlags(yes, no) {
  if (yes === true && no !== true) return 'yes';
  if (no === true && yes !== true) return 'no';
  return 'unknown';
}

function propertyRelationship(workOrder = {}) {
  const choices = [
    ['owner', workOrder?.customer_is_building_owner === true],
    ['tenant', workOrder?.customer_is_tenant === true],
    ['agent', workOrder?.customer_is_marketing_co === true],
  ].filter(([, active]) => active).map(([value]) => value);
  return choices.length === 1 ? choices[0] : 'unknown';
}

function validDateTime(value) {
  const text = clean(value);
  return text && Number.isFinite(Date.parse(text)) ? text : '';
}

export function proposedOpportunityFromWorkOrder(workOrder = {}, { resolvedCustomerId = '', customerResolutionSource = '' } = {}) {
  const id = clean(workOrder?.id);
  const scope = classifyWorkOrderSalesScope(workOrder);
  const stage = opportunityStageFromWorkOrder(workOrder, scope);
  const electricalRequired = [
    workOrder?.electrical_ibi,
    workOrder?.electrical_nkyei,
    workOrder?.electrical_nec,
    workOrder?.electrical_city,
    workOrder?.electrical_county,
  ].some((value) => value === true);

  const proposed = {
    creation_request_key: id ? `workorder:${id}:opportunity:v1` : '',
    customer_display_name: clean(workOrder?.client_name),
    compatibility_work_order_id: id,
    title: clean(workOrder?.title) || clean(workOrder?.client_name),
    job_description: clean(workOrder?.description),
    stage,
    salesperson: clean(workOrder?.sales_rep),
    lead_source: clean(workOrder?.lead_source),
    origination: clean(workOrder?.origination),
    permit_requirement: ['yes', 'no', 'maybe', 'na'].includes(clean(workOrder?.permitting).toLowerCase())
      ? clean(workOrder.permitting).toLowerCase()
      : 'unknown',
    installation_requirement: requirementFromFlags(workOrder?.install_yes, workOrder?.install_no),
    removal_requirement: requirementFromFlags(workOrder?.removal_yes, workOrder?.removal_no),
    electrical_requirement: electricalRequired ? 'yes' : 'unknown',
    property_relationship: propertyRelationship(workOrder),
    next_action: clean(workOrder?.current_task_description),
    next_action_due: clean(workOrder?.current_task_deadline),
    next_action_assignee: clean(workOrder?.current_task_assigned_to),
    source_summary: {
      bridge_source: 'workorder',
      work_order_id: id,
      sales_scope: scope,
      sales_status: clean(workOrder?.sales_status),
      in_pipeline: workOrder?.in_pipeline === true,
      completed: workOrder?.completed === true,
      estimate_id: clean(workOrder?.estimate_id),
      work_order_customer_id: clean(workOrder?.customer_id),
      resolved_customer_source: customerResolutionSource,
      smartsheet_sheet_id: clean(workOrder?.smartsheet_sheet_id),
      smartsheet_row_id: clean(workOrder?.smartsheet_row_id),
      sales_import_source_id: clean(workOrder?.sales_import_source_id),
      date_initial_contact: clean(workOrder?.date_initial_contact),
      date_estimate_sent: clean(workOrder?.date_estimate_sent),
      date_order_created: clean(workOrder?.date_order_created),
      expected_close_date: clean(workOrder?.expected_close_date),
      close_date: clean(workOrder?.close_date),
      follow_up_date: clean(workOrder?.follow_up_date),
      lost_reason: clean(workOrder?.lost_reason),
      budget_less_than: workOrder?.budget_less_than ?? null,
      install_location: clean(workOrder?.install_location),
      contact_name: clean(workOrder?.contact_name),
      contact_email: clean(workOrder?.contact_email),
      contact_phone: clean(workOrder?.contact_phone),
      representative: clean(workOrder?.representative),
    },
  };

  if (resolvedCustomerId) proposed.customer_id = clean(resolvedCustomerId);
  const stageChangedAt = validDateTime(workOrder?.sales_stage_changed_at);
  const lastActivityAt = validDateTime(workOrder?.sales_last_activity_at);
  if (stageChangedAt) proposed.stage_changed_at = stageChangedAt;
  if (lastActivityAt) proposed.last_activity_at = lastActivityAt;

  return proposed;
}

export function buildOpportunityBridgeAudit({
  workOrders = [],
  customers = [],
  estimates = [],
  opportunities = [],
} = {}) {
  const allWorkOrders = Array.isArray(workOrders) ? workOrders : [];
  const customerRows = Array.isArray(customers) ? customers : [];
  const estimateRows = Array.isArray(estimates) ? estimates : [];
  const opportunityRows = Array.isArray(opportunities) ? opportunities : [];

  const customerById = mapById(customerRows);
  const estimateById = mapById(estimateRows);
  const opportunityById = mapById(opportunityRows);
  const aliasIndex = approvedAliasIndex(customerRows);

  const salesCandidates = allWorkOrders.filter((workOrder) =>
    ['current', 'outcome', 'legacy_history'].includes(classifyWorkOrderSalesScope(workOrder))
  );

  const estimateCounts = countIndex(salesCandidates, (row) => row?.estimate_id);
  const smartsheetCounts = countIndex(salesCandidates, completeSmartsheetKey);
  const importSourceCounts = countIndex(salesCandidates, (row) => row?.sales_import_source_id);

  const rows = allWorkOrders.map((workOrder) => {
    const scope = classifyWorkOrderSalesScope(workOrder);
    const id = clean(workOrder?.id);

    if (scope === 'excluded' || scope === 'other' || scope === 'all_records_only') {
      return {
        work_order_id: id,
        sales_scope: scope,
        decision: OPPORTUNITY_BRIDGE_DECISIONS.NOT_SALES_SCOPE,
        evidence_strength: 'none',
        review_reasons: [],
      };
    }
    if (scope === 'smartsheet_shell') {
      return {
        work_order_id: id,
        sales_scope: scope,
        decision: OPPORTUNITY_BRIDGE_DECISIONS.SMARTSHEET_SHELL,
        evidence_strength: 'none',
        review_reasons: ['smartsheet_import_shell'],
      };
    }

    const review = [];
    if (!id) review.push('missing_work_order_id');
    if (!clean(workOrder?.title) && !clean(workOrder?.client_name)) review.push('missing_display_identity');

    const terminalKind = legacyTerminalTaskKind(workOrder);
    if (scope === 'current' && terminalKind) review.push('open_status_terminal_task_conflict');
    if (scope === 'outcome') {
      const status = clean(workOrder?.sales_status).toLowerCase();
      if (status === 'won' && terminalKind && terminalKind !== 'won') review.push('won_status_terminal_task_conflict');
      if (status === 'lost' && terminalKind === 'won') review.push('lost_status_completed_sale_conflict');
    }
    if (scope === 'legacy_history' && terminalKind === 'closed') {
      review.push('legacy_closed_stage_ambiguous');
    }

    const smartsheetKey = completeSmartsheetKey(workOrder);
    if (hasPartialOrMalformedSmartsheetIdentity(workOrder)) review.push('partial_or_malformed_smartsheet_identity');
    if (smartsheetKey && (smartsheetCounts.get(smartsheetKey) || 0) > 1) review.push('duplicate_smartsheet_identity');

    const importSourceId = clean(workOrder?.sales_import_source_id);
    if (importSourceId && (importSourceCounts.get(importSourceId) || 0) > 1) review.push('duplicate_sales_import_source_id');

    const customerResolution = resolveCustomerAnchor(workOrder, customerById, aliasIndex);
    if (customerResolution.error) review.push(customerResolution.error);

    const estimateId = clean(workOrder?.estimate_id);
    let estimate = null;
    if (estimateId) {
      if ((estimateCounts.get(estimateId) || 0) > 1) review.push('duplicate_estimate_id');
      estimate = estimateById.get(estimateId) || null;
      if (!estimate) {
        review.push('missing_estimate_id_target');
      } else {
        const estimateWorkOrderId = clean(estimate?.work_order_id);
        if (estimateWorkOrderId && estimateWorkOrderId !== id) review.push('estimate_work_order_conflict');
        const estimateCustomerId = clean(estimate?.customer_id);
        if (estimateCustomerId && customerResolution.customer_id && estimateCustomerId !== customerResolution.customer_id) {
          review.push('estimate_customer_conflict');
        }
        const estimateOpportunityId = clean(estimate?.opportunity_id);
        const workOrderOpportunityId = clean(workOrder?.opportunity_id);
        if (estimateOpportunityId && estimateOpportunityId !== workOrderOpportunityId) {
          review.push('estimate_already_links_other_opportunity');
        }
      }
    }

    const linkedOpportunityId = clean(workOrder?.opportunity_id);
    let linkedOpportunity = null;
    if (linkedOpportunityId) {
      linkedOpportunity = opportunityById.get(linkedOpportunityId) || null;
      if (!linkedOpportunity) {
        review.push('missing_linked_opportunity');
      } else {
        const compatibilityId = clean(linkedOpportunity?.compatibility_work_order_id);
        if (compatibilityId && compatibilityId !== id) review.push('opportunity_work_order_conflict');
      }
    }

    let evidenceStrength = 'source_work_order_only';
    if (smartsheetKey || (estimateId && estimate)) evidenceStrength = 'strong_stable_anchor';
    else if (customerResolution.customer_id || importSourceId) evidenceStrength = 'verified_secondary_anchor';

    let decision = OPPORTUNITY_BRIDGE_DECISIONS.SAFE_AUTO;
    if (review.length) decision = OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW;
    else if (linkedOpportunityId && linkedOpportunity) decision = OPPORTUNITY_BRIDGE_DECISIONS.ALREADY_LINKED;

    const proposedOpportunity = proposedOpportunityFromWorkOrder(workOrder, {
      resolvedCustomerId: customerResolution.customer_id,
      customerResolutionSource: customerResolution.source,
    });

    return {
      work_order_id: id,
      sales_scope: scope,
      decision,
      evidence_strength: evidenceStrength,
      review_reasons: [...new Set(review)],
      anchors: {
        estimate_id: estimateId,
        customer_id: customerResolution.customer_id,
        customer_resolution_source: customerResolution.source,
        smartsheet_key: smartsheetKey,
        sales_import_source_id: importSourceId,
        existing_opportunity_id: linkedOpportunityId,
      },
      proposed_opportunity: proposedOpportunity,
    };
  });

  const summary = {
    total_work_orders_examined: rows.length,
    sales_candidates: rows.filter((row) => ['current', 'outcome', 'legacy_history'].includes(row.sales_scope)).length,
    current: rows.filter((row) => row.sales_scope === 'current').length,
    outcome: rows.filter((row) => row.sales_scope === 'outcome').length,
    legacy_history: rows.filter((row) => row.sales_scope === 'legacy_history').length,
    all_records_only: rows.filter((row) => row.sales_scope === 'all_records_only').length,
    smartsheet_shells: rows.filter((row) => row.sales_scope === 'smartsheet_shell').length,
    safe_auto_bridge: rows.filter((row) => row.decision === OPPORTUNITY_BRIDGE_DECISIONS.SAFE_AUTO).length,
    manual_review: rows.filter((row) => row.decision === OPPORTUNITY_BRIDGE_DECISIONS.MANUAL_REVIEW).length,
    already_linked: rows.filter((row) => row.decision === OPPORTUNITY_BRIDGE_DECISIONS.ALREADY_LINKED).length,
    not_sales_scope: rows.filter((row) => row.decision === OPPORTUNITY_BRIDGE_DECISIONS.NOT_SALES_SCOPE).length,
    by_evidence_strength: {},
    review_reason_counts: {},
  };

  for (const row of rows) {
    if (row.evidence_strength && row.evidence_strength !== 'none') {
      summary.by_evidence_strength[row.evidence_strength] = (summary.by_evidence_strength[row.evidence_strength] || 0) + 1;
    }
    for (const reason of row.review_reasons || []) {
      summary.review_reason_counts[reason] = (summary.review_reason_counts[reason] || 0) + 1;
    }
  }

  return { rows, summary };
}
