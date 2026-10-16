// Only regular-user Sales history fields may leave the service-role audit
// store. ActivityLog and unrelated WorkOrder fields remain restricted.
export const SALES_OPPORTUNITY_HISTORY_FIELDS = Object.freeze([
  'sales_status', 'sales_stage_changed_at', 'sales_rep', 'lead_source',
  'estimate_amount', 'date_estimate_sent', 'follow_up_date',
  'sales_last_follow_up_completed_at', 'sales_last_follow_up_outcome',
  'expected_close_date', 'close_date', 'lost_reason',
  'current_task_description', 'current_task_deadline',
  'current_task_assigned_to', 'in_pipeline', 'sales_neutral_closed_at',
]);

const ALLOWED = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);

// Once pages have been authorized and sanitized by the backend, merge them
// without dropping older entries at an arbitrary display cap. Load-more is
// always explicit; no entire archive is fetched automatically.
export function appendSalesOpportunityHistoryPages(previous = [], incoming = []) {
  const byId = new Map();
  for (const entry of [...previous, ...incoming]) {
    if (!entry?.id || !ALLOWED.has(entry.field_name) ||
        !/^(audit|legacy):/.test(String(entry.id))) continue;
    byId.set(String(entry.id), entry);
  }
  return [...byId.values()].sort((a, b) => {
    const time = entry => Date.parse(entry.modified_at || entry.created_date || '') || 0;
    return time(b) - time(a) || String(a.id).localeCompare(String(b.id));
  });
}


export function mergeSalesOpportunityHistory(audit = [], legacy = [], limit = 75) {
  const entries = [];
  const seen = new Set();
  for (const [kind, rows] of [['audit', audit], ['legacy', legacy]]) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row?.id || !ALLOWED.has(row.field_name) ||
          (kind === 'audit' && row.status !== 'committed')) continue;
      const id = kind + ':' + String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id, field_name: row.field_name,
        old_value: row.old_value ?? null, new_value: row.new_value ?? null,
        ...(kind === 'audit'
          ? {modified_at: row.modified_at || '', actor_name: row.actor_name || '',
              actor_email: row.actor_email || '', source: 'Verified app save',
              preview_truncated: row.preview_truncated === true}
          : {created_date: row.created_date || '', changed_by_name: row.changed_by_name || '',
              changed_by_email: row.changed_by_email || '', source: 'Legacy CellHistory'}),
      });
    }
  }
  entries.sort((a, b) => {
    const time = entry => Date.parse(entry.modified_at || entry.created_date || '') || 0;
    return time(b) - time(a) || a.id.localeCompare(b.id);
  });
  return entries.slice(0, Math.max(1, Math.min(100, Number(limit) || 75)));
}
