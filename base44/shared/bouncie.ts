import { secrets } from "base44:runtime";

const AUTH_BASE = "https://auth.bouncie.com";
const API_BASE = "https://api.bouncie.dev";

export async function getActiveConnection(base44) {
  const conns = await base44.asServiceRole.entities.BouncieConnection.list();
  if (!conns || conns.length === 0) return null;
  return conns.sort((a, b) => new Date(b.updated_date).getTime() - new Date(a.updated_date).getTime())[0];
}

export async function saveConnection(base44, data) {
  const existing = await getActiveConnection(base44);
  if (existing) {
    return await base44.asServiceRole.entities.BouncieConnection.update(existing.id, data);
  }
  return await base44.asServiceRole.entities.BouncieConnection.create(data);
}

export async function exchangeAuthorizationCode(base44, code, redirectUri) {
  const clientId = secrets.get("BOUNCIE_CLIENT_ID");
  const clientSecret = secrets.get("BOUNCIE_CLIENT_SECRET");
  const res = await fetch(AUTH_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function refreshAccessToken(base44, connection) {
  const clientId = secrets.get("BOUNCIE_CLIENT_ID");
  const clientSecret = secrets.get("BOUNCIE_CLIENT_SECRET");
  const res = await fetch(AUTH_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
  await saveConnection(base44, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    token_type: tokens.token_type || "Bearer"
  });
  return tokens.access_token;
}

export async function getValidAccessToken(base44) {
  const conn = await getActiveConnection(base44);
  if (!conn) throw new Error("Bouncie not connected. Please connect your Bouncie account first.");
  const expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;
  if (!expiresAt || expiresAt.getTime() - Date.now() < 60000) {
    return await refreshAccessToken(base44, conn);
  }
  return conn.access_token;
}

export async function callBouncieApi(base44, method, path, { query, body } = {}) {
  const token = await getValidAccessToken(base44);
  let url = API_BASE + path;
  if (query && Object.keys(query).length) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    }
    url += "?" + params.toString();
  }
  const headers = { Authorization: token, "Content-Type": "application/json" };
  let res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    const conn = await getActiveConnection(base44);
    if (conn) {
      const newToken = await refreshAccessToken(base44, conn);
      res = await fetch(url, {
        method,
        headers: { ...headers, Authorization: newToken },
        body: body ? JSON.stringify(body) : undefined
      });
    }
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`Bouncie API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return data;
}

export async function fetchBouncieUser(base44, accessToken) {
  const res = await fetch(API_BASE + "/v1/user", { headers: { Authorization: accessToken } });
  if (!res.ok) return {};
  return await res.json();
}