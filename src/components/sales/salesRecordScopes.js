const LEGACY_TERMINAL_TASK_PATTERN = /^(lost\b|completed sale\b|closed\b)/i;

export const isModernSalesRecord = (workOrder) => workOrder?.in_pipeline === true;

export const isOpenSalesStatus = (workOrder) => !["won", "lost"].includes(workOrder?.sales_status);

export const isCurrentPipelineOpportunity = (workOrder) =>
  isModernSalesRecord(workOrder) && isOpenSalesStatus(workOrder);

export const isTrustedSalesOutcome = (workOrder) =>
  isModernSalesRecord(workOrder) && ["won", "lost"].includes(workOrder?.sales_status);

export const isLegacyClosedSalesRecord = (workOrder) => {
  if (isModernSalesRecord(workOrder)) return false;
  const legacyTask = String(workOrder?.current_task_description || "").trim();
  return LEGACY_TERMINAL_TASK_PATTERN.test(legacyTask);
};

export const getSalesRecordClassification = (workOrder) => {
  if (isCurrentPipelineOpportunity(workOrder)) return "current";
  if (isTrustedSalesOutcome(workOrder)) return "outcome";
  if (isLegacyClosedSalesRecord(workOrder)) return "legacy_history";
  return "other";
};
