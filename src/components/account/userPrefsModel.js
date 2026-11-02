// Per-user account preferences model — masterplan K-03. Pure JS, ZERO
// imports: unit-testable under Node (scripts/test-user-prefs.mjs,
// esbuild-bundled) and safe to compose from any surface.
//
// STORAGE (the smallest correct carrier — both already exist):
//   * View prefs + timezone + queue defaults live on the
//     UserWorkspacePreferences.preferences blob, written ONLY through
//     workspacePrefsAction (prefs_get/prefs_update) which stamps
//     user_email = session email server-side. No admin required; the
//     WorkspacePreferencesProvider in Layout hydrates it on app mount.
//     This model owns the account-facing subtrees of that blob:
//       locale.timezone            — IANA name, "" = browser local (#488
//                                    consumer: userDateDisplay.js)
//       queues.defaultLens         — Product Queues opening tab
//       queues.myQueueOnly         — seed ?assigned=me on queue open
//   * Notification subscriptions live on NotificationPreference.subscriptions
//     (H-12), written ONLY through notificationAction save_preferences,
//     scoped to the caller's own pref row by session email.
//
// PER-USER ISOLATION is enforced server-side — workspacePrefsAction and
// notificationAction resolve the owner from the session, never from the
// payload. The helpers here mirror that contract: persist payloads carry
// NO identity field the client could spoof, and scopedUserWrite forces
// user_email = actor exactly the way the functions do. Tests cover that
// user A's save can never re-key user B's row.
//
// The subscription normalize/dedupe section is a documented PARITY COPY of
// base44/shared/alertSubscriptionsModel.ts (event-key casing, delivery
// aliases, enabled, criteria, signature) so the UI's persist shape is what
// the server-side matcher dedupes — keep in sync with that file.

const clean = (v) => String(v ?? "").trim();
const lower = (v) => clean(v).toLowerCase();
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------
// timezone — parity with estimator/userDateDisplay.js isValidTimeZone
// ---------------------------------------------------------------------------

// The suggestion list the account + estimator datalists share.
export const IANA_TIMEZONE_SUGGESTIONS = Object.freeze([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC",
]);

