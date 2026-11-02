// Pure helpers + the dependency-injected store core for SavedQueueView rows.
// Kept React-free and gateway-agnostic so the whole surface is unit-testable
// under Node (scripts/test-saved-queue-views.mjs): savedViewsPersistence.js
// wires the store to staffEntities.SavedQueueView; tests inject a fake
// entity + a Map-backed storage.
import { DEFAULT_QUEUE_FILTERS, PAGE_SIZES } from "./productQueueModel";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  ensureIdempotentEntityCreate,
  newCreationRequestKey,
} from "@/components/estimator/idempotentEntityCreate";

export const QUEUE_LENSES = ["design", "production", "fulfillment", "all"];

// Canonical key order for a saved view's `filters` payload — serialization
// always emits the known keys in this order so identical states produce
// identical JSON (dedupe checks, equality tests, stored payloads all depend
// on that stability). The last four are the CoreBridge extension keys
// QueueFilterBar emits; they are absent from DEFAULT_QUEUE_FILTERS
// (filterQueueRows treats an absent key as "all"), so this layer owns their
// "all" default. New keys were appended — never reordered — so canonical
// forms from older builds remain a strict prefix.
export const SAVED_VIEW_FILTER_KEYS = [
  "status",
  "substatus",
  "designer",
  "responsibility",
  "assignedTo",
  "category",
  "moduleKey",
  "duePreset",
  "search",
  "pageSize",
  "includeFulfilled",
  "machine",
  "part",
  "salesperson",
  "enteredBy",
];

const KNOWN_KEYS = new Set(SAVED_VIEW_FILTER_KEYS);

// Text/enum keys normalized via String(); the boolean (includeFulfilled) and
// number (pageSize) keys have their own coercion below.
const TEXT_KEYS = [
  "status",
  "substatus",
  "designer",
  "responsibility",
  "assignedTo",
  "category",
  "moduleKey",
  "duePreset",
  "search",
  "machine",
  "part",
  "salesperson",
  "enteredBy",
];

// Keys that may never be copied into a record — protects downstream merges
// and serialization from prototype pollution if a hostile state object ever
// reaches save.
const BLOCKED_EXTRA_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// The queue defaults plus the CB extension keys at their "no filter" value.
export const SAVED_VIEW_FILTER_DEFAULTS = {
  ...DEFAULT_QUEUE_FILTERS,
  machine: "all",
  part: "all",
  salesperson: "all",
  enteredBy: "all",
};

const str = (v, fallback = "") => (v === undefined || v === null ? fallback : String(v));

const normEmail = (v) => String(v || "").trim().toLowerCase();

// `filters` may arrive as an object, as a JSON string (some transports
// serialize object columns), or as junk — always resolves to a plain object.
const asFilterObject = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON — fall through to {} */
    }
  }
  return {};
};

// ---------------------------------------------------------------------------
// Filter state <-> SavedQueueView.filters
//
// UNKNOWN-KEY POLICY (documented): keys outside SAVED_VIEW_FILTER_KEYS pass
// through verbatim in BOTH directions — emitted after the known keys in
// sorted order so the canonical form stays deterministic. Rationale:
//   a) forward compat — a view written by a newer build survives a load/save
//      cycle on this build without silently losing the newer filter keys;
//   b) SavedViews.jsx is a generic component whose non-queue pages store
//      arbitrary state shapes (e.g. {q, status, sort, mine}) — dropping
//      unknown keys would corrupt them. Known queue keys are a reserved
//      namespace: they are always validated/coerced, so a generic page must
//      not reuse e.g. "pageSize" for a non-numeric value.
// ---------------------------------------------------------------------------

