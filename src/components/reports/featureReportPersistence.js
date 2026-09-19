import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken, label) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error(`${label} requires an active sign-in session.`);
  return token;
}

async function invokeFeatureReport(payload) {
  try {
    const response = await base44.functions.invoke("manageFeatureReports", payload);
    return response?.data || response;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || "Report could not be changed safely.");
  }
}

export async function listFeatureReports({ scope = "open", sessionToken = "" } = {}) {
  const result = await invokeFeatureReport({
    action: "list",
    scope,
    session_token: String(sessionToken || "").trim(),
  });
  if (!Array.isArray(result?.records)) throw new Error("Feature reports could not be loaded safely.");
  return result.records;
}

export async function createFeatureReportWithRecovery({ data, sessionToken, label = "Feature report" } = {}) {
  const result = await invokeFeatureReport({
    action: "create",
    data,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
  return result;
}

export async function updateFeatureReportFields({ record, nextFields, sessionToken, label = "Feature report" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is missing its loaded version. Reload before saving.`);
  const result = await invokeFeatureReport({
    action: "update",
    id: record.id,
    expected_updated_date: record.updated_date,
    next_fields: nextFields,
    session_token: requireSessionToken(sessionToken, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteFeatureReportSafely({ record, sessionToken, label = "Feature report" } = {}) {
  if (!record?.id || !record?.updated_date) throw new Error(`${label} is missing its loaded version. Reload before deleting.`);
  return invokeFeatureReport({
    action: "delete",
    id: record.id,
    expected_updated_date: record.updated_date,
    session_token: requireSessionToken(sessionToken, label),
  });
}
