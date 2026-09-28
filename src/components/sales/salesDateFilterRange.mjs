// Date-only comparisons for saved Sales information filters. Keep this list
// aligned with the date-typed fields in CustomFilterDialog; never infer
// trustworthy Sales dates from created_date or updated_date.
export const SALES_DATE_FILTER_FIELDS = Object.freeze([
  "sales_stage_changed_at",
  "current_task_deadline",
  "date_initial_contact",
  "site_survey_date",
  "date_estimate_sent",
  "date_order_created",
  "project_install_date",
  "permit_submitted_date",
  "permit_receipt_confirmed_date",
  "permit_approved_date",
  "follow_up_date",
  "sales_last_follow_up_completed_at",
  "expected_close_date",
  "close_date",
  "start_date",
]);

const dateFields = new Set(SALES_DATE_FILTER_FIELDS);

export function isSalesDateFilterField(field) {
  return dateFields.has(field);
}

// Compare calendar dates, not parseFloat("2026-09-28") === 2026.
// ISO timestamps compare by their stored date portion, without reinterpreting
// the date through the browser's local timezone. Existing M/D/YY filters are
// accepted with an explicit 2000–2099 interpretation.
export function salesFilterCalendarDay(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (!iso && !us) return null;

  const year = iso ? Number(iso[1]) : (us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]));
  const month = iso ? Number(iso[2]) : Number(us[1]);
  const day = iso ? Number(iso[3]) : Number(us[2]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

export function compareSalesDateFilterRange(actual, expected, operator) {
  const actualDay = salesFilterCalendarDay(actual);
  const expectedDay = salesFilterCalendarDay(expected);
  if (!actualDay || !expectedDay) return false;
  if (operator === "greater_than") return actualDay > expectedDay;
  if (operator === "less_than") return actualDay < expectedDay;
  return false;
}
