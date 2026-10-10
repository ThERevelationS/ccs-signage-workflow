import { buildSnapshot, serializeWorkNotes } from './smartsheetSyncFields.ts';
import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';
import { isLegacyTerminalSmartsheetSalesRecord } from './historicalSalesOutcomeReconciliation.mjs';

const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

// A user-confirmed Sales stage movement is not permission for a later
// Smartsheet pull to reverse it merely because the *task text* still equals
// the old remote snapshot. Only a verified Sales stage-change timestamp counts
// as local stage evidence; never infer it from generic WorkOrder timestamps.
export function hasUnverifiedSalesStageChangeSinceSync(record) {
  if (record?.in_pipeline !== true) return false;
  const stageAt = Date.parse(String(record?.sales_stage_changed_at || ''));
  if (!Number.isFinite(stageAt)) return false;
  const syncAt = Date.parse(String(record?.smartsheet_last_synced_at || ''));
  return !Number.isFinite(syncAt) || stageAt > syncAt;
}

// Reconcile inbound fields independently. Missing data may be filled without
// allowing an unrelated local edit to freeze the entire row.
export function planSalesFieldPull(record, incoming, remoteSnapshot, bindings) {
  const local = buildSnapshot(record, bindings, 'sales');
  const prior = record.smartsheet_sync_snapshot || {};
  const snapshot = { ...remoteSnapshot }, fields = {}, held = [];
  // Records untouched locally for over 2 weeks defer to Smartsheet's non-blank values.
  const stale = Date.now() - Date.parse(record.updated_date || '') > 14 * 86400000;
  for (const [field, value] of Object.entries(incoming)) {
    const binding = field === 'work_notes' ? 'notes_serialized' : field;
    const column = String(bindings[binding] || '');
    const known = Boolean(record.smartsheet_last_synced_at && Object.prototype.hasOwnProperty.call(prior, column));
    const current = field === 'work_notes' ? serializeWorkNotes(record.work_notes || []) : record[field];
    const next = field === 'work_notes' ? serializeWorkNotes(value) : value;
    const blank = !String(current ?? '').trim();
    const unchangedLocally = known && same(local[column], prior[column]);
    if (same(current, next) || unchangedLocally || (stale && String(next ?? '').trim()) || (!known && blank) || (field === 'work_notes' && blank)) {
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
    if (stale && String(remoteSnapshot[column] ?? '').trim()) continue;
    if (Object.prototype.hasOwnProperty.call(prior, column)) snapshot[column] = prior[column];
    else if (String(local[column] ?? '').trim()) {
      delete snapshot[column];
      if (!held.includes(binding)) held.push(binding);
    }
  }
  return { fields, snapshot, held };
}

// If a stage CAS succeeded but its history/snapshot confirmation did not,
// later no-op pulls must not launder the missing stage evidence into a clean
// baseline. The real stage-change stamp is newer than the verified sync.
export function salesStageSnapshotRecoveryNeedsReview(record, bindings) {
  const column = String(bindings?.current_task_description || '').trim();
  const prior = record?.smartsheet_sync_snapshot;
  if (record?.in_pipeline !== true || !/^\d+$/.test(column) ||
      !prior || !Object.prototype.hasOwnProperty.call(prior, column) ||
      same(record.current_task_description, prior[column])) return false;
  const stageAt = Date.parse(String(record.sales_stage_changed_at || ''));
  const syncAt = Date.parse(String(record.smartsheet_last_synced_at || ''));
  return Number.isFinite(stageAt) && Number.isFinite(syncAt) && stageAt > syncAt;
}

// A Smartsheet pull must not independently change the task of a modern Sales
// record when doing so requires a stage change, a terminal confirmation, or a
// choice between two locally edited versions. The pull's ordinary bulkUpdate
// cannot atomically perform the Sales stage transition or its approvals.
// Hold only the task column, keeping other safe incoming fields syncable.
export function guardSalesPulledTaskTransition(record, incoming, plan, bindings) {
  if (salesStageSnapshotRecoveryNeedsReview(record, bindings)) {
    const column = String(bindings.current_task_description).trim();
    const snapshot = { ...plan.snapshot, [column]: record.smartsheet_sync_snapshot[column] };
    const fields = { ...plan.fields };
    delete fields.current_task_description;
    return { ...plan, fields, snapshot,
      held: [...new Set([...(plan.held || []), 'current_task_description'])], stageTransition: null };
  }
  if (record?.in_pipeline !== true ||
      !Object.prototype.hasOwnProperty.call(incoming || {}, 'current_task_description') ||
      same(record?.current_task_description, incoming.current_task_description)) return { ...plan, stageTransition: null };
  const bindingId = String(bindings?.current_task_description || '').trim();
  if (!/^\d+$/.test(bindingId)) return { ...plan, stageTransition: null };

  const mapped = mapSalesTaskToStage(incoming.current_task_description);
  const currentStatus = String(record?.sales_status || 'lead').trim().toLowerCase();
  const prior = record?.smartsheet_sync_snapshot || {};
  const known = Boolean(record?.smartsheet_last_synced_at &&
    Object.prototype.hasOwnProperty.call(prior, bindingId));
  const locallyEdited = known
    ? !same(record?.current_task_description, prior[bindingId])
    : Boolean(String(record?.current_task_description || '').trim());
  const activeStatuses = ['lead', 'quoted', 'follow_up', 'on_hold'];
  const needsStageChange = mapped.kind === 'stage' && mapped.status !== currentStatus;
  const canAutoTransition = needsStageChange &&
    activeStatuses.includes(currentStatus) && activeStatuses.includes(mapped.status) &&
    // A verified local stage move since the last full Smartsheet sync takes
    // precedence over a later remote task disagreement. Hold for review and
    // keep other independently safe fields flowing.
    !hasUnverifiedSalesStageChangeSinceSync(record) &&
    known && !locallyEdited && !isLegacyTerminalSmartsheetSalesRecord(record) &&
    !plan.held.includes('current_task_description') &&
    Object.prototype.hasOwnProperty.call(plan.fields, 'current_task_description');
  if (canAutoTransition) {
    // Only the separate CAS write path may consume this marker. The task,
    // real status, and stage timestamp must commit in one guarded WorkOrder save.
    return { ...plan, stageTransition: { from: currentStatus, to: mapped.status } };
  }
  const requiresReview = isLegacyTerminalSmartsheetSalesRecord(record) ||
    mapped.kind !== 'stage' || needsStageChange || locallyEdited;
  if (!requiresReview) return { ...plan, stageTransition: null };

  const fields = { ...plan.fields };
  delete fields.current_task_description;
  const snapshot = { ...plan.snapshot };
  if (Object.prototype.hasOwnProperty.call(prior, bindingId)) snapshot[bindingId] = prior[bindingId];
  else delete snapshot[bindingId];
  return {
    ...plan,
    fields,
    snapshot,
    held: [...new Set([...(plan.held || []), 'current_task_description'])],
    stageTransition: null,
  };
}