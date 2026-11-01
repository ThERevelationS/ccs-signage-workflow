// scripts/.tmp-sdk-stub-acceptance.mjs
globalThis.__invokeCalls = [];
globalThis.__invokeHandler = null;
var createClientFromRequest = () => ({
  entities: globalThis.__entities,
  asServiceRole: {
    entities: globalThis.__entities,
    functions: { invoke: async (fn, body) => {
      globalThis.__invokeCalls.push({ fn, body });
      return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} };
    } }
  },
  functions: { invoke: async (fn, body) => {
    globalThis.__invokeCalls.push({ fn, body });
    return globalThis.__invokeHandler ? globalThis.__invokeHandler(fn, body) : { data: {} };
  } },
  auth: { me: async () => typeof globalThis.__authMe === "function" ? globalThis.__authMe() : globalThis.__authMe }
});

// base44/shared/smartsheetTraceContext.ts
import { AsyncLocalStorage } from "node:async_hooks";
var syncTraceContext = new AsyncLocalStorage();
var round = (n) => Math.round(n * 100) / 100;
function traceEvent(kind, detail = {}) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  const event = { sequence: ++t.sequence, at: (/* @__PURE__ */ new Date()).toISOString(), elapsed_ms: round(performance.now() - t.start), kind, ...detail };
  if (t.timeline.length < 300) t.timeline.push(event);
  else {
    t.timeline.splice(150, 1);
    t.timeline.push(event);
    t.metrics.timeline_omitted++;
  }
}
function traceDelay(kind, ms, retry = false) {
  const t = syncTraceContext.getStore();
  if (!t) return;
  t.metrics[retry ? "retry_delay_ms" : "pacing_delay_ms"] += round(ms);
  if (retry) t.metrics.retries++;
  traceEvent(kind, { duration_ms: round(ms) });
}

// base44/shared/entityRateLimitRetry.ts
function withEntityRateLimitRetry(client, { paceMs = 0, maxRetries = 5 } = {}) {
  if (!client?.asServiceRole?.entities) return client;
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  const reserveRequest = () => {
    const slot = queue.then(async () => {
      const delay = nextRequestAt - Date.now();
      if (delay > 0) {
        const start = performance.now();
        await new Promise((resolve) => setTimeout(resolve, delay));
        traceDelay("base44_pacing_wait", performance.now() - start);
      }
      nextRequestAt = Date.now() + paceMs;
    });
    queue = slot.catch(() => {
    });
    return slot;
  };
  const isLimited = (e) => e?.status === 429 || /rate limit|traffic volume/i.test(String(e?.message || e?.data?.message || ""));
  const wrapEntity = (entity) => new Proxy(entity, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== "function") return value;
      return async (...args) => {
        for (let attempt = 0; ; attempt++) {
          if (paceMs) await reserveRequest();
          try {
            return await value.apply(target, args);
          } catch (e) {
            if (!isLimited(e) || attempt >= maxRetries) throw e;
            const delay = paceMs ? 15e3 * (attempt + 1) : 1500 * (attempt + 1);
            if (paceMs) nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
            const start = performance.now();
            await new Promise((r) => setTimeout(r, delay));
            traceDelay("base44_retry_wait", performance.now() - start, true);
          }
        }
      };
    }
  });
  const entities = new Proxy(client.asServiceRole.entities, {
    get: (target, name) => target[name] ? wrapEntity(target[name]) : target[name]
  });
  const serviceRole = new Proxy(client.asServiceRole, { get: (t, p) => p === "entities" ? entities : t[p] });
  return new Proxy(client, { get: (t, p) => p === "asServiceRole" ? serviceRole : t[p] });
}

// base44/shared/constantTime.ts
function constantTimeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

