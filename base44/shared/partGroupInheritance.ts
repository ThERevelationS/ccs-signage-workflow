// CatalogPartGroup inheritance — shared-defaults resolution, member linking,
// and pure write-plan generation (ESTIMATOR_MASTERPLAN F-13).
// Pure TS, ZERO imports, NO IO — every function is deterministic over its
// arguments so it can run identically in a deployed function, the frontend
// bundle, or a Node test harness.
//
// Entity contract (base44/entities/CatalogPartGroup.jsonc):
//   { id, name, description, shared_defaults: {…}, part_ids: string[],
//     sort: number, status: string }
// `shared_defaults` is a JSON bag of inheritable part fields (pricing mode,
// margin, vendor, waste factor, …) that members adopt unless they opt out.
//
// LINK MODES — a part can belong to a group two ways, BOTH supported:
//   1. MEMBERSHIP (roster): group.part_ids contains part.id. This is the
//      canonical catalog-level link — the group owns its member list.
//   2. FK LINK: the part points back at the group via a group-link field.
//      Checked fields, in order: part_group_id (declared on BuilderPart),
//      catalog_part_group_id, group_id. First non-empty wins.
// MEMBERSHIP WINS: when a part is listed in one group's part_ids but its
// FK points at a different group, the roster group is authoritative (the
// group-side list is the maintained source of truth; a stale FK is ignored).
// Caveat: on BuilderPart, part_group_id normally references a *Builder*
// PartGroup (ordered group inside one product) — the FK fallback only binds
// to a CatalogPartGroup when the id literally matches, so an unrelated
// BuilderPartGroup id never resolves as a catalog group.
//
// OVERRIDE SEMANTICS (effectivePartDefaults precedence):
//   1. part explicit  — part has its own non-empty value for the key:
//      part value wins, group default does NOT apply. "Non-empty" means not
//      undefined/null/'' — false, 0, [], and {} all count as explicit values.
//   2. overridden_fields exclusion — part.overridden_fields lists the key
//      (diff-track: user deliberately detached this field from the group):
//      group default does NOT apply; the part keeps whatever it has (even an
//      empty value or absence).
//   3. group default — otherwise shared_defaults[key] fills the field
//      (including part fields that are present-but-empty).
// Inherited/overridden group keys are reported sorted; suppressed_keys is the
// subset of overridden_keys excluded purely via overridden_fields (no explicit
// part value) — UIs use it to distinguish "suppressed" from "own value".
//
// WRITE PLAN (propagateGroupEdit) — diff-driven: only shared_defaults keys
// whose value CHANGED versus prevDefaults are candidates for writes
// (unchanged keys are assumed already materialized, or are served by
// read-time inheritance anyway). For each member part an entry
//   { part_id, updates: {key: newValue}, skipped_keys: [...] }
// is produced; skipped_keys lists changed keys NOT written because the part
// overrides them (explicit value or overridden_fields). Members with zero
// updates are still listed so callers can preview/no-op them. Keys present in
// prevDefaults but REMOVED from the new shared_defaults are reported as
// top-level removed_keys — the plan never emits unsets, since a removed
// group default must not clobber a value the part may have legitimately
// inherited earlier; the caller decides whether to clear them.

// ---------------------------------------------------------------------------
// public types
// ---------------------------------------------------------------------------

/** Loose record shape — works for BuilderPart, catalog part rows, or stubs. */
export interface PartLike {
  id?: string;
  part_group_id?: string;
  catalog_part_group_id?: string;
  group_id?: string;
  overridden_fields?: unknown; // expected string[]; junk tolerated
  [key: string]: unknown;
}

export interface CatalogPartGroupLike {
  id?: string;
  name?: string;
  shared_defaults?: Record<string, unknown> | null;
  part_ids?: unknown; // expected string[]; junk tolerated
  sort?: number;
  status?: string;
  [key: string]: unknown;
}

export interface EffectiveDefaults {
  /** Part record with applicable group defaults filled in. */
  merged: Record<string, unknown>;
  /** Sorted shared_defaults keys applied into merged. */
  inherited_keys: string[];
  /** Sorted shared_defaults keys NOT applied (explicit value or opt-out). */
  overridden_keys: string[];
  /** Subset of overridden_keys excluded via overridden_fields with no
   *  explicit part value ("suppressed" rather than "overridden by value"). */
  suppressed_keys: string[];
}

export interface PartWritePlan {
  part_id: string | null;
  /** field -> new shared_defaults value to write on this part. */
  updates: Record<string, unknown>;
  /** Sorted changed keys not written because the part overrides them. */
  skipped_keys: string[];
}

