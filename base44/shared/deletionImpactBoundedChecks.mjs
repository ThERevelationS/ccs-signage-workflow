// Bounded read-only impact queries protect the admin backend from an unbounded
// burst of entity scans, while preserving the report's deterministic order.
export async function runDeletionImpactChecks(checks, maxConcurrency = 5) {
  if (!Array.isArray(checks) || !Number.isSafeInteger(maxConcurrency) ||
      maxConcurrency < 1 || maxConcurrency > 10 ||
      checks.some(check => typeof check !== "function")) {
    throw new Error("Invalid deletion impact scan plan.");
  }
  const results = new Array(checks.length);
  let next = 0;
  let failed = false;
  async function work() {
    while (!failed && next < checks.length) {
      const index = next++;
      try {
        results[index] = await checks[index]();
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(maxConcurrency, checks.length) }, () => work(),
  ));
  return results;
}
