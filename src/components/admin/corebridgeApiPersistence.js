import { base44 } from "@/api/base44Client";

function requireSessionToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("An active sign-in session is required.");
  return token;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

async function invokeCorebridgeApi(action, sessionToken, extra = {}) {
  try {
    const response = await base44.functions.invoke("corebridgeApiAction", {
      action,
      session_token: requireSessionToken(sessionToken),
      ...extra,
    });
    const data = response?.data || response;
    if (!data?.success) throw new Error(data?.error || "CoreBridge API request could not be verified.");
    return data;
  } catch (error) {
    throw new Error(errorMessage(error, "CoreBridge API request could not be completed safely."));
  }
}

export async function getCorebridgeApiStatus({ sessionToken } = {}) {
  return invokeCorebridgeApi("status", sessionToken);
}

export async function testCorebridgeApiConnection({ sessionToken } = {}) {
  return invokeCorebridgeApi("test_connection", sessionToken);
}

export async function getCorebridgeApiAccountSummary({ sessionToken } = {}) {
  return invokeCorebridgeApi("account_summary", sessionToken);
}
