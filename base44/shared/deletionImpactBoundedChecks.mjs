// Bounded read-only impact queries protect the admin backend from an unbounded
// burst of entity scans, while preserving the report's deterministic order.
export async function runDeletionImpactChecks(checks, maxConcurrency = 5, deadlineMs = 60_000) {
  if (!Array.isArray(checks) || !Number.isSafeInteger(maxConcurrency) ||
      maxConcurrency < 1 || maxConcurrency > 10 ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 120_000 ||
      checks.some(check => typeof check !== "function")) {
    throw new Error("Invalid deletion impact scan plan.");
  }
  const results = new Array(checks.length);
  let next = 0;
  let stopped = false;
  let deadlineTimer;
  // Timeout rejects the entire report and stops *scheduling* new reads.
  // Existing SDK reads cannot be cancelled, so their late results are ignored.
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => {
      stopped = true;
      reject(new Error("Deletion impact scan deadline exceeded; no report was verified."));
    }, deadlineMs);
  });
  async function work() {
    while (!stopped && next < checks.length) {
      const index = next++;
      try {
        const result = await checks[index]();
        if (!stopped) results[index] = result;
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  }
  try {
    await Promise.race([
      Promise.all(Array.from(
        { length: Math.min(maxConcurrency, checks.length) }, () => work(),
      )),
      deadline,
    ]);
    return results;
  } finally {
    stopped = true;
    clearTimeout(deadlineTimer);
  }
}
