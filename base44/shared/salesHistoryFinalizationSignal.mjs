// A WorkOrder write can succeed before its FieldAudit row is finalized.
// Never treat an uncommitted audit as saved history. Only signal a possible
// incomplete history view when a pending, nontruncated Sales audit still
// matches the loaded WorkOrder. Never return pending values to the client.
import { SALES_OPPORTUNITY_HISTORY_FIELDS } from './salesOpportunityHistory.mjs';

const allowed = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);

const preview = value => typeof value === 'string' ? value : JSON.stringify(value ?? null);
export const SALES_AUDIT_REVIEW_AFTER_MS = 15 * 60 * 1000;

const matchesUnfinalizedAudit = (event, workOrder) =>
  event?.status === 'pending' &&
  allowed.has(event.field_name) &&
  event.entity_type === 'WorkOrder' &&
  event.entity_id === workOrder.id &&
  event.preview_truncated !== true &&
  typeof event.new_value === 'string' &&
  event.new_value === preview(workOrder[event.field_name]);

export function salesHistoryHasUnfinalizedMatchingAudit(pendingRows, workOrder) {
  if (!Array.isArray(pendingRows) || !workOrder) return false;
  return pendingRows.some(event => matchesUnfinalizedAudit(event, workOrder));
}

// Never auto-finalize or discard a pending audit based on value agreement:
// repeated Sales outcomes can share values, and the matching row may be from
// an unrelated save. Instead, distinguish retryable finalization from an
// unresolved review case without returning sensitive audit values.
export function classifySalesHistoryPendingAudits(pendingRows, workOrder, {
  hasMore = false, now = Date.now(),
} = {}) {
  if (!Array.isArray(pendingRows) || !workOrder) return 'unverified';
  const matching = pendingRows.filter(event => matchesUnfinalizedAudit(event, workOrder));
  if (matching.some(event => {
    const created = typeof event.created_date === 'string' ? Date.parse(event.created_date) : NaN;
    return !Number.isFinite(created) || created > now ||
      now - created >= SALES_AUDIT_REVIEW_AFTER_MS;
  })) return 'needs_review';
  if (hasMore) return 'needs_review'; // Unread matching audit rows cannot be excluded.
  return matching.length ? 'pending' : 'none';
}
