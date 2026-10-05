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
  if (isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) return null;
  return parsed;
};

export const hasTrustworthyQuoteSentDate = (workOrder) => Boolean(
  workOrder?.date_estimate_sent && workOrder?.sales_quote_sent_verified_at
);

export const getQuoteSentDate = (workOrder) =>
  hasTrustworthyQuoteSentDate(workOrder) ? workOrder.date_estimate_sent : "";

export const isQuoteAwaitingResponse = (workOrder) => ["quoted", "follow_up"].includes(workOrder?.sales_status);

export const getQuoteAgeDays = (workOrder, today = new Date()) => {
  if (!isQuoteAwaitingResponse(workOrder)) return null;
  const sentDate = toLocalDay(getQuoteSentDate(workOrder));
  const todayDate = toLocalDay(today);
  if (!sentDate || !todayDate || sentDate.getTime() > todayDate.getTime()) return null;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((todayDate.getTime() - sentDate.getTime()) / millisecondsPerDay);
};

export const getQuoteAgingState = (workOrder, today = new Date()) => {
  const awaitingResponse = isQuoteAwaitingResponse(workOrder);
  const rawSentDate = workOrder?.date_estimate_sent || "";
  const sentDate = getQuoteSentDate(workOrder);
  const ageDays = getQuoteAgeDays(workOrder, today);
  return {
    awaitingResponse,
    rawSentDate,
    sentDate,
    trusted: Boolean(sentDate),
    tracked: ageDays !== null,
    ageDays,
    aged: ageDays !== null && ageDays >= QUOTE_REVIEW_DAYS,
    veryAged: ageDays !== null && ageDays >= 30,
  };
};