export interface GroupWritePlan {
  group_id: string | null;
  /** Sorted shared_defaults keys whose value differs from prevDefaults. */
  changed_keys: string[];
  /** Sorted keys in prevDefaults removed from the new shared_defaults.
   *  No part writes are emitted for these — caller decides on unsets. */
  removed_keys: string[];
  /** One entry per member part (both link modes), part_ids order first. */
  parts: PartWritePlan[];
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/** FK link candidates in precedence order — part_group_id is the field
 *  actually declared on BuilderPart; the other two cover catalog part rows. */
export const PART_GROUP_LINK_FIELDS: readonly string[] = [
  "part_group_id",
  "catalog_part_group_id",
  "group_id",
];

const hasOwn = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/** "Empty" means a hole the group may fill: absent/null/undefined/''.
 *  false, 0, [], {} are real values and count as explicit. */
const isEmptyValue = (v: unknown): boolean =>
  v === undefined || v === null || v === "";

function partId(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const id = (part as { id?: unknown }).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

function groupId(group: unknown): string | null {
  return partId(group); // same "non-empty id" rule
}

/** First non-empty group-link value on a part, in PART_GROUP_LINK_FIELDS
 *  order. Strings are trimmed; finite numbers coerce. null/''/objects skip. */
function partGroupLink(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  for (const f of PART_GROUP_LINK_FIELDS) {
    const v = (part as Record<string, unknown>)[f];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Set of trimmed non-empty string ids in group.part_ids (junk tolerated). */
function membershipIds(group: CatalogPartGroupLike): Set<string> {
  const out = new Set<string>();
  const raw = group ? group.part_ids : null;
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && v.trim()) out.add(v.trim());
      else if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
    }
  }
  return out;
}

/** Normalized part.overridden_fields — string keys only, trimmed, deduped. */
function overrideSet(part: unknown): Set<string> {
  const out = new Set<string>();
  const raw = part && typeof part === "object"
    ? (part as { overridden_fields?: unknown }).overridden_fields
    : null;
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && v.trim()) out.add(v.trim());
    }
  }
  return out;
}

/** Does the part carry an explicit (non-empty) own value for `key`? */
function partHasExplicitValue(part: unknown, key: string): boolean {
  if (!part || typeof part !== "object") return false;
  if (!hasOwn(part, key)) return false;
  return !isEmptyValue((part as Record<string, unknown>)[key]);
}

/** Groups array -> copy sorted by `sort` ascending (stable; missing/non-numeric
 *  sort counts as 0, matching the entity default). Deterministic scan order
 *  for double-membership data errors. */
function orderedGroups(groups: unknown): CatalogPartGroupLike[] {
  const list = (Array.isArray(groups) ? groups : []).filter(
    (g): g is CatalogPartGroupLike => !!g && typeof g === "object",
  );
  return list
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const sa = typeof a.g.sort === "number" && Number.isFinite(a.g.sort) ? a.g.sort : 0;
      const sb = typeof b.g.sort === "number" && Number.isFinite(b.g.sort) ? b.g.sort : 0;
      return sa - sb || a.i - b.i;
    })
    .map((x) => x.g);
}

/** JSON-ish deep equality for shared_defaults diffing (NaN === NaN). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" &&
      Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (!deepEqual(aa[i], bb[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!hasOwn(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Resolve the CatalogPartGroup that owns `part`, or null.
 * MEMBERSHIP WINS: groups are scanned (ascending `sort`, then input order)
 * for a part_ids hit first; only when no roster claims the part does the
 * part's group-link field (part_group_id → catalog_part_group_id → group_id)
 * bind it to a group by id.
 */
export function resolveGroupForPart(
  part: unknown,
  groups: unknown,
): CatalogPartGroupLike | null {
  const list = orderedGroups(groups);
  const pid = partId(part);
  if (pid) {
    for (const g of list) {
      if (membershipIds(g).has(pid)) return g;
    }
  }
  const link = partGroupLink(part);
  if (link) {
    for (const g of list) {
      if (groupId(g) === link) return g;
    }
  }
  return null;
}

/**
 * Member list of `group` honoring BOTH link modes, deduped:
 * membership-linked parts first in group.part_ids order, then FK-linked
 * parts in the input `parts` order. Ids listed in part_ids but absent from
 * `parts` are skipped (can't return a record that wasn't supplied).
 */
