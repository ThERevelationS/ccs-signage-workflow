import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";

// Staff email bridge client. `sendStaffEmail` is the session-authed backend
// gateway that validates a small plain-text envelope and hands it to sendGmail
// internally — staff sessions cannot call sendGmail directly (it only trusts a
// platform session or the backend workflow capability).
//
// Throws Error with a user-safe message on failure; the thrown error carries
// `.status` when the backend returned an HTTP status. A 404 / missing-function
// response means the bridge has not been deployed yet.
export async function sendStaffEmail({ to, subject, body, cc, kind, sessionToken } = {}) {
  const token = String(sessionToken || "").trim() || getSessionToken();
  let response;
  try {
    response = await base44.functions.invoke("sendStaffEmail", {
      session_token: token,
      to,
      cc,
      subject,
      body,
      kind,
    });
  } catch (error) {
    const status = Number(error?.response?.status ?? error?.status);
    const apiError = error?.response?.data?.error || error?.message;
    const err = new Error(
      status === 404 || /not found|does not exist|no such function|unknown function/i.test(String(apiError))
        ? "Email bridge is not deployed yet."
        : apiError || "Email could not be sent.",
    );
    err.status = status;
    throw err;
  }
  const data = response?.data || response;
  if (data?.error || data?.success === false || data?.ok === false) {
    throw new Error(data?.error || "Email could not be sent.");
  }
  return data;
}
