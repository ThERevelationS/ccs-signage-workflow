import { SALES_OPPORTUNITY_HISTORY_FIELDS } from './salesOpportunityHistory.mjs';
import { SALES_HISTORY_STALE_CODE } from './salesHistorySnapshotGuard.mjs';

// A WorkOrder's updated_date does not move when FieldAudit.status finalizes.
// Compare two bounded, scoped pending reads so an in-flight finalization does
// not masquerade as a stable admin investigation. This is NOT a transaction
// snapshot, nor proof that a pending field write was committed.
const ALLOWED = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);
const changed = () => Object.assign(
  new Error('Pending Sales audit evidence changed during inspection. Recheck Sales history and inspect again.'),
  { status: 409, code: SALES_HISTORY_STALE_CODE },
);

function signature(page, workOrderId) {
  if (!Array.isArray(page?.items) || typeof workOrderId !== 'string') throw changed();
  const entries = page.items.map(row => {
    if (!row?.id || row.entity_type !== 'WorkOrder' ||
        row.entity_id !== workOrderId || row.status !== 'pending' ||
        !ALLOWED.has(row.field_name)) throw changed();
    // Keep values within the server-side comparison only. Never return them.
    return {
      id:String(row.id), event_key:row.event_key ?? null,
      field_name:row.field_name, status:row.status,
      created_date:row.created_date ?? null,
      new_value:row.new_value ?? null, old_value:row.old_value ?? null,
      preview_truncated:row.preview_truncated ?? null,
      source:row.source ?? null, actor_name:row.actor_name ?? null,
    };
  });
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw changed();
  entries.sort((a,b)=>a.id.localeCompare(b.id));
  return JSON.stringify({entries,has_more:page.has_more===true});
}

export function verifyPendingSalesAuditReviewSnapshot(first, second, workOrderId) {
  if (signature(first,workOrderId) !== signature(second,workOrderId)) throw changed();
  return true;
}
