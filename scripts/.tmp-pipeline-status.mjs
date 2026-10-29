// src/components/estimator/pipelineStatus.js
function resolvePipelineSalesStatus(estimateStatus, existingStatus = "") {
  if (estimateStatus === "approved") return "won";
  if (estimateStatus === "cancelled") return "lost";
  if (estimateStatus === "archived") return existingStatus || "lead";
  if (estimateStatus === "sent") {
    return ["won", "lost", "on_hold"].includes(existingStatus) ? existingStatus : "quoted";
  }
  return existingStatus || "lead";
}
function resolvePipelineLifecycleDates({
  estimateStatus,
  previousEstimateStatus = "",
  existingDateEstimateSent = "",
  existingQuoteSentVerifiedAt = "",
  today,
  issuedQuoteDate = "",
  issuedQuoteVersion = 0
}) {
  if (existingDateEstimateSent) {
    if (existingQuoteSentVerifiedAt) return {};
    if (["sent", "approved", "archived", "cancelled"].includes(estimateStatus) && Number(issuedQuoteVersion || 0) > 0 && issuedQuoteDate && issuedQuoteDate === existingDateEstimateSent) {
      return { date_estimate_sent: issuedQuoteDate };
    }
    return {};
  }
  if (estimateStatus === "sent" && previousEstimateStatus && previousEstimateStatus !== "sent") {
    return { date_estimate_sent: today };
  }
  if (["sent", "approved", "archived", "cancelled"].includes(estimateStatus) && Number(issuedQuoteVersion || 0) > 0 && issuedQuoteDate) {
    return { date_estimate_sent: issuedQuoteDate };
  }
  return {};
}
export {
  resolvePipelineLifecycleDates,
  resolvePipelineSalesStatus
};
