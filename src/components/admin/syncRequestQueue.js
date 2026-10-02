import { base44 } from "@/api/base44Client";

// One Smartsheet sync request at a time from this browser, and a patient retry
// when another sync (scheduled or from another user) holds the coordinator.
let tail = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorText(error) {
  return String(error?.response?.data?.error || error?.data?.error || error?.message || "");
}

function isBusy(error) {
  const status = error?.response?.status || error?.status;
  return status === 429 || status === 409 && /already running/i.test(errorText(error)) || /rate limit/i.test(errorText(error));
}

async function run(payload, { attempts = 8, delayMs = 10000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await base44.functions.invoke("smartsheetSyncAction", payload);
      const data = response?.data || response;
      const skippedForRate = Array.isArray(data?.results) &&
        data.results.some((r) => /rate limit/i.test(String(r?.reason || "")));
      if (!skippedForRate || attempt >= attempts) return response;
    } catch (error) {
      if (!isBusy(error) || attempt >= attempts) throw error;
    }
    await wait(delayMs);
  }
}

export function queueSmartsheetSync(payload, options) {
  const next = tail.then(() => run(payload, options));
  tail = next.catch(() => {});
  return next;
}