// Order Form due-date surfacing. A text option in Date Needed (ASAP, N/A,
// Stock, etc.) is not a date and is never overdue. Received and cancelled
// Orders are finished work and are never due.
import { isFulfilledOrder, effectiveOrderStatus } from "./smartsheetOrderReceivedState.mjs";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function orderNeededDate(order) {
  const match = ISO_DATE.exec(String(order?.date_needed ?? "").trim());
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? { year, month, day } : null;
}

export function orderDueState(order, todayStr) {
  if (isFulfilledOrder(order) || effectiveOrderStatus(order) === "cancelled") return "ok";
  const needed = orderNeededDate(order);
  if (!needed) return "ok";
  const neededStr = `${needed.year}-${String(needed.month).padStart(2, "0")}-${String(needed.day).padStart(2, "0")}`;
  const today = String(todayStr ?? "").trim();
  if (!ISO_DATE.test(today)) return "ok";
  if (neededStr < today) return "overdue";
  // Due within the next 3 days, counting today.
  const soon = new Date(new Date(`${today}T00:00:00`).getTime() + 3 * 86400000);
  const soonStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
  return neededStr <= soonStr ? "due_soon" : "ok";
}
