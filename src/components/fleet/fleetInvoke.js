import { base44 } from "@/api/base44Client";
import { getSessionToken, notifySessionRejected } from "@/components/auth/EmailGate";

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

export async function invokeFleet(name, payload = {}) {
  try {
    return await base44.functions.invoke(name, {
      session_token: getSessionToken(),
      ...(payload || {}),
    });
  } finally {
    if (!READ_ONLY_FUNCTIONS.has(name)) mutationEpoch += 1;
  }
}