// Automation recovery uses read-only snapshots. A hung read must not hold the
// editor indefinitely; timing out does not cancel a request at the server.
export const AUTOMATION_READ_DEADLINE_MS = 25_000;

export class AutomationReadTimeoutError extends Error {
  constructor() {
    super("Automation rule verification timed out. No result was verified.");
    this.name = "AutomationReadTimeoutError";
  }
}

export async function withAutomationReadDeadline(operation, deadlineMs = AUTOMATION_READ_DEADLINE_MS) {
  if (typeof operation !== "function" || !Number.isSafeInteger(deadlineMs) ||
      deadlineMs < 1 || deadlineMs > 120_000) {
    throw new Error("Invalid Automation verification deadline.");
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AutomationReadTimeoutError()), deadlineMs);
  });
  try {
    // Promise.race observes the losing promise's settlement/rejection. The
    // caller's owned request ID prevents any late response from taking effect.
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
