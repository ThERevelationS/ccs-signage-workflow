// Pure queue-grouping helpers for the product queues — C-06: responsibility
// grouping headers + priority sort + group color. Kept React-free and
// import-free so the logic is unit-testable under Node.
//
// Canonical responsibility order comes from the Responsibility registry —
// the same rule tagResponsibilityModel.responsibilityGroups applies (active
// rows ordered by registry `sort`, ties alphabetical, unassigned last). That
// ordering reaches this model through `opts.order`; the rule itself is
// duplicated here so the file stays standalone — keep in sync.
//
// Within-group ordering is priorityRank(): the B-05 CB 1-99 "priority" sort
// convention (set values ascending, unset always last), then due-date
// proximity, then created age — mirroring sortQueueRows' tie-break chain.

const DAY = 86400000;

export const GROUP_MODES = ["none", "responsibility", "priority", "due"];

// Group labels. "(unassigned)" is the C-06 unassigned bucket spelling;
// DEFAULT_GROUP_COLOR mirrors tagResponsibilityModel's
// DEFAULT_RESPONSIBILITY_COLOR — keep in sync.
export const UNASSIGNED_LABEL = "(unassigned)";
export const NO_PRIORITY_LABEL = "(no priority)";
export const ALL_LABEL = "All";
export const DEFAULT_GROUP_COLOR = "#475569"; // slate-600
export const PRIORITY_GROUP_COLOR = "#4f46e5"; // indigo-600 — PriorityBadge family

// Due-window buckets in render order. Keys reuse the DUE_PRESETS vocabulary
// (productQueueModel) where the windows line up; "later"/"no_due" close the
// partition. Empty buckets are dropped — headers only render where work
// exists (responsibilityGroups convention).
export const DUE_BUCKETS = [
  { key: "past_due", label: "Past due", color: "#dc2626" }, // red-600 — overdue rose-700 family
  { key: "today", label: "Due today", color: "#d97706" }, // amber-600
  { key: "tomorrow", label: "Due tomorrow", color: "#ca8a04" }, // yellow-600
  { key: "this_week", label: "Due this week", color: "#0284c7" }, // sky-600
  { key: "later", label: "Later", color: "#475569" }, // slate-600
  { key: "no_due", label: "No due date", color: "#94a3b8" }, // slate-400
];

const collapseWs = (v) => String(v || "").trim().replace(/\s+/g, " ");
const firstStr = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

// Positive finite number rounded to an int; anything else reads as 0 (unset).
// Same rule as productQueueModel's queuePosNum — keep in sync.
const posNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// A valid hex color lowercased, else "" (caller falls through to the next
// color source / the group default).
const hexOrEmpty = (v) => {
  const s = collapseWs(v);
  return HEX_RE.test(s) ? s.toLowerCase() : "";
};

