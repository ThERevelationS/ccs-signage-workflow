import { base44 } from "@/api/base44Client";
import { validateDeletionImpactReport } from "./deletionImpactValidation.js";
import { runCoordinatedDeletionImpact } from "./deletionImpactRetryCoordinator.js";

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

export async function listAccountDeletionRequestsAdmin({ sessionToken } = {}) {
  const result = await invokeAdminUsers({
    action: "list_deletion_requests",
    session_token: requireSessionToken(sessionToken),
  });
  if (!Array.isArray(result?.deletion_requests)) {
    throw new Error("Account deletion requests could not be loaded safely.");
  }
  return result.deletion_requests;
}

export async function getAccountDeletionImpactAdmin({ request, sessionToken } = {}) {
  if (!request?.id || !request?.updated_date || !request?.user_email || !request?.authorized_email_id) {
    throw new Error("Deletion request identity is incomplete. Reload before reviewing its impact.");
  }

  const token = requireSessionToken(sessionToken);
  const result = await runCoordinatedDeletionImpact(() => invokeAdminUsers({
    action: "deletion_impact",
    request_id: request.id,
    session_token: token,
  }));
  if (result?.success !== true) {
    throw new Error("Account deletion impact could not be verified safely.");
  }
  return validateDeletionImpactReport(result.impact, request);
}

// Pre-delete impact check for the Remove User dialog — same read-only report
// as the request-scoped path, but keyed directly on the user's identity.
export async function getUserDeletionImpactAdmin({ user, sessionToken } = {}) {
  const email = String(user?.email || "").trim().toLowerCase();
  const authorizedId = String(user?.id || "").trim();
  if (!email || !authorizedId) {
    throw new Error("User identity is incomplete. Reload before reviewing impact.");
  }
  const result = await runCoordinatedDeletionImpact(() => invokeAdminUsers({
    action: "deletion_impact",
    user_email: email,
    authorized_email_id: authorizedId,
    user_name: user?.full_name || "",
    session_token: requireSessionToken(sessionToken),
  }));
  if (result?.success !== true) {
    throw new Error("User deletion impact could not be verified safely.");
  }
  return result.impact;
}

export async function resolveAccountDeletionRequestAdmin({
  request,
  resolution,
  adminNotes = "",
  sessionToken,
} = {}) {
  if (!request?.id || !request?.updated_date || !request?.user_email || !request?.authorized_email_id ||
      request?.status !== "pending") {
    throw new Error("Deletion request is missing its verified pending identity or version. Reload before resolving it.");
  }
  if (!["processed", "cancelled"].includes(resolution)) {
    throw new Error("Deletion request resolution is invalid.");
  }

  const result = await invokeAdminUsers({
    action: "resolve_deletion_request",
    request_id: request.id,
    expected_updated_date: request.updated_date,
    expected_user_email: request.user_email,
    expected_authorized_email_id: request.authorized_email_id,
    resolution,
    admin_notes: adminNotes,
    session_token: requireSessionToken(sessionToken),
  });
  if (!result?.success || result.record?.id !== request.id ||
      result.record?.status !== resolution ||
      String(result.record.resolution_source_updated_date || "") !== String(request.updated_date) ||
      String(result.record.authorized_email_id || "") !== String(request.authorized_email_id) ||
      String(result.record.user_email || "").trim().toLowerCase() !== String(request.user_email).trim().toLowerCase()) {
    throw new Error("Deletion request resolution could not be verified.");
  }
  return result.record;
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
  const permissionDependsOnRole = ["can_order_export", "can_view_resources"]
    .some(field => Object.prototype.hasOwnProperty.call(desired, field));
  const result = await invokeAdminUsers({
    action: "update",
    id: record.id,
    email: record.email,
    next_fields: desired,
    expected_fields: expectedFields,
    // Not a write field: protect role-dependent permission edits against a
    // role change between the editor snapshot and the backend conditional write.
    ...(permissionDependsOnRole ? { expected_role: record.role } : {}),
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