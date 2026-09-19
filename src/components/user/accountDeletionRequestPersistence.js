import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

async function invokeDeletionRequest(action, sessionToken) {
  try {
    const response = await base44.functions.invoke("manageAccountDeletionRequest", {
      action,
      session_token: requireSessionToken(sessionToken),
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "The account deletion request could not be verified.");
    return data?.request || null;
  } catch (error) {
    throw new Error(errorMessage(error, "The account deletion request could not be handled safely."));
  }
}

export async function loadOwnAccountDeletionRequest({ sessionToken } = {}) {
  return invokeDeletionRequest("status", sessionToken);
}

export async function submitOwnAccountDeletionRequest({ sessionToken } = {}) {
  const request = await invokeDeletionRequest("request", sessionToken);
  if (!request?.id || request?.status !== "pending") {
    throw new Error("The account deletion request was not persisted as pending.");
  }
  return request;
}