// "YYYY-MM-DD" must mean that calendar day in local time, not UTC midnight —
// duplicated from productQueueModel.parseLocalDate so this file stays
// import-free; keep in sync.
function parseLocalDate(str) {
  const v = String(str || "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const endOfWeek = (d) => { const x = endOfDay(d); x.setDate(x.getDate() + (7 - x.getDay())); return x; };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The row's effective due date — the same lens the due presets and
// overdueDays read: the flattened `due` field, then the order-level
// install date, then the raw product dates (either casing) for hand-built
// rows and bare products.
const rowDueStr = (row) =>
  firstStr(row?.due, row?.woDue, row?.productDue, row?.designDue,
    row?.product_due_date, row?.design_due_date,
    row?.product?.product_due_date, row?.product?.design_due_date);

// Effective CB 1-99 priority — same merge flattenQueueRows performs
// (products[].priority wins; queue_priority is the legacy fallback) so
// hand-built rows and bare products rank the same as flattened ones.
const rowPriorityNum = (row) =>
  posNum(row?.priority) || posNum(row?.product?.priority) ||
  posNum(row?.queuePriority) || posNum(row?.product?.queue_priority);

// Stable render key for a row — mirrors ProductQueue's
// `${workOrderId}:${productId}` row key, with fallbacks for hand-built rows.
const rowKey = (row, idx = 0) => {
  const a = firstStr(row?.workOrderId, row?.work_order_id);
  const b = firstStr(row?.productId, row?.product_id, row?.product?.id, row?.id);
  if (a || b) return `${a}:${b}`;
  return `i${idx}`;
};

// ── priorityRank ────────────────────────────────────────────────────────
// Single-number within-group rank — ascending sort surfaces the most urgent
// row first. Three strictly-dominated tiers, each bounded so a lower tier
// can never overtake a higher one:
//
//   tier 1  priority flag  — CB 1-99 ascending (B-05 "priority" sort
//           convention): set values rank 1..99; unset always last (100),
//           regardless of due date.
//   tier 2  due proximity  — whole days until due (negative = overdue),
//           clamped to ±3650; undated ranks worst. ~10 years of day-grain
//           fits under one priority step.
//   tier 3  created age    — older work has waited longer, so it ranks
//           slightly ahead of newer work; clamped to 3650d, unknown = 0.
//
//   rank = priTerm·1e8 + (dueDays+3651)·1e4 + (3650−ageDays)
//
// `product` may be a flattened queue row or a bare product — both read
// through the same field fallbacks. `now` injects the clock for tests.
export function priorityRank(product, now = new Date()) {
  const row = product || {};
  const p = (row.product && typeof row.product === "object") ? row.product : row;
  const pri = posNum(row.priority) || posNum(p.priority) ||
    posNum(row.queuePriority) || posNum(p.queue_priority);
  const priTerm = pri > 0 ? pri : 100;
  const due = parseLocalDate(rowDueStr(row));
  const dueDays = due
    ? clamp(Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY), -3650, 3650)
    : 3651;
  const created = parseLocalDate(firstStr(
    row.created_date, p.created_date, row.created_at, p.created_at,
    row.createdAt, p.createdAt));
  const ageDays = created
    ? clamp(Math.floor((now.getTime() - created.getTime()) / DAY), 0, 3650)
    : 0;
  return priTerm * 1e8 + (dueDays + 3651) * 1e4 + (3650 - ageDays);
}

// Within-group ordering: rank asc, then a deterministic key tie-break on top
// of stable sort so equal-rank rows still serialize identically every time.
const rankSortRows = (rows, now) =>
  [...rows].sort((a, b) =>
    (priorityRank(a, now) - priorityRank(b, now)) ||
    rowKey(a).localeCompare(rowKey(b)));

// ── order spec (responsibility mode) ────────────────────────────────────
// `opts.order` carries the canonical responsibility order in. Two spellings:
//   strings          — the array IS the rank order (declaration = position)
//   registry objects — {name, color?, sort?}; reordered by the canonical
//                      rule (sort asc → name alpha → declaration index)
// A mixed list is honored item-by-item; only the object form triggers the
// canonical re-sort (a string list is already the caller's rank).
function normalizeOrderSpec(order) {
  const raw = Array.isArray(order) ? order : [];
  const hasObjects = raw.some((o) => o && typeof o === "object");
  const entries = [];
  raw.forEach((o, idx) => {
    if (typeof o === "string") {
      const name = collapseWs(o);
      if (name) entries.push({ key: name.toLowerCase(), name, color: "", sort: 0, index: idx });
      return;
    }
    if (o && typeof o === "object") {
      const name = collapseWs(o.name ?? o.label ?? o.key);
      if (!name) return;
      entries.push({
        key: name.toLowerCase(), name, color: hexOrEmpty(o.color),
        sort: Number.isFinite(Number(o.sort)) ? Number(o.sort) : 0, index: idx,
      });
    }
  });
  if (hasObjects) {
    entries.sort((a, b) =>
      (a.sort - b.sort) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      (a.index - b.index));
  }
  return entries;
}

const makeGroup = (key, label, color, rows, now) => ({
  key, label, ...(color ? { color } : {}), count: rows.length, rows: rankSortRows(rows, now),
});

// ── responsibility ───────────────────────────────────────────────────────
// One group per distinct responsibility name (deduped case-insensitively —
// first-seen casing wins, matching responsibilityGroups' merge). Every
// non-blank value gets a group: `order` ranks and colors groups but is never
// a whitelist — queue responsibilities are free-text (RowEditor input), so
// unknown names still surface, ordered after ranked names alphabetically.
// Blank responsibility → the trailing "(unassigned)" bucket (key "").
function groupByResponsibility(list, order, now) {
  const spec = normalizeOrderSpec(order);
  const rankOf = new Map(spec.map((e, i) => [e.key, i]));
  const colorOf = new Map(spec.filter((e) => e.color).map((e) => [e.key, e.color]));
  const buckets = new Map(); // lowercase name → {name, rows}
  const unassigned = [];
  for (const row of list) {
    const name = collapseWs(row?.responsibility ?? row?.product?.responsibility);
    if (!name) { unassigned.push(row); continue; }
    const key = name.toLowerCase();
    if (!buckets.has(key)) buckets.set(key, { name, rows: [] });
    buckets.get(key).rows.push(row);
  }
  const named = [...buckets.entries()].sort(([ka, a], [kb, b]) => {
    const ra = rankOf.has(ka) ? rankOf.get(ka) : Number.MAX_SAFE_INTEGER;
    const rb = rankOf.has(kb) ? rankOf.get(kb) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return ka.localeCompare(kb) || a.name.localeCompare(b.name);
  });
  const groups = named.map(([key, g]) => {
    const color = colorOf.get(key) ||
      hexOrEmpty(g.rows.map((r) => r?.responsibilityColor ?? r?.product?.responsibility_color).find((c) => hexOrEmpty(c))) ||
      DEFAULT_GROUP_COLOR;
    return makeGroup(key, g.name, color, g.rows, now);
  });
  if (unassigned.length) {
    groups.push(makeGroup("", UNASSIGNED_LABEL, DEFAULT_GROUP_COLOR, unassigned, now));
  }
  return groups;
}

// ── priority ─────────────────────────────────────────────────────────────
// One group per distinct set priority (CB 1-99), ascending — 1 first.
// Unset rows fall into the trailing "(no priority)" bucket (key "").
function groupByPriority(list, now) {
  const buckets = new Map(); // priority number → rows
  const unset = [];
  for (const row of list) {
    const n = rowPriorityNum(row);
    if (n > 0) {
      if (!buckets.has(n)) buckets.set(n, []);
      buckets.get(n).push(row);
    } else {
      unset.push(row);
    }
  }
  const groups = [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((n) => makeGroup(`p${n}`, `Priority ${n}`, PRIORITY_GROUP_COLOR, buckets.get(n), now));
  if (unset.length) {
    groups.push(makeGroup("", NO_PRIORITY_LABEL, DEFAULT_GROUP_COLOR, unset, now));
  }
  return groups;
}

// ── due ──────────────────────────────────────────────────────────────────
// Partition rows across DUE_BUCKETS using the duePresetMatch windows:
// past_due (< today) → today → tomorrow → this week (≤ end of week) →
// later (dated) → no_due (undated). Empty buckets are dropped.
function dueBucketKey(row, now) {
  const due = parseLocalDate(rowDueStr(row));
  if (!due) return "no_due";
  const sod = startOfDay(now), eod = endOfDay(now);
  const eot = endOfDay(new Date(now.getTime() + DAY));
  if (due < sod) return "past_due";
  if (due <= eod) return "today";
  if (due <= eot) return "tomorrow";
  if (due <= endOfWeek(now)) return "this_week";
  return "later";
}

function groupByDue(list, now) {
  const buckets = new Map(DUE_BUCKETS.map((b) => [b.key, []]));
  for (const row of list) buckets.get(dueBucketKey(row, now)).push(row);
  return DUE_BUCKETS
    .filter((b) => buckets.get(b.key).length > 0)
    .map((b) => makeGroup(b.key, b.label, b.color, buckets.get(b.key), now));
}

// ── public API ───────────────────────────────────────────────────────────
// groupQueueRows(rows, {mode, order?, now?}) → [{key, label, color?, count, rows[]}]
//   mode            — GROUP_MODES; unknown/absent behaves like "none".
//   order           — responsibility mode only: strings (rank order) or
//                     registry-like {name, color?, sort?} (canonical sort).
//   now             — clock injection for due windows + rank (default Date()).
//   "none"          — one pass-through {key:"all"} group preserving the
//                     caller's row order (the page's chosen flat sort stands);
//                     grouped modes re-sort each bucket by priorityRank.
export function groupQueueRows(rows = [], { mode = "none", order, now = new Date() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  switch (mode) {
    case "responsibility": return groupByResponsibility(list, order, now);
    case "priority": return groupByPriority(list, now);
    case "due": return groupByDue(list, now);
    case "none":
    default:
      return [{ key: "all", label: ALL_LABEL, count: list.length, rows: list }];
  }
}

// Header descriptor a renderer needs for one group. `key` is the group's own
// key ("" for the unassigned/unset catch-alls) — feed it to collapsed_keys.
// `collapsed_default` is always false: groups render expanded until the user
// collapses them.
export function groupHeaderFor(group) {
  const g = group || {};
  return {
    key: g.key ?? "",
    label: g.label ?? String(g.key ?? ""),
    color: g.color ?? null,
    count: Number.isFinite(Number(g.count))
      ? Number(g.count)
      : (Array.isArray(g.rows) ? g.rows.length : 0),
    collapsed_default: false,
  };
}

// Interleave groups into a single render list the page can map over:
//   { type:"header", key, group_key, label, color, count, collapsed, collapsed_default }
//   { type:"row",    key, group_key, row }
// `collapsed_keys` is a Set/array of group keys — a collapsed group emits its
// header (with collapsed:true) and no row items. Item `key`s are unique,
// stable render keys; `group_key` ties a row item back to its header.
export function flattenGroups(groups = [], { collapsed_keys } = {}) {
  const collapsed = collapsed_keys instanceof Set
    ? collapsed_keys
    : new Set(Array.isArray(collapsed_keys) ? collapsed_keys : []);
  const out = [];
  for (const g of groups || []) {
    const header = groupHeaderFor(g);
    const isCollapsed = collapsed.has(header.key);
    out.push({
      type: "header",
      key: `header:${header.key || "(blank)"}`,
      group_key: header.key,
      label: header.label,
      color: header.color,
      count: header.count,
      collapsed: isCollapsed,
      collapsed_default: header.collapsed_default,
    });
    if (isCollapsed) continue;
    (g.rows || []).forEach((row, i) => {
      out.push({
        type: "row",
        key: `row:${header.key}:${rowKey(row, i)}`,
        group_key: header.key,
        row,
      });
    });
  }
  return out;
}
