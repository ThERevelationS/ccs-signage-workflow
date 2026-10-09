// Regular-user Sales history uses CellHistory; FieldAudit alone is restricted.
// Emit stage provenance only after a successful WorkOrder CAS, never on a held
// task or a failed transition. The unique stage timestamp distinguishes events.
export function salesStageCellHistoryRows(record, patch) {
  if (!record?.id || String(record.sales_status || '') === String(patch?.sales_status || '') ||
      !patch?.current_task_description || !patch?.sales_stage_changed_at) {
    throw new Error('Stage history requires a verified Sales status transition.');
  }
  return ['current_task_description', 'sales_status', 'sales_stage_changed_at'].map((field) => ({
    entity_type: 'WorkOrder',
    entity_id: String(record.id),
    field_name: field,
    old_value: String(record[field] ?? ''),
    new_value: String(patch[field] ?? ''),
    changed_by_name: 'Smartsheet Sync',
  }));
}