// base44/shared/signShopSession.ts
var sessionAuthCache = /* @__PURE__ */ new Map();
var SESSION_AUTH_CACHE_MS = 6e4;
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
  if (cachedAuth && cachedAuth.expires > Date.now()) return stripExpiredGrant(cachedAuth.user);
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
  const user = stripExpiredGrant(users[0]);
  if (sessionAuthCache.size > 500) sessionAuthCache.clear();
  sessionAuthCache.set(tokenHash, { user, expires: Date.now() + SESSION_AUTH_CACHE_MS });
  const notBefore = Date.parse(String(user?.session_not_before || ""));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  return user;
}

// base44/shared/opportunityFoundationPersistence.mjs
var OpportunityFoundationCreateAmbiguityError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OpportunityFoundationCreateAmbiguityError";
    this.code = "OPPORTUNITY_FOUNDATION_CREATE_AMBIGUOUS";
  }
};
function requireFoundationCreationKey(data = {}, label = "Opportunity foundation record") {
  const key = String(data?.creation_request_key || "").trim();
  if (!key) throw new Error(`${label} requires a stable creation_request_key.`);
  return key;
}
async function createFoundationRecordWithRecovery({
  entity,
  data,
  readMatches,
  label = "Opportunity foundation create",
  settleMs = 50
} = {}) {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  if (!payload || typeof entity?.create !== "function" || typeof entity?.get !== "function" || typeof readMatches !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  requireFoundationCreationKey(payload, label);
  const readVerifiedMatches = async (phase) => {
    const rows = await readMatches();
    if (!Array.isArray(rows)) throw new Error(`${label} ${phase} lookup did not return a record list.`);
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(row);
    }
    return unique;
  };
  const before = await readVerifiedMatches("preflight");
  if (before.length > 1) {
    throw new OpportunityFoundationCreateAmbiguityError(
      `${label} found multiple records with the same creation identity. Nothing was deleted; review the duplicates before retrying.`
    );
  }
  if (before.length === 1) return { record: before[0], status: "reused" };
  let created = null;
  let createError = null;
  try {
    created = await entity.create(payload);
  } catch (error) {
    createError = error;
  }
  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  let after = [];
  let verificationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    try {
      after = await readVerifiedMatches("recovery");
      verificationError = null;
      if (after.length) break;
    } catch (error) {
      verificationError = error;
    }
  }
  if (after.length > 1) {
    throw new OpportunityFoundationCreateAmbiguityError(
      `${label} may have been created more than once during concurrent processing or an uncertain response. Nothing was deleted; review the matching records.`
    );
  }
  if (after.length === 1) {
    const record = after[0];
    if (created?.id && String(record.id) !== String(created.id)) {
      const direct = await entity.get(created.id).catch(() => null);
      if (direct?.id) {
        throw new OpportunityFoundationCreateAmbiguityError(
          `${label} returned one create receipt while a different matching record became visible. Nothing was deleted; reload and review.`
        );
      }
    }
    return {
      record,
      status: created?.id && String(record.id) === String(created.id) ? "created" : "recovered"
    };
  }
  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) return { record: direct, status: "created" };
  }
  if (verificationError) {
    throw new Error(`${label} create outcome could not be verified because recovery lookup failed. Do not retry blindly; reload first. ${verificationError?.message || ""}`.trim());
  }
  if (createError) {
    throw new Error(`${createError?.message || `${label} could not be created.`} No matching record was visible after recovery checks. Reload before retrying.`);
  }
  throw new Error(`${label} could not verify whether it was created. Do not retry blindly; reload first.`);
}

