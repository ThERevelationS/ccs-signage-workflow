// Custom estimate statuses — ESTIMATOR_MASTERPLAN WS-K / item K-11 (#493).
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*), frontend picker surfaces, and Node test harnesses
// alike. No I/O anywhere — the wiring layer loads QuoteDefaults and calls
// customStatusRowsFromStorage() / statusPickerRows() with what it found.
//
// ── Builtin vocabulary (source of truth) ──────────────────────────────────
//   AllInOneEstimate.jsonc `status` enum (base44/entities/AllInOneEstimate
//   .jsonc ~L402-413): draft, calculated, sent, approved, archived,
//   cancelled — SIX persisted values. The QuoteSettings editor copy says
//   "built-in seven"; that prose is stale (the enum has always been six —
//   "converted" is a derived conversionInfo state, never a stored status).
//
// ── Transition engine parity ──────────────────────────────────────────────
//   BUILTIN_TRANSITIONS mirrors src/components/estimator/
//   estimateStatusTransitions.js ALLOWED_TRANSITIONS verbatim:
//     draft/calculated → sent → approved; anything active → archived or
//     cancelled; archived → draft (unarchive); approved → sent (reopen);
//     cancelled → terminal. Overrides in status_transitions REPLACE a `from`
//   row wholesale — they never merge with the baked row.
//
// ── Storage shape (QuoteDefaults, config_name 'default') ─────────────────
//   The entity stores JSON INSIDE string fields (frontend parses on read):
//     custom_statuses      JSON string of a slug array — ["on_hold","in_prod"]
//     status_transitions   JSON string of {from: [to,...]} override map —
//                          replaces that source row's outgoing list entirely
//     custom_status_meta   JSON string of {key: {label,color,terminal,
//                          bucket,roles,allow_builtin_reentry}} — OPTIONAL,
//                          emitted only when rows carry non-default metadata;
//                          consumers that don't know it still work off the
//                          slug list + transition map (label falls back to
//                          the humanized slug).
//   Empty string = unset (DEFAULT_QUOTE_SETTINGS convention) — never "[]".
//
// ── Edge constraint (the one rule that matters) ──────────────────────────
//   Custom rows may NOT create edges INTO builtin non-terminal (flow)
//   states — draft, calculated, sent, approved — because entering those
//   triggers quote-engine effects (quote issuance/version bump on sent,
//   lifecycle revision records on protected statuses). A custom status
//   legitimately ENDS in archived or cancelled, or moves to another custom
//   status. Re-entry into the builtin flow is allowed only when explicitly
//   spec'd two ways: row.allow_builtin_reentry === true, or an explicit
//   status_transitions override row authored by the admin (overrides are
//   the escape hatch — the editor writes them verbatim). transitionGraph()
//   silently drops non-compliant declared edges; validateCustomStatuses()
//   reports them as 'builtin_reentry' errors.
//
// ── Funnel bucketing ─────────────────────────────────────────────────────
//   Funnel/pipeline reports bucket every estimate under a CANONICAL builtin
//   stage. Custom rows declare `bucket` (a builtin key); undeclared →
//   'draft' (open pipeline) so funnels never over-count wins. Terminal-flag
//   customs still report under their declared bucket.
//
// API:
//   BUILTIN_STATUSES / BUILTIN_STATUS_LABELS / BUILTIN_TRANSITIONS /
//   BUILTIN_TERMINAL_STATUSES / BUILTIN_PROTECTED_ENTRY_STATUSES /
//   BUILTIN_CUSTOM_TARGET_STATUSES
//   slugifyStatusKey / normalizeStatusValue / humanizeStatusKey /
//   isCustomStatusKey
//   customStatusRow / customStatusRowsFromStorage
//   statusVocabulary / transitionGraph / isTerminalStatus / canTransition /
//   statusPickerRows / quoteDefaultsStatusPatch / validateCustomStatuses /
//   canonicalStatusBucket

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The live AllInOneEstimate.status enum — persisted values only. */
export const BUILTIN_STATUSES: readonly string[] = [
  'draft', 'calculated', 'sent', 'approved', 'archived', 'cancelled',
];

