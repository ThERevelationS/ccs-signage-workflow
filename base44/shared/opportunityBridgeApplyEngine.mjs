import { sameFoundationValue } from './opportunityFoundationPersistence.mjs';
import {
  bridgeSourceSnapshot,
  opportunityBridgeReceiptKey,
} from './opportunityBridgeExecutionPlan.mjs';
import {
  OPPORTUNITY_BRIDGE_DRY_RUN,
  bridgeSourceSnapshotsEqual,
  opportunityBridgeReceiptState,
} from './opportunityBridgeDryRunPlanner.mjs';

const clean = (value) => String(value ?? '').trim();

export const OPPORTUNITY_BRIDGE_APPLY_STATUS = Object.freeze({
  LINKED: 'linked',
  ALREADY_LINKED: 'already_linked',
  HELD: 'held',
});

function requiredAdapter(adapter = {}) {
  for (const method of [
    'getWorkOrder',
    'findOpportunities',
    'createOpportunity',
    'getOpportunity',
    'linkWorkOrderIfUnchanged',
  ]) {
    if (typeof adapter?.[method] !== 'function') {
      throw new Error(`Opportunity bridge apply adapter requires ${method}().`);
    }
  }
  return adapter;
}

function proposalIdentityErrors(proposal = {}, workOrderId = '') {
  const errors = [];
  const id = clean(workOrderId);
  const key = opportunityBridgeReceiptKey(id);
  if (!id) errors.push('missing_work_order_id');
  if (!key || clean(proposal?.creation_request_key) !== key) errors.push('creation_request_key_mismatch');
  if (clean(proposal?.compatibility_work_order_id) !== id) errors.push('compatibility_work_order_id_mismatch');
  if (!clean(proposal?.title)) errors.push('missing_opportunity_title');
  return errors;
}

export function opportunityMatchesBridgeProposal(opportunity = {}, proposal = {}) {
  if (!clean(opportunity?.id)) return false;
  return Object.keys(proposal || {}).every((field) =>
    sameFoundationValue(opportunity?.[field], proposal?.[field])
  );
}

function receiptBase({ planRow, sourceSnapshot, resultCode = '', details = {} }) {
  return {
    operation_key: clean(planRow?.receipt_key) || opportunityBridgeReceiptKey(planRow?.work_order_id),
    work_order_id: clean(planRow?.work_order_id),
    planned_action: clean(planRow?.action),
    source_snapshot: sourceSnapshot || planRow?.source_snapshot || {},
    result_code: resultCode,
    ...details,
  };
}

function held(planRow, sourceSnapshot, code, details = {}) {
  return {
    ...receiptBase({ planRow, sourceSnapshot, resultCode:code, details }),
    status: OPPORTUNITY_BRIDGE_APPLY_STATUS.HELD,
  };
}

async function readReceiptState(adapter, workOrderId) {
  const matches = await adapter.findOpportunities({
    workOrderId,
    receiptKey: opportunityBridgeReceiptKey(workOrderId),
  });
  if (!Array.isArray(matches)) throw new Error('Opportunity receipt lookup did not return a record list.');
  return opportunityBridgeReceiptState(matches, workOrderId);
}

function receiptStateHoldCode(state) {
  if (state === 'duplicate_identity') return 'receipt_duplicate_identity';
  if (state === 'identity_conflict') return 'receipt_identity_conflict';
  if (state === 'incomplete_existing_identity') return 'receipt_incomplete_existing_identity';
  if (state === 'invalid_source_identity') return 'receipt_invalid_source_identity';
  return '';
}