// Filter state → SavedQueueView.filters. Known keys are emitted in
// SAVED_VIEW_FILTER_KEYS order — never rely on caller object ordering.
export function filtersToRecord(filters = {}) {
  const f = { ...SAVED_VIEW_FILTER_DEFAULTS, ...asFilterObject(filters) };
  const out = {};
  out.status = str(f.status, "all");
  out.substatus = str(f.substatus);
  out.designer = str(f.designer, "all");
  out.responsibility = str(f.responsibility, "all");
  out.assignedTo = str(f.assignedTo, "all");
  out.category = str(f.category, "all");
  out.moduleKey = str(f.moduleKey, "all");
  out.duePreset = str(f.duePreset, "all");
  out.search = str(f.search);
  const size = Number(f.pageSize);
  out.pageSize = PAGE_SIZES.includes(size) ? size : DEFAULT_QUEUE_FILTERS.pageSize;
  out.includeFulfilled = f.includeFulfilled === true;
  out.machine = str(f.machine, "all");
  out.part = str(f.part, "all");
  out.salesperson = str(f.salesperson, "all");
  out.enteredBy = str(f.enteredBy, "all");
  for (const key of Object.keys(f).sort()) {
    if (!KNOWN_KEYS.has(key) && !BLOCKED_EXTRA_KEYS.has(key)) out[key] = f[key];
  }
  return out;
}
// Legacy name kept — ProductQueue + persistence already import it.
export const serializeViewFilters = filtersToRecord;

// SavedQueueView.filters → filter state. Missing keys fall back to
// SAVED_VIEW_FILTER_DEFAULTS — forward-compatible with partial payloads
// written by older builds; unknown keys pass through verbatim.
export function recordToFilters(stored = {}) {
  const s = asFilterObject(stored);
  const f = { ...SAVED_VIEW_FILTER_DEFAULTS };
  for (const key of TEXT_KEYS) {
    if (s[key] !== undefined && s[key] !== null) f[key] = String(s[key]);
  }
  const size = Number(s.pageSize);
  if (PAGE_SIZES.includes(size)) f.pageSize = size;
  if (s.includeFulfilled !== undefined) f.includeFulfilled = s.includeFulfilled === true;
  for (const key of Object.keys(s).sort()) {
    if (!KNOWN_KEYS.has(key) && !BLOCKED_EXTRA_KEYS.has(key)) f[key] = s[key];
  }
  return f;
}
// Legacy name kept.
export const deserializeViewFilters = recordToFilters;

// Canonical comparable form of a filter state — same filters ⇒ same string.
export function canonicalViewFilters(filters = {}) {
  return JSON.stringify(filtersToRecord(filters));
}

export function sameViewFilters(a, b) {
  return canonicalViewFilters(a) === canonicalViewFilters(b);
}

// The saved view already capturing exactly this filter state, or null —
// the dedupe check used before saving and to detect which saved view is
// currently applied.
export function matchView(views = [], filters = {}) {
  const want = canonicalViewFilters(filters);
  return (views || []).find((v) => canonicalViewFilters(v?.filters) === want) || null;
}

// ---------------------------------------------------------------------------
// SavedQueueView record shape
//
// The entity declares alias pairs (owner_email ↔ user_email, is_shared ↔
// shared, page ↔ queue_lens); writes emit both sides of a pair so either
// convention reads correctly.
// ---------------------------------------------------------------------------

export function viewOwnerEmail(view = {}) {
  return normEmail(view?.owner_email || view?.user_email);
}

export function isViewShared(view = {}) {
  return view?.is_shared === true || view?.shared === true;
}

// Page-axis scope (C-03) — the `page` field only. `queue_lens` is the legacy
// lens axis used by ProductQueue; the two axes are deliberately disjoint.
export function viewPageKey(view = {}) {
  return String(view?.page ?? "").trim();
}

export function viewQueueLens(view = {}) {
  return String(view?.queue_lens ?? "").trim();
}

// Rows marked archived (any status other than active/blank) are retired —
// hidden from pickers without deleting them.
export function isLiveView(view = {}) {
  const s = String(view?.status ?? "").trim().toLowerCase();
  return s === "" || s === "active";
}

export function isOwnView(view, ownerEmail = "") {
  const me = normEmail(ownerEmail);
  return me !== "" && viewOwnerEmail(view) === me;
}

// Staff see their own views plus anything marked shared.
export function isViewVisible(view, ownerEmail = "") {
  return isViewShared(view) || isOwnView(view, ownerEmail);
}

// Only the owner may delete a view.
export function canDeleteView(view, ownerEmail = "") {
  return isOwnView(view, ownerEmail);
}

