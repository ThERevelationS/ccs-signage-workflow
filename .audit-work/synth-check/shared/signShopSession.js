import { constantTimeEqual } from "./constantTime.ts";
import { applyOwnerCapabilities } from "./ownerRole.ts";
const sessionAuthCache = /* @__PURE__ */ new Map();
const SESSION_AUTH_CACHE_MS = 15e3;
function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  let value = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  return atob(value);
}
async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}
async function signShopSessionPayload(payload) {
  const secret = Deno.env.get("SESSION_SIGNING_SECRET");
  if (!secret) throw Object.assign(new Error("Session authentication is unavailable"), { status: 503 });
  const payloadStr = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(payloadStr, secret);
  return `${payloadStr}.${sig}`;
}
async function signShopSessionTokenHash(token) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(buf)));
}
async function authenticateSignShopSession(base44, token) {
  const rawToken = String(token || "").trim();
  if (!rawToken) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const parts = rawToken.split(".");
  if (parts.length !== 2) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const secret = Deno.env.get("SESSION_SIGNING_SECRET");
  if (!secret) throw Object.assign(new Error("Session authentication is unavailable"), { status: 503 });
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) throw Object.assign(new Error("Authentication required"), { status: 401 });
  let sessionPayload;
  try {
    sessionPayload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  const email = String(sessionPayload?.email || "").trim().toLowerCase();
  const issuedAt = Number(sessionPayload?.iat);
  const expiresAt = Number(sessionPayload?.exp);
  if (!email || !Number.isFinite(issuedAt) || issuedAt <= 0 || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  const stripExpiredGrant = (user2) => {
    const grantExpiry = Date.parse(String(user2?.admin_grant_expires || ""));
    if (Number.isFinite(grantExpiry) && grantExpiry > 0 && grantExpiry <= Date.now() && user2) {
      user2.role = "user";
      user2.is_full_admin = false;
      user2.admin_permissions = {};
    }
    return user2;
  };
  const tokenHash = await signShopSessionTokenHash(rawToken);
  const cachedAuth = sessionAuthCache.get(tokenHash);
  if (cachedAuth && cachedAuth.expires > Date.now()) {
    const cachedUser = applyOwnerCapabilities(stripExpiredGrant(cachedAuth.user));
    const cachedNotBefore = Date.parse(String(cachedUser?.session_not_before || ""));
    if (Number.isFinite(cachedNotBefore) && cachedNotBefore > 0 && issuedAt < cachedNotBefore) {
      throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
    return cachedUser;
  }
  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(users)) {
    throw Object.assign(new Error("Authenticated user identity could not be verified"), { status: 503 });
  }
  if (users.length === 0) throw Object.assign(new Error("Authentication required"), { status: 401 });
  if (users.length !== 1) {
    throw Object.assign(new Error("Authenticated user identity is ambiguous"), { status: 409 });
  }
  try {
    const revoked = await base44.asServiceRole.entities.UserSession.filter({ token_hash: tokenHash, revoked: true });
    if (Array.isArray(revoked) && revoked.length > 0) {
      throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
  } catch (e) {
    if (e?.status === 401) throw e;
  }
  const user = applyOwnerCapabilities(stripExpiredGrant(users[0]));
  if (sessionAuthCache.size > 500) sessionAuthCache.clear();
  sessionAuthCache.set(tokenHash, { user, expires: Date.now() + SESSION_AUTH_CACHE_MS });
  const notBefore = Date.parse(String(user?.session_not_before || ""));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  return user;
}
export {
  authenticateSignShopSession,
  signShopSessionPayload,
  signShopSessionTokenHash
};