// "" is falsy → not valid; callers treat it as "browser local". Intl probes
// the host IANA db — same check userDateDisplay.isValidTimeZone performs.
export function isValidIANATimezone(tz) {
  const v = clean(tz);
  if (!v) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

// Canonical persist value: a valid IANA name, else "" (never store junk).
export function normalizeTimezone(value) {
  const v = clean(value);
  return v && isValidIANATimezone(v) ? v : "";
}

// What the UI should render for the stored pref: validated name or "".
export function timezoneFromPrefs(prefs) {
  return normalizeTimezone(prefs?.locale?.timezone);
}

// Resolved display zone for "dates will show in X": user pick wins, then the
// company fallback, then "" (browser local).
export function resolveTimezoneChoice(prefs, companyTz = "") {
  const user = timezoneFromPrefs(prefs);
  if (user) return user;
  const co = clean(companyTz);
  return co && isValidIANATimezone(co) ? co : "";
}

// ---------------------------------------------------------------------------
// queue defaults — the `queues` subtree of the workspace-prefs blob
// ---------------------------------------------------------------------------

// Product Queues tabs (src/pages/ProductQueues.jsx QUEUES[].key order).
export const ACCOUNT_QUEUE_LENSES = Object.freeze(["design", "production", "fulfillment", "all"]);

// The ?assigned= URL token the my-queue filter honors (myQueueModel
// MY_QUEUE_TOKEN).
export const MY_QUEUE_TOKEN = "me";

export function defaultQueuePrefs() {
  return {
    defaultLens: "",      // "" = app default (design); else an ACCOUNT_QUEUE_LENSES key
    myQueueOnly: false,   // true → open queue pages filtered to "assigned to me"
  };
}

// Normalize the stored `queues` subtree (tolerates the whole blob, the
// subtree, or junk). Unknown keys pass through so a newer build's queue
// prefs survive a load/save cycle here.
export function normalizeQueuePrefs(raw) {
  const src = isObj(raw) ? (isObj(raw.queues) ? raw.queues : raw) : {};
  const out = { ...src };
  out.defaultLens = ACCOUNT_QUEUE_LENSES.includes(clean(src.defaultLens))
    ? clean(src.defaultLens) : "";
  out.myQueueOnly = src.myQueueOnly === true;
  return out;
}

// The subtree read off a workspace-prefs blob — always a complete normalized
// shape (defaults-when-empty).
export function queuePrefsFromWorkspace(prefs) {
  return normalizeQueuePrefs(isObj(prefs) ? prefs.queues : null);
}

// The deep-mergeable patch for patchPrefs/updatePrefs — {queues:{...}} so a
// partial save never drops sibling keys the caller did not touch.
export function queueDefaultsPatch(next = {}) {
  const cur = normalizeQueuePrefs(next);
  return { queues: { defaultLens: cur.defaultLens, myQueueOnly: cur.myQueueOnly === true } };
}

// Which lens a queue page should open with. Precedence (documented):
//   1. an explicit URL/section lens (deep link wins — saved views and
//      ?queue= are explicit intent)
//   2. the user's stored defaultLens
//   3. `fallback` (the page's own default, "design" today)
export function resolveQueueLens({ queuePrefs, urlLens = "", fallback = "design" } = {}) {
  const url = clean(urlLens);
  if (ACCOUNT_QUEUE_LENSES.includes(url)) return url;
  const stored = clean(queuePrefs?.defaultLens);
  if (ACCOUNT_QUEUE_LENSES.includes(stored)) return stored;
  return ACCOUNT_QUEUE_LENSES.includes(clean(fallback)) ? clean(fallback) : "design";
}

// Param names the product-queue URL layer treats as explicit filter intent.
// When ANY is present the user (or a saved-view link) has already chosen —
// the myQueueOnly default must NOT override it. `queue` is tab selection,
// not filter intent; `size` is page chrome.
export const QUEUE_FILTER_INTENT_PARAMS = Object.freeze([
  "status", "substatus", "designer", "responsibility", "assignedTo",
  "category", "moduleKey", "due", "sort", "q", "fulfilled", "machine",
  "part", "salesperson", "enteredBy", "entered_by", "fulfillment", "proof",
  "rush", "assigned", "view",
]);

// Does the param map carry explicit queue filter intent? Accepts
// URLSearchParams-like ({get}) or a plain object of param names.
export function urlHasQueueFilterIntent(params) {
  const has = (k) => {
    if (!params) return false;
    if (typeof params.get === "function") return !!params.get(k);
    const v = params[k];
    return v !== undefined && v !== null && clean(v) !== "";
  };
  return QUEUE_FILTER_INTENT_PARAMS.some(has);
}

// Should this page open seed ?assigned=me? One-shot per mount — a later
// param change (e.g. the user pressing Clear) must not re-seed; the caller
// passes seededAlready=false only until it applies the seed once.
export function shouldSeedMyQueue({ queuePrefs, params, seededAlready = false } = {}) {
  if (queuePrefs?.myQueueOnly !== true) return false;
  if (seededAlready) return false;
  return !urlHasQueueFilterIntent(params);
}

// ---------------------------------------------------------------------------
// notification prefs — NotificationPreference row via notificationAction
// ---------------------------------------------------------------------------

// The preference fields the account surface owns. hidden_sections /
// section_snoozed_until / dismissed_feed_items stay with the feed popover —
// a save from here must never clobber them, so the patch builder emits only
// supplied keys.
export const NOTIFICATION_PREF_KEYS = Object.freeze(["sound_on", "digest_opt_in", "subscriptions"]);

// save_preferences patch: only the supplied keys are emitted (partial-patch
// contract — an omitted field keeps its stored value server-side).
export function notificationPrefsPatch({ sound_on, digest_opt_in, subscriptions } = {}) {
  const patch = {};
  if (typeof sound_on === "boolean") patch.sound_on = sound_on;
  if (typeof digest_opt_in === "boolean") patch.digest_opt_in = digest_opt_in;
  if (Array.isArray(subscriptions)) patch.subscriptions = subscriptionsPayload(subscriptions);
  return patch;
}

// --- subscriptions: PARITY COPY of base44/shared/alertSubscriptionsModel.ts
// normalize layer (event key, delivery aliases, criteria, signature dedupe).
// The persist shape is the same one the deployed fan-out consumes.

export const ACCOUNT_SUBSCRIPTION_DELIVERIES = Object.freeze(["feed", "digest", "both"]);
export const ACCOUNT_SUBSCRIPTIONS_MAX = 200; // == SUBSCRIPTIONS_MAX
export const ACCOUNT_DEFAULT_DELIVERY = "feed";

// Canonical event key — 'PO.Created' → 'po_created'.
export function normalizeSubEventKey(value) {
  return lower(value).replace(/[\s.\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

const SUB_DELIVERY_ALIASES = {
  feed: "feed", notification: "feed", notifications: "feed", in_app: "feed",
  inapp: "feed", alert: "feed", immediate: "feed",
  digest: "digest", daily: "digest", daily_digest: "digest",
  both: "both", all: "both", feed_and_digest: "both", feed_digest: "both",
};

export function normalizeSubDelivery(value) {
  return SUB_DELIVERY_ALIASES[normalizeSubEventKey(value)] ?? ACCOUNT_DEFAULT_DELIVERY;
}

// Canonical criteria — keys normalized per-segment (dotted paths survive),
// empty values dropped, arrays = any-of (parity with normalizeCriteria).
export function normalizeSubCriteria(value) {
  const out = {};
  if (!isObj(value)) return out;
  for (const rawKey of Object.keys(value)) {
    const key = clean(rawKey).split(".").map(normalizeSubEventKey).filter(Boolean).join(".") || clean(rawKey);
    if (!key) continue;
    let v = value[rawKey];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v = v.map((x) => (typeof x === "string" ? clean(x) : x)).filter((x) => x !== undefined && x !== null && x !== "");
      if (!v.length) continue;
    } else if (typeof v === "string") {
      v = clean(v);
      if (v === "") continue;
    }
    out[key] = v;
  }
  return out;
}

// Canonical subscription — tolerates the H-12 legacy spellings
// ({event|kind|type|event_type}, {filters|match|when|criteria},
// {channel|via|deliver}, {disabled|active:false}). Audit stamps pass
// through so replace round-trips keep created_*.
export function normalizeAccountSubscription(sub) {
  if (typeof sub === "string") {
    return { event_key: normalizeSubEventKey(sub), criteria: {}, delivery: ACCOUNT_DEFAULT_DELIVERY, enabled: true };
  }
  const src = isObj(sub) ? sub : {};
  const out = {
    event_key: normalizeSubEventKey(src.event_key ?? src.event ?? src.kind ?? src.type ?? src.event_type),
    criteria: normalizeSubCriteria(src.criteria ?? src.filters ?? src.match ?? src.when),
    delivery: normalizeSubDelivery(src.delivery ?? src.channel ?? src.via ?? src.deliver),
    enabled: src.enabled === false || src.disabled === true || src.active === false ? false : true,
  };
  for (const k of ["created_by", "created_at", "updated_by", "updated_at"]) {
    const v = clean(src[k]);
    if (v) out[k] = v;
  }
  return out;
}

// Dedupe identity — event_key + canonical criteria (sorted keys), exactly
// the alertSubscriptionsModel.subscriptionSignature contract.
export function accountSubscriptionSignature(sub) {
  const n = normalizeAccountSubscription(sub);
  const keys = Object.keys(n.criteria).sort();
  return `${n.event_key}|${keys.map((k) => `${k}=${JSON.stringify(n.criteria[k])}`).join("&")}`;
}

// The user's normalized sub list from a pref row (or a bare
// subscriptions array / {subscriptions} / legacy alert_subscriptions).
// Keyless junk dropped; identical signatures dedupe LAST-WINS (a repeated
// entry keeps the newest write) in stable first-seen order.
export function accountSubscriptionsFor(raw) {
  const rows = Array.isArray(raw) ? raw
    : isObj(raw) ? (Array.isArray(raw.subscriptions) ? raw.subscriptions : list(raw.alert_subscriptions))
    : [];
  const seen = new Map();
  for (const r of rows) {
    const n = normalizeAccountSubscription(r);
    if (!n.event_key) continue;
    seen.set(accountSubscriptionSignature(n), n);
  }
  return [...seen.values()];
}

// The list the persist layer stores — normalized, deduped, bounded at
// ACCOUNT_SUBSCRIPTIONS_MAX (oldest dropped FIFO past the cap), and carrying
// NO identity field (user_email/user/owner) — ownership is the server's
// session scope, never a client-supplied field.
export function subscriptionsPayload(listValue) {
  const subs = accountSubscriptionsFor(listValue).slice(0, ACCOUNT_SUBSCRIPTIONS_MAX);
  return subs.map((s) => {
    const out = {
      event_key: s.event_key,
      criteria: s.criteria,
      delivery: s.delivery,
      enabled: s.enabled,
    };
    for (const k of ["created_by", "created_at", "updated_by", "updated_at"]) {
      if (s[k]) out[k] = s[k];
    }
    return out;
  });
}

// Toggle/upsert one subscription for the prefs UI: same signature replaces
// (delivery/enabled refresh), anything else appends; `enabled:false` keeps
// the entry stored (the UI renders the off state) — pass removeEventKey to
// delete instead. Returns the full replacement list (whole-list write).
export function accountSubscriptionUpsert(currentList, sub) {
  const subs = accountSubscriptionsFor(currentList);
  const next = normalizeAccountSubscription(sub);
  const sig = accountSubscriptionSignature(next);
  const idx = subs.findIndex((s) => accountSubscriptionSignature(s) === sig);
  if (idx >= 0) {
    // created_* survive a replace — same contract as subscriptionPatch.
    const prior = subs[idx];
    if (!next.created_by && prior.created_by) next.created_by = prior.created_by;
    if (!next.created_at && prior.created_at) next.created_at = prior.created_at;
    subs[idx] = next;
  } else {
    subs.push(next);
  }
  return subs.slice(-ACCOUNT_SUBSCRIPTIONS_MAX);
}

// Remove by signature (or by event_key when criteria-less).
export function accountSubscriptionRemove(currentList, sub) {
  const sig = accountSubscriptionSignature(sub);
  return accountSubscriptionsFor(currentList).filter((s) => accountSubscriptionSignature(s) !== sig);
}

// ---------------------------------------------------------------------------
// merge + persist shape — the isolation contract
// ---------------------------------------------------------------------------

// Small deep-merge for optimistic prefs updates (objects merge, everything
// else replaces) — mirrors workspacePrefs.deepMerge semantics.
export function mergeAccountPrefs(base, patch) {
  if (!isObj(base)) return isObj(patch) ? mergeAccountPrefs({}, patch) : patch;
  const out = { ...base };
  if (!isObj(patch)) return out;
  for (const key of Object.keys(patch)) {
    const b = base[key], p = patch[key];
    out[key] = isObj(b) && isObj(p) ? mergeAccountPrefs(b, p) : p;
  }
  return out;
}

export function normalizeEmailForPrefs(value) {
  return lower(value);
}

// THE isolation primitive: the stored row's owner is ALWAYS the actor —
// a fields payload can never re-key the row. Mirrors workspacePrefsAction
// (write.user_email = actorEmail) and notificationAction (me from session).
export function scopedUserWrite(actorEmail, fields = {}) {
  const email = normalizeEmailForPrefs(actorEmail);
  if (!email) throw new Error("An owner email is required for a per-user write.");
  const out = { ...(isObj(fields) ? fields : {}) };
  out.user_email = email;
  return out;
}

// The workspacePrefsAction prefs_update row shape — user_email forced to
// the actor, identity fields the client supplied in `extra` are ignored.
export function workspacePrefsRowForWrite(actorEmail, { preferences, profiles, requestId } = {}) {
  const write = scopedUserWrite(actorEmail, {
    preferences: isObj(preferences) ? preferences : {},
    profiles: list(profiles).slice(0, 20),
    schema_version: 1,
  });
  const rid = clean(requestId);
  if (rid) write.last_request_id = rid;
  return write;
}

// Simulate applying a scoped write to a keyed store (tests only — the real
// writers are the functions). Returns the row actually stored.
export function applyScopedWrite(store, actorEmail, fields) {
  const row = scopedUserWrite(actorEmail, fields);
  if (store && typeof store.set === "function") store.set(row.user_email, row);
  return row;
}