export function groupMembers(
  group: CatalogPartGroupLike | null | undefined,
  parts: unknown,
): PartLike[] {
  const list = (Array.isArray(parts) ? parts : []).filter(
    (p): p is PartLike => !!p && typeof p === "object",
  );
  if (!group || typeof group !== "object") return [];
  const gid = groupId(group);
  const out: PartLike[] = [];
  const seen = new Set<string>();

  const byId = new Map<string, PartLike>();
  for (const p of list) {
    const pid = partId(p);
    if (pid && !byId.has(pid)) byId.set(pid, p);
  }

  // 1) roster order
  const rawIds = Array.isArray(group.part_ids) ? group.part_ids : [];
  for (const v of rawIds) {
    const id = typeof v === "string" ? v.trim()
      : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    if (!id || seen.has(id)) continue;
    const p = byId.get(id);
    if (p) {
      out.push(p);
      seen.add(id);
    }
  }

  // 2) FK-linked extras, input order (id-less parts can only ever land here)
  for (const p of list) {
    if (!gid) break;
    const pid = partId(p);
    if (pid && seen.has(pid)) continue;
    if (partGroupLink(p) === gid) {
      out.push(p);
      if (pid) seen.add(pid);
    }
  }
  return out;
}

/**
 * Effective part record for `part` inside `group`.
 * Precedence: part explicit value > overridden_fields exclusion > group
 * default. `merged` is the part's own fields with applicable shared_defaults
 * filled in (group never deletes part fields; an opt-out with no own value
 * simply leaves the key absent/empty rather than receiving the default).
 */
export function effectivePartDefaults(args: {
  part: unknown;
  group: CatalogPartGroupLike | null | undefined;
}): EffectiveDefaults {
  const part = args ? args.part : null;
  const group = args ? args.group : null;
  const merged: Record<string, unknown> =
    part && typeof part === "object" ? { ...(part as Record<string, unknown>) } : {};
  const shared =
    group && typeof group === "object" && group.shared_defaults &&
    typeof group.shared_defaults === "object" && !Array.isArray(group.shared_defaults)
      ? (group.shared_defaults as Record<string, unknown>)
      : {};
  const overrides = overrideSet(part);

  const inherited_keys: string[] = [];
  const overridden_keys: string[] = [];
  const suppressed_keys: string[] = [];

  for (const k of Object.keys(shared).sort()) {
    if (partHasExplicitValue(part, k)) {
      // explicit part value wins — even over an overridden_fields listing
      overridden_keys.push(k);
      continue;
    }
    if (overrides.has(k)) {
      overridden_keys.push(k);
      suppressed_keys.push(k); // suppressed: opt-out with no own value
      continue;
    }
    merged[k] = shared[k];
    inherited_keys.push(k);
  }
  return { merged, inherited_keys, overridden_keys, suppressed_keys };
}

/**
 * Pure write plan for propagating a shared_defaults edit to member parts.
 * Diff-driven: candidates = keys whose new value deep-differs from
 * prevDefaults. For each member (both link modes) a {part_id, updates,
 * skipped_keys} entry is produced — updates contains only keys the part does
 * NOT override; overridden keys land in skipped_keys so callers can report
 * them. Keys dropped from shared_defaults are reported as removed_keys and
 * never written/unset. No IO is performed.
 */
export function propagateGroupEdit(args: {
  group: CatalogPartGroupLike | null | undefined;
  prevDefaults?: Record<string, unknown> | null;
  parts: unknown;
}): GroupWritePlan {
  const group = args ? args.group : null;
  const prev = args && args.prevDefaults && typeof args.prevDefaults === "object"
    ? args.prevDefaults
    : {};
  const next =
    group && typeof group === "object" && group.shared_defaults &&
    typeof group.shared_defaults === "object" && !Array.isArray(group.shared_defaults)
      ? (group.shared_defaults as Record<string, unknown>)
      : {};

  const changed_keys = Object.keys(next)
    .filter((k) => !hasOwn(prev, k) || !deepEqual(next[k], prev[k]))
    .sort();
  const removed_keys = Object.keys(prev)
    .filter((k) => !hasOwn(next, k))
    .sort();

  const parts: PartWritePlan[] = groupMembers(group, args ? args.parts : null).map(
    (p) => {
      const overrides = overrideSet(p);
      const updates: Record<string, unknown> = {};
      const skipped_keys: string[] = [];
      for (const k of changed_keys) {
        if (partHasExplicitValue(p, k) || overrides.has(k)) {
          skipped_keys.push(k);
        } else {
          updates[k] = next[k];
        }
      }
      return { part_id: partId(p), updates, skipped_keys };
    },
  );

  return { group_id: groupId(group), changed_keys, removed_keys, parts };
}

/**
 * Return the updated overridden_fields list for `part` after opting
 * `fieldKey` out of group inheritance: existing keys normalized (strings,
 * trimmed, deduped), fieldKey added if non-empty, result sorted. Pure — the
 * part is not mutated; caller assigns `part.overridden_fields = markOverride(part, k)`.
 */
export function markOverride(part: unknown, fieldKey: unknown): string[] {
  const set = overrideSet(part);
  if (typeof fieldKey === "string" && fieldKey.trim()) set.add(fieldKey.trim());
  return [...set].sort();
}