export const BUILTIN_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  calculated: 'Calculated',
  sent: 'Sent',
  approved: 'Approved',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

/** estimateStatusTransitions.ALLOWED_TRANSITIONS — verbatim parity. */
export const BUILTIN_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['calculated', 'sent', 'archived', 'cancelled'],
  calculated: ['draft', 'sent', 'archived', 'cancelled'],
  sent: ['approved', 'archived', 'cancelled'],
  approved: ['sent'],
  archived: ['draft'],
  cancelled: [],
};

/** Builtin statuses with no outgoing edges (graph-derived terminal set). */
export const BUILTIN_TERMINAL_STATUSES: readonly string[] = BUILTIN_STATUSES.filter(
  (s) => (BUILTIN_TRANSITIONS[s] || []).length === 0,
); // ['cancelled']

/** Builtin FLOW statuses: entering any of these triggers quote-engine /
 *  lifecycle effects (quote issuance + version bump on sent, lifecycle
 *  revision records on protected statuses). Custom rows may not edge INTO
 *  these unless allow_builtin_reentry or an explicit override spec's it. */
export const BUILTIN_PROTECTED_ENTRY_STATUSES: readonly string[] = [
  'draft', 'calculated', 'sent', 'approved',
];

/** Builtin statuses a custom row may always transition INTO (end states). */
export const BUILTIN_CUSTOM_TARGET_STATUSES: readonly string[] = BUILTIN_STATUSES.filter(
  (s) => !BUILTIN_PROTECTED_ENTRY_STATUSES.includes(s),
); // ['archived','cancelled']

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomStatusRow {
  /** snake_case slug — unique, never a builtin key. */
  key: string;
  /** Display label; falls back to the humanized key. */
  label: string;
  /** Optional picker accent color (hex). '' = uncolored. */
  color: string;
  /** Declared outgoing statuses (slugs). Filtered by the edge constraint
   *  inside transitionGraph/quoteDefaultsStatusPatch. */
  transitions_to: string[];
  /** Explicit terminal flag — no outgoing moves regardless of list. */
  terminal: boolean;
  /** Canonical builtin stage this status funnels under ('' → 'draft'). */
  bucket: string;
  /** Optional actor-role allowlist for moves INTO this status. */
  roles: string[];
  /** Opt-in: permits transitions_to entries naming builtin flow states. */
  allow_builtin_reentry: boolean;
}

export interface StatusVocabularyEntry {
  value: string;
  label: string;
  group: 'builtin' | 'custom';
  color: string;
  terminal: boolean;
}

export interface StatusPickerRow {
  value: string;
  label: string;
  group: 'builtin' | 'custom';
  color: string;
  disabled: boolean;
  disabled_reason: '' | 'transition_not_allowed' | 'role_restricted' | 'terminal_source';
  current: boolean;
}

export interface CustomStatusError {
  code:
    | 'not_a_row'
    | 'missing_key'
    | 'invalid_key'
    | 'key_collision_builtin'
    | 'duplicate_key'
    | 'duplicate_label'
    | 'unknown_transition_target'
    | 'builtin_reentry'
    | 'self_transition'
    | 'terminal_with_outgoing'
    | 'no_terminal_exit'
    | 'invalid_color'
    | 'invalid_bucket'
    | 'invalid_roles';
  key: string;
  message: string;
}

export interface QuoteDefaultsStatusPatch {
  custom_statuses: string;
  status_transitions: string;
  custom_status_meta: string;
}

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

/** QuoteSettings addStatus slugger parity: trim → lowercase → non-[a-z0-9]
 *  runs to '_' → strip edge underscores. '' when nothing usable remains. */
