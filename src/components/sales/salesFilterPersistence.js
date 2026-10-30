import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken, label) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error(`${label} requires an active sign-in session.`);
  return token;
}

async function invokeSalesFilter(payload) {
  try {
    const response = await base44.functions.invoke("manageSalesFilters", payload);
    return response?.data || response;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || "Saved filter could not be changed safely.");
  }
}

// Every Sales Pipeline mount, live-filter event, and preference save used to
// invoke manageSalesFilters again — under load that function 503s and the
// screens retry it back into the same wall. Cache the read briefly, share one
// in-flight call per session, and wait out failures instead of re-invoking.
const PREFERENCES_CACHE_MS = 5 * 60 * 1000;
const PREFERENCES_FAILURE_COOLDOWN_MS = 60 * 1000;
let preferencesCache = { token: "", at: 0, value: null };
let preferencesInFlight = null;
let preferencesCooldownUntil = 0;
let preferencesLastError = null;

const cachedPreferencesFor = (token) =>
  preferencesCache.token === token && preferencesCache.value ? preferencesCache.value : null;

export async function loadSalesPipelinePreferencesSafely({ sessionToken, label = "Sales Pipeline preferences" } = {}) {
  const token = requireSessionToken(sessionToken, label);
  const now = Date.now();
  const cached = cachedPreferencesFor(token);
  if (cached && now - preferencesCache.at < PREFERENCES_CACHE_MS) return { ...cached };
  if (preferencesInFlight && preferencesInFlight.token === token) {
    return preferencesInFlight.promise.then((value) => ({ ...value }));
  }
  if (now < preferencesCooldownUntil) {
    if (cached) return { ...cached };
    throw preferencesLastError || new Error(`${label} is busy. Try again shortly.`);
  }

  const promise = (async () => {
    const result = await invokeSalesFilter({ action: "preferences_get", session_token: token });
    const preferences = result?.preferences;
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
      throw new Error(`${label} could not be verified.`);
    }
    return preferences;
  })();

  preferencesInFlight = { token, promise };
  try {
    const value = await promise;
    preferencesCache = { token, at: Date.now(), value };
    return { ...value };
  } catch (error) {
    preferencesCooldownUntil = Date.now() + PREFERENCES_FAILURE_COOLDOWN_MS;
    preferencesLastError = error;
    const stale = cachedPreferencesFor(token);
    if (stale) return { ...stale };
    throw error;
  } finally {
    if (preferencesInFlight?.promise === promise) preferencesInFlight = null;
  }
}

export async function saveSalesPipelinePreferencesSafely({
  sessionToken,
  preferences,
  expectedPreferences,
  label = "Sales Pipeline preferences",
} = {}) {
  const payload = {
    action: "preferences_set",
    session_token: requireSessionToken(sessionToken, label),
    preferences,
  };
  if (expectedPreferences !== undefined) payload.expected_preferences = expectedPreferences;
  const result = await invokeSalesFilter(payload);
  const saved = result?.preferences;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    throw new Error(`${label} saved but could not be verified.`);
  }
  // The save is authoritative — keep the read cache in step so the next
  // preference load serves the just-saved value instead of a stale snapshot.
  preferencesCache = { token: payload.session_token, at: Date.now(), value: saved };
  return saved;
}

export async function loadSalesDefaultSortSafely({ sessionToken, label = "Sales Pipeline default sort" } = {}) {
  const result = await invokeSalesFilter({
    action: "default_sort_get",
    session_token: requireSessionToken(sessionToken, label),
  });
  return { record: result?.record || null, value: result?.value || { column: "created_date", direction: "desc" } };
}

export async function saveSalesDefaultSortSafely({ sessionToken, record, value, label = "Sales Pipeline default sort" } = {}) {
  const result = await invokeSalesFilter({
    action: "default_sort_set",
    session_token: requireSessionToken(sessionToken, label),
    expected_updated_date: record?.updated_date || "",
    value,
  });
  if (!result?.record?.id || !result?.value) throw new Error(`${label} save could not be verified.`);
  return result;
}

// Several Sales screens need the same roster at once. Share one request and
// reuse the answer briefly, and wait out "busy" responses instead of failing.
const ROSTER_TTL_MS = 5 * 60 * 1000;
let rosterCache = { token: "", at: 0, promise: null };
const isBusyError = (error) => /busy|rate limit|429|too many/i.test(String(error?.message || ""));

async function fetchRoster(token, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await invokeSalesFilter({ action: "roster", session_token: token });
      if (!Array.isArray(result?.users)) throw new Error(`${label} could not be verified.`);
      return result.users;
    } catch (error) {
      if (!isBusyError(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt + Math.random() * 500));
    }
  }
}

export async function loadSalesPersonRosterSafely({ sessionToken, label = "Sales person roster" } = {}) {
  const token = requireSessionToken(sessionToken, label);
  const fresh = rosterCache.promise && rosterCache.token === token && Date.now() - rosterCache.at < ROSTER_TTL_MS;
  if (!fresh) {
    const promise = fetchRoster(token, label);
    rosterCache = { token, at: Date.now(), promise };
    promise.catch(() => {
      if (rosterCache.promise === promise) rosterCache = { token: "", at: 0, promise: null };
    });
  }
  const users = await rosterCache.promise;
  return users.map((user) => ({ ...user }));
}

export async function createSalesFilterIfAbsent({ data, sessionToken, label = "Sales filter" } = {}) {
  const result = await invokeSalesFilter({
    action: "create",
    data,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
  return result;
}

export async function createUniqueSalesFilterCopy({ source, sessionToken, label = "Sales filter copy" } = {}) {
  const result = await invokeSalesFilter({
    action: "copy",
    source,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} copy could not be verified.`);
  return result;
}

export async function updateSalesFilterIfUnchanged({ record, nextFields, sessionToken, label = "Sales filter" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const result = await invokeSalesFilter({
    action: "update",
    id: record.id,
    expected_updated_date: record.updated_date,
    next_fields: nextFields,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteSalesFilterIfUnchanged({ record, sessionToken, label = "Sales filter" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return invokeSalesFilter({
    action: "delete",
    id: record.id,
    expected_updated_date: record.updated_date,
    session_token: requireSessionToken(sessionToken, label),
  });
}

export async function setSalesFilterSelectionSafely({
  recordId,
  selected,
  sessionToken,
  label = "Sales filter selection",
} = {}) {
  const id = String(recordId || "").trim();
  if (!id) throw new Error(`${label} could not identify the saved filter.`);
  const result = await invokeSalesFilter({
    action: "selection",
    id,
    selected: Boolean(selected),
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}