export function syncQueueRetryKind(error) {
  const status = Number(error?.response?.status ?? error?.status);
  const text = String(error?.response?.data?.error || error?.data?.error || error?.message || "");
  if (status === 429 || /rate limit/i.test(text)) return "rate_limit";
  if (status === 409 && /already running/i.test(text)) return "coordinator_busy";
  return "none";
}
