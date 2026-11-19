// base44/functions/queueFeed/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

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

// base44/shared/ownerRole.ts
var normEmail = (v) => String(v || "").trim().toLowerCase();
var DEFAULT_OWNER_EMAILS = ["brett@cincisigns.com", "brettheinlein1@gmail.com"];
function ownerEmails() {
  try {
    const raw = (typeof Deno !== "undefined" ? Deno.env.get("APP_OWNER_EMAILS") : "") || "";
    const parsed = raw.split(",").map(normEmail).filter(Boolean);
    return parsed.length ? parsed : DEFAULT_OWNER_EMAILS;
  } catch {
    return DEFAULT_OWNER_EMAILS;
  }
}
function isOwnerEmail(email) {
  return ownerEmails().includes(normEmail(email));
}
function isOwnerRecord(row) {
  if (!row || typeof row !== "object") return false;
  return row.is_owner === true || isOwnerEmail(row.email);
}
function applyOwnerCapabilities(row) {
  if (!isOwnerRecord(row) || !row) return row;
  row.role = "admin";
  row.is_owner = true;
  row.is_full_admin = true;
  row.role_label = "Owner";
  return row;
}

// base44/shared/signShopSession.ts
var sessionAuthCache = /* @__PURE__ */ new Map();
var SESSION_AUTH_CACHE_MS = 15e3;
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
var isolateEntityStats = {
  calls: 0,
  // total entity API attempts (incl. retries)
  retries: 0,
  // attempts that were 429 retries (not new logical calls)
  paced_waits: 0,
  // times a caller waited on the paceMs queue
  since: (/* @__PURE__ */ new Date()).toISOString()
};
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
          if (paceMs) {
            isolateEntityStats.paced_waits++;
            await reserveRequest();
          }
          isolateEntityStats.calls++;
          if (attempt > 0) isolateEntityStats.retries++;
          try {
            return await value.apply(target, args);
          } catch (e) {
            if (!isLimited(e)) throw e;
            if (attempt >= maxRetries) {
              e.status = e.status ?? 429;
              e.statusCode = e.statusCode ?? 429;
              throw e;
            }
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

// base44/shared/queueFeedModel.mjs
var SAVED_VIEW_FIELDS = [
  "id",
  "created_date",
  "updated_date",
  "name",
  "filters",
  "status",
  "queue_lens",
  "page",
  "owner_email",
  "user_email",
  "is_shared",
  "shared",
  "pinned",
  "sort",
  "is_default",
  "creation_request_key"
];
var normEmail2 = (v) => String(v || "").trim().toLowerCase();
var normScopeKey = (v, fallback = "all") => String(v ?? "").trim() || fallback;
function projectSavedView(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of SAVED_VIEW_FIELDS) out[field] = row[field];
  return out;
}
function viewOwnerEmail(view = {}) {
  return normEmail2(view?.owner_email || view?.user_email);
}
function isViewShared(view = {}) {
  return view?.is_shared === true || view?.shared === true;
}
function isLiveSavedView(view = {}) {
  const s = String(view?.status ?? "").trim().toLowerCase();
  return s === "" || s === "active";
}
function isOwnView(view, ownerEmail = "") {
  const me = normEmail2(ownerEmail);
  return me !== "" && viewOwnerEmail(view) === me;
}
var sortWeight = (v) => {
  const n = Number(v?.sort);
  return Number.isFinite(n) ? n : null;
};
function sortSavedViews(views = [], ownerEmail = "") {
  return [...views || []].sort((a, b) => {
    const aMine = isOwnView(a, ownerEmail);
    const bMine = isOwnView(b, ownerEmail);
    if (aMine !== bMine) return aMine ? -1 : 1;
    const aPin = a?.pinned === true;
    const bPin = b?.pinned === true;
    if (aPin !== bPin) return aPin ? -1 : 1;
    const aw = sortWeight(a);
    const bw = sortWeight(b);
    if (aw !== bw) {
      if (aw === null) return 1;
      if (bw === null) return -1;
      return aw - bw;
    }
    const byName = String(a?.name || "").localeCompare(String(b?.name || ""));
    if (byName !== 0) return byName;
    const byCreated = String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
    if (byCreated !== 0) return byCreated;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}
function scopeSavedViewsForLens(rows, { lens = "all", ownerEmail = "" } = {}) {
  const want = normScopeKey(lens);
  const me = normEmail2(ownerEmail);
  const views = (Array.isArray(rows) ? rows : []).map(projectSavedView).filter(
    (r) => String(r?.queue_lens || "") === want && isLiveSavedView(r) && (me !== "" && viewOwnerEmail(r) === me || isViewShared(r))
  );
  return sortSavedViews(views, ownerEmail);
}
function scopeSavedViewsForPage(rows, { pageKey = "all", ownerEmail = "" } = {}) {
  const want = normScopeKey(pageKey);
  const me = normEmail2(ownerEmail);
  const views = (Array.isArray(rows) ? rows : []).map(projectSavedView).filter(
    (r) => String(r?.page ?? "").trim() === want && isLiveSavedView(r) && (me !== "" && viewOwnerEmail(r) === me || isViewShared(r))
  );
  return sortSavedViews(views, ownerEmail);
}
var SETTING_RECORD_FIELDS = ["id", "setting_key", "setting_value"];
function projectSettingRecord(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of SETTING_RECORD_FIELDS) out[field] = row[field];
  return out;
}
var CRM_EVENT_TYPES = [
  "Call: Accounts Receivable",
  "Call: Collections",
  "Call: Estimate Follow Up",
  "Call: Install Scheduling",
  "Call: Post delivery follow up",
  "Call: Proof",
  "Call: Prospecting",
  "Call: Sales Follow Up",
  "Consultation",
  "E-Mail: Estimate",
  "E-Mail: Follow Up",
  "E-Mail: Information Request",
  "ReDo Work",
  "Visit: Installation",
  "Visit: Networking/Marketing",
  "Visit: Sales Appointment",
  "Visit: Sales Cold Call",
  "Visit: Sales Relationship",
  "Visit: Site Survey"
];
var CRM_ACTIVITY_FIELDS = [
  "id",
  "created_date",
  "updated_date",
  "event_type",
  "subject",
  "summary",
  "notes",
  "details",
  "contact_name",
  "contact_id",
  "company_name",
  "customer_id",
  "opportunity_id",
  "work_order_id",
  "assigned_to",
  "due_at",
  "completed_at",
  "outcome",
  "source",
  "actor",
  "created_by",
  "deleted"
];
function projectCrmActivity(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of CRM_ACTIVITY_FIELDS) out[field] = row[field];
  return out;
}
var CRM_CUSTOMER_FIELDS = ["id", "company_name", "name"];
function projectCrmCustomer(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of CRM_CUSTOMER_FIELDS) out[field] = row[field];
  return out;
}
var ESTIMATE_QUEUE_FIELDS = [
  "id",
  "created_date",
  "updated_date",
  // Identity / display
  "estimate_number",
  "project_name",
  "job_name",
  "client_name",
  "contact_name",
  "project_address",
  "site_address",
  "source_module",
  // Status buckets + lifecycle
  "status",
  "pipeline_sync_pending",
  "deleted",
  "deleted_at",
  "deleted_by",
  "archived_at",
  "archived_reason",
  // Money + dates the cards/sorts/exports read
  "quote_total",
  "total_cost",
  "cost_total",
  "quote_issue_date",
  "quote_valid_days",
  "valid_days",
  "quote_expiration_date",
  "quote_expired",
  "due_date",
  "target_install_date",
  "priority",
  // People / filters
  "salesperson",
  "salesperson_email",
  "assigned_to",
  "created_by",
  "personal_tags",
  "work_order_id",
  // Search haystack fields (deepLinks.ESTIMATE_SEARCH_FIELDS)
  "notes",
  "estimate_notes",
  // line_items[] survives projected to ESTIMATE_LINE_ITEM_FIELDS
  "line_items"
];
var ESTIMATE_LINE_ITEM_FIELDS = [
  "title",
  "name",
  "product_name",
  "client_product_name",
  "builder_name",
  "project_name",
  "description",
  "module_key",
  "product_category",
  "production_product_type"
];
function projectEstimateLineItem(line) {
  if (!line || typeof line !== "object") return line;
  const out = {};
  for (const field of ESTIMATE_LINE_ITEM_FIELDS) out[field] = line[field];
  return out;
}
function projectEstimate(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of ESTIMATE_QUEUE_FIELDS) {
    if (field === "line_items") continue;
    out[field] = row[field];
  }
  out.line_items = Array.isArray(row.line_items) ? row.line_items.map(projectEstimateLineItem) : row.line_items;
  return out;
}
var QUOTE_DEFAULTS_FIELDS = [
  "id",
  "config_name",
  "display_timezone",
  "custom_statuses",
  "status_transitions"
];
function projectQuoteDefaults(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of QUOTE_DEFAULTS_FIELDS) out[field] = row[field];
  return out;
}
var GENERAL_TASK_FIELDS = [
  "id",
  "created_date",
  "updated_date",
  "text",
  "stage",
  "assigned_to",
  "sub_tasks",
  "completed",
  "blocked",
  "blocked_reason",
  "due_date",
  "created_by_name"
];
function projectGeneralTask(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of GENERAL_TASK_FIELDS) out[field] = row[field];
  return out;
}
var MY_WORKFLOW_USER_FIELDS = [
  "id",
  "email",
  "full_name",
  "sales_roles",
  "is_active"
];
function projectWorkflowUser(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of MY_WORKFLOW_USER_FIELDS) out[field] = row[field];
  return out;
}
function queueFeedCacheKey({
  feed = "product_queue",
  lens = "",
  pageKey = "",
  owner = "",
  include = [],
  moduleKey = ""
} = {}) {
  const inc = [...new Set((Array.isArray(include) ? include : [include]).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))].sort();
  return [
    String(feed || "product_queue"),
    normScopeKey(lens, ""),
    normScopeKey(pageKey, ""),
    normEmail2(owner),
    inc.join(","),
    String(moduleKey || "").trim().toLowerCase()
  ].join("|");
}

