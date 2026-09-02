export function resolvePipelineSalesStatus(estimateStatus, existingStatus = "") {
  if (estimateStatus === "approved") return "won";
  if (estimateStatus === "archived") return "lost";
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
