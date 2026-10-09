import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';
import {
  historicalTerminalTaskFamily,
  isLegacyTerminalSmartsheetSalesRecord,
} from './historicalSalesOutcomeReconciliation.mjs';
import { isSmartsheetSalesImportShell } from './smartsheetSalesImportEligibility.mjs';

const clean = (value) => String(value ?? '').trim();
const statuses = new Set(['lead', 'quoted', 'follow_up', 'on_hold', 'won', 'lost']);

// Read-only categorization of loaded WorkOrders, never an instruction to
// rewrite a historical classification, stage timestamp or downstream outcome.
// This deliberately does not infer modern Sales authority from a task string.
export function classifySalesTaskStatusAudit(workOrder = {}) {
  const none = { kind: 'none', reason: '', storedStatus: clean(workOrder?.sales_status), mappedStatus: '' };
  if (!workOrder || workOrder.deleted === true || isSmartsheetSalesImportShell(workOrder)) return none;

  const task = clean(workOrder.current_task_description);
  const status = clean(workOrder.sales_status).toLowerCase();
  const mapping = mapSalesTaskToStage(task);
  const result = (kind, reason) => ({
    kind, reason, storedStatus: status, mappedStatus: mapping.status || '',
  });

  if (workOrder.in_pipeline !== true) {
    if (historicalTerminalTaskFamily(task) && !clean(workOrder.sales_neutral_closed_at)) {
      return result('legacy_context',
        'Older closed-task text is historical context, not a verified modern Won/Lost outcome.');
    }
    return none;
  }
  if (isLegacyTerminalSmartsheetSalesRecord(workOrder)) {
    return result('legacy_context',
      'Imported terminal task has no verified modern Sales workflow evidence. Review as legacy history; do not infer a Won/Lost outcome.');
  }
  if (!statuses.has(status)) return result('modern_review', 'Stored Sales Status is missing or unsupported. Review without guessing a replacement.');
  if (!task) return result('modern_review', 'Task Description is missing; verify the next task before changing the stored status.');
  if (mapping.kind === 'neutral_close') return result('modern_review',
    'Neutral closure needs its existing confirmation flow; this task alone cannot close a modern opportunity.');
  if (mapping.kind !== 'stage') return result('modern_review',
    'Task Description is not in the reviewed Sales stage catalog; no stage can be inferred.');
  if (mapping.status !== status) return result('modern_review',
    'Task Description and stored Sales Status disagree. Verify the actual stage and use the protected task-transition workflow.');
  return none;
}

export const salesTaskStatusNeedsReview = (workOrder) =>
  classifySalesTaskStatusAudit(workOrder).kind === 'modern_review';
