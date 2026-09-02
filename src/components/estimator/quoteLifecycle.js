const whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Customer-facing quote issuance metadata.
 *
 * Quote versions are deliberately separate from EstimateRevision.revision_number:
 * lifecycle audit events (approval, cancellation, conversion, etc.) do not mean a
 * new customer quote was issued. A quote version advances only on a persisted
 * transition INTO `sent`.
 *
 * Existing/historical sent estimates are not backfilled merely by being saved.
 */
export function resolveQuoteIssueMetadata({
  previousStatus = "",
  nextStatus = "",
  currentVersion = 0,
  today,
}) {
  const enteringSent = nextStatus === "sent" && previousStatus && previousStatus !== "sent";
  if (!enteringSent) return {};

  return {
    quote_version: Math.max(0, whole(currentVersion)) + 1,
    quote_issue_date: today,
  };
}

export function formatQuoteIssueDate(value, fallbackDate = new Date()) {
  const text = String(value || "").trim();
  if (!text) return fallbackDate.toLocaleDateString();

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
}
