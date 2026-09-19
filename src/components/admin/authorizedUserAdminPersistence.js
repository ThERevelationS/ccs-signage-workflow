import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active admin sign-in session is required.");
  return token;
}

async function invokeAdminUsers(payload) {
  try {
    const response = await base44.functions.invoke("manageAuthorizedUsers", payload);
    const data = response?.data || response;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.data?.error || error?.message || "User administration could not be completed safely.");
  }
}

export async function listAuthorizedUsersAdmin({ sessionToken } = {}) {
  const result = await invokeAdminUsers({
    action: "list",
    session_token: requireSessionToken(sessionToken),
  });
  if (!Array.isArray(result?.users)) throw new Error("Authorized users could not be loaded safely.");
  return result.users;
}

export async function createAuthorizedUserAdmin({ data, sessionToken } = {}) {
  const result = await invokeAdminUsers({
    action: "create",
    data,
    session_token: requireSessionToken(sessionToken),
  });
  if (!result?.success || !result?.record?.id) throw new Error("Authorized user create could not be verified.");
  return result;
}

export async function updateAuthorizedUserAdmin({ record, nextFields, sessionToken } = {}) {
  if (!record?.id || !record?.email) throw new Error("Authorized user is not loaded. Reload before saving.");
  const desired = nextFields && typeof nextFields === "object" ? nextFields : {};
  const expectedFields = Object.fromEntries(Object.keys(desired).map((field) => [field, record?.[field]]));
  const result = await invokeAdminUsers({
    action: "update",
    id: record.id,
    email: record.email,
    next_fields: desired,
    expected_fields: expectedFields,
    session_token: requireSessionToken(sessionToken),
  });
  if (!result?.success || !result?.record?.id) throw new Error("Authorized user update could not be verified.");
  return result.record;
}

export async function updateAuthorizedUserHrAdmin({ record, hrData, sessionToken } = {}) {
  if (!record?.id || !record?.email) throw new Error("Authorized user is not loaded. Reload before saving HR data.");
  const result = await invokeAdminUsers({
    action: "update_hr",
    id: record.id,
    email: record.email,
    hr_data: hrData,
    expected_hr_data: record.hr_data ?? null,
    session_token: requireSessionToken(sessionToken),
  });
  if (!result?.success || !result?.record?.id) throw new Error("Authorized user HR update could not be verified.");
  return result.record;
}

export async function deleteAuthorizedUserAdmin({ record, sessionToken } = {}) {
  if (!record?.id || !record?.email || !record?.updated_date) {
    throw new Error("Authorized user is missing its loaded version. Reload before removing it.");
  }
  const result = await invokeAdminUsers({
    action: "delete",
    id: record.id,
    email: record.email,
    expected_updated_date: record.updated_date,
    session_token: requireSessionToken(sessionToken),
  });
  if (!result?.success || result?.deleted !== true) throw new Error("Authorized user deletion could not be verified.");
  return result;
}
