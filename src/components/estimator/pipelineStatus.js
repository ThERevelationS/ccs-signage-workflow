export function resolvePipelineSalesStatus(estimateStatus, existingStatus = "") {
  if (estimateStatus === "approved") return "won";
  if (estimateStatus === "cancelled") return "lost";
  // Archived is an Estimator filing/queue state, not a sales outcome. Preserve
  // the pipeline result already earned (won/quoted/lost/on-hold/etc.) rather
  // than silently reclassifying an archived record as Lost.
  if (estimateStatus === "archived") return existingStatus || "lead";
  if (estimateStatus === "sent") {
    return ["won", "lost", "on_hold"].includes(existingStatus) ? existingStatus : "quoted";
  }
  return existingStatus || "lead";
}

/**
 * Return timestamp fields that should be added to the Sales Pipeline when an
 * estimate changes lifecycle state. Historical sent estimates are intentionally
 * not backfilled: date_estimate_sent is stamped only on a real transition into
 * sent, and an existing pipeline date is never replaced.
 */
export function resolvePipelineLifecycleDates({
  estimateStatus,
  previousEstimateStatus = "",
  existingDateEstimateSent = "",
  today,
}) {
  if (
    estimateStatus === "sent" &&
    previousEstimateStatus &&
    previousEstimateStatus !== "sent" &&
    !existingDateEstimateSent
  ) {
    return { date_estimate_sent: today };
  }
  return {};
}