export function slugifyStatusKey(raw: any): string {
  return clean(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SNAKE_KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** estimateStatusTransitions.normalize parity: stored status VALUE →
 *  lowercase token, '' falls back to 'draft' (blank = never-written row). */
export function normalizeStatusValue(status: any): string {
  return clean(status).toLowerCase() || 'draft';
}

/** 'awaiting_permit' → 'Awaiting Permit' (single-word slugs stay as-is). */
export function humanizeStatusKey(key: any): string {
  const slug = clean(key);
  if (!slug) return '';
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** True when `key` is a usable custom slug — snake_case AND not a builtin. */
export function isCustomStatusKey(key: any): boolean {
  const slug = clean(key);
  return !!slug && SNAKE_KEY.test(slug) && !BUILTIN_STATUSES.includes(slug);
}

/** Tolerant JSON-field reader: accepts a JSON string, an already-parsed
 *  value, or blank — returns `fallback` on anything unusable. */
const parseStatusField = (raw: any, fallback: any): any => {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  return raw;
};

const slugList = (v: any): string[] => {
  const out: string[] = [];
  for (const item of Array.isArray(v) ? v : []) {
    const slug = slugifyStatusKey(typeof item === 'string' ? item : (item as any)?.key ?? (item as any)?.value);
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
};

const builtinSet = (): Set<string> => new Set(BUILTIN_STATUSES);

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

/**
 * customStatusRow — normalize a declared custom-status definition.
 * Accepts {key|status|value, label|name, color?, transitions_to?|
 * transitions?|allowed_next?, terminal?, bucket?, roles?,
 * allow_builtin_reentry?}. Key is slugified; throws TypeError when the
 * result is empty, non-snake, or collides with a builtin — a bad row is a
 * programmer/admin-config error, not data to silently keep.
 */
export function customStatusRow(input: any): CustomStatusRow {
  const src = isObj(input) ? input : {};
  const key = slugifyStatusKey(src.key ?? src.status ?? src.value);
  if (!key) throw new TypeError('customStatusRow: key required');
  if (!SNAKE_KEY.test(key)) throw new TypeError(`customStatusRow: key "${key}" is not snake_case`);
  if (BUILTIN_STATUSES.includes(key)) {
    throw new TypeError(`customStatusRow: key "${key}" collides with a builtin status`);
  }
  const label = clean(src.label ?? src.name) || humanizeStatusKey(key);
  const colorRaw = clean(src.color);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(colorRaw) ? colorRaw.toLowerCase() : '';
  const transitions_to = slugList(src.transitions_to ?? src.transitions ?? src.allowed_next).filter(
    (t) => t !== key,
  );
  const terminal = src.terminal === true;
  const bucketRaw = slugifyStatusKey(src.bucket ?? src.funnel_bucket);
  const bucket = BUILTIN_STATUSES.includes(bucketRaw) ? bucketRaw : '';
  const roles: string[] = [];
  for (const r of Array.isArray(src.roles) ? src.roles : []) {
    const role = clean(r).toLowerCase();
    if (role && !roles.includes(role)) roles.push(role);
  }
  return {
    key,
    label,
    color,
    transitions_to,
    terminal,
    bucket,
    roles,
    allow_builtin_reentry: src.allow_builtin_reentry === true,
  };
}

/** Non-throwing row read — null on anything unusable. */
const tryRow = (input: any): CustomStatusRow | null => {
  try {
    return customStatusRow(input);
  } catch {
    return null;
  }
};

/**
 * customStatusRowsFromStorage — turn the QuoteDefaults string fields into
 * normalized rows. `customStatusesField` may be the stored JSON string, a
 * slug array, or a row-object array; `metaField` is the optional
 * custom_status_meta JSON string/object ({key: {label,color,terminal,
 * bucket,roles,allow_builtin_reentry}}). Unusable entries are skipped —
 * storage is never allowed to throw here.
 */
export function customStatusRowsFromStorage(
  customStatusesField: any,
  metaField: any = null,
): CustomStatusRow[] {
  const list = parseStatusField(customStatusesField, []);
  const meta = parseStatusField(metaField, {});
  const metaByKey: Record<string, any> = isObj(meta) ? meta : {};
  const rows: CustomStatusRow[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    const slug = slugifyStatusKey(typeof item === 'string' ? item : item?.key ?? item?.value);
    if (!slug || seen.has(slug) || !isCustomStatusKey(slug)) continue;
    seen.add(slug);
    const base = isObj(item) ? item : { key: slug };
    const extra = isObj(metaByKey[slug]) ? metaByKey[slug] : {};
    const row = tryRow({ key: slug, ...base, ...extra });
    if (row) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * statusVocabulary — merged ordered picker list. Builtins keep enum order;
 * customs follow as a sorted group (label asc, key tiebreak) so the picker
 * is deterministic regardless of storage write order.
 */
export function statusVocabulary(
  builtins: readonly any[] = BUILTIN_STATUSES,
  customs: readonly (CustomStatusRow | any)[] = [],
): StatusVocabularyEntry[] {
  const out: StatusVocabularyEntry[] = [];
  const seen = new Set<string>();
  for (const b of Array.isArray(builtins) ? builtins : []) {
    const value = typeof b === 'string' ? normalizeStatusValue(b) : clean(b?.value);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: clean(typeof b === 'string' ? '' : b?.label) || BUILTIN_STATUS_LABELS[value] || humanizeStatusKey(value),
      group: 'builtin',
      color: '',
      terminal: BUILTIN_TERMINAL_STATUSES.includes(value),
    });
  }
  const customRows = (Array.isArray(customs) ? customs : [])
    .map((c) => (c && typeof c === 'object' && typeof c.key === 'string' && Array.isArray(c.transitions_to)
      ? (c as CustomStatusRow)
      : tryRow(c)))
    .filter((r): r is CustomStatusRow => !!r);
  customRows.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  for (const row of customRows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push({
      value: row.key,
      label: row.label,
      group: 'custom',
      color: row.color,
      terminal: isTerminalStatus(row.key, [row]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transition graph
// ---------------------------------------------------------------------------

/** Valid targets for a custom row, honoring the reentry constraint:
 *  other custom keys, builtin end states (archived/cancelled), and builtin
 *  flow states ONLY when the row opts in via allow_builtin_reentry. */
const customTargets = (
  row: CustomStatusRow,
  vocabulary: Set<string>,
): string[] => {
  const out: string[] = [];
  if (row.terminal) return out;
  for (const t of row.transitions_to) {
    if (!t || t === row.key) continue;
    if (!vocabulary.has(t)) continue;
    if (BUILTIN_PROTECTED_ENTRY_STATUSES.includes(t) && !row.allow_builtin_reentry) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
};

/**
 * transitionGraph — merged {from: Set(to)} edge map.
 *   1. Seed builtin rows (default BUILTIN_TRANSITIONS).
 *   2. Custom rows add their own source row with constraint-filtered
 *      targets — a custom with no compliant edges stays present with an
 *      empty set (de facto terminal, like cancelled).
 *   3. `overrides` (the status_transitions {from:[to]} map) REPLACE a
 *      source row wholesale — existing statusTransitionMap semantics.
 *      Overrides are the explicit spec hatch: they may name any known or
 *      forward-referenced target, including builtin flow states.
 */
export function transitionGraph(
  builtinsTransitions: Record<string, readonly string[]> = BUILTIN_TRANSITIONS,
  customs: readonly (CustomStatusRow | any)[] = [],
  overrides: any = null,
): Record<string, Set<string>> {
  const graph: Record<string, Set<string>> = {};
  const vocab = builtinSet();

  const customRows = (Array.isArray(customs) ? customs : [])
    .map((c) => (c && typeof c === 'object' && Array.isArray(c.transitions_to)
      ? (c as CustomStatusRow)
      : tryRow(c)))
    .filter((r): r is CustomStatusRow => !!r && isCustomStatusKey(r.key));
  for (const r of customRows) vocab.add(r.key);

  for (const [from, tos] of Object.entries(builtinsTransitions || {})) {
    const f = normalizeStatusValue(from);
    if (!f) continue;
    graph[f] = new Set((Array.isArray(tos) ? tos : []).map(normalizeStatusValue).filter(Boolean));
    vocab.add(f);
    for (const t of graph[f]) vocab.add(t);
  }

  for (const row of customRows) {
    graph[row.key] = new Set(customTargets(row, vocab));
  }

  const ov = parseStatusField(overrides, {});
  if (isObj(ov)) {
    for (const [fromKey, toList] of Object.entries(ov)) {
      const f = normalizeStatusValue(fromKey);
      if (!f) continue;
      const targets = (Array.isArray(toList) ? toList : [])
        .map(normalizeStatusValue)
        .filter((t) => !!t);
      graph[f] = new Set(targets);
      vocab.add(f);
      for (const t of targets) if (!graph[t]) graph[t] = new Set();
    }
  }
  return graph;
}

/**
 * isTerminalStatus — builtin terminal set (cancelled) plus customs flagged
 * terminal:true or left with no declared outgoing moves (the picker renders
 * empty-outgoing customs exactly like cancelled: "terminal — no outgoing
 * moves"). A graph may be passed to honor admin overrides; without one the
 * answer reflects the declared row shape only.
 */
export function isTerminalStatus(
  status: any,
  customs: readonly (CustomStatusRow | any)[] = [],
  graph: Record<string, Set<string>> | null = null,
): boolean {
  const s = normalizeStatusValue(status);
  if (graph) {
    const edges = graph[s];
    if (!edges) return false; // unknown statuses aren't terminal — they're legacy
    return edges.size === 0;
  }
  if (BUILTIN_TERMINAL_STATUSES.includes(s)) return true;
  if (BUILTIN_STATUSES.includes(s)) return false;
  const row = (Array.isArray(customs) ? customs : [])
    .map((c) => (c && typeof c === 'object' && Array.isArray(c.transitions_to)
      ? (c as CustomStatusRow)
      : tryRow(c)))
    .find((r): r is CustomStatusRow => !!r && r.key === s);
  if (!row) return false;
  return row.terminal === true || row.transitions_to.length === 0;
}

// ---------------------------------------------------------------------------
// Transition checks + picker rows
// ---------------------------------------------------------------------------

interface TransitionOptions {
  customs?: readonly (CustomStatusRow | any)[];
  overrides?: any;
  builtin_transitions?: Record<string, readonly string[]>;
  actor_role?: string;
}

const customRowFor = (customs: readonly any[] | undefined, key: string): CustomStatusRow | null => {
  for (const c of Array.isArray(customs) ? customs : []) {
    const r = c && typeof c === 'object' && Array.isArray(c.transitions_to) ? (c as CustomStatusRow) : tryRow(c);
    if (r && r.key === key) return r;
  }
  return null;
};

/** Role gate on the TARGET custom row: rows with a non-empty roles list
 *  admit only those actor roles. Builtins are never role-gated here. */
const roleAllows = (customs: readonly any[] | undefined, target: string, actorRole: any): boolean => {
  const row = customRowFor(customs, target);
  if (!row || row.roles.length === 0) return true;
  return row.roles.includes(clean(actorRole).toLowerCase());
};

/**
 * canTransition — merged-graph edge check.
 *   from === to          → true (no-op saves are always allowed)
 *   unknown `from`       → true (legacy rows stay permissive, matching
 *                          isEstimateStatusTransitionAllowed — never brick)
 *   `to` not in edges    → false
 *   `to` role-restricted → false unless actor_role is on the row's list
 */
export function canTransition(from: any, to: any, opts: TransitionOptions = {}): boolean {
  const f = normalizeStatusValue(from);
  const t = normalizeStatusValue(to);
  if (f === t) return true;
  const graph = transitionGraph(opts.builtin_transitions || BUILTIN_TRANSITIONS, opts.customs || [], opts.overrides);
  const edges = graph[f];
  if (!edges) return true;
  if (!edges.has(t)) return false;
  return roleAllows(opts.customs, t, opts.actor_role);
}

/**
 * statusPickerRows — display-ready options for a status <select>.
 * Every vocabulary entry becomes a row; unreachable targets are kept but
 * disabled with a machine-readable reason so the UI can explain WHY rather
 * than silently hiding statuses (hiding confuses filters/queues that still
 * hold estimates in that status).
 */
export function statusPickerRows(
  vocabulary: StatusVocabularyEntry[],
  opts: {
    current?: string;
    actor_role?: string;
    customs?: readonly (CustomStatusRow | any)[];
    overrides?: any;
    builtin_transitions?: Record<string, readonly string[]>;
  } = {},
): StatusPickerRow[] {
  const current = normalizeStatusValue(opts.current);
  const graph = transitionGraph(
    opts.builtin_transitions || BUILTIN_TRANSITIONS,
    opts.customs || [],
    opts.overrides,
  );
  const sourceEdges = graph[current];
  return (Array.isArray(vocabulary) ? vocabulary : []).map((entry) => {
    const value = normalizeStatusValue(entry.value);
    const isCurrent = value === current;
    if (isCurrent) {
      return {
        value, label: entry.label, group: entry.group, color: entry.color || '',
        disabled: false, disabled_reason: '', current: true,
      };
    }
    let disabled = false;
    let reason: StatusPickerRow['disabled_reason'] = '';
    if (sourceEdges && sourceEdges.size === 0) {
      disabled = true;
      reason = 'terminal_source';
    } else if (sourceEdges && !sourceEdges.has(value)) {
      disabled = true;
      reason = 'transition_not_allowed';
    }
    if (!disabled && !roleAllows(opts.customs, value, opts.actor_role)) {
      disabled = true;
      reason = 'role_restricted';
    }
    return {
      value, label: entry.label, group: entry.group, color: entry.color || '',
      disabled, disabled_reason: reason, current: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Storage patch
// ---------------------------------------------------------------------------

/**
 * quoteDefaultsStatusPatch — build the QuoteDefaults write patch for a
 * desired set of custom rows. `existingTransitions` is the CURRENT stored
 * status_transitions (JSON string or object) — builtin-source override rows
 * the admin authored are preserved verbatim; rows whose source is a custom
 * status are rewritten from the declared rows (removed statuses lose their
 * source row AND are scrubbed from every target list, matching
 * CustomStatusesEditor.removeStatus).
 *
 * Stored custom edges are pre-filtered by the reentry constraint so older
 * consumers (statusTransitionMap) can't accidentally honor a non-spec'd
 * flow-state reentry — the violation still surfaces via
 * validateCustomStatuses() for the editor to flag.
 */
export function quoteDefaultsStatusPatch(
  existingTransitions: any,
  customRows: readonly (CustomStatusRow | any)[],
): QuoteDefaultsStatusPatch {
  const rows = (Array.isArray(customRows) ? customRows : [])
    .map((c) => (c && typeof c === 'object' && Array.isArray(c.transitions_to)
      ? (c as CustomStatusRow)
      : tryRow(c)))
    .filter((r): r is CustomStatusRow => !!r);
  const customKeys = new Set(rows.map((r) => r.key));
  const vocabulary = new Set<string>([...BUILTIN_STATUSES, ...customKeys]);

  const existing = parseStatusField(existingTransitions, {});
  const next: Record<string, string[]> = {};
  if (isObj(existing)) {
    for (const [fromKey, toList] of Object.entries(existing)) {
      const f = normalizeStatusValue(fromKey);
      if (!f) continue;
      // Drop source rows for custom statuses that no longer exist.
      if (!BUILTIN_STATUSES.includes(f) && !customKeys.has(f)) continue;
      const targets = (Array.isArray(toList) ? toList : [])
        .map(normalizeStatusValue)
        .filter((t) => !!t && t !== f && vocabulary.has(t));
      next[f] = [...new Set(targets)];
    }
  }
  for (const row of rows) {
    next[row.key] = customTargets(row, vocabulary);
  }

  const meta: Record<string, any> = {};
  for (const row of rows) {
    const m: Record<string, any> = {};
    const defaultLabel = humanizeStatusKey(row.key);
    if (row.label && row.label !== defaultLabel) m.label = row.label;
    if (row.color) m.color = row.color;
    if (row.terminal) m.terminal = true;
    if (row.bucket) m.bucket = row.bucket;
    if (row.roles.length) m.roles = row.roles;
    if (row.allow_builtin_reentry) m.allow_builtin_reentry = true;
    if (Object.keys(m).length) meta[row.key] = m;
  }

  const keys = rows.map((r) => r.key);
  return {
    custom_statuses: keys.length ? JSON.stringify(keys) : '',
    status_transitions: Object.keys(next).length ? JSON.stringify(next) : '',
    custom_status_meta: Object.keys(meta).length ? JSON.stringify(meta) : '',
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * validateCustomStatuses — config-time error list for the editor/admin
 * surface. Rows may be raw declarations or normalized CustomStatusRows;
 * validation never throws. Returned errors carry a machine `code`, the
 * offending `key`, and a human `message`.
 */
export function validateCustomStatuses(rows: readonly any[]): CustomStatusError[] {
  const errors: CustomStatusError[] = [];
  const list = Array.isArray(rows) ? rows : [];
  const push = (code: CustomStatusError['code'], key: string, message: string) =>
    errors.push({ code, key, message });

  const normalized: (CustomStatusRow | null)[] = list.map((raw) => {
    if (!isObj(raw)) return null;
    const key = slugifyStatusKey(raw.key ?? raw.status ?? raw.value);
    if (!key) return null;
    return {
      key,
      label: clean(raw.label ?? raw.name),
      color: clean(raw.color),
      transitions_to: slugList(raw.transitions_to ?? raw.transitions ?? raw.allowed_next),
      terminal: raw.terminal === true,
      bucket: slugifyStatusKey(raw.bucket ?? raw.funnel_bucket),
      roles: (Array.isArray(raw.roles) ? raw.roles : []).map((r: any) => clean(r).toLowerCase()).filter(Boolean),
      allow_builtin_reentry: raw.allow_builtin_reentry === true,
    };
  });

  // -- per-row checks -------------------------------------------------------
  const keys = new Set<string>();
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  list.forEach((raw, i) => {
    const row = normalized[i];
    if (!isObj(raw)) {
      push('not_a_row', '', 'custom status entry is not an object');
      return;
    }
    const rawKey = clean(raw.key ?? raw.status ?? raw.value);
    if (!rawKey) {
      push('missing_key', '', 'custom status is missing a key');
      return;
    }
    const key = slugifyStatusKey(rawKey);
    // Keys must ALREADY be snake_case — if the slugger had to change the raw
    // key (case fold, space→underscore, char strip) it wasn't valid input.
    if (!key || key !== rawKey || !SNAKE_KEY.test(rawKey)) {
      push('invalid_key', rawKey,
        key ? `key "${rawKey}" is not snake_case (normalizes to "${key}")`
            : `key "${rawKey}" is not snake_case`);
      return;
    }
    if (BUILTIN_STATUSES.includes(key)) {
      push('key_collision_builtin', key, `key "${key}" collides with a builtin status`);
      return;
    }
    if (seenKeys.has(key)) {
      push('duplicate_key', key, `duplicate custom status key "${key}"`);
      return;
    }
    seenKeys.add(key);
    keys.add(key);

    const label = clean(raw.label ?? raw.name);
    const labelKey = label.toLowerCase();
    if (labelKey && seenLabels.has(labelKey)) {
      push('duplicate_label', key, `label "${label}" is used by another custom status`);
    }
    if (labelKey) seenLabels.add(labelKey);

    const color = clean(raw.color);
    if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
      push('invalid_color', key, `color "${color}" is not a hex color`);
    }
    const bucket = slugifyStatusKey(raw.bucket ?? raw.funnel_bucket);
    if (bucket && !BUILTIN_STATUSES.includes(bucket)) {
      push('invalid_bucket', key, `bucket "${bucket}" is not a builtin status`);
    }
    if (raw.roles !== undefined && !Array.isArray(raw.roles)) {
      push('invalid_roles', key, 'roles must be an array of role names');
    }
    if (row!.terminal && row!.transitions_to.length) {
      push('terminal_with_outgoing', key, `terminal status "${key}" declares outgoing transitions`);
    }
    if (row!.transitions_to.includes(key)) {
      push('self_transition', key, `"${key}" lists itself as a transition target`);
    }
  });

  // -- cross-row checks -----------------------------------------------------
  const vocab = new Set<string>([...BUILTIN_STATUSES, ...keys]);
  for (const row of normalized) {
    if (!row) continue;
    for (const t of row.transitions_to) {
      if (t === row.key) continue; // already reported as self_transition
      if (!vocab.has(t)) {
        push('unknown_transition_target', row.key, `"${row.key}" transitions to unknown status "${t}"`);
      } else if (BUILTIN_PROTECTED_ENTRY_STATUSES.includes(t) && !row.allow_builtin_reentry) {
        push('builtin_reentry', row.key,
          `"${row.key}" transitions into builtin flow state "${t}" — requires allow_builtin_reentry or an explicit status_transitions override`);
      }
    }
  }

  // -- circular terminal chains ---------------------------------------------
  // Every custom status must be able to REACH a terminal: cancelled, an
  // archived-edge (leaves the active flow), a terminal-flagged row, or an
  // empty-outgoing row. A cycle with no terminal exit traps estimates.
  const compliantEdges = new Map<string, string[]>();
  for (const row of normalized) {
    if (!row) continue;
    compliantEdges.set(
      row.key,
      row.terminal
        ? []
        : row.transitions_to.filter(
            (t) => t !== row.key && vocab.has(t) &&
              (!BUILTIN_PROTECTED_ENTRY_STATUSES.includes(t) || row.allow_builtin_reentry),
          ),
    );
  }
  const reachesTerminal = (start: string): boolean => {
    const stack = [start];
    const visited = new Set<string>();
    while (stack.length) {
      const s = stack.pop()!;
      if (visited.has(s)) continue;
      visited.add(s);
      if (BUILTIN_STATUSES.includes(s)) return true; // cancelled/archived exit, and every builtin flow state can reach cancelled
      const row = normalized.find((r) => r && r.key === s);
      if (!row) continue;
      if (row.terminal) return true;
      const edges = compliantEdges.get(s) || [];
      if (edges.length === 0) return true; // de facto terminal — no compliant outgoing moves
      for (const t of edges) stack.push(t);
    }
    return false;
  };
  for (const row of normalized) {
    if (!row || row.terminal) continue;
    if (!reachesTerminal(row.key)) {
      push('no_terminal_exit', row.key,
        `"${row.key}" is trapped in a transition cycle that never reaches a terminal status`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Funnel bucketing
// ---------------------------------------------------------------------------

/**
 * canonicalStatusBucket — the builtin stage a status reports under.
 * Builtins report as themselves; customs report under their declared
 * `bucket`, falling back to 'draft' (open pipeline) so funnel tiles never
 * over-count wins on an unconfigured row.
 */
export function canonicalStatusBucket(
  status: any,
  customs: readonly (CustomStatusRow | any)[] = [],
): string {
  const s = normalizeStatusValue(status);
  if (BUILTIN_STATUSES.includes(s)) return s;
  const row = customRowFor(customs, s);
  if (row && row.bucket && BUILTIN_STATUSES.includes(row.bucket)) return row.bucket;
  return 'draft';
}
