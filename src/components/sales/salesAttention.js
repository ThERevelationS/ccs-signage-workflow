import { getQuoteAgingState } from "@/components/sales/salesQuoteAging";
import { getStageAgingState } from "@/components/sales/salesStageAging";
import { isCurrentPipelineOpportunity } from "@/components/sales/salesRecordScopes";

const DEFINITIONS = {
  next_action: {
    key: "next_action",
    label: "No next action",
    shortLabel: "Next action",
    detail: "Schedule a follow-up or task deadline so this opportunity has a clear next step.",
    actionable: true,
    priority: 80,
  },
  owner_missing: {
    key: "owner_missing",
    label: "Sales owner missing",
    shortLabel: "Owner",
    detail: "Assign a sales owner so responsibility is clear.",
    actionable: true,
    priority: 40,
  },
  source_missing: {
    key: "source_missing",
    label: "Lead source missing",
    shortLabel: "Source",
    detail: "Select the known lead source. Leave it missing rather than guessing historical data.",
    actionable: true,
    priority: 10,
  },
  quote_timing_missing: {
    key: "quote_timing_missing",
    label: "Quote timing missing",
    shortLabel: "Quote timing",
    detail: "Quoted/Follow Up has no trustworthy sent date. Enter the actual sent date; do not infer it from record dates.",
    actionable: true,
    priority: 100,
  },
  stage_timing_missing: {
    key: "stage_timing_missing",
    label: "Stage timing missing",
    shortLabel: "Stage timing",
    detail: "Stage age is not historically known. Tracking begins automatically after the next real Sales status change.",
    actionable: false,
    priority: 0,
  },
};

export const getSalesAttentionItems = (workOrder, today = new Date()) => {
  if (!isCurrentPipelineOpportunity(workOrder)) return [];

  const items = [];
  const add = (key) => items.push(DEFINITIONS[key]);

  if (!workOrder.follow_up_date && !workOrder.current_task_deadline) add("next_action");
  if (!String(workOrder.sales_rep || "").trim()) add("owner_missing");
  if (!String(workOrder.lead_source || "").trim()) add("source_missing");

  const quoteAging = getQuoteAgingState(workOrder, today);
  if (quoteAging.awaitingResponse && !quoteAging.tracked) add("quote_timing_missing");

  const stageAging = getStageAgingState(workOrder, today);
  if (!stageAging.tracked) add("stage_timing_missing");

  return items;
};

export const getActionableSalesAttentionItems = (workOrder, today = new Date()) =>
  getSalesAttentionItems(workOrder, today).filter((item) => item.actionable !== false);

export const hasSalesAttention = (workOrder, today = new Date()) =>
  getActionableSalesAttentionItems(workOrder, today).length > 0;

export const getSalesAttentionScore = (workOrder, today = new Date()) =>
  getActionableSalesAttentionItems(workOrder, today).reduce((total, item) => total + (item.priority || 0), 0);