// Normalized SavedQueueView data for create/updateMany $set. `page` is
// emitted only when pageKey is passed and `queue_lens` only when lens is
// passed — page-scoped rows intentionally omit queue_lens so the lens-axis
// reader (ProductQueue) never cross-lists page views, and vice versa.
// Optional fields (shared, pinned, is_default, sort) are emitted only when
// their param is not undefined, so an overwrite $set preserves stored values
// the caller did not intend to change.
export function buildViewRecord({
  name = "",
  pageKey = null,
  lens = null,
  filters = {},
  ownerEmail = "",
  shared = undefined,
  pinned = undefined,
  sort = undefined,
  isDefault = undefined,
} = {}) {
  const data = {
    name: String(name || "").trim().slice(0, 120),
    filters: filtersToRecord(filters),
    owner_email: String(ownerEmail || "").trim(),
    user_email: String(ownerEmail || "").trim(),
    status: "active",
  };
  const pk = String(pageKey ?? "").trim();
  if (pk) data.page = pk;
  const ln = String(lens ?? "").trim();
  if (ln) data.queue_lens = ln;
  if (shared !== undefined) {
    data.is_shared = shared === true;
    data.shared = shared === true;
  }
  if (pinned !== undefined) data.pinned = pinned === true;
  if (isDefault !== undefined) data.is_default = isDefault === true;
  const weight = Number(sort);
  if (sort !== undefined && sort !== null && Number.isFinite(weight)) data.sort = weight;
  return data;
}

const sortWeight = (v) => {
  const n = Number(v?.sort);
  return Number.isFinite(n) ? n : null;
};

// Dropdown order, fully deterministic: own views before shared (others')
// views; pinned before unpinned inside each group; numeric `sort` weight
// ascending (unweighted rows sit after weighted ones); then name; then
// created_date; then id — the tiebreak chain ends on a unique field so the
// order is stable across reloads and sessions ("pin ordering stable").
export function sortViews(views = [], ownerEmail = "") {
  return [...(views || [])].sort((a, b) => {
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

// Sort weight a newly-pinned view gets: one less than the smallest weight in
// the pinned group, so the most recent pin floats to the top of the pinned
// block without disturbing existing weights. Unweighted pinned rows count
// as weight 0 for this purpose; an empty pinned group starts at 0.
export function nextPinnedSort(views = []) {
  const weights = (views || [])
    .filter((v) => v?.pinned === true)
    .map((v) => sortWeight(v) ?? 0);
  return weights.length ? Math.min(...weights) - 1 : 0;
}

// Same owner + scope + name (case-insensitive). Pass `pageKey` to match the
// C-03 page axis or `lens` for the legacy lens axis — pageKey wins when both
// are given.
export function findViewByName(views = [], { name = "", ownerEmail = "", lens = "all", pageKey = null } = {}) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return null;
  return (
    (views || []).find(
      (v) =>
        isOwnView(v, ownerEmail) &&
        (pageKey != null
          ? viewPageKey(v) === String(pageKey)
          : String(v?.queue_lens || "") === String(lens || "")) &&
        String(v?.name || "").trim().toLowerCase() === want
    ) || null
  );
}

// ---------------------------------------------------------------------------
// Gateway-error classification
// ---------------------------------------------------------------------------

export const SAVED_VIEWS_UNAVAILABLE = "Saved views unavailable";

// Errors that mean the entity is not (yet) wired into the staff gateways —
// a 403/404 from staffDataRead/staffEntityWrite, or the gateway's
// "record type" rejections. Anything else is a transient/user-visible
// failure, not a permanent unavailable state.
export function isSavedViewsUnavailableError(error) {
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 403 || status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.error || error?.data?.error || ""
  ).toLowerCase();
  return (
    message.includes("cannot be written") ||
    message.includes("unknown record type") ||
    message.includes("not permitted") ||
    message.includes("not readable") ||
    message.includes("denied")
  );
}

// Errors that justify degrading a scope to the session mirror on WRITE:
// clearly-unavailable gateway (above) plus transient infrastructure failures
// (429, 5xx, bare network TypeErrors). Ambiguous outcomes — CAS conflicts and
// unverifiable-write results — carry `conflict: true`/no status and always
// propagate instead of silently mirroring (a mirrored write would diverge
// from what the server actually stored).
export function isDegradableError(error) {
  if (!error || error.conflict === true) return false;
  if (isSavedViewsUnavailableError(error)) return true;
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 429 || status >= 500) return true;
  return Number.isNaN(status) && error?.name === "TypeError";
}

