import { SALES_OPPORTUNITY_HISTORY_FIELDS } from './salesOpportunityHistory.mjs';

const salesAuditFields = new Set(SALES_OPPORTUNITY_HISTORY_FIELDS);

export const equivalent = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (a == null || a === '') && (b == null || b === '');
export async function valueHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function preview(value) { return typeof value === 'string' ? value : JSON.stringify(value ?? null); }
export async function prepareFieldAudit(base44, type, record, patch, actor, source = 'app', timestamps = {}) {
  const at = new Date().toISOString();
  // Correlate only locally initiated Sales WorkOrder saves. This does not
  // establish whether the following compare-and-set write actually succeeded.
  // Keep Smartsheet, Order and unrelated WorkOrder audit contracts unchanged.
  const localSalesAttempt = type === 'WorkOrder' && source === 'app' &&
    Object.keys(patch).some(field => salesAuditFields.has(field));
  const saveAttempt = localSalesAttempt
    ? {save_attempt_id:crypto.randomUUID(),
       ...(typeof record.updated_date === 'string' && record.updated_date
         ? {save_attempt_baseline_version:record.updated_date} : {})}
    : null;
  const events = [];
  for (const [field, value] of Object.entries(patch)) {
    if (field.startsWith('smartsheet_') || equivalent(record[field], value)) continue;
    const old = preview(record[field]), next = preview(value);
    events.push({event_key: crypto.randomUUID(), ...(saveAttempt || {}), entity_type: type, entity_id: record.id, field_name: field,
      old_value: old.slice(0, 4000), new_value: next.slice(0, 4000), preview_truncated: old.length > 4000 || next.length > 4000,
      value_hash: await valueHash(value), ...(timestamps[field] || source === 'app' || source === 'admin' ? {modified_at:timestamps[field] || at} : {}), source,
      actor_name: actor?.full_name || actor?.name || source, actor_email: actor?.email || '', status: 'pending'});
  }
  return events.length ? await base44.asServiceRole.entities.FieldAudit.bulkCreate(events) : [];
}
export async function finishFieldAudit(base44, events, status) {
  if (events.length) await base44.asServiceRole.entities.FieldAudit.bulkUpdate(events.map(e => ({id:e.id, status})));
}
export async function trackedConditionalSave(base44, type, record, patch, actor, source = 'app', timestamps = {}) {
  const events = await prepareFieldAudit(base44, type, record, patch, actor, source, timestamps);
  const entity = base44.asServiceRole.entities[type];
  const result = await entity.updateMany({id: record.id, updated_date: record.updated_date}, {$set: patch});
  if (result?.updated !== 1) { await finishFieldAudit(base44, events, 'aborted'); throw Object.assign(new Error('This record changed during saving. Reload before retrying; no newer fields were overwritten.'), {status:409}); }
  // Intent exists before the business write. Missing finalization is never a trusted timestamp.
  await finishFieldAudit(base44, events, 'committed');
  const saved = await entity.get(record.id);
  if (Object.entries(patch).some(([f,v]) => !equivalent(saved[f],v))) throw Object.assign(new Error('Saved fields changed before verification. Reload the latest record.'), {status:409});
  return saved;
}
export async function verifiedLocalFieldTime(base44, type, record, field) {
  const key = field === 'notes_serialized' ? 'work_notes' : field;
  const page = await base44.asServiceRole.entities.FieldAudit.filter({entity_type:type,entity_id:record.id,field_name:key,status:'committed'}, {sort:'-modified_at',limit:1});
  const event = page.items[0];
  return event && event.source === 'app' && event.value_hash === await valueHash(record[key]) ? event.modified_at : '';
}