// base44/functions/recordEstimateAcceptance/entry.ts
var METHODS = /* @__PURE__ */ new Set(["signed_quote", "email", "verbal", "in_person", "other"]);
var whole = (value, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
var quoteIssueKey = (estimateId, quoteVersion) => estimateId && quoteVersion > 0 ? `estimate:${estimateId}:quote:v${quoteVersion}` : "";
var quoteExpirationDate = (issueDate, validDays) => {
  const text = String(issueDate || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + Math.max(0, whole(validDays, 30)));
  return date.toISOString().slice(0, 10);
};
var canonicalAcceptance = (rows = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.accepted_at || "") || 0;
  const bTime = Date.parse(b?.created_date || b?.accepted_at || "") || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
})[0] || null;
var isActiveAcceptance = (row) => String(row?.status || "accepted") !== "superseded" && !row?.superseded_at;
var activeAcceptanceRows = (rows = []) => (Array.isArray(rows) ? rows : []).filter(isActiveAcceptance);
async function patchEstimateAcceptanceFields(Estimate, estimateId, estimate, acceptance) {
  if (!acceptance?.id) return;
  const patch = {
    accepted_at: String(acceptance.accepted_at || "").trim() || (/* @__PURE__ */ new Date()).toISOString(),
    accepted_by_name: String(acceptance.accepted_by_name || "").trim(),
    accepted_by_email: String(acceptance.accepted_by_email || "").trim()
  };
  const filter = { id: estimateId };
  const version = String(estimate?.updated_date || "").trim();
  if (version) filter.updated_date = version;
  try {
    await Estimate.updateMany(filter, { $set: patch });
  } catch (e) {
    console.error("Estimate acceptance field mirror failed:", e?.message || e);
  }
}
async function rejectEstimateQuote({ base44, user, body }) {
  const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
  const EstimatingRequest = base44.asServiceRole.entities.EstimatingRequest;
  const estimateId = String(body?.estimate_id || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 500);
  if (!estimateId) {
    return Response.json({ error: "Estimate is required to reject a quote." }, { status: 400 });
  }
  if (!reason) {
    return Response.json({ error: "A rejection reason is required \u2014 a lost quote must never be silent." }, { status: 400 });
  }
  const rawDueDate = String(body?.due_date || "").trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate) ? rawDueDate : new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const expectedVersion = String(body?.expected_estimate_updated_date || "").trim();
  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id || estimate?.deleted === true) {
    return Response.json({ error: "Estimate could not be verified for quote rejection." }, { status: 404 });
  }
  if (expectedVersion && expectedVersion !== String(estimate.updated_date || "").trim()) {
    return Response.json({ error: "This estimate changed in another session. Reload before rejecting the quote." }, { status: 409 });
  }
  if (String(estimate.work_order_id || "").trim()) {
    return Response.json({ error: "This estimate is already linked to a Work Order. Cancel or close the job from the workflow instead of rejecting its source quote." }, { status: 409 });
  }
  const status = String(estimate.status || "").trim();
  let saved = estimate;
  let reused = false;
  if (status === "sent") {
    const anchor = String(estimate.updated_date || "").trim();
    if (!anchor) {
      return Response.json({ error: "Estimate is missing version metadata and cannot be rejected safely." }, { status: 409 });
    }
    const result = await Estimate.updateMany(
      { id: estimateId, updated_date: anchor },
      { $set: { status: "cancelled", cancel_reason: reason, cancelled_at: (/* @__PURE__ */ new Date()).toISOString(), edit_reason: "" } }
    );
    if (!result || typeof result.updated !== "number") {
      throw new Error("Quote rejection conditional-update result could not be verified.");
    }
    if (result.updated !== 1) {
      const after = await Estimate.get(estimateId).catch(() => null);
      if (after?.id && String(after?.status || "") === "cancelled" && String(after?.cancel_reason || "").trim() === reason) {
        saved = after;
        reused = true;
      } else {
        return Response.json({ error: "Estimate changed while the quote was being rejected. Reload before rejecting again." }, { status: 409 });
      }
    } else {
      saved = await Estimate.get(estimateId).catch(() => null) || estimate;
    }
  } else if (status === "cancelled" && String(estimate.cancel_reason || "").trim() === reason) {
    reused = true;
  } else {
    return Response.json({ error: `This quote is ${status || "not awaiting response"} \u2014 only sent quotes can be rejected.` }, { status: 409 });
  }
  let followUp = null;
  let followUpWarning = "";
  const requestKey = `staff-reject-request:${estimateId}`;
  const quoteVersion = Math.max(0, whole(estimate.quote_version));
  const quoteLabel = `Quote Version ${quoteVersion || "?"}${estimate.estimate_number ? ` \xB7 ${estimate.estimate_number}` : ""}`;
  try {
    const projectName = String(estimate.project_name || estimate.estimate_number || "estimate").trim();
    const created = await createFoundationRecordWithRecovery({
      entity: EstimatingRequest,
      data: {
        creation_request_key: requestKey,
        estimate_id: estimateId,
        opportunity_id: String(estimate.opportunity_id || "").trim() || `staff-reject:${estimateId}`,
        customer_id: String(estimate.customer_id || "").trim(),
        // "ready" is the queue-visible status — it lands on the estimator
        // queue and attention feed, unlike the legacy "open" value.
        status: "ready",
        requested_at: (/* @__PURE__ */ new Date()).toISOString(),
        submitted_at: (/* @__PURE__ */ new Date()).toISOString(),
        requested_by: String(user.email || user.full_name || user.name || "staff").trim(),
        assigned_estimator: String(estimate.salesperson_email || estimate.created_by || estimate.salesperson || "").trim(),
        due_date: dueDate,
        priority: "high",
        request_kind: "quote_rejection_followup",
        request_notes: `Staff rejected ${quoteLabel} on ${projectName}: ${reason.slice(0, 400)} \u2014 follow up with the customer.`
      },
      readMatches: () => EstimatingRequest.filter({ creation_request_key: requestKey }),
      label: "Staff quote rejection follow-up task"
    });
    followUp = created?.record || null;
  } catch (error) {
    console.error("Quote rejected but its follow-up task failed:", error?.message || error);
    followUpWarning = "The quote was rejected, but its estimator follow-up task could not be queued. Create the follow-up manually.";
  }
  return Response.json({ success: true, action: "reject_quote", estimate: saved, follow_up: followUp, follow_up_warning: followUpWarning, reused });
}
async function supersedeEstimateAcceptance({ base44, user, body }) {
  const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
  const Acceptance = base44.asServiceRole.entities.EstimateAcceptance;
  const estimateId = String(body?.estimate_id || "").trim();
  const acceptanceId = String(body?.acceptance_id || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 500) || "Customer acceptance superseded by staff.";
  const expectedVersion = String(body?.expected_estimate_updated_date || "").trim();
  if (!estimateId) {
    return Response.json({ error: "Estimate is required to supersede an acceptance." }, { status: 400 });
  }
  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id || estimate?.deleted === true) {
    return Response.json({ error: "Estimate could not be verified for acceptance supersede." }, { status: 404 });
  }
  if (expectedVersion && expectedVersion !== String(estimate.updated_date || "").trim()) {
    return Response.json({ error: "This estimate changed in another session. Reload before superseding the acceptance." }, { status: 409 });
  }
  const status = String(estimate.status || "").trim();
  if (!["approved", "sent"].includes(status)) {
    return Response.json({ error: `Only an Approved estimate's customer acceptance can be superseded.` }, { status: 409 });
  }
  const quoteVersion = Math.max(0, whole(estimate.quote_version));
  const rows = await Acceptance.filter({ estimate_id: estimateId, quote_version: quoteVersion });
  if (!Array.isArray(rows)) {
    throw new Error("Acceptance history could not be verified safely.");
  }
  const activeRows = activeAcceptanceRows(rows);
  const target = (acceptanceId ? activeRows.find((row) => String(row?.id || "") === acceptanceId) : null) || canonicalAcceptance(activeRows);
  if (!target?.id) {
    return Response.json({ error: "No active customer acceptance exists for the current Quote Version." }, { status: 409 });
  }
  let saved = estimate;
  let reused = false;
  if (status === "approved") {
    const anchor = String(estimate.updated_date || "").trim();
    if (!anchor) {
      return Response.json({ error: "Estimate is missing version metadata and cannot be superseded safely." }, { status: 409 });
    }
    const result2 = await Estimate.updateMany(
      { id: estimateId, updated_date: anchor },
      { $set: { status: "sent", accepted_at: "", accepted_by_name: "", accepted_by_email: "", edit_reason: "" } }
    );
    if (!result2 || typeof result2.updated !== "number") {
      throw new Error("Acceptance supersede conditional-update result could not be verified.");
    }
    if (result2.updated !== 1) {
      const after = await Estimate.get(estimateId).catch(() => null);
      if (after?.id && String(after?.status || "") === "sent") {
        saved = after;
        reused = true;
      } else {
        return Response.json({ error: "Estimate changed while the acceptance was being superseded. Reload before superseding again." }, { status: 409 });
      }
    } else {
      saved = await Estimate.get(estimateId).catch(() => null) || estimate;
    }
  } else {
    reused = true;
  }
  const targetVersion = String(target.updated_date || "").trim();
  if (!targetVersion) {
    throw new Error("The acceptance record is missing version metadata and cannot be superseded safely.");
  }
  const patch = {
    status: "superseded",
    superseded_at: (/* @__PURE__ */ new Date()).toISOString(),
    superseded_by_email: String(user.email || "").trim(),
    superseded_by_name: String(user.full_name || user.name || user.email || "").trim(),
    supersede_reason: reason
  };
  const result = await Acceptance.updateMany({ id: target.id, updated_date: targetVersion }, { $set: patch });
  if (!result || typeof result.updated !== "number") {
    throw new Error("Acceptance supersede conditional-update result could not be verified.");
  }
  let superseded = target;
  if (result.updated === 1) {
    superseded = await Acceptance.get(target.id).catch(() => null) || { ...target, ...patch };
  } else {
    const after = await Acceptance.get(target.id).catch(() => null);
    if (after?.id && !isActiveAcceptance(after)) {
      superseded = after;
      reused = true;
    } else {
      return Response.json({ error: "Acceptance changed while it was being superseded. Reload before superseding again." }, { status: 409 });
    }
  }
  return Response.json({ success: true, action: "supersede_acceptance", estimate: saved, acceptance: superseded, reused });
}
Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const action = String(body?.action || "record").trim();
    if (action === "reject_quote") return await rejectEstimateQuote({ base44, user, body });
    if (action === "supersede_acceptance") return await supersedeEstimateAcceptance({ base44, user, body });
    const estimateId = String(body?.estimate_id || "").trim();
    const quoteVersion = Math.max(0, whole(body?.quote_version));
    const acceptedByName = String(body?.accepted_by_name || "").trim();
    const acceptedByEmail = String(body?.accepted_by_email || "").trim();
    if (acceptedByEmail && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(acceptedByEmail)) {
      return Response.json({ error: "accepted_by_email is not a valid email address." }, { status: 400 });
    }
    const acceptanceMethod = String(body?.acceptance_method || "").trim();
    const acceptedAt = String(body?.accepted_at || "").trim();
    const deliveryId = String(body?.delivery_id || "").trim();
    const rawEvidence = String(body?.evidence_reference || "").trim();
    const evidenceReference = /^(javascript|data|vbscript)[ ]*:/i.test(rawEvidence) ? "" : rawEvidence;
    const notes = String(body?.notes || "").trim();
    if (!estimateId || quoteVersion <= 0) {
      return Response.json({ error: "Estimate id and issued Quote Version are required." }, { status: 400 });
    }
    if (!acceptedAt || !METHODS.has(acceptanceMethod)) {
      return Response.json({ error: "Acceptance date/time and a valid acceptance method are required." }, { status: 400 });
    }
    if (!Number.isFinite(Date.parse(acceptedAt))) {
      return Response.json({ error: "Acceptance date/time is invalid." }, { status: 400 });
    }
    const acceptedMs = Date.parse(acceptedAt);
    const nowMs = Date.now();
    if (acceptedMs > nowMs + 15 * 60 * 1e3) {
      return Response.json({ error: "Acceptance date/time cannot be in the future." }, { status: 400 });
    }
    if (acceptedMs < nowMs - 10 * 365 * 24 * 60 * 60 * 1e3) {
      return Response.json({ error: "Acceptance date/time is unreasonably old." }, { status: 400 });
    }
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Acceptance = base44.asServiceRole.entities.EstimateAcceptance;
    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;
    const estimate = await Estimate.get(estimateId);
    if (!estimate || !["sent", "approved"].includes(String(estimate.status || ""))) {
      return Response.json({ error: "Customer acceptance can only be recorded for a Sent or Approved estimate." }, { status: 409 });
    }
    const currentVersion = Math.max(0, whole(estimate.quote_version));
    if (!currentVersion || currentVersion !== quoteVersion) {
      return Response.json({ error: "The issued Quote Version changed. Reload the estimate before recording acceptance." }, { status: 409 });
    }
    const expirationDate = quoteExpirationDate(estimate.quote_issue_date, estimate.quote_valid_days ?? 30);
    if (expirationDate && expirationDate < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
      return Response.json({ error: "This quote is expired. Issue a revised quote before recording acceptance." }, { status: 409 });
    }
    const resolvedByName = acceptedByName || [estimate.contact_first_name, estimate.contact_last_name].map((v) => String(v || "").trim()).filter(Boolean).join(" ") || String(estimate.order_contact || estimate.contact_name || "").trim();
    if (!resolvedByName) {
      return Response.json({ error: "Accepted by is required and no customer contact name is on file." }, { status: 400 });
    }
    const existingRowsRaw = await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion
    });
    if (!Array.isArray(existingRowsRaw)) {
      throw new Error("Acceptance history could not be verified safely.");
    }
    const existingRows = activeAcceptanceRows(existingRowsRaw);
    if (existingRows.length > 1) {
      throw new Error("Multiple immutable acceptance records already exist for this Quote Version. No acceptance was changed; review the acceptance history before continuing.");
    }
    const existing = canonicalAcceptance(existingRows);
    if (existing) {
      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, existing);
      return Response.json({ acceptance: existing, reused: true });
    }
    if (estimate.status === "approved") {
      return Response.json({ error: "This estimate is already Approved, but no immutable acceptance record exists for the current Quote Version. Acceptance cannot be reconstructed automatically." }, { status: 409 });
    }
    let delivery = null;
    if (deliveryId) {
      delivery = await Delivery.get(deliveryId);
      if (!delivery || delivery.estimate_id !== estimateId || Math.max(0, whole(delivery.quote_version)) !== quoteVersion || delivery.delivery_status !== "sent") {
        return Response.json({ error: "The selected quote delivery does not belong to this estimate/version." }, { status: 409 });
      }
    }
    let created = null;
    let createError = null;
    try {
      created = await Acceptance.create({
        estimate_id: estimateId,
        work_order_id: estimate.work_order_id || "",
        delivery_id: delivery?.id || "",
        quote_issue_key: quoteIssueKey(estimateId, quoteVersion),
        quote_version: quoteVersion,
        quote_issue_date: estimate.quote_issue_date || "",
        quote_expiration_date: quoteExpirationDate(estimate.quote_issue_date, estimate.quote_valid_days ?? 30),
        quote_total: Number(estimate.quote_total || 0),
        accepted_at: new Date(acceptedAt).toISOString(),
        accepted_by_name: resolvedByName,
        accepted_by_email: acceptedByEmail,
        acceptance_method: acceptanceMethod,
        evidence_reference: evidenceReference,
        notes,
        recorded_by_email: String(user.email || ""),
        recorded_by_name: String(user.full_name || user.name || user.email || "")
      });
    } catch (error) {
      createError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterCreateRowsRaw = await Acceptance.filter({
      estimate_id: estimateId,
      quote_version: quoteVersion
    });
    if (!Array.isArray(afterCreateRowsRaw)) {
      throw new Error("Acceptance create outcome could not be verified safely.");
    }
    const afterCreateRows = activeAcceptanceRows(afterCreateRowsRaw);
    if (!created?.id) {
      if (afterCreateRows.length === 1) {
        await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, afterCreateRows[0]);
        return Response.json({ acceptance: afterCreateRows[0], reused: true, recovered_after_create_error: true });
      }
      if (afterCreateRows.length > 1) {
        throw new Error("Acceptance creation became ambiguous and multiple immutable records are now visible. No uncertain acceptance was deleted; review the acceptance history before retrying.");
      }
      throw createError || new Error("Acceptance could not be created or verified.");
    }
    const canonical = canonicalAcceptance(afterCreateRows) || created;
    if (afterCreateRows.length > 1 && canonical?.id === created.id) {
      throw new Error("A concurrent acceptance record was detected after this acceptance was created. The earlier canonical row was preserved and no uncertain concurrent record was deleted; review the acceptance history before continuing.");
    }
    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const createdVersion = String(created.updated_date || "").trim();
      if (!createdVersion) {
        throw new Error("A duplicate acceptance record was detected, but the losing row has no version metadata. No uncertain acceptance was deleted.");
      }
      const deleted = await Acceptance.deleteMany({
        id: created.id,
        estimate_id: estimateId,
        quote_version: quoteVersion,
        updated_date: createdVersion
      });
      if (!deleted || deleted.deleted !== 1) {
        throw new Error("A duplicate acceptance record changed before cleanup. No uncertain acceptance was deleted; reload the acceptance history before retrying.");
      }
      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, canonical);
      return Response.json({ acceptance: canonical, reused: true, concurrent_duplicate_discarded: true });
    }
    try {
      const ownerEmail = String(estimate.created_by || estimate.salesperson_email || "").trim();
      if (ownerEmail && ownerEmail !== String(user.email || "").trim()) {
        const projectName = String(estimate.project_name || estimate.estimate_number || "estimate").trim();
        await base44.asServiceRole.functions.invoke("sendGmail", {
          to: ownerEmail,
          subject: `Quote accepted: ${projectName}`,
          body: `${acceptedByName} accepted quote version ${quoteVersion} on ${projectName}

Total: $${Number(estimate.quote_total || 0).toFixed(2)}
Method: ${acceptanceMethod}
${notes ? `Notes: ${notes}` : ""}`.trim(),
          _workflow_capability: "ccs-sendGmail-acceptance-notify"
        });
      }
    } catch (notifyError) {
      console.error("Acceptance salesperson notify failed:", notifyError?.message || notifyError);
    }
    try {
      if (acceptedByEmail) {
        const custProject = String(estimate.project_name || estimate.estimate_number || "your estimate").trim();
        await base44.asServiceRole.functions.invoke("sendGmail", {
          to: acceptedByEmail,
          subject: `Quote acceptance confirmed: ${custProject}`,
          body: `Thank you${acceptedByName ? `, ${acceptedByName}` : ""} \u2014 your approval of quote version ${quoteVersion} for ${custProject} ($${Number(estimate.quote_total || 0).toFixed(2)}) has been recorded. We'll be in touch about next steps.`,
          _workflow_capability: "ccs-sendGmail-acceptance-confirm"
        });
      }
    } catch (confirmError) {
      console.error("Acceptance customer confirm failed:", confirmError?.message || confirmError);
    }
    await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, canonical);
    return Response.json({ acceptance: canonical, reused: false });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 409, 503].includes(status) ? status : 500;
    console.error("recordEstimateAcceptance error:", error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? "Customer acceptance could not be recorded safely." : error.message
    }, { status: safeStatus });
  }
});
