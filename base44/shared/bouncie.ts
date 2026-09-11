import { secrets } from "base44:runtime";

const AUTH_BASE = "https://auth.bouncie.com";
const API_BASE = "https://api.bouncie.dev";

// Published app origin used for externally-registered URLs (OAuth redirect_uri,
// webhook endpoint). The function runtime's own req.url origin resolves to an
// internal dispatcher host, which does NOT match what partners register in
// their dashboards — so this must be the public app domain.
export const APP_BASE = "https://clay-flow-signage-suite-387da97c.base44.app";

export function appFunctionUrl(name) {
  return `${APP_BASE}/functions/${name}`;
}

export const WEBHOOK_NAME = "CCS Signage Workflow Fleet Events";

export const WEBHOOK_EVENTS = [
  "tripStart", "tripData", "tripEnd", "tripMetrics",
  "mil", "battery", "connect", "disconnect", "vinChange",
  "userGeozone", "applicationGeozone"
];

// Paths any authenticated CCS user may READ.
export const READ_ALLOWLIST = [
  "/v1/user",
  "/v1/vehicles",
  "/v1/trips",
  "/v1/user-geozones/",
  "/v1/application-geozones/",
  "/v1/locations/",
  "/v1/schedules/"
];

// Path prefixes an admin may write to.
export const ADMIN_WRITE_PREFIXES = [
  "/v1/webhooks",
  "/v1/application-geozones/",
  "/v1/locations/",
  "/v1/schedules/"
];

export function isAllowedRead(path) {
  return READ_ALLOWLIST.some((p) => path === p || path.startsWith(p));
}

export function isAllowedAdminWrite(path) {
  return ADMIN_WRITE_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/* ---------------- connection record ---------------- */

export async function getActiveConnection(base44) {
  const conns = await base44.asServiceRole.entities.BouncieConnection.list();
  if (!conns || conns.length === 0) return null;
  return conns.sort(
    (a, b) => new Date(b.updated_date).getTime() - new Date(a.updated_date).getTime()
  )[0];
}

export async function saveConnection(base44, data) {
  const existing = await getActiveConnection(base44);
  if (existing) {
    return await base44.asServiceRole.entities.BouncieConnection.update(existing.id, data);
  }
  return await base44.asServiceRole.entities.BouncieConnection.create(data);
}

export async function patchConnection(base44, patch) {
  const existing = await getActiveConnection(base44);
  if (!existing) return null;
  return await base44.asServiceRole.entities.BouncieConnection.update(existing.id, patch);
}

/* ---------------- oauth ---------------- */

export async function exchangeAuthorizationCode(base44, code, redirectUri) {
  const res = await fetch(AUTH_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: (secrets.get("BOUNCIE_CLIENT_ID") || "").trim(),
      client_secret: (secrets.get("BOUNCIE_CLIENT_SECRET") || "").trim(),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return await res.json();
}

// Rotates BOTH tokens. Bouncie issues a new refresh token on every refresh.
export async function refreshAccessToken(base44, connection) {
  const res = await fetch(AUTH_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: (secrets.get("BOUNCIE_CLIENT_ID") || "").trim(),
      client_secret: (secrets.get("BOUNCIE_CLIENT_SECRET") || "").trim(),
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token
    })
  });

  if (!res.ok) {
    const text = await res.text();
    await base44.asServiceRole.entities.BouncieConnection.update(connection.id, {
      needs_reconnect: true,
      last_error: `Token refresh rejected by Bouncie (${res.status}). Reauthorization required.`,
      last_error_at: new Date().toISOString()
    });
    throw new Error("BOUNCIE_REAUTH_REQUIRED");
  }

  const tokens = await res.json();
  await base44.asServiceRole.entities.BouncieConnection.update(connection.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || connection.refresh_token,
    expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    token_type: tokens.token_type || "Bearer",
    needs_reconnect: false,
    last_error: ""
  });
  return tokens.access_token;
}

export async function getValidAccessToken(base44) {
  const conn = await getActiveConnection(base44);
  if (!conn) throw new Error("BOUNCIE_NOT_CONNECTED");
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  // Refresh a couple of minutes early so in-flight requests don't race expiry.
  if (!expiresAt || expiresAt - Date.now() < 120000) {
    return await refreshAccessToken(base44, conn);
  }
  return conn.access_token;
}

