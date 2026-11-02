// Pure "my queue" personalization helpers (C-10): the "assigned to me"
// preset + the per-user default view. React-free and gateway-agnostic so the
// whole surface is unit-testable under Node (scripts/test-my-queue.mjs).
//
// ── The preset ────────────────────────────────────────────────────────────
// MY_QUEUE_PRESET is the canonical storable form: `{ assigned: "me" }`. The
// `assigned` key is deliberately NOT in savedViewsModel's
// SAVED_VIEW_FILTER_KEYS — per its documented unknown-key policy the marker
// passes through saved-view serialization verbatim, so a saved view can
// carry "assigned to me" for whoever opens it: the identity is resolved at
// apply time from the signed-in user, never baked into the record. Always
// persist the marker, never the resolved `my` block from myQueueFilters
// (that one is per-user session state).
//
// ── Identity matching ─────────────────────────────────────────────────────
// Spec'd matching: case-insensitive email compare against the row's
// assignedTo / assigned_to / designer / responsibility columns, with a
// display-name match as fallback (queue rows may store either spelling —
// flattenQueueRows keeps the raw product value). Tokens are strictly the
// user's email + display name: email-local-part/first-name matching (the
// MyWorkflow convention) is NOT applied here — a "sam" local part would
// false-positive on rows assigned to a different sam@domain.
import {
  isLiveView,
  isOwnView,
  recordToFilters,
  viewOwnerEmail,
  viewPageKey,
} from "./savedViewsModel";

export const MY_QUEUE_TOKEN = "me";

// The canonical preset object — frozen; callers spread it into filter state.
export const MY_QUEUE_PRESET = Object.freeze({ assigned: MY_QUEUE_TOKEN });

// Row fields the my-queue predicate inspects, in match order: the flattened
// queue row's `assignedTo`, the raw product's snake-case `assigned_to`, then
// the other identity-bearing columns `designer` + `responsibility` (a
// person-type responsibility IS an assignee spelling; a department/group
// name simply never string-matches a user — no false positives).
export const MY_QUEUE_ROW_FIELDS = Object.freeze([
  "assignedTo",
  "assigned_to",
  "designer",
  "responsibility",
]);

const norm = (v) => String(v || "").trim().toLowerCase();

// Normalize the caller's user argument — accepts an email string or a
// {email, display_name|full_name|name} object (staff session shapes carry
// both spellings). Returns {email, name, tokens}; tokens are the lowercase
// match spellings of "me" (email + display name, deduped, blanks dropped).
export function userIdentity(user = null) {
  const src = typeof user === "string" ? { email: user } : user && typeof user === "object" ? user : {};
  const email = norm(src.email || src.user_email || src.owner_email);
  const name = String(src.display_name || src.full_name || src.name || "").trim();
  const tokens = [];
  for (const t of [email, name]) {
    const k = norm(t);
    if (k && !tokens.includes(k)) tokens.push(k);
  }
  return { email, name, tokens };
}

// Normalize a `fields` option: array of row-field names → deduped non-blank
// list; anything else → the default MY_QUEUE_ROW_FIELDS.
const matchFields = (fields) => {
  const list = Array.isArray(fields)
    ? fields.map((f) => String(f || "").trim()).filter(Boolean)
    : [];
  return [...new Set(list.length ? list : MY_QUEUE_ROW_FIELDS)];
};

