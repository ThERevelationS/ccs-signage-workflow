import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

// Board pages render a WorkOrderCard per row and every card (plus dialogs and
// resource views) used to fire its own listAuthorizedUserDirectory invoke at
// mount — dozens of calls in a few seconds that rate-limit the function into
// deterministic 500s. Cache the directory briefly, share one in-flight call,
// and back off after a failure so a struggling backend is never re-hit in a
// render loop.
const DIRECTORY_CACHE_MS = 5 * 60 * 1000;
const DIRECTORY_FAILURE_COOLDOWN_MS = 60 * 1000;
const EMPTY_DIRECTORY = {
  viewer: { id: "", email: "", role: "user", can_view_resources: false },
  users: [],
};
let directoryCache = { token: null, at: 0, value: null };
let directoryInFlight = null;
let directoryCooldownUntil = 0;

const lastGoodFor = (token) =>
  directoryCache.token === token && directoryCache.value ? directoryCache.value : null;

export async function loadAuthorizedUserDirectory({ sessionToken } = {}) {
  const token = requireSessionToken(sessionToken);
  const now = Date.now();
  const cached = lastGoodFor(token);
  if (cached && now - directoryCache.at < DIRECTORY_CACHE_MS) return cached;
  if (directoryInFlight && directoryInFlight.token === token) return directoryInFlight.promise;
  if (now < directoryCooldownUntil) return cached || EMPTY_DIRECTORY;

  const promise = (async () => {
    try {
      const response = await base44.functions.invoke("listAuthorizedUserDirectory", {
        session_token: token,
      });
      const data = response?.data || response;
      if (!data?.success || !Array.isArray(data?.users) || !data?.viewer?.email) {
        throw new Error(data?.error || "The authorized user directory could not be verified.");
      }
      return {
        viewer: data.viewer,
        users: data.users,
      };
    } catch (error) {
      throw new Error(
        error?.response?.data?.error ||
        error?.data?.error ||
        error?.message ||
        "The authorized user directory could not be loaded safely."
      );
    }
  })();

  directoryInFlight = { token, promise };
  try {
    const value = await promise;
    directoryCache = { token, at: Date.now(), value };
    return value;
  } catch (error) {
    directoryCooldownUntil = Date.now() + DIRECTORY_FAILURE_COOLDOWN_MS;
    // A stale directory is better than none; without one, an empty directory
    // stops the caller's error path from re-invoking on the next render.
    const fallback = lastGoodFor(token);
    if (fallback) return fallback;
    console.warn("Authorized user directory unavailable; serving an empty directory for 60s.", error);
    return EMPTY_DIRECTORY;
  } finally {
    if (directoryInFlight?.promise === promise) directoryInFlight = null;
  }
}