// base44/functions/queueFeed/entry.ts
var QUEUE_WO_FIELDS = [
  "id",
  "created_date",
  "updated_date",
  "title",
  "client_name",
  "customer_id",
  "contact_email",
  "opportunity_id",
  "corbridge_invoice_number",
  "current_stage",
  "priority",
  "assigned_to",
  "due_date",
  "project_install_date",
  "completed",
  "deleted",
  // Module ownership — moduleKeyForRow's WO fallback chain, first non-blank wins.
  "module_key",
  "project_type",
  "order_type",
  "module",
  "type",
  // Queue filter columns (QueueFilterBar: salesperson / entered_by) + enteredBy.
  "sales_rep",
  "salesperson",
  "salesperson_email",
  "created_by",
  "entered_by",
  // Order-level rush signals flattenQueueRows folds into the row's rush flag.
  "is_rush",
  "rush",
  "order_priority",
  // Write/notify paths mounted rows drive: deposit gate (depositGate.js) and
  // buildNotifyContext fallbacks. Without these a projected snapshot would
  // silently bypass the deposit warning and empty notify placeholders.
  "deposit_required",
  "deposit_invoiced",
  "deposit_amount",
  "estimator",
  "total",
  "balance_due",
  "products"
];
var QUEUE_PRODUCT_FIELDS = [
  "id",
  "product_name",
  "description",
  "client_product_name",
  "quantity",
  "product_type",
  "category",
  "module_key",
  "operational_status",
  "operational_substatus",
  "customer_facing_status",
  "operational_status_changed_at",
  "fulfillment_state",
  "fulfillment_method",
  "proof_status",
  "proof_version",
  "proof_approved_version",
  "proof_file_url",
  "proof_file_name",
  "design_due_date",
  "product_due_date",
  "hard_due_date",
  "designer",
  "assigned_to",
  "responsibility",
  "responsibility_color",
  "priority",
  "queue_priority",
  "priority_label",
  // Product-level rush signals + quick tags.
  "is_rush",
  "rush",
  "quick_tags",
  // CoreBridge filter keys (machine / part columns).
  "machine",
  "machine_name",
  "assigned_machine",
  "part",
  "part_name",
  // Per-product crew/credit spellings some imported rows carry.
  "salesperson",
  "entered_by",
  "builder_product_id"
];
var PRODUCT_HEAVY_FIELDS = ["notes", "status_history", "conversion_events"];
var PRODUCT_HEAVY_PREFIXES = ["smartsheet_"];
var WO_MODULE_KEYS = ["module_key", "project_type", "order_type", "module", "type"];
var PAGE_SIZE = 5e3;
var MAX_ROWS = 2e4;
var MAX_LIMIT = 2e4;
var MAX_MODULE_KEY = 120;
var MAX_LENS = 80;
var MAX_OWNER = 200;
var MAX_SAVED_VIEWS = 2e3;
var SETTINGS_KEY_STAGE_MODE = "productStatusDrivesStage";
var SETTINGS_KEY_DROPDOWN_CONDITIONS = "dropdownConditions";
var SETTINGS_KEY_TASK_DESCRIPTIONS = "salesTaskDescriptions";
var FEED_NAMES = /* @__PURE__ */ new Set(["product_queue", "crm_events", "estimate_queue", "my_workflow"]);
var FEED_EXTRAS = {
  product_queue: ["saved_views", "settings"],
  crm_events: ["customers"],
  estimate_queue: ["quote_defaults", "saved_views"],
  my_workflow: ["users", "dropdown_conditions", "task_descriptions"]
};
function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}
function cleanSince(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw bad("Feed cursor is invalid.");
  return new Date(ms).toISOString();
}
function cleanLimit(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw bad("Feed limit is invalid.");
  return Math.min(Math.floor(n), MAX_LIMIT);
}
function cleanModuleKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.length > MAX_MODULE_KEY) throw bad("Feed module_key is invalid.");
  return raw;
}
function cleanFeed(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "product_queue";
  if (!FEED_NAMES.has(raw)) throw bad("This feed cannot be read here.");
  return raw;
}
function cleanLens(value) {
  const raw = String(value || "").trim();
  if (raw.length > MAX_LENS) throw bad("Feed queue_lens is invalid.");
  return raw;
}
function cleanPageKey(value) {
  const raw = String(value || "").trim();
  if (raw.length > MAX_LENS) throw bad("Feed page_key is invalid.");
  return raw;
}
function cleanOwner(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.length > MAX_OWNER) throw bad("Feed owner_email is invalid.");
  return raw;
}
function cleanInclude(value, feed) {
  const allowed = new Set(FEED_EXTRAS[feed] || []);
  if (value == null || value === "") return [...allowed];
  const list = Array.isArray(value) ? value : String(value).split(",");
  const out = [...new Set(list.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))];
  for (const name of out) {
    if (!allowed.has(name)) throw bad(`Feed extra is not available here: ${name}`);
  }
  return out;
}
var norm = (v) => String(v || "").trim().toLowerCase();
function woModuleKey(wo) {
  for (const key of WO_MODULE_KEYS) {
    const v = norm(wo?.[key]);
    if (v) return v;
  }
  return "";
}
function productModuleKey(product, woKey) {
  return norm(product?.module_key) || woKey;
}
function projectProduct(product) {
  if (!product || typeof product !== "object") return product;
  const out = {};
  for (const field of QUEUE_PRODUCT_FIELDS) out[field] = product[field];
  for (const field of PRODUCT_HEAVY_FIELDS) delete out[field];
  for (const key of Object.keys(out)) {
    if (PRODUCT_HEAVY_PREFIXES.some((p) => key.startsWith(p))) delete out[key];
  }
  return out;
}
function projectWorkOrder(row, wantedModule) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const field of QUEUE_WO_FIELDS) out[field] = row[field];
  const woKey = woModuleKey(row);
  const products = Array.isArray(row.products) ? row.products : [];
  if (!wantedModule) {
    out.products = products.map(projectProduct);
    return out;
  }
  const kept = products.filter((p) => productModuleKey(p, woKey) === wantedModule);
  if (!kept.length) return null;
  out.products = kept.map(projectProduct);
  return out;
}
var feedCache = /* @__PURE__ */ new Map();
var FEED_CACHE_TTL_MS = 3e4;
var FEED_CACHE_MAX_KEYS = 40;
function feedCacheGet(key) {
  const hit = feedCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    feedCache.delete(key);
    return null;
  }
  return hit.payload;
}
function feedCacheSet(key, payload) {
  if (feedCache.size >= FEED_CACHE_MAX_KEYS) {
    const now = Date.now();
    for (const [k, v] of feedCache) {
      if (v.expires <= now) feedCache.delete(k);
    }
    if (feedCache.size >= FEED_CACHE_MAX_KEYS) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [k, v] of feedCache) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) feedCache.delete(oldestKey);
    }
  }
  feedCache.set(key, { payload, expires: Date.now() + FEED_CACHE_TTL_MS, at: Date.now() });
}
var projectionSupported = true;
async function scanProjectedRows(entity, query, projection, projectRow, { limit = 0, maxRows = MAX_ROWS } = {}) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  let skip = 0;
  let rowsHit = 0;
  let truncated = false;
  let maxUpdated = "";
  while (true) {
    let page = null;
    if (projection && projectionSupported) {
      try {
        page = await entity.filter(query, "updated_date", PAGE_SIZE, skip, projection);
      } catch {
        projectionSupported = false;
      }
    }
    if (page === null) page = await entity.filter(query, "updated_date", PAGE_SIZE, skip);
    if (!Array.isArray(page)) throw new Error("Queue feed could not be verified completely.");
    rowsHit += page.length;
    for (const row of page) {
      const id = String(row?.id || "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const updated = String(row?.updated_date || "");
      if (updated && (!maxUpdated || updated > maxUpdated)) maxUpdated = updated;
      const projected = projectRow(row);
      if (projected) items.push(projected);
    }
    if (rowsHit >= maxRows) {
      truncated = true;
      break;
    }
    if (page.length < PAGE_SIZE) break;
    if (limit && items.length >= limit) {
      truncated = true;
      break;
    }
    skip += PAGE_SIZE;
  }
  return { items, truncated, maxUpdated };
}
async function loadScopedRows(entity, query, sort, cap = MAX_SAVED_VIEWS) {
  const rows = [];
  let skip = 0;
  const pageSize = 1e3;
  while (rows.length < cap) {
    const page = await entity.filter(query, sort, pageSize, skip);
    if (!Array.isArray(page)) throw new Error("Saved view rows could not be loaded.");
    rows.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return rows.slice(0, cap);
}
Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const sessionUser = await authenticateSignShopSession(base44, body?.session_token);
    const sessionEmail = norm(sessionUser?.email);
    const feed = cleanFeed(body?.feed);
    const since = cleanSince(body?.since);
    const limit = cleanLimit(body?.limit);
    const moduleKey = cleanModuleKey(body?.module_key);
    const queueLens = cleanLens(body?.queue_lens);
    const pageKey = cleanPageKey(body?.page_key);
    cleanOwner(body?.owner_email);
    const include = cleanInclude(body?.include, feed);
    const wantItems = body?.items !== false;
    const cacheable = !since && !limit;
    const cacheKey = queueFeedCacheKey({
      feed,
      lens: queueLens,
      pageKey,
      // my_workflow carries no owner-scoped slice — its items and extras are
      // the same rows for every session, so the key drops the owner segment
      // and one entry serves a whole-staff mount burst.
      owner: feed === "my_workflow" ? "" : sessionEmail,
      include,
      moduleKey
    }) + `|items:${wantItems ? 1 : 0}`;
    if (cacheable) {
      const hit = feedCacheGet(cacheKey);
      if (hit) return Response.json(hit);
    }
    const entities = base44.asServiceRole.entities;
    const payload = {
      feed,
      items: [],
      count: 0,
      truncated: false,
      next_cursor: since || null,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const extrasErrors = {};
    const jobs = [];
    if (wantItems) {
      jobs.push(async () => {
        const query = {};
        if (since) query.updated_date = { $gte: since };
        let projection = null;
        let projectRow = (r) => r;
        if (feed === "product_queue") {
          projection = QUEUE_WO_FIELDS;
          projectRow = (row) => projectWorkOrder(row, moduleKey);
        } else if (feed === "crm_events") {
          projection = CRM_ACTIVITY_FIELDS;
          query.event_type = { $in: [...CRM_EVENT_TYPES] };
          projectRow = (row) => projectCrmActivity(row);
        } else if (feed === "estimate_queue") {
          projection = ESTIMATE_QUEUE_FIELDS;
          projectRow = (row) => projectEstimate(row);
        } else if (feed === "my_workflow") {
          projection = GENERAL_TASK_FIELDS;
          query.completed = false;
          projectRow = (row) => projectGeneralTask(row);
        }
        const entity = feed === "crm_events" ? entities.OpportunityActivity : feed === "estimate_queue" ? entities.AllInOneEstimate : feed === "my_workflow" ? entities.GeneralTask : entities.WorkOrder;
        const scanned = await scanProjectedRows(
          entity,
          query,
          projection,
          projectRow,
          { limit }
        );
        const cappedByLimit = limit > 0 && scanned.items.length >= limit;
        const pageItems = limit > 0 ? scanned.items.slice(0, limit) : scanned.items;
        let nextCursor = scanned.maxUpdated || since || null;
        if (cappedByLimit) {
          const maxReturned = pageItems.reduce((m, it) => {
            const u = String(it?.updated_date || "");
            return u > m ? u : m;
          }, "");
          nextCursor = maxReturned || since || null;
        }
        if (feed === "my_workflow") {
          pageItems.sort((a, b) => String(a?.created_date || "").localeCompare(String(b?.created_date || "")));
        }
        payload.items = pageItems;
        payload.count = pageItems.length;
        payload.truncated = scanned.truncated || cappedByLimit;
        payload.next_cursor = nextCursor;
      });
    }
    if (include.includes("saved_views")) {
      jobs.push(async () => {
        try {
          const rows = queueLens ? await loadScopedRows(entities.SavedQueueView, { queue_lens: queueLens }, "created_date") : await loadScopedRows(entities.SavedQueueView, {}, "created_date");
          payload.saved_views = pageKey ? scopeSavedViewsForPage(rows, { pageKey, ownerEmail: sessionEmail }) : scopeSavedViewsForLens(rows, { lens: queueLens || "all", ownerEmail: sessionEmail });
        } catch (e) {
          extrasErrors.saved_views = e?.message || "Saved views could not be loaded.";
          payload.saved_views = null;
        }
      });
    }
    if (include.includes("settings")) {
      jobs.push(async () => {
        try {
          const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_STAGE_MODE });
          if (!Array.isArray(rows)) throw new Error("Setting lookup did not return a record list.");
          if (rows.length > 1) throw new Error("Setting has multiple records for its key.");
          payload.settings = {
            product_stage_mode: rows[0] ? projectSettingRecord(rows[0]) : null
          };
        } catch (e) {
          extrasErrors.settings = e?.message || "Queue settings could not be loaded.";
          payload.settings = null;
        }
      });
    }
    if (include.includes("customers")) {
      jobs.push(async () => {
        try {
          const rows = await scanProjectedRows(
            entities.Customer,
            {},
            CRM_CUSTOMER_FIELDS,
            projectCrmCustomer,
            { maxRows: MAX_ROWS }
          );
          payload.customers = rows.items;
          if (rows.truncated) extrasErrors.customers = "Customer list reached the row cap.";
        } catch (e) {
          extrasErrors.customers = e?.message || "Customers could not be loaded.";
          payload.customers = null;
        }
      });
    }
    if (include.includes("quote_defaults")) {
      jobs.push(async () => {
        try {
          const rows = await entities.QuoteDefaults.filter({ config_name: "default" }, void 0, 1);
          const row = Array.isArray(rows) ? rows[0] : null;
          payload.quote_defaults = row ? projectQuoteDefaults(row) : null;
        } catch (e) {
          extrasErrors.quote_defaults = e?.message || "Quote defaults could not be loaded.";
          payload.quote_defaults = null;
        }
      });
    }
    if (include.includes("users")) {
      jobs.push(async () => {
        try {
          const rows = await scanProjectedRows(
            entities.AuthorizedEmail,
            {},
            MY_WORKFLOW_USER_FIELDS,
            projectWorkflowUser,
            { maxRows: MAX_ROWS }
          );
          payload.users = rows.items;
          if (rows.truncated) extrasErrors.users = "User directory reached the row cap.";
        } catch (e) {
          extrasErrors.users = e?.message || "The user directory could not be loaded.";
          payload.users = null;
        }
      });
    }
    if (include.includes("dropdown_conditions")) {
      jobs.push(async () => {
        try {
          const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_DROPDOWN_CONDITIONS });
          if (!Array.isArray(rows)) throw new Error("Setting lookup did not return a record list.");
          if (rows.length > 1) throw new Error("Setting has multiple records for its key.");
          payload.dropdown_conditions = rows[0] ? projectSettingRecord(rows[0]) : null;
        } catch (e) {
          extrasErrors.dropdown_conditions = e?.message || "Dropdown conditions could not be loaded.";
          payload.dropdown_conditions = null;
        }
      });
    }
    if (include.includes("task_descriptions")) {
      jobs.push(async () => {
        try {
          const rows = await entities.GlobalSettings.filter({ setting_key: SETTINGS_KEY_TASK_DESCRIPTIONS });
          if (!Array.isArray(rows)) throw new Error("Setting lookup did not return a record list.");
          if (rows.length > 1) throw new Error("Setting has multiple records for its key.");
          payload.task_descriptions = rows[0] ? projectSettingRecord(rows[0]) : null;
        } catch (e) {
          extrasErrors.task_descriptions = e?.message || "Task descriptions could not be loaded.";
          payload.task_descriptions = null;
        }
      });
    }
    await Promise.all(jobs.map((run) => run()));
    payload.projected_fields = {
      items: feed === "crm_events" ? CRM_ACTIVITY_FIELDS : feed === "estimate_queue" ? ESTIMATE_QUEUE_FIELDS : feed === "my_workflow" ? GENERAL_TASK_FIELDS : QUEUE_WO_FIELDS,
      product: feed === "product_queue" ? QUEUE_PRODUCT_FIELDS : void 0,
      saved_view: include.includes("saved_views") ? SAVED_VIEW_FIELDS : void 0,
      customer: include.includes("customers") ? CRM_CUSTOMER_FIELDS : void 0,
      quote_defaults: include.includes("quote_defaults") ? QUOTE_DEFAULTS_FIELDS : void 0,
      user: include.includes("users") ? MY_WORKFLOW_USER_FIELDS : void 0
    };
    if (Object.keys(extrasErrors).length) payload.extras_errors = extrasErrors;
    if (cacheable) feedCacheSet(cacheKey, payload);
    return Response.json(payload);
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || "Queue feed failed." }, { status });
    }
    console.error("queueFeed error:", error);
    return Response.json({ error: "Data could not be loaded. Try again." }, { status: 500 });
  }
});