/* ---------------- rest api ---------------- */

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

  const send = (accessToken) =>
    fetch(url, {
      // Bouncie expects the RAW access token — no "Bearer " prefix.
      method,
      headers: { Authorization: accessToken, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });

  let res = await send(token);

  // Exactly one controlled refresh + retry on 401. Never loops.
  if (res.status === 401) {
    const conn = await getActiveConnection(base44);
    if (!conn) throw new Error("BOUNCIE_NOT_CONNECTED");
    const newToken = await refreshAccessToken(base44, conn);
    res = await send(newToken);
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = `Bouncie API ${method} ${path} failed (${res.status})`;
    await patchConnection(base44, { last_error: msg, last_error_at: new Date().toISOString() });
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  await patchConnection(base44, { last_sync_at: new Date().toISOString(), last_error: "" });
  return data;
}

export async function fetchBouncieUser(base44, accessToken) {
  const res = await fetch(API_BASE + "/v1/user", { headers: { Authorization: accessToken } });
  if (!res.ok) return {};
  return await res.json();
}

/* ---------------- webhook upsert ---------------- */

export async function upsertWebhook(base44, origin) {
  const webhookUrl = `${origin}/functions/bouncieWebhook`;
  const authKey = secrets.get("BOUNCIE_WEBHOOK_KEY") || "";
  if (!authKey) {
    throw new Error("BOUNCIE_WEBHOOK_KEY_NOT_CONFIGURED");
  }

  const existing = await callBouncieApi(base44, "GET", "/v1/webhooks");
  const list = Array.isArray(existing) ? existing : existing?.data || [];
  const match = list.find((w) => w.url === webhookUrl);

  const desired = {
    name: WEBHOOK_NAME,
    url: webhookUrl,
    authKey,
    active: true,
    events: WEBHOOK_EVENTS
  };

  let result;
  let action;
  if (match) {
    const sameEvents =
      Array.isArray(match.events) &&
      match.events.length === WEBHOOK_EVENTS.length &&
      WEBHOOK_EVENTS.every((e) => match.events.includes(e));
    if (sameEvents && match.active === true) {
      result = match;
      action = "verified";
    } else {
      const id = match.webhookId || match.id || match._id;
      result = await callBouncieApi(base44, "PUT", `/v1/webhooks/${id}`, { body: desired });
      result = result && typeof result === "object" ? { ...match, ...desired } : { ...match, ...desired };
      action = "updated";
    }
  } else {
    const created = await callBouncieApi(base44, "POST", "/v1/webhooks", { body: desired });
    result = created && typeof created === "object" ? { ...desired, ...created } : desired;
    action = "created";
  }

  const id = result.webhookId || result.id || result._id || match?.webhookId || "";
  await patchConnection(base44, {
    webhook_id: String(id || ""),
    webhook_url: webhookUrl,
    webhook_active: result.active !== false,
    webhook_events: Array.isArray(result.events) ? result.events : WEBHOOK_EVENTS,
    webhook_checked_at: new Date().toISOString(),
    webhook_error: ""
  });

  return { action, webhookId: String(id || ""), url: webhookUrl, events: WEBHOOK_EVENTS };
}

/* ---------------- webhook event normalization ---------------- */

// Each Bouncie webhook nests its payload under a DIFFERENT key — not always event[eventType].
const PAYLOAD_KEY = {
  connect: "connect",
  disconnect: "disconnect",
  battery: "battery",
  mil: "mil",
  vinChange: "vinChange",
  tripStart: "start",
  tripData: "data",
  tripMetrics: "metrics",
  tripEnd: "end",
  userGeozone: "geozone",
  applicationGeozone: "geozone"
};

const EVENT_CATEGORY = {
  tripStart: "drive", tripEnd: "drive", tripData: "drive", tripMetrics: "drive",
  userGeozone: "drive", applicationGeozone: "drive",
  mil: "care",
  battery: "vehicle", connect: "vehicle", disconnect: "vehicle", vinChange: "vehicle"
};

export function extractPayload(event) {
  const key = PAYLOAD_KEY[event?.eventType];
  const raw = key ? event[key] : undefined;
  // Fall back to the legacy event[eventType] shape so older/unknown events still parse.
  const value = raw !== undefined ? raw : event?.[event?.eventType];
  if (Array.isArray(value)) return { list: value, first: value[0] || {}, last: value[value.length - 1] || {} };
  return { list: null, first: value || {}, last: value || {} };
}

function firstNumber(...vals) {
  for (const v of vals) if (typeof v === "number" && isFinite(v)) return v;
  return undefined;
}

// Deterministic key so repeated deliveries of the same event collapse to one record.
export function buildEventKey(event, payload, timestamp) {
  const parts = [
    event.vin || event.imei || "",
    event.eventType || "",
    timestamp || "",
    payload?.transactionId || event.transactionId || "",
    payload?.gps ? `${payload.gps.lat},${payload.gps.lon}` : "",
    payload?.odometer != null ? String(payload.odometer) : "",
    payload?.value != null ? String(payload.value) : "",
    payload?.name || ""
  ];
  return parts.join("|").slice(0, 480);
}

export function milSemanticState(input) {
  const raw = input?.raw_data || input || {};
  const mil = raw?.mil || raw || {};
  const rawState = mil?.milOn !== undefined ? mil.milOn : mil?.value;
  const stateText = String(rawState ?? '').trim().toLowerCase();
  const known = rawState === true || rawState === false || ['on','off','true','false','1','0'].includes(stateText);
  const on = rawState === true || ['on','true','1'].includes(stateText);
  const codes = [];
  const dtcs = mil?.qualifiedDtcList || mil?.dtcList || [];
  if (Array.isArray(dtcs)) {
    for (const dtc of dtcs) {
      const code = String(dtc?.code || dtc || '').trim().toUpperCase();
      if (code) codes.push(code);
    }
  }
  const rawCodes = String(mil?.codes || '').trim();
  if (rawCodes) {
    for (const code of rawCodes.split(/[,;\s]+/)) {
      const normalized = String(code || '').trim().toUpperCase();
      if (normalized) codes.push(normalized);
    }
  }
  const uniqueCodes = [...new Set(codes)].sort();
  return {
    known,
    on,
    codes: uniqueCodes,
    signature: known ? `${on ? 'on' : 'off'}|${uniqueCodes.join(',')}` : '',
  };
}

export function normalizeWebhookEvent(event) {
  const eventType = event?.eventType;
  const { list, first, last } = extractPayload(event);
  const payload = last || {};
  const timestamp = payload.timestamp || first?.timestamp || new Date().toISOString();
  const category = EVENT_CATEGORY[eventType] || "vehicle";

  let title = eventType || "Fleet event";
  let description = "";
  let severity = "info";

  if (eventType === "mil") {
    const state = milSemanticState(payload);
    const on = state.known ? state.on : null;
    title = on === true ? "Check engine light is on" : on === false ? "Check engine light cleared" : "Check engine light status updated";
    const dtcs = payload.qualifiedDtcList || payload.dtcList || [];
    description = Array.isArray(dtcs) && dtcs.length
      ? dtcs.map((d) => `${d.code || ""} ${(Array.isArray(d.name) ? d.name.join(", ") : d.name) || ""}`.trim()).join(" · ")
      : payload.codes || (on === true ? "Malfunction indicator lamp is on" : on === false ? "Malfunction indicator lamp is off" : "Malfunction indicator lamp status changed");
    severity = on === true ? "warning" : "info";
  } else if (eventType === "battery") {
    const status = payload.status || payload.value || "unknown";
    title = `Battery level is ${status}`;
    description = `Vehicle battery status reported as ${status}`;
    severity = String(status).toLowerCase() === "critical" ? "critical" : "warning";
  } else if (eventType === "connect") {
    title = "Bouncie device connected";
    description = "The Bouncie device reconnected to the vehicle.";
  } else if (eventType === "disconnect") {
    title = "Bouncie device disconnected";
    description = "The Bouncie device lost power or was unplugged.";
    severity = "warning";
  } else if (eventType === "vinChange") {
    title = "VIN changed";
    description = `${payload.oldVin || "unknown"} → ${payload.newVin || payload.vin || ""}`;
  } else if (eventType === "tripStart") {
    title = "Trip started";
    const odo = firstNumber(payload.odometer);
    description = odo != null ? `Starting odometer ${Math.round(odo).toLocaleString()} mi` : "Vehicle started driving.";
  } else if (eventType === "tripEnd") {
    title = "Trip ended";
    const odo = firstNumber(payload.odometer);
    const fuel = firstNumber(payload.fuelConsumed);
    const bits = [];
    if (odo != null) bits.push(`Ending odometer ${Math.round(odo).toLocaleString()} mi`);
    if (fuel != null && fuel > 0) bits.push(`${fuel.toFixed(2)} gal used`);
    description = bits.join(" · ") || "Vehicle stopped driving.";
  } else if (eventType === "tripMetrics") {
    title = "Trip metrics updated";
    const dist = firstNumber(payload.totalDistance, payload.distance);
    description = dist != null ? `${Math.round(dist).toLocaleString()} mi so far` : "Trip metrics received.";
  } else if (eventType === "userGeozone" || eventType === "applicationGeozone") {
    const dir = payload.event || payload.type || "";
    const name = payload.name || payload.geozoneName || "Geo-Zone";
    title = `${name} — ${String(dir).toLowerCase() === "exit" ? "Exited" : "Entered"}`;
    description = eventType === "userGeozone"
      ? `Bouncie user geo-zone ${name}`
      : `Application geo-zone ${name}`;
  }

  return {
    eventType,
    category,
    timestamp,
    title,
    description,
    severity,
    payload,
    points: list,
    eventKey: buildEventKey(event, payload, timestamp),
    // tripData is telemetry, not a notification — it only drives live map state.
    createNotification: eventType !== "tripData"
  };
}

/* ---------------- live vehicle state ---------------- */

const MAX_PATH_POINTS = 250;

const timeValue = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function latestDateValue(rows, field) {
  let winner = null;
  let winnerTime = 0;
  for (const row of rows || []) {
    const value = row?.[field];
    const parsed = timeValue(value);
    if (parsed >= winnerTime && value) {
      winner = value;
      winnerTime = parsed;
    }
  }
  return winner;
}

function mergedLivePath(rows, extraPoints = []) {
  const all = [...(rows || []).flatMap((row) => Array.isArray(row?.recent_path_points) ? row.recent_path_points : []), ...(extraPoints || [])]
    .filter((point) => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)));
  const seen = new Set();
  const unique = [];
  for (const point of all) {
    const key = `${point.ts || ""}|${point.lat}|${point.lon}|${point.speed ?? ""}|${point.heading ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  unique.sort((a, b) => timeValue(a?.ts) - timeValue(b?.ts));
  return unique.slice(-MAX_PATH_POINTS);
}

function mergeLiveStateRows(rows) {
  const ordered = (rows || []).slice().sort((a, b) => {
    const eventDelta = timeValue(b?.last_event_at) - timeValue(a?.last_event_at);
    if (eventDelta) return eventDelta;
    const seenDelta = timeValue(b?.last_seen_at) - timeValue(a?.last_seen_at);
    if (seenDelta) return seenDelta;
    return timeValue(b?.updated_date || b?.created_date) - timeValue(a?.updated_date || a?.created_date);
  });
  const latest = ordered[0] || {};
  const firstPresent = (field) => ordered.find((row) => row?.[field] !== undefined && row?.[field] !== null && row?.[field] !== "")?.[field];
  const latestEndedAt = timeValue(latest?.ended_at);
  const latestStartedAt = timeValue(latest?.started_at);
  const latestEventAt = timeValue(latest?.last_event_at);
  const hasDefinitiveEnd = !!latest?.ended_at
    && !String(latest?.transaction_id || "").trim()
    && (!latestStartedAt || latestEndedAt >= latestStartedAt)
    && (!latestEventAt || latestEndedAt >= latestEventAt);
  const active = hasDefinitiveEnd
    ? false
    : typeof latest?.is_trip_active === "boolean"
      ? latest.is_trip_active
      : ordered.find((row) => typeof row?.is_trip_active === "boolean")?.is_trip_active ?? false;
  const merged = {
    vehicle_vin: firstPresent("vehicle_vin") || "",
    vehicle_imei: firstPresent("vehicle_imei") || "",
    transaction_id: active ? (firstPresent("transaction_id") || null) : null,
    is_trip_active: active,
    latitude: firstPresent("latitude"),
    longitude: firstPresent("longitude"),
    heading: firstPresent("heading"),
    speed: active ? firstPresent("speed") : 0,
    fuel_level: firstPresent("fuel_level"),
    odometer: firstPresent("odometer"),
    started_at: latestDateValue(ordered, "started_at"),
    ended_at: active ? null : latestDateValue(ordered, "ended_at"),
    last_event_at: latestDateValue(ordered, "last_event_at"),
    last_seen_at: latestDateValue(ordered, "last_seen_at"),
    recent_path_points: mergedLivePath(ordered),
  };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

export async function coalesceLiveStateRows(LiveState, vin) {
  const rows = await LiveState.filter({ vehicle_vin: vin });
  if (!rows?.length) return null;
  if (rows.length === 1) {
    const current = rows[0];
    const normalized = mergeLiveStateRows(rows);
    const stateFields = ["is_trip_active", "transaction_id", "ended_at", "speed"];
    const needsStateNormalization = stateFields.some((field) => String(current?.[field] ?? "") !== String(normalized?.[field] ?? ""));
    if (!needsStateNormalization) return current;
    return await LiveState.update(current.id, normalized) || { ...current, ...normalized };
  }

  // Bouncie live state is a derived cache, not trip history. Keep one deterministic
  // row per VIN while merging the newest state and bounded path from duplicate cache rows.
  const winner = rows.slice().sort((a, b) => {
    const createdDelta = timeValue(a?.created_date) - timeValue(b?.created_date);
    if (createdDelta) return createdDelta;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0];
  const patch = mergeLiveStateRows(rows);
  const saved = await LiveState.update(winner.id, patch);
  for (const row of rows) {
    if (row.id !== winner.id) await LiveState.delete(row.id).catch(() => null);
  }
  return saved || { ...winner, ...patch };
}

function pointsFrom(list, payload) {
  const src = Array.isArray(list) ? list : payload ? [payload] : [];
  return src
    .map((p) => {
      const gps = p?.gps || p?.location || {};
      const lat = firstNumber(gps.lat, gps.latitude, p?.lat);
      const lon = firstNumber(gps.lon, gps.lng, gps.longitude, p?.lon);
      if (lat == null || lon == null) return null;
      return {
        lat, lon,
        ts: p?.timestamp || new Date().toISOString(),
        speed: firstNumber(p?.speed, gps.speed),
        heading: firstNumber(gps.heading, p?.heading)
      };
    })
    .filter(Boolean);
}

export async function applyLiveState(base44, event, normalized) {
  const vin = event.vin;
  if (!vin) return;
  const { eventType, payload, points, timestamp } = normalized;
  if (!["tripStart", "tripData", "tripEnd", "tripMetrics"].includes(eventType)) return;

  const LiveState = base44.asServiceRole.entities.BouncieVehicleLiveState;
  let current = await coalesceLiveStateRows(LiveState, vin);

  const newPoints = pointsFrom(points, payload);
  const latest = newPoints[newPoints.length - 1];

  const incomingAt = timeValue(timestamp);
  const currentAt = timeValue(current?.last_event_at);
  const endedAt = timeValue(current?.ended_at);
  const delayedTelemetryAfterEnd = eventType === "tripData"
    && current?.is_trip_active === false
    && endedAt > 0
    && incomingAt > 0
    && incomingAt <= endedAt;
  const incomingIsCurrent = (!currentAt || !incomingAt || incomingAt >= currentAt) && !delayedTelemetryAfterEnd;
  const patch = { last_seen_at: new Date().toISOString() };

  if (incomingIsCurrent) {
    patch.vehicle_vin = vin;
    patch.vehicle_imei = event.imei || current?.vehicle_imei || "";
    patch.last_event_at = timestamp;
    const transactionId = payload.transactionId || event.transactionId;
    if (transactionId) patch.transaction_id = String(transactionId);
    if (latest) {
      patch.latitude = latest.lat;
      patch.longitude = latest.lon;
      if (latest.heading != null) patch.heading = latest.heading;
      if (latest.speed != null) patch.speed = latest.speed;
    }
    const fuel = firstNumber(payload.fuelLevel, payload.fuel);
    if (fuel != null) patch.fuel_level = fuel;
    const odo = firstNumber(payload.odometer);
    if (odo != null) patch.odometer = odo;

    if (eventType === "tripStart") {
      patch.is_trip_active = true;
      patch.started_at = timestamp;
      patch.ended_at = null;
      patch.recent_path_points = newPoints.slice(-MAX_PATH_POINTS);
    } else if (eventType === "tripEnd") {
      patch.is_trip_active = false;
      patch.transaction_id = null;
      patch.ended_at = timestamp;
      patch.speed = 0;
      if (current?.recent_path_points?.length) patch.recent_path_points = mergedLivePath([current]);
    } else if (newPoints.length) {
      patch.recent_path_points = mergedLivePath(current ? [current] : [], newPoints);
      patch.is_trip_active = true;
      const recoveringMissedTripStart = eventType === "tripData"
        && (current?.is_trip_active !== true || (endedAt > 0 && incomingAt > endedAt));
      if (recoveringMissedTripStart) {
        patch.started_at = newPoints[0]?.ts || timestamp;
        patch.ended_at = null;
      }
    }
  } else if (newPoints.length) {
    // A delayed telemetry batch may still contribute path detail, but must never
    // roll the current trip state, odometer, position, or active/ended flags backward.
    patch.recent_path_points = mergedLivePath(current ? [current] : [], newPoints);
  }

  if (current) {
    await LiveState.update(current.id, patch);
  } else {
    await LiveState.create({ vehicle_vin: vin, vehicle_imei: event.imei || "", ...patch });
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  // Collapse only this VIN's duplicate derived cache rows. This preserves the newest
  // live state/path while preventing first-event races from leaving permanent duplicates.
  current = await coalesceLiveStateRows(LiveState, vin);
  return current;
}