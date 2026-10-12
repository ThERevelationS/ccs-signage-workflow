import { DELETION_IMPACT_RESPONSE_DEADLINE_MS, withDeletionImpactDeadline } from "./deletionImpactDeadline.js";

export const DELETION_IMPACT_RETRY_COOLDOWN_MS = 90_000;
export const DELETION_IMPACT_BUSY_MESSAGE = "A prior account deletion impact scan is still awaiting its server response.";
export const DELETION_IMPACT_COOLDOWN_MESSAGE = "Account deletion impact retry is temporarily paused after a timed-out scan.";
export const DELETION_IMPACT_BACKEND_TIMEOUT_MESSAGE = "Account deletion impact scan timed out. No report was verified.";

let activeInvocation = null;
let retryBlockedUntil = 0;

export function getDeletionImpactRetryState() {
  return {
    inFlight: activeInvocation !== null,
    retryInMs: Math.max(0, retryBlockedUntil - Date.now()),
  };
}

/**
 * Browser-tab coordination only. A timeout does not cancel the SDK request:
 * retain ownership until it settles, and pause new attempts after a timeout.
 * This is not a cross-browser lock or a distributed server-side lease.
 */
export async function runCoordinatedDeletionImpact(
  operation,
  { deadlineMs = DELETION_IMPACT_RESPONSE_DEADLINE_MS, cooldownMs = DELETION_IMPACT_RETRY_COOLDOWN_MS } = {},
) {
  if (typeof operation !== "function" ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 120_000 ||
      !Number.isSafeInteger(cooldownMs) || cooldownMs < 1 || cooldownMs > 300_000) {
    throw new Error("Invalid account deletion impact scan parameters.");
  }
  if (activeInvocation) throw new Error(DELETION_IMPACT_BUSY_MESSAGE);
  if (getDeletionImpactRetryState().retryInMs > 0) throw new Error(DELETION_IMPACT_COOLDOWN_MESSAGE);

  const invocation = Promise.resolve().then(operation);
  activeInvocation = invocation;
  // Both outcomes release ownership. This handler also handles a late failure
  // without generating an unhandled rejection after the UI deadline.
  void invocation.then(
    () => { if (activeInvocation === invocation) activeInvocation = null; },
    () => { if (activeInvocation === invocation) activeInvocation = null; },
  );
  try {
    return await withDeletionImpactDeadline(() => invocation, deadlineMs);
  } catch (error) {
    if (error?.message === "Account deletion impact scan timed out. No report was verified." ||
        error?.message === DELETION_IMPACT_BACKEND_TIMEOUT_MESSAGE) {
      retryBlockedUntil = Math.max(retryBlockedUntil, Date.now() + cooldownMs);
    }
    throw error;
  }
}
