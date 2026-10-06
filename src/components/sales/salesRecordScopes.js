import { isSmartsheetSalesImportShell } from "@/shared/smartsheetSalesImportEligibility.mjs";
import {
  historicalTerminalTaskFamily,
  isLegacyTerminalSmartsheetSalesRecord,
} from "@/shared/historicalSalesOutcomeReconciliation.mjs";

export const isModernSalesRecord = (workOrder) => workOrder?.in_pipeline === true;

export const isOpenSalesStatus = (workOrder) => !["won", "lost"].includes(workOrder?.sales_status);

export const isCurrentPipelineOpportunity = (workOrder) =>
  isModernSalesRecord(workOrder) && isOpenSalesStatus(workOrder) &&
  !isSmartsheetSalesImportShell(workOrder) &&
  !isLegacyTerminalSmartsheetSalesRecord(workOrder);

export const isTrustedSalesOutcome = (workOrder) =>
  isModernSalesRecord(workOrder) && ["won", "lost"].includes(workOrder?.sales_status);

export const isLegacyClosedSalesRecord = (workOrder) => {
  if (isLegacyTerminalSmartsheetSalesRecord(workOrder)) return true;
  if (isModernSalesRecord(workOrder)) return false;
  return Boolean(historicalTerminalTaskFamily(workOrder?.current_task_description));
};

export const getSalesRecordClassification = (workOrder) => {
  if (isCurrentPipelineOpportunity(workOrder)) return "current";
  if (isTrustedSalesOutcome(workOrder)) return "outcome";
  if (isLegacyClosedSalesRecord(workOrder)) return "legacy_history";
  return "other";
};