// A row cell may hold a scalar, an array (multi-assignee), or a
// ";"-separated list. Comma is NOT split — "Last, First" is a single name.
const cellTokens = (v) => {
  if (Array.isArray(v)) return v.flatMap(cellTokens);
  return String(v || "")
    .split(";")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

// The resolved per-user form of MY_QUEUE_PRESET — a merge-ready filter
// object: the `assigned:"me"` marker plus a `my` block carrying the fields
// to inspect and the lowercase identity tokens to match. `my` is one
// namespaced unknown key so it survives saved-view round-trips without
// colliding with any page's own filter keys. Anonymous/no-identity users get
// an empty match list — fail-closed (isMyRow can never match for them).
export function myQueueFilters(user, { fields } = {}) {
  const { tokens } = userIdentity(user);
  return {
    ...MY_QUEUE_PRESET,
    my: { fields: matchFields(fields), match: tokens },
  };
}

// Does a filter state carry the "assigned to me" marker? Pages use this to
// decide whether the row pass needs isMyRow applied (the queue's exact-match
// filter can't express OR-across-fields, so the marker is interpreted here).
export function isMyQueueFilters(filters = {}) {
  return norm(filters?.assigned) === MY_QUEUE_TOKEN;
}

// The predicate myQueueFilters encodes: row matches when ANY inspected field
// carries ANY of the user's identity tokens (email / display name,
// case-insensitive). `fields` narrows the inspected columns (default
// MY_QUEUE_ROW_FIELDS). `user` is the same string-or-object as everywhere.
export function isMyRow(row, user, { fields } = {}) {
  const { tokens } = userIdentity(user);
  if (!tokens.length || !row || typeof row !== "object") return false;
  return matchFields(fields).some((col) =>
    cellTokens(row[col]).some((v) => tokens.includes(v)));
}

// Convenience: the preset applied to a row list — what MY_QUEUE_PRESET
// "produces" once a concrete user is bound.
export function filterMyQueueRows(rows = [], user, { fields } = {}) {
  return (rows || []).filter((r) => isMyRow(r, user, { fields }));
}

// Ownership — the savedViewsModel convention: owner_email (user_email alias)
// normalized, compared to the user's email. `user` is string-or-object.
export function userOwnsView(view, user) {
  const { email } = userIdentity(user);
  return email !== "" && viewOwnerEmail(view) === email;
}

// `default_for_user` may be a single email (the spec'd shape) or — defensive
// — an array of emails; a normalized compare decides the claim.
const claimsUser = (v, me) =>
  Array.isArray(v) ? v.some((x) => norm(x) === me) : norm(v) === me;

// Deterministic pick inside a precedence tier: earliest created_date first
// (missing dates read as oldest — a pre-metadata row is presumably early),
// then id so ties can never flip between loads.
const byOldest = (a, b) =>
  String(a?.created_date || "").localeCompare(String(b?.created_date || "")) ||
  String(a?.id || "").localeCompare(String(b?.id || ""));

// The SavedQueueView row to auto-apply for this user, or null.
//
// Precedence (documented — the personal-default tier consumes BOTH spellings
// of the claim):
//   1. personal default — a `default_for_user` claim on this user's email
//      (explicit per-user assignment, e.g. provisioned by a lead), then an
//      `is_default === true` flag on a view the user owns — the C-03 flag
//      setDefaultView writes; on an owned row it IS the same personal claim
//      in stored form. Someone else's is_default never counts.
//   2. `shared_default === true` — the team default; applies only when the
//      user has no personal default. Personal choice always beats the
//      org-wide fallback.
//   3. the user's OLDEST owned view — first-saved ≈ most-established
//      personal preference when nothing is flagged.
//   4. null — nothing applies; the page's own defaults stand.
// Archived rows (isLiveView) are never returned. When `pageKey` is given the
// pool is scoped to that page axis — a page-scoped default never applies
// off-page. Callers normally pass a listViews() result already scoped +
// visibility-filtered (own + shared rows).
export function defaultViewFor(user, savedViews = [], { pageKey } = {}) {
  const { email: me } = userIdentity(user);
  if (!me) return null;
  const pk = pageKey == null ? null : String(pageKey).trim();
  const pool = (savedViews || []).filter((v) => {
    if (!v || typeof v !== "object" || !isLiveView(v)) return false;
    if (pk == null) return true;
    return viewPageKey(v) === pk;
  });
  if (!pool.length) return null;

  const claimed = pool.filter((v) => claimsUser(v?.default_for_user, me));
  if (claimed.length) return [...claimed].sort(byOldest)[0];

  const flaggedMine = pool.filter((v) => v?.is_default === true && isOwnView(v, me));
  if (flaggedMine.length) return [...flaggedMine].sort(byOldest)[0];

  const teamDefault = pool.filter((v) => v?.shared_default === true);
  if (teamDefault.length) return [...teamDefault].sort(byOldest)[0];

  const mine = pool.filter((v) => isOwnView(v, me));
  return mine.length ? [...mine].sort(byOldest)[0] : null;
}

// First-load filter resolution for a queue page. Merging rule:
//   URL filters always win — a deep link is explicit intent and bypasses
//   stored defaults entirely (`urlFilters` is the C-08 parseQueueFilters
//   output shape or any plain map; URLSearchParams-like objects are read
//   via .entries()). An empty/absent urlFilters is "no link intent".
//   else the user's default view — the stored payload normalized through
//   recordToFilters so partial or JSON-string `filters` arrive as a complete
//   filter state (and unknown keys like `assigned:"me"` pass through, so a
//   saved "Assigned to me" view re-binds to whoever opens it).
//   else {} — the page's own DEFAULT_QUEUE_FILTERS stand.
export function resolveInitialFilters({
  user,
  savedViews = [],
  urlFilters = null,
  pageKey = null,
} = {}) {
  let url = null;
  if (urlFilters && typeof urlFilters.entries === "function") {
    url = {};
    for (const [k, v] of urlFilters.entries()) url[k] = v;
  } else if (urlFilters && typeof urlFilters === "object" && !Array.isArray(urlFilters)) {
    url = urlFilters;
  }
  if (url && Object.keys(url).length > 0) return { ...url };

  const view = defaultViewFor(user, savedViews, { pageKey });
  if (view) return recordToFilters(view?.filters ?? view?.state ?? {});
  return {};
}
