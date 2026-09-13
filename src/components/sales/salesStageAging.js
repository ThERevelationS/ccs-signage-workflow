import { differenceInDays } from "date-fns";

export const STAGE_AGING_DAYS = 14;

const parseDateOnly = (value) => {
  const stamp = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const [year, month, day] = stamp.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getStageAgeDays = (workOrder, today = new Date()) => {
  const changedAt = parseDateOnly(workOrder?.sales_stage_changed_at);
  if (!changedAt) return null;
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  if (isNaN(end.getTime())) return null;
  return Math.max(0, differenceInDays(end, changedAt));
};

export const isStageAgedOpportunity = (workOrder, today = new Date()) => {
  if (!workOrder || ["won", "lost", "on_hold"].includes(workOrder.sales_status)) return false;
  const ageDays = getStageAgeDays(workOrder, today);
  return ageDays !== null && ageDays >= STAGE_AGING_DAYS;
};

export const getStageAgingState = (workOrder, today = new Date()) => {
  const ageDays = getStageAgeDays(workOrder, today);
  return {
    tracked: ageDays !== null,
    ageDays,
    aged: isStageAgedOpportunity(workOrder, today),
  };
};
