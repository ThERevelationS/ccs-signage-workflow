import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { createRequestGovernor } from "@/api/requestGovernor.mjs";

// A read issued while a pre-mutation fetch is in flight must not consume that
// fetch's stale snapshot — so every completed fleet* invoke advances a mutation
// epoch that the entity loaders fold into their dedupe signatures. Even an
// invoke that throws may have committed server-side (lost ack), so the bump is
// unconditional for anything that is not a pure read.
let mutationEpoch = 0;
export const getFleetMutationEpoch = () => mutationEpoch;
const READ_ONLY_FUNCTIONS = new Set([
  "fleetDataRead",
  "verifySession",
  "bouncieStatus",
  "bouncieApi",
  "getGoogleMapsKey",
]);

// All backend invokes share the app's function rate budget, and pages fan out
// dozens of staffDataRead calls at mount — an unbounded burst 429s itself. The
// governor caps in-flight invokes and retries rejected ones with backoff so a
// busy page degrades to slower loads instead of failing outright.
const invokeGovernor = createRequestGovernor({
  maxConcurrent: 6,
  maxRetries: 1,
  baseDelayMs: 800,
  maxDelayMs: 10000,
});

export async function invokeFleet(name, payload = {}) {
  try {
    return await invokeGovernor.run(`invoke:${name}`, () =>
      base44.functions.invoke(name, {
        session_token: getSessionToken(),
        ...(payload || {}),
      }),
      { retryOnRateLimit: true },
    );
  } finally {
    if (!READ_ONLY_FUNCTIONS.has(name)) mutationEpoch += 1;
  }
}
