export function resolvePipelineSalesStatus(estimateStatus, existingStatus = "") {
  if (estimateStatus === "approved") return "won";
  if (estimateStatus === "archived") return "lost";
  if (estimateStatus === "sent") {
    return ["won", "lost", "on_hold"].includes(existingStatus) ? existingStatus : "quoted";
  }
  return existingStatus || "lead";
}
