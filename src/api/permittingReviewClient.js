import { base44 } from "@/api/base44Client";

export function invokePermittingReview(payload) {
  const sessionToken = typeof window === "undefined" ? "" : window.localStorage.getItem("sss_session_token") || "";
  return base44.functions.invoke("permittingRuleReview", {
    ...payload,
    ...(sessionToken ? { session_token: sessionToken } : {}),
  });
}
