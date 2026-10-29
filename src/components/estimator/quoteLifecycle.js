const whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function localDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Company-timezone display formatting (#488): renders a date/time value in
// the configured company timezone (QuoteDefaults.display_timezone). Blank
// falls back to the browser's local zone so existing pages stay unchanged.
let _tzCache = { tz: null, fmt: null };
export function formatInCompanyTz(value, companyTz = "", pattern = "MMM d") {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tz = String(companyTz || "").trim();
  if (!tz) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    if (pattern === "MMM d") return `${months[d.getMonth()]} ${d.getDate()}`;
    if (pattern === "MMM d, yyyy") return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return d.toLocaleDateString();
  }
  try {
    if (_tzCache.tz !== tz) {
      _tzCache = { tz, fmt: new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }) };
    }
    return _tzCache.fmt.format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function quoteIssueKey(estimateId, quoteVersion) {
  const id = String(estimateId || "").trim();
  const version = Math.max(0, whole(quoteVersion));
  return id && version > 0 ? `estimate:${id}:quote:v${version}` : "";
}

/**
 * Customer-facing quote issuance metadata.
 *
 * Quote versions are deliberately separate from EstimateRevision.revision_number:
 * lifecycle audit events (approval, cancellation, conversion, etc.) do not mean a
 * new customer quote was issued. A quote version advances on a persisted
 * transition INTO `sent`, or when an intentional open revision is completed
 * while the estimate remains `sent`.
 *
 * Existing/historical sent estimates are not backfilled merely by being saved.
 */
export function resolveQuoteIssueMetadata({
  previousStatus = "",
  nextStatus = "",
  currentVersion = 0,
  today,
  completingSentRevision = false,
}) {
  const enteringSent = nextStatus === "sent" && previousStatus && previousStatus !== "sent";
  const reissuingSentRevision = nextStatus === "sent" && previousStatus === "sent" && completingSentRevision;
  if (!enteringSent && !reissuingSentRevision) return {};

  return {
    quote_version: Math.max(0, whole(currentVersion)) + 1,
    quote_issue_date: today,
  };
}


export function estimateQuoteExpiration(estimate = {}, validDaysFallback = 30) {
  const override = String(estimate?.quote_expiration_date || "").trim();
  if (/^d{4}-d{2}-d{2}$/.test(override)) return override;
  return quoteExpirationDate(estimate?.quote_issue_date || localDateStamp(), estimate?.quote_valid_days ?? validDaysFallback);
}

export function quoteExpirationDate(issueDate, validDays = 30, fallbackDate = new Date()) {
  const baseText = String(issueDate || localDateStamp(fallbackDate)).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseText);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + Math.max(0, whole(validDays, 30)));
  return localDateStamp(date);
}

export function isQuoteExpired(issueDate, validDays = 30, today = localDateStamp()) {
  const expiration = quoteExpirationDate(issueDate, validDays);
  return !!expiration && String(today || localDateStamp()) > expiration;
}

export function formatQuoteIssueDate(value, fallbackDate = new Date()) {
  const text = String(value || "").trim();
  if (!text) return fallbackDate.toLocaleDateString();

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
}
