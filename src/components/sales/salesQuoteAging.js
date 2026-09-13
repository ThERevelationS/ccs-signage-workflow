export const QUOTE_REVIEW_DAYS = 14;

const toLocalDay = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  const stamp = String(value).slice(0, 10);
  const [year, month, day] = stamp.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const getQuoteSentDate = (workOrder) => workOrder?.date_estimate_sent || workOrder?.quote_date || "";

export const isQuoteAwaitingResponse = (workOrder) => ["quoted", "follow_up"].includes(workOrder?.sales_status);

export const getQuoteAgeDays = (workOrder, today = new Date()) => {
  if (!isQuoteAwaitingResponse(workOrder)) return null;
  const sentDate = toLocalDay(getQuoteSentDate(workOrder));
  const todayDate = toLocalDay(today);
  if (!sentDate || !todayDate) return null;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((todayDate.getTime() - sentDate.getTime()) / millisecondsPerDay));
};

export const getQuoteAgingState = (workOrder, today = new Date()) => {
  const awaitingResponse = isQuoteAwaitingResponse(workOrder);
  const sentDate = getQuoteSentDate(workOrder);
  const ageDays = getQuoteAgeDays(workOrder, today);
  return {
    awaitingResponse,
    sentDate,
    tracked: ageDays !== null,
    ageDays,
    aged: ageDays !== null && ageDays >= QUOTE_REVIEW_DAYS,
    veryAged: ageDays !== null && ageDays >= 30,
  };
};
