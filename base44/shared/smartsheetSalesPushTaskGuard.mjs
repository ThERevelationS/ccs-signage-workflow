import { mapSalesTaskToStage } from './salesTaskStageCatalog.mjs';
import { isLegacyTerminalSmartsheetSalesRecord } from './historicalSalesOutcomeReconciliation.mjs';

// Safety boundary for the *reverse* Smartsheet push/reconciliation path.
// A remote task must never be written to Base44 (nor a local task pushed to
// Smartsheet) if it disagrees with a protected Sales stage. The pull path has
// the version-guarded task+stage transition; this bulk path does not.
export function guardSalesPushTaskPlan(record, plan, bindings) {
  const taskColumn = String(bindings?.current_task_description ?? '').trim();
  if (record?.in_pipeline !== true || !/^\d+$/.test(taskColumn)) return { ...plan, taskStageHeld: false };
  const incomingTask = Object.prototype.hasOwnProperty.call(plan?.incoming || {}, 'current_task_description');
  const outgoingTask = (plan?.outgoing || []).some(cell => String(cell?.columnId) === taskColumn);
  if (!incomingTask && !outgoingTask) return { ...plan, taskStageHeld: false };

  const status = String(record?.sales_status || '').trim().toLowerCase();
  const currentTask = String(record?.current_task_description || '').trim();
  const remoteTask = String(plan?.remote?.[taskColumn] ?? '').trim();
  const currentStage = mapSalesTaskToStage(currentTask);
  const remoteStage = mapSalesTaskToStage(remoteTask);
  const incompatible = isLegacyTerminalSmartsheetSalesRecord(record) ||
    (incomingTask && (remoteStage.kind !== 'stage' || remoteStage.status !== status)) ||
    (outgoingTask && (currentStage.kind !== 'stage' || currentStage.status !== status));

  if (!incompatible) return { ...plan, taskStageHeld: false };

  const incoming = { ...plan.incoming };
  delete incoming.current_task_description;
  const outgoing = (plan.outgoing || []).filter(cell => String(cell?.columnId) !== taskColumn);
  // This is a held column, not a successful remote baseline. Never advance
  // its snapshot merely because a different field was safely reconciled.
  const remote = { ...plan.remote };
  const prior = record?.smartsheet_sync_snapshot;
  if (prior && Object.prototype.hasOwnProperty.call(prior, taskColumn)) {
    remote[taskColumn] = prior[taskColumn];
  } else {
    delete remote[taskColumn];
  }
  return {
    ...plan, incoming, outgoing, remote, taskStageHeld: true,
    unresolved: [...new Set([...(plan.unresolved || []), 'current_task_description'])],
  };
}
