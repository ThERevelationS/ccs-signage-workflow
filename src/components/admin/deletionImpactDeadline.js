// The Base44 function invocation may never settle if its network response is
// lost. Return a failed read after the client deadline; don't show partial data.
// This does not cancel a request already executing on Base44.
export const DELETION_IMPACT_RESPONSE_DEADLINE_MS = 75_000;

export async function withDeletionImpactDeadline(operation, deadlineMs = DELETION_IMPACT_RESPONSE_DEADLINE_MS) {
  if (typeof operation !== "function" || !Number.isSafeInteger(deadlineMs) ||
      deadlineMs < 1 || deadlineMs > 120_000) {
    throw new Error("Invalid impact scan deadline.");
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Account deletion impact scan timed out. No report was verified.")), deadlineMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
