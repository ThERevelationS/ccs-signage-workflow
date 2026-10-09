import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';

// The Smartsheet bulk-update path must NEVER use this patch. It is reserved
// for a single WorkOrder compare-and-set write (trackedConditionalSave).
export function buildNonterminalSalesPullPatch(record, fields, transition, stamp) {
  const active = ['lead', 'quoted', 'follow_up', 'on_hold'];
  const from = String(record?.sales_status || '').trim();
  const to = String(transition?.to || '').trim();
  const task = String(fields?.current_task_description || '').trim();
  const mapped = mapSalesTaskToStage(task);
  if (record?.in_pipeline !== true || !record?.id || !record?.updated_date ||
      !active.includes(from) || !active.includes(to) || from === to ||
      transition?.from !== from || mapped.kind !== 'stage' || mapped.status !== to ||
      task === String(record?.current_task_description || '').trim() ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(stamp || '')) ||
      !Number.isFinite(Date.parse(stamp))) {
    throw new Error('Smartsheet task stage change requires a fresh, mapped, nonterminal WorkOrder transition.');
  }
  return { ...fields, sales_status: to, sales_stage_changed_at: stamp };
}
