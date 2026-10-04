export const TIME_CLOCK_IDLE_LOGOUT_MS = 15 * 60 * 1000;

export function remainingTimeClockSessionMs(lastActivityAt, nowMs = Date.now()) {
  const last = Number(lastActivityAt);
  const now = Number(nowMs);
  if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(now)) return 0;
  return Math.max(0, TIME_CLOCK_IDLE_LOGOUT_MS - Math.max(0, now - last));
}

export function classifyTimeClockLoginStatus(status) {
  if (!status?.success) return { kind: "unverified", status: String(status?.status || "") };

  if (status.requires_punch_resolution === true && status?.entry?.id && status?.punch_resolution) {
    return {
      kind: "punch_resolution",
      status: String(status.status || "clocked_in"),
      clockIn: status.entry.clock_in || null,
      entryId: status.entry.id,
    };
  }

  const unresolvedPunchReview = status?.unresolved_punch_review;
  const unresolvedPunchCount = Number(unresolvedPunchReview?.count || 0);
  if (Number.isFinite(unresolvedPunchCount) && unresolvedPunchCount > 0) {
    return {
      kind: "pending_punch_review",
      status: String(status?.status || ""),
      count: unresolvedPunchCount,
      hasIntegrityIssue: unresolvedPunchReview?.has_integrity_issue === true,
      hasRejectedItem: unresolvedPunchReview?.has_rejected_item === true,
      item: Array.isArray(unresolvedPunchReview?.items) ? unresolvedPunchReview.items[0] || null : null,
      clockIn: status?.entry?.clock_in || null,
      entryId: status?.entry?.id || null,
    };
  }

  if (status?.transition || ["clocking_in", "clocking_out"].includes(String(status?.status || ""))) {
    return {
      kind: "transition",
      status: String(status.status || ""),
      transition: String(status.transition || status.status || ""),
      clockIn: status?.entry?.clock_in || null,
      entryId: status?.entry?.id || null,
    };
  }

  if (status.status === "clocked_in" && status?.entry?.id) {
    return {
      kind: "clocked_in",
      status: "clocked_in",
      clockIn: status.entry.clock_in || null,
      entryId: status.entry.id,
    };
  }

  if (status.status === "clocked_out") {
    return { kind: "clocked_out", status: "clocked_out" };
  }

  return { kind: "unverified", status: String(status?.status || "") };
}
