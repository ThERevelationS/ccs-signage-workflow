// src/components/estimator/quoteLifecycle.js
var whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
function localDateStamp(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function quoteIssueKey(estimateId, quoteVersion) {
  const id = String(estimateId || "").trim();
  const version = Math.max(0, whole(quoteVersion));
  return id && version > 0 ? `estimate:${id}:quote:v${version}` : "";
}
function resolveQuoteIssueMetadata({
  previousStatus = "",
  nextStatus = "",
  currentVersion = 0,
  today,
  completingSentRevision = false
}) {
  const enteringSent = nextStatus === "sent" && previousStatus && previousStatus !== "sent";
  const reissuingSentRevision = nextStatus === "sent" && previousStatus === "sent" && completingSentRevision;
  if (!enteringSent && !reissuingSentRevision) return {};
  return {
    quote_version: Math.max(0, whole(currentVersion)) + 1,
    quote_issue_date: today
  };
}
function quoteExpirationDate(issueDate, validDays = 30, fallbackDate = /* @__PURE__ */ new Date()) {
  const baseText = String(issueDate || localDateStamp(fallbackDate)).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseText);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + Math.max(0, whole(validDays, 30)));
  return localDateStamp(date);
}
function isQuoteExpired(issueDate, validDays = 30, today = localDateStamp()) {
  const expiration = quoteExpirationDate(issueDate, validDays);
  return !!expiration && String(today || localDateStamp()) > expiration;
}
function formatQuoteIssueDate(value, fallbackDate = /* @__PURE__ */ new Date()) {
  const text = String(value || "").trim();
  if (!text) return fallbackDate.toLocaleDateString();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
}
export {
  formatQuoteIssueDate,
  isQuoteExpired,
  localDateStamp,
  quoteExpirationDate,
  quoteIssueKey,
  resolveQuoteIssueMetadata
};
