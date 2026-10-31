// Pure helpers for SavedQueueView rows. Kept React-free so the logic is
// unit-testable under Node (scripts/test-saved-views.mjs).
import { DEFAULT_QUEUE_FILTERS, PAGE_SIZES } from "./productQueueModel";

export const QUEUE_LENSES = ["design", "production", "fulfillment", "all"];

// Fixed ordering — serializing a filter state always emits these keys in
// this order so two identical states produce identical JSON. Dedupe checks,
// equality tests, and stored payloads all depend on that stability.
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
];

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
];

const str = (v, fallback = "") => (v === undefined || v === null ? fallback : String(v));

const normEmail = (v) => String(v || "").trim().toLowerCase();

// Filter state → SavedQueueView.filters. Every key is always emitted in
// SAVED_VIEW_FILTER_KEYS order — never rely on caller object ordering.
export function serializeViewFilters(filters = {}) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
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
  return out;
}

// SavedQueueView.filters → filter state. Unknown keys are dropped and
// missing keys fall back to defaults — forward-compatible with partial
// payloads written by older builds.
export function deserializeViewFilters(stored = {}) {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const f = { ...DEFAULT_QUEUE_FILTERS };
  for (const key of TEXT_KEYS) {
    if (s[key] !== undefined && s[key] !== null) f[key] = String(s[key]);
  }
  const size = Number(s.pageSize);
  if (PAGE_SIZES.includes(size)) f.pageSize = size;
  if (s.includeFulfilled !== undefined) f.includeFulfilled = s.includeFulfilled === true;
  return f;
}

// Canonical comparable form of a filter state — same filters ⇒ same string.
export function canonicalViewFilters(filters = {}) {
  return JSON.stringify(serializeViewFilters(filters));
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

export function isOwnView(view, ownerEmail = "") {
  const me = normEmail(ownerEmail);
  return me !== "" && normEmail(view?.owner_email) === me;
}

// Staff see their own views plus anything marked shared.
export function isViewVisible(view, ownerEmail = "") {
  return view?.is_shared === true || isOwnView(view, ownerEmail);
}

// Only the owner may delete a view.
export function canDeleteView(view, ownerEmail = "") {
  return isOwnView(view, ownerEmail);
}

// Dropdown order: own views first, then shared (others'), alphabetical by
// name inside each group.
export function sortViews(views = [], ownerEmail = "") {
  return [...(views || [])].sort((a, b) => {
    const aMine = isOwnView(a, ownerEmail);
    const bMine = isOwnView(b, ownerEmail);
    if (aMine !== bMine) return aMine ? -1 : 1;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

// Same owner + lens + name (case-insensitive). The "overwrite existing"
// lookup when saving a view.
export function findViewByName(views = [], { name = "", ownerEmail = "", lens = "all" } = {}) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return null;
  return (
    (views || []).find(
      (v) =>
        isOwnView(v, ownerEmail) &&
        String(v?.queue_lens || "") === String(lens || "") &&
        String(v?.name || "").trim().toLowerCase() === want
    ) || null
  );
}