export async function executeOpportunityBridgePlanRow({
  planRow,
  adapter,
} = {}) {
  const store = requiredAdapter(adapter);
  const workOrderId = clean(planRow?.work_order_id);
  const proposal = planRow?.proposed_opportunity && typeof planRow.proposed_opportunity === 'object'
    ? planRow.proposed_opportunity
    : null;
  const plannedAction = clean(planRow?.action);

  if (!workOrderId) return held(planRow, planRow?.source_snapshot, 'missing_work_order_id');
  if (![OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_CREATE, OPPORTUNITY_BRIDGE_DRY_RUN.PROPOSE_RECOVER_LINK,
    OPPORTUNITY_BRIDGE_DRY_RUN.ALREADY_LINKED].includes(plannedAction)) {
    return held(planRow, planRow?.source_snapshot, 'plan_row_not_apply_eligible');
  }
  if (!proposal) return held(planRow, planRow?.source_snapshot, 'missing_opportunity_proposal');

  const identityErrors = proposalIdentityErrors(proposal, workOrderId);
  if (identityErrors.length) {
    return held(planRow, planRow?.source_snapshot, 'invalid_opportunity_proposal_identity', { identity_errors:identityErrors });
  }

  const loaded = await store.getWorkOrder(workOrderId);
  if (!loaded?.id) return held(planRow, planRow?.source_snapshot, 'source_work_order_missing');
  if (!bridgeSourceSnapshotsEqual(planRow?.source_snapshot || {}, loaded)) {
    return held(planRow, bridgeSourceSnapshot(loaded), 'stale_source_snapshot');
  }

  let receipt;
  try {
    receipt = await readReceiptState(store, workOrderId);
  } catch (error) {
    return held(planRow, bridgeSourceSnapshot(loaded), 'receipt_lookup_failed', {
      error_message: clean(error?.message),
    });
  }

  const preflightHold = receiptStateHoldCode(receipt.state);
  if (preflightHold) {
    return held(planRow, bridgeSourceSnapshot(loaded), preflightHold, {
      receipt_matching_ids: receipt.matching_ids || [],
    });
  }

  let opportunity = receipt.opportunity || null;
  let createStatus = opportunity ? 'reused_preflight' : '';

  if (opportunity && !opportunityMatchesBridgeProposal(opportunity, proposal)) {
    return held(planRow, bridgeSourceSnapshot(loaded), 'existing_opportunity_differs_from_proposal', {
      opportunity_id: clean(opportunity.id),
    });
  }

  if (!opportunity) {
    let createError = null;
    try {
      opportunity = await store.createOpportunity(proposal);
      createStatus = 'created_acknowledged';
    } catch (error) {
      createError = error;
      opportunity = null;
    }

    let recovered;
    try {
      recovered = await readReceiptState(store, workOrderId);
    } catch (error) {
      return held(planRow, bridgeSourceSnapshot(loaded), 'create_outcome_unverifiable', {
        create_error_message: clean(createError?.message),
        recovery_error_message: clean(error?.message),
      });
    }

    const postCreateHold = receiptStateHoldCode(recovered.state);
    if (postCreateHold) {
      return held(planRow, bridgeSourceSnapshot(loaded), postCreateHold, {
        create_error_message: clean(createError?.message),
        receipt_matching_ids: recovered.matching_ids || [],
      });
    }
    if (recovered.state !== 'matched_existing' || !recovered.opportunity?.id) {
      return held(planRow, bridgeSourceSnapshot(loaded), 'create_outcome_unverifiable', {
        create_error_message: clean(createError?.message),
      });
    }

    if (opportunity?.id && clean(opportunity.id) !== clean(recovered.opportunity.id)) {
      return held(planRow, bridgeSourceSnapshot(loaded), 'create_receipt_conflict', {
        acknowledged_opportunity_id: clean(opportunity.id),
        recovered_opportunity_id: clean(recovered.opportunity.id),
      });
    }

    opportunity = recovered.opportunity;
    if (!opportunityMatchesBridgeProposal(opportunity, proposal)) {
      return held(planRow, bridgeSourceSnapshot(loaded), 'created_opportunity_differs_from_proposal', {
        opportunity_id: clean(opportunity.id),
      });
    }
    if (createError) createStatus = 'created_recovered_after_error';
    else if (!createStatus) createStatus = 'recovered_existing';
  }

  const opportunityId = clean(opportunity?.id);
  if (!opportunityId) return held(planRow, bridgeSourceSnapshot(loaded), 'opportunity_id_missing_after_create');

  const beforeLink = await store.getWorkOrder(workOrderId);
  if (!beforeLink?.id) return held(planRow, planRow?.source_snapshot, 'source_work_order_missing_before_link');

  const linkedId = clean(beforeLink?.opportunity_id);
  if (linkedId) {
    if (linkedId !== opportunityId) {
      return held(planRow, bridgeSourceSnapshot(beforeLink), 'work_order_opportunity_link_conflict', {
        opportunity_id: opportunityId,
        conflicting_opportunity_id: linkedId,
      });
    }
    const verifiedOpportunity = await store.getOpportunity(opportunityId).catch(() => null);
    if (!verifiedOpportunity?.id ||
        clean(verifiedOpportunity.creation_request_key) !== opportunityBridgeReceiptKey(workOrderId) ||
        clean(verifiedOpportunity.compatibility_work_order_id) !== workOrderId) {
      return held(planRow, bridgeSourceSnapshot(beforeLink), 'post_link_opportunity_verification_failed', {
        opportunity_id: opportunityId,
      });
    }
    return {
      ...receiptBase({
        planRow,
        sourceSnapshot:bridgeSourceSnapshot(beforeLink),
        resultCode:'bridge_already_linked',
        details:{ opportunity_id:opportunityId, create_status:createStatus || 'reused' },
      }),
      status:OPPORTUNITY_BRIDGE_APPLY_STATUS.ALREADY_LINKED,
    };
  }

  if (!bridgeSourceSnapshotsEqual(planRow?.source_snapshot || {}, beforeLink)) {
    return held(planRow, bridgeSourceSnapshot(beforeLink), 'stale_source_snapshot_before_link', {
      opportunity_id: opportunityId,
      create_status:createStatus,
    });
  }

  let linkError = null;
  try {
    await store.linkWorkOrderIfUnchanged({
      workOrderId,
      opportunityId,
      expectedSnapshot:bridgeSourceSnapshot(beforeLink),
    });
  } catch (error) {
    linkError = error;
  }

  const afterLink = await store.getWorkOrder(workOrderId).catch(() => null);
  const verifiedOpportunity = await store.getOpportunity(opportunityId).catch(() => null);
  if (!afterLink?.id ||
      clean(afterLink.opportunity_id) !== opportunityId ||
      !verifiedOpportunity?.id ||
      clean(verifiedOpportunity.creation_request_key) !== opportunityBridgeReceiptKey(workOrderId) ||
      clean(verifiedOpportunity.compatibility_work_order_id) !== workOrderId) {
    return held(planRow, afterLink ? bridgeSourceSnapshot(afterLink) : planRow?.source_snapshot, 'link_outcome_unverifiable', {
      opportunity_id:opportunityId,
      create_status:createStatus,
      link_error_message:clean(linkError?.message),
    });
  }

  return {
    ...receiptBase({
      planRow,
      sourceSnapshot:bridgeSourceSnapshot(afterLink),
      resultCode:linkError ? 'bridge_link_recovered_after_error' : 'bridge_linked',
      details:{
        opportunity_id:opportunityId,
        create_status:createStatus,
        link_status:linkError ? 'recovered_after_error' : 'linked_acknowledged',
      },
    }),
    status:OPPORTUNITY_BRIDGE_APPLY_STATUS.LINKED,
  };
}
