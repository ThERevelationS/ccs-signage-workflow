import { buildSnapshot, serializeWorkNotes } from './smartsheetSyncFields.ts';

const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
// Reconcile inbound fields independently. Missing data may be filled without
// allowing an unrelated local edit to freeze the entire row.
export function planSalesFieldPull(record, incoming, remoteSnapshot, bindings) {
  const local = buildSnapshot(record, bindings, 'sales');
  const prior = record.smartsheet_sync_snapshot || {};
  const snapshot = { ...remoteSnapshot }, fields = {}, held = [];
  for (const [field, value] of Object.entries(incoming)) {
    const binding = field === 'work_notes' ? 'notes_serialized' : field;
    const column = String(bindings[binding] || '');
    const known = Boolean(record.smartsheet_last_synced_at && Object.prototype.hasOwnProperty.call(prior, column));
    const current = field === 'work_notes' ? serializeWorkNotes(record.work_notes || []) : record[field];
    const next = field === 'work_notes' ? serializeWorkNotes(value) : value;
    const blank = !String(current ?? '').trim();
    const unchangedLocally = known && same(local[column], prior[column]);
    if (same(current, next) || unchangedLocally || (!known && blank) || (field === 'work_notes' && blank)) {
      fields[field] = value;
    } else {
      held.push(binding);
      if (known) snapshot[column] = prior[column];
      else delete snapshot[column];
    }
  }
  // A blank remote cell must not manufacture a new baseline for nonblank
  // local data. Preserve its prior evidence, or hold the newly bound field.
  for (const [binding, id] of Object.entries(bindings)) {
    const column = String(id), field = binding === 'notes_serialized' ? 'work_notes' : binding;
    if (Object.prototype.hasOwnProperty.call(fields, field) || same(local[column], remoteSnapshot[column])) continue;
    if (Object.prototype.hasOwnProperty.call(prior, column)) snapshot[column] = prior[column];
    else if (String(local[column] ?? '').trim()) {
      delete snapshot[column];
      if (!held.includes(binding)) held.push(binding);
    }
  }
  return { fields, snapshot, held };
}