import { buildSnapshot, buildSalesPullSnapshot } from './smartsheetSyncFields.ts';
import { valueHash, preview } from './fieldAudit.ts';

// Build review evidence without one database/history lookup per field. A large
// legacy sheet must not exhaust the request budget before safe fields can pull.
export async function buildSalesPullReviews(record, bindings, remoteRow) {
  const local = buildSnapshot(record, bindings, 'sales');
  const remote = buildSalesPullSnapshot(remoteRow, bindings);
  const prior = record.smartsheet_sync_snapshot || {};
  return await Promise.all(Object.entries(bindings).map(async ([field, id]) => {
    const column = String(id), a = local[column], b = remote[column];
    const known = Object.prototype.hasOwnProperty.call(prior, column);
    return {
      conflict_key: await valueHash(['sales', record.id, column, a, b]),
      dataset: 'sales', entity_id: record.id, record_label: record.client_name || record.title || record.id,
      field_name: field, field_label: field.replace(/_/g, ' '), sheet_id: record.smartsheet_sheet_id,
      row_id: record.smartsheet_row_id, column_id: column,
      local_value: preview(a ?? ''), remote_value: preview(b ?? ''),
      baseline_value: known ? preview(prior[column] ?? '') : 'Unknown',
      local_modified_at: '', remote_modified_at: '', local_version: record.updated_date,
      remote_version: remoteRow.modified_at || '',
      reason: 'This field differs without an unchanged local baseline. Both versions were preserved; choose a version in Admin.',
      status: 'open',
    };
  }));
}