const conflict = (message) => Object.assign(new Error(message), { conflict: true });

// ---------------------------------------------------------------------------
// Degraded-session mirror ("ssv:" namespace)
//
// When the SavedQueueView gateway read fails, listViews serves the scope's
// views from a per-session mirror instead of the entity and marks the result
// degraded:true. While a scope stays degraded, writes (save/rename/pin/
// default/delete) apply to the mirror too — the user keeps working and a
// later successful read clears the flag and serves server rows again.
//
// Semantics, documented:
//  * Mirror keys are "ssv:<owner-email>:<scope>" — per signed-in user, per
//    page/lens scope.
//  * Mirror rows carry synthetic "ssv-<uuid>" ids (isMirrorView) — they can
//    never collide with server ids and never sync back. The mirror is a
//    session fallback, not an offline-write queue: views saved while
//    degraded are visible only in that browser session's mirror, and
//    deletes/pins/renames while degraded do not touch server rows.
//  * `storage` is injectable — tests pass a Map-like {getItem,setItem,
//    removeItem}; when left undefined it resolves to the browser's
//    localStorage at call time (under Node there is none → the mirror
//    silently no-ops).
// ---------------------------------------------------------------------------
export const MIRROR_PREFIX = "ssv:";
export const MIRROR_ID_PREFIX = "ssv-";

export const defaultViewMirrorStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const mirrorKeyFor = ({ scope = "all", ownerEmail = "" } = {}) =>
  `${MIRROR_PREFIX}${normEmail(ownerEmail) || "anon"}:${String(scope || "all")}`;

export const isMirrorView = (view) => String(view?.id || "").startsWith(MIRROR_ID_PREFIX);

export function newMirrorViewId() {
  const token =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${MIRROR_ID_PREFIX}${token}`;
}

export function readViewMirror({ storage = defaultViewMirrorStorage(), scope = "all", ownerEmail = "" } = {}) {
  if (!storage || typeof storage.getItem !== "function") return [];
  try {
    const parsed = JSON.parse(storage.getItem(mirrorKeyFor({ scope, ownerEmail })) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v) => v && typeof v === "object" && typeof v.name === "string")
      : [];
  } catch {
    return [];
  }
}

// Returns false (never throws) when storage is missing or full — callers
// decide whether that is silent (read path) or an error (write path).
export function writeViewMirror({ storage = defaultViewMirrorStorage(), scope = "all", ownerEmail = "", views = [] } = {}) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(mirrorKeyFor({ scope, ownerEmail }), JSON.stringify(views || []));
    return true;
  } catch {
    return false; // quota — mirror stays best-effort
  }
}

// ---------------------------------------------------------------------------
// createSavedViewStore — the injectable CRUD core.
//
// `entity` is any SavedQueueView-shaped client ({filter,list,get,create,
// updateMany,delete}); persistence passes staffEntities.SavedQueueView.
// `storage` is the mirror backend (undefined → resolved lazily per call).
// `loadRows`/`ensureCreate`/`newKey` default to the hardened estimator
// helpers but accept any same-contract equivalent — tests inject fakes.
//
// Result contract:
//   listViews / loadLensViews → { views, degraded, available, error }
//   saveView / saveLensView   → { view, degraded } (saveLensView returns the
//                               bare record for the ProductQueue contract)
//   renameView / pinView / setDefaultView → { view, degraded, warning? }
//   deleteView                → { deleted: true, degraded }
//   applyView                 → filters object (recordToFilters)
// `degraded: true` means the op ran against the session mirror, not the
// entity — session-local persistence while the gateway is unreachable.
// ---------------------------------------------------------------------------
const normScopeKey = (v, fallback = "all") => String(v ?? "").trim() || fallback;
export const pageScope = (pageKey) => `page:${normScopeKey(pageKey)}`;
export const lensScope = (lens) => `lens:${normScopeKey(lens)}`;

export function createSavedViewStore({
  entity = null,
  storage = undefined,
  loadRows = loadAllEntityRows,
  ensureCreate = ensureIdempotentEntityCreate,
  newKey = newCreationRequestKey,
} = {}) {
  // Scopes whose last gateway read failed — writes route to the mirror while
  // degraded; a successful read clears the flag. In-memory ⇒ per session.
  const degradedScopes = new Set();

  const mirrorList = (scope, ownerEmail) =>
    readViewMirror({ storage, scope, ownerEmail }).filter(isLiveView);

  // Mirror writes are the fallback path — when storage itself is gone the
  // user must hear about it, so a failed mirror write throws.
  const mirrorWrite = (scope, ownerEmail, views) => {
    const ok = writeViewMirror({ storage, scope, ownerEmail, views });
    if (!ok) {
      throw new Error("Saved views are offline and session mirror storage is unavailable.");
    }
  };

  const mirrorPatch = (scope, ownerEmail, id, patch) => {
    const rows = mirrorList(scope, ownerEmail);
    const now = new Date().toISOString();
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch, updated_date: now, mirrored: true } : r));
    mirrorWrite(scope, ownerEmail, next);
    return next.find((r) => r.id === id) || null;
  };

  const mirrorSave = ({ scope, ownerEmail, data, existing }) => {
    const rows = mirrorList(scope, ownerEmail);
    const now = new Date().toISOString();
    if (existing?.id && rows.some((r) => r.id === existing.id)) {
      const next = rows.map((r) =>
        r.id === existing.id ? { ...r, ...data, id: r.id, updated_date: now, mirrored: true } : r
      );
      mirrorWrite(scope, ownerEmail, next);
      return next.find((r) => r.id === existing.id);
    }
    // New view — or an `existing` row that lives only server-side and cannot
    // be reached while degraded: append a fresh mirror row, deduped by name.
    const row = {
      id: newMirrorViewId(),
      created_date: now,
      updated_date: now,
      mirrored: true,
      creation_request_key:
        typeof newKey === "function" ? newKey("saved_queue_view") : `saved_queue_view:${now}`,
      ...data,
    };
    const want = String(data.name || "").trim().toLowerCase();
    mirrorWrite(scope, ownerEmail, [
      ...rows.filter((r) => String(r?.name || "").trim().toLowerCase() !== want),
      row,
    ]);
    return row;
  };

  // Single-record CAS write: updateMany({id, updated_date}, {$set}) — the
  // updateMany op is the only mutation the staffEntityWrite gateway allows
  // besides create/delete, and the updated_date anchor keeps two sessions
  // from both claiming an overwrite.
  const casUpdate = async (view, fields, label = "Saved view") => {
    const version = String(view?.updated_date || "").trim();
    if (!version) {
      throw conflict(`${label} is missing its current version. Reload before saving.`);
    }
    const result = await entity.updateMany({ id: view.id, updated_date: version }, { $set: fields });
    if (result && typeof result.updated === "number") {
      if (result.updated === 1) {
        // Post-update re-read is best-effort — the applied fields are known
        // locally even if the gateway get races.
        const saved = await entity.get(view.id).catch(() => null);
        return saved || { ...view, ...fields };
      }
      if (result.updated === 0) {
        throw conflict("This saved view changed in another session. Reload before saving.");
      }
      throw conflict("Saved view update matched more than one record. Reload and review.");
    }
    throw new Error("Saved view update result could not be verified.");
  };

  // Route a mutation: mirror while the scope is degraded (or the row itself
  // is a mirror row); otherwise try the server and degrade on a clearly
  // unavailable/transient gateway failure. Conflicts and unverifiable
  // outcomes always propagate.
  const writeOp = async ({ scope, view, server, mirror }) => {
    if (degradedScopes.has(scope) || (view && isMirrorView(view))) {
      return { result: mirror(), degraded: true };
    }
    try {
      return { result: await server(), degraded: false };
    } catch (error) {
      if (isDegradableError(error)) {
        degradedScopes.add(scope);
        return { result: mirror(), degraded: true };
      }
      throw error;
    }
  };

  const scopeOf = (view, pageKey) => {
    if (pageKey != null) return pageScope(pageKey);
    const pk = viewPageKey(view);
    if (pk) return pageScope(pk);
    const ln = viewQueueLens(view);
    if (ln) return lensScope(ln);
    return pageScope("all");
  };

  const ownerOf = (view, ownerEmail) => ownerEmail || viewOwnerEmail(view);

  const listScoped = async ({ scope, query, matchScope, ownerEmail, includeShared }) => {
    const me = normEmail(ownerEmail);
    try {
      if (!entity) {
        const e = new Error("Saved view store has no entity client.");
        e.status = 404;
        throw e;
      }
      const rows = await loadRows({
        entity,
        query,
        sort: "created_date",
        maxRows: 2000,
        label: "Saved queue views",
      });
      const views = (rows || []).filter(
        (r) =>
          matchScope(r) &&
          isLiveView(r) &&
          ((me !== "" && viewOwnerEmail(r) === me) || (includeShared === true && isViewShared(r)))
      );
      degradedScopes.delete(scope);
      return { views: sortViews(views, ownerEmail), degraded: false, available: true, error: null };
    } catch (error) {
      degradedScopes.add(scope);
      return {
        views: sortViews(mirrorList(scope, ownerEmail), ownerEmail),
        degraded: true,
        available: !isSavedViewsUnavailableError(error),
        error,
      };
    }
  };

  const store = {};

  // C-03 page axis — "the user's views for this page, pinned first then
  // sort". Shared rows are included for visibility; the UI gates mutations
  // on them via isOwnView/canDeleteView.
  store.listViews = ({ pageKey = "all", ownerEmail = "", includeShared = true } = {}) =>
    listScoped({
      scope: pageScope(pageKey),
      query: { page: normScopeKey(pageKey) },
      matchScope: (r) => viewPageKey(r) === normScopeKey(pageKey),
      ownerEmail,
      includeShared,
    });

  // Legacy lens axis (ProductQueue) — same machinery scoped by queue_lens.
  store.loadLensViews = ({ lens = "all", ownerEmail = "", includeShared = true } = {}) =>
    listScoped({
      scope: lensScope(lens),
      query: { queue_lens: normScopeKey(lens) },
      matchScope: (r) => String(r?.queue_lens || "") === normScopeKey(lens),
      ownerEmail,
      includeShared,
    });

  // Save (or overwrite, when `existing` is the same-name row) a named view
  // on the page axis. `existing.updated_date` anchors the conditional
  // update so two sessions can never both claim the overwrite.
  store.saveView = async ({
    name,
    pageKey = "all",
    lens = null,
    filters = {},
    ownerEmail = "",
    existing = null,
    shared,
    pinned,
    sort,
    isDefault,
  } = {}) => {
    const cleanName = String(name || "").trim().slice(0, 120);
    if (!cleanName) throw new Error("View name is required.");
    const scope = pageScope(pageKey);
    const data = buildViewRecord({
      name: cleanName, pageKey, lens, filters, ownerEmail, shared, pinned, sort, isDefault,
    });
    const key = () =>
      typeof newKey === "function" ? newKey("saved_queue_view") : `saved_queue_view:${Date.now()}`;
    const { result, degraded } = await writeOp({
      scope,
      view: existing,
      server: async () => {
        if (existing?.id && !isMirrorView(existing)) return casUpdate(existing, data, "Saved view");
        return ensureCreate({
          entity,
          keyField: "creation_request_key",
          key: key(),
          data,
          label: "Saved queue view",
        });
      },
      mirror: () => mirrorSave({ scope, ownerEmail, data, existing }),
    });
    return { view: result, degraded };
  };

  // Legacy lens-axis save (the ProductQueue contract) — returns the bare
  // record. `is_shared:false` is always emitted as before.
  store.saveLensView = async ({ name, lens = "all", filters = {}, ownerEmail = "", existing = null } = {}) => {
    const cleanName = String(name || "").trim().slice(0, 120);
    if (!cleanName) throw new Error("View name is required.");
    const scope = lensScope(lens);
    const data = buildViewRecord({ name: cleanName, lens, filters, ownerEmail, shared: false });
    const { result } = await writeOp({
      scope,
      view: existing,
      server: async () => {
        if (existing?.id && !isMirrorView(existing)) return casUpdate(existing, data, "Saved view");
        return ensureCreate({
          entity,
          keyField: "creation_request_key",
          key: newKey("saved_queue_view"),
          data,
          label: "Saved queue view",
        });
      },
      mirror: () => mirrorSave({ scope, ownerEmail, data, existing }),
    });
    return result;
  };

  store.renameView = async ({ view, name, ownerEmail, pageKey } = {}) => {
    const cleanName = String(name || "").trim().slice(0, 120);
    if (!cleanName) throw new Error("View name is required.");
    const scope = scopeOf(view, pageKey);
    const me = ownerOf(view, ownerEmail);
    const { result, degraded } = await writeOp({
      scope,
      view,
      server: () => casUpdate(view, { name: cleanName }, "Saved view"),
      mirror: () => mirrorPatch(scope, me, String(view?.id || ""), { name: cleanName }),
    });
    return { view: result, degraded };
  };

  // Pin/unpin. Pinning (when `sort` is not given) assigns the view the
  // smallest pinned weight — newest pin floats to the top of the pinned
  // block. Pass `views` (the loaded list) for correct weight placement.
  store.pinView = async ({ view, pinned, sort, views = [], ownerEmail, pageKey } = {}) => {
    const target = pinned === undefined ? view?.pinned !== true : pinned === true;
    const patch = { pinned: target };
    if (sort !== undefined && sort !== null) {
      patch.sort = Number(sort);
    } else if (target) {
      patch.sort = nextPinnedSort(views);
    }
    const scope = scopeOf(view, pageKey);
    const me = ownerOf(view, ownerEmail);
    const { result, degraded } = await writeOp({
      scope,
      view,
      server: () => casUpdate(view, patch, "Saved view"),
      mirror: () => mirrorPatch(scope, me, String(view?.id || ""), patch),
    });
    return { view: result, degraded };
  };

  // Mark/unmark a view as the owner's auto-applied default. Setting a new
  // default also clears `is_default` on the other loaded rows — secondary
  // clears are best-effort and reported via `warning` (the reload reconciles).
  store.setDefaultView = async ({ view, views = [], isDefault, ownerEmail, pageKey } = {}) => {
    const target = isDefault === undefined ? view?.is_default !== true : isDefault === true;
    const scope = scopeOf(view, pageKey);
    const me = ownerOf(view, ownerEmail);
    let warning = "";
    const { result, degraded } = await writeOp({
      scope,
      view,
      server: async () => {
        const saved = await casUpdate(view, { is_default: target }, "Saved view");
        if (target) {
          const failed = [];
          for (const other of views || []) {
            if (!other?.id || other.id === view?.id || other.is_default !== true || isMirrorView(other)) continue;
            try {
              await casUpdate(other, { is_default: false }, "Saved view");
            } catch {
              failed.push(other?.name || other?.id);
            }
          }
          if (failed.length) {
            warning = `Could not clear ${failed.length} other default view(s) — reload to reconcile.`;
          }
        }
        return saved;
      },
      mirror: () => {
        const rows = mirrorList(scope, me);
        const now = new Date().toISOString();
        const next = rows.map((r) =>
          r.id === view?.id || (target && r.is_default === true)
            ? { ...r, is_default: r.id === view?.id ? target : false, updated_date: now }
            : r
        );
        mirrorWrite(scope, me, next);
        return next.find((r) => r.id === view?.id) || null;
      },
    });
    return { view: result, degraded, warning };
  };

  // Delete. Mirror rows (ssv- ids) always go through the mirror; a server
  // row deleted while the scope is degraded only leaves the mirror (the row
  // was never in it — the delete is a session-local no-op and the row
  // reappears when the gateway recovers; documented mirror semantics).
  store.deleteView = async (view = {}, { ownerEmail, pageKey } = {}) => {
    const id = String(view?.id || "").trim();
    if (!id) throw new Error("Saved view is missing its id.");
    const scope = scopeOf(view, pageKey);
    const me = ownerOf(view, ownerEmail);
    const { degraded } = await writeOp({
      scope,
      view,
      server: async () => {
        const deleted = await entity.delete(id);
        if (deleted !== true) throw new Error("Saved view delete could not be verified.");
        return true;
      },
      mirror: () => {
        mirrorWrite(scope, me, mirrorList(scope, me).filter((r) => r.id !== id));
        return true;
      },
    });
    return { deleted: true, degraded };
  };

  // Apply — the row's stored payload back into a live filters object.
  // Accepts a legacy {state} shape too so mixed lists never hard-crash.
  store.applyView = (view = {}) => recordToFilters(view?.filters ?? view?.state ?? {});

  store.isScopeDegraded = (scope) => degradedScopes.has(String(scope || ""));

  return store;
}
