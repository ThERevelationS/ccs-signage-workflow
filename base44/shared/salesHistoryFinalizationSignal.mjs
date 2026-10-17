// A WorkOrder write can succeed before its FieldAudit row is finalized.
// Never treat an uncommitted audit as saved history. Only signal a possible
// incomplete history view when a pending, nontruncated Sales audit still
// matches the loaded WorkOrder. Never return pending values to the client.
import { SALES_OPPORTUNITY_HISTORY_FIELDS } from './salesOpportunityHistory.mjs';

const allowed = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);

const preview = value => typeof value === 'string' ? value : JSON.stringify(value ?? null);

export function salesHistoryHasUnfinalizedMatchingAudit(pendingRows, workOrder) {
  if (!Array.isArray(pendingRows) || !workOrder) return false;
  return pendingRows.some(event => event?.status === 'pending' &&
    allowed.has(event.field_name) &&
    event.entity_type === 'WorkOrder' &&
    event.entity_id === workOrder.id &&
    event.preview_truncated !== true &&
    typeof event.new_value === 'string' &&
    event.new_value === preview(workOrder[event.field_name]));
}
