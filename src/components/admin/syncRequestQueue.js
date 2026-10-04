import { base44 } from "@/api/base44Client";
import { syncQueueRetryKind } from "@/components/admin/syncRequestQueuePolicy.mjs";

// One Smartsheet sync request at a time from this browser, and a patient retry
// when another sync (scheduled or from another user) holds the coordinator.
let tail = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(payload, {
  attempts = 8,
  delayMs = 10000,
  retryRateLimit = true,
  retryCoordinatorBusy = true,
} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await base44.functions.invoke("smartsheetSyncAction", payload);
      const data = response?.data || response;
      const skippedForRate = Array.isArray(data?.results) &&
        data.results.some((r) => /rate limit/i.test(String(r?.reason || "")));
      if (!skippedForRate || !retryRateLimit || attempt >= attempts) return response;
    } catch (error) {
      const kind = syncQueueRetryKind(error);
      const canRetry = kind === "coordinator_busy" ? retryCoordinatorBusy
        : kind === "rate_limit" ? retryRateLimit : false;
      if (!canRetry || attempt >= attempts) throw error;
    }
    await wait(delayMs);
  }
}

export function queueSmartsheetSync(payload, options) {
  const next = tail.then(() => run(payload, options));
  tail = next.catch(() => {});
  return next;
}