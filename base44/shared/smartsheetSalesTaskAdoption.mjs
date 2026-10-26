import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';

// Adopting a Smartsheet task is a real Sales transition, never a field
// overwrite. This patch is reserved for a single WorkOrder compare-and-set
// write (trackedConditionalSave) — never the bulk-update path. The same
// builder backs the admin resolve-conflict 'smartsheet' decision and the
// pull's verified remote-wins task adoption.
export function buildSalesTaskAdoptionPatch(record, fields, remoteTask, remoteLostReason, stamp) {
  const task = String(remoteTask ?? '').trim();
  const currentStatus = String(record?.sales_status || 'lead').trim().toLowerCase();
  const mapped = mapSalesTaskToStage(task);
  // The write is meaningful when the task text changes or the stored stage
  // disagrees with the proven remote task's mapped outcome. A converged task
  // with a diverged stage still needs the stage half of the adoption.
  const noChange = task === String(record?.current_task_description || '').trim() &&
    !(mapped.kind === 'stage' && mapped.status !== currentStatus) &&
    !(mapped.kind === 'neutral_close' && !['won', 'lost'].includes(currentStatus));
  if (!record?.id || record.in_pipeline !== true || !task ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(stamp || '')) ||
      !Number.isFinite(Date.parse(stamp)) || noChange) {
    throw new Error('Smartsheet task adoption requires a changed task on an active Sales record.');
  }
  const today = String(stamp).slice(0, 10);
  const patch = { ...(fields || {}), current_task_description: task };
  if (mapped.kind === 'neutral_close') {
    if (['won', 'lost'].includes(currentStatus)) {
      throw new Error('This record is no longer an active Sales opportunity; the neutral closure could not be applied.');
    }
    Object.assign(patch, { in_pipeline: false, sales_neutral_closed_at: stamp, follow_up_date: '' });
  } else if (mapped.kind === 'stage' && mapped.status !== currentStatus) {
    patch.sales_status = mapped.status;
    patch.sales_stage_changed_at = stamp;
    if (['won', 'lost'].includes(mapped.status)) {
      patch.close_date = today;
      patch.follow_up_date = '';
      patch.lost_reason = mapped.status === 'lost' ? String(remoteLostReason ?? '').trim() : '';
    } else if (['won', 'lost'].includes(currentStatus)) {
      patch.close_date = '';
      patch.lost_reason = '';
    }
  }
  return patch;
}
