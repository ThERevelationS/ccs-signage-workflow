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

export async function loadSalesPipelinePreferencesSafely({ sessionToken, label = "Sales Pipeline preferences" } = {}) {
  const result = await invokeSalesFilter({
    action: "preferences_get",
    session_token: requireSessionToken(sessionToken, label),
  });
  const preferences = result?.preferences;
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    throw new Error(`${label} could not be verified.`);
  }
  return preferences;
}

export async function saveSalesPipelinePreferencesSafely({ sessionToken, preferences, label = "Sales Pipeline preferences" } = {}) {
  const result = await invokeSalesFilter({
    action: "preferences_set",
    session_token: requireSessionToken(sessionToken, label),
    preferences,
  });
  const saved = result?.preferences;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    throw new Error(`${label} saved but could not be verified.`);
  }
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

export async function loadSalesPersonRosterSafely({ sessionToken, label = "Sales person roster" } = {}) {
  const result = await invokeSalesFilter({
    action: "roster",
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!Array.isArray(result?.users)) throw new Error(`${label} could not be verified.`);
  return result.users;
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
