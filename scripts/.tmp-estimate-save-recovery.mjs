// src/components/estimator/estimateSaveRecovery.js
var SYSTEM_FIELDS = /* @__PURE__ */ new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id"
]);
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.keys(value).filter((key) => value[key] !== void 0).sort().reduce((result, key) => {
      result[key] = normalize(value[key]);
      return result;
    }, {});
  }
  return value;
}
function estimateSaveComparableState(record = {}) {
  const comparable = {};
  Object.keys(record || {}).filter((key) => !SYSTEM_FIELDS.has(key) && record[key] !== void 0).sort().forEach((key) => {
    comparable[key] = normalize(record[key]);
  });
  return comparable;
}
function estimateServerMatchesIntendedSave(serverRecord = {}, intendedRecord = {}) {
  return JSON.stringify(estimateSaveComparableState(serverRecord)) === JSON.stringify(estimateSaveComparableState(intendedRecord));
}
function estimateSaveLifecycleBaseline({
  serverRecord = {},
  openRevision = null,
  pendingTransition = null
} = {}) {
  if (openRevision?.estimate_snapshot_before) return openRevision.estimate_snapshot_before;
  if (pendingTransition?.estimateBefore) return pendingTransition.estimateBefore;
  return serverRecord || {};
}
function intendedQuoteIssueMetadata({
  resolveQuoteIssueMetadata,
  serverRecord = {},
  localEstimate = {},
  openRevision = null,
  pendingTransition = null,
  today
} = {}) {
  if (pendingTransition?.quoteIssueMetadata) return { ...pendingTransition.quoteIssueMetadata };
  const baseline = estimateSaveLifecycleBaseline({ serverRecord, openRevision, pendingTransition });
  const baselineStatus = String(baseline?.status || serverRecord?.status || "");
  const baselineVersion = Math.max(0, Math.floor(Number(baseline?.quote_version ?? serverRecord?.quote_version ?? 0)));
  const nextStatus = String(localEstimate?.status || "");
  const completingSentRevision = !!openRevision && baselineStatus === "sent" && nextStatus === "sent";
  const metadata = resolveQuoteIssueMetadata({
    previousStatus: baselineStatus,
    nextStatus,
    currentVersion: baselineVersion,
    today,
    completingSentRevision
  });
  const expectedVersion = Number(metadata?.quote_version || 0);
  if (openRevision && expectedVersion > 0 && Number(serverRecord?.quote_version || 0) === expectedVersion && String(serverRecord?.status || "") === nextStatus && serverRecord?.quote_issue_date) {
    return { ...metadata, quote_issue_date: serverRecord.quote_issue_date };
  }
  return metadata;
}
export {
  estimateSaveComparableState,
  estimateSaveLifecycleBaseline,
  estimateServerMatchesIntendedSave,
  intendedQuoteIssueMetadata
};
