// F-26 "Price-lock override audit" report model — the "Overrides by
// Salesperson" feed (J-05 consumes it).
//
// Pure and React-free — esbuild-bundled + unit-tested under Node by
// scripts/test-override-report.mjs. Data is ALWAYS injected by the caller
// (page/function wiring fetches ProductActivity rows); this model only
// shapes them, same contract as reportEngine/opsReportModel.
//
// Event source: ProductActivity rows written for manual price edits on
// converted order lines — D-11's orderEntryOverrideModel.overrideHistoryRow.
// Two stored shapes feed the report:
//   1. event_type "price_override" — the D-11 money-trail type (in the
//      entity enum since A-32, pushed 2026-11-02).
//   2. event_type "override" carrying details.price_fields[] — the
//      asEntityEvent variant written before the enum gained the literal
//      type (and the enum-safe shape any future writer may still emit).
//      details.override_type === "price_override" is accepted as the same
//      signal. Plain B-11 status overrides (overrideReasonModel rows —
//      override_type "status", no price_fields) are REJECTED so the feed
//      reports price provenance only, never ops-status history.
//
// One normalized row per FIELD-LEVEL edit: a multi-edit event
// (details.field === "multiple" with details.edits[]) explodes into one row
// per edits[] entry so the salesperson feed counts every overridden price
// field, not just every event. Events without an edits[] fall back to a
// single row from details.field + the row-level from_value/to_value.
//
// Delta math: from/to parse numerically; delta = to - from rounded to 4
// decimals — cent-clean for money fields (100.01 - 100 → 0.01, never
// 0.010000000000005) while preserving fractional-cent prices ($/sqft) and
// quantity integer moves. delta_pct = delta / |from| (fraction, matching
// reportEngine's percent column format); null when from is zero/blank or
// either side is non-numeric.
//
// Reason: details.reason → details.reason_label → note (ProductActivity's
// note column is documented as "override reason" in the entity schema).
// Blank normalizes to UNSPECIFIED_REASON in reasonBreakdown/report rows.

import { parseReportDate } from "./reportEngine.js";
import { PRICE_OVERRIDE_EVENT_TYPE } from "../jobs/orderEntryOverrideModel.js";

const clean = (v) => String(v ?? "").trim();
const asObject = (v) => (v && typeof v === "object" ? v : {});
const numOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Bucket label for blank/missing reasons in reasonBreakdown and report rows.
export const UNSPECIFIED_REASON = "unspecified";

const ACTOR_TYPES = ["staff", "customer", "vendor", "system"];

const actorTypeOf = (evt) =>
  ACTOR_TYPES.includes(clean(evt?.actor_type)) ? clean(evt.actor_type) : "staff";

// formatAuditLine convention: actor_label first, actor_type when the label
// is blank, "system" last so a row always names someone.
const actorOf = (evt) =>
  clean(evt?.actor_label) || clean(evt?.actor_type) || "system";

const reasonOf = (evt) => {
  const d = asObject(evt?.details);
  return clean(d.reason) || clean(d.reason_label) || clean(evt?.note);
};

const priceFieldsOf = (details) =>
  Array.isArray(details?.price_fields)
    ? details.price_fields.map((f) => clean(f).toLowerCase()).filter(Boolean)
    : [];

// Is this ProductActivity row a money-trail override? The literal D-11 type
// always counts; the enum-fallback "override" type counts only when it
// carries the price-field payload (price_fields[] or override_type tag) so
// B-11 status overrides stay out of the feed.
export function isPriceOverrideEvent(evt) {
  const type = clean(evt?.event_type);
  if (type === PRICE_OVERRIDE_EVENT_TYPE) return true;
  if (type !== "override") return false;
  const d = asObject(evt?.details);
  return (
    priceFieldsOf(d).length > 0 ||
    clean(d.override_type) === PRICE_OVERRIDE_EVENT_TYPE
  );
}

// details.edits[] → well-formed {field, from, to} entries (render-side
// normalize — no allowlist; detection already decided what counts).
const editsOf = (evt) =>
  (Array.isArray(asObject(evt?.details).edits) ? evt.details.edits : [])
    .map((e) => ({
      field: clean(e?.field).toLowerCase(),
      from: e?.from ?? "",
      to: e?.to ?? "",
    }))
    .filter((e) => e.field);

// --- date-window helpers ----------------------------------------------------

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// `until` bound: a bare "YYYY-MM-DD" means "through that day" (reportEngine
// filterByDateRange `to` convention); a full timestamp compares as-is.
const untilBound = (v) => {
  const d = parseReportDate(v);
  if (!d) return null;
  return DAY_ONLY.test(clean(v)) ? endOfDay(d) : d;
};

const deltaRound = (n) => Math.round(n * 1e4) / 1e4;

// --- overrideRows -------------------------------------------------------------
//
// ProductActivity rows → normalized override rows:
//   { occurred_at, actor, actor_type, work_order_id, product_id,
//     product_label, field, from_value, to_value, delta, delta_pct, reason }
//
// opts.since / opts.until bound occurred_at inclusively (bare dates = day
// boundaries). Undated events drop whenever a bound exists; a fully
// unbounded call keeps them. Output sorts newest-first (feed order);
// undated rows sink to the bottom.
export function overrideRows(productActivityRows, { since, until } = {}) {
  const sinceD = parseReportDate(since);
  const untilD = untilBound(until);
  const bounded = Boolean(sinceD || untilD);

  const out = [];
  for (const evt of Array.isArray(productActivityRows) ? productActivityRows : []) {
    if (!evt || typeof evt !== "object") continue;
    if (!isPriceOverrideEvent(evt)) continue;
    const at = parseReportDate(evt.occurred_at);
    if (bounded) {
      if (!at) continue;
      if (sinceD && at < sinceD) continue;
      if (untilD && at > untilD) continue;
    }

    const base = {
      occurred_at: clean(evt.occurred_at),
      actor: actorOf(evt),
      actor_type: actorTypeOf(evt),
      work_order_id: clean(evt.work_order_id),
      product_id: clean(evt.product_id),
      product_label: clean(evt.product_label),
      reason: reasonOf(evt),
    };

    const edits = editsOf(evt);
    // No edits[] → the row itself is the field record (single-edit events
    // store details.field + from_value/to_value directly).
    const pairs = edits.length
      ? edits
      : [{
          field: clean(asObject(evt.details).field).toLowerCase(),
          from: evt.from_value ?? "",
          to: evt.to_value ?? "",
        }];

    for (const pair of pairs) {
      const a = numOrNull(pair.from);
      const b = numOrNull(pair.to);
      const delta = a !== null && b !== null ? deltaRound(b - a) : null;
      out.push({
        ...base,
        field: pair.field,
        from_value: pair.from ?? "",
        to_value: pair.to ?? "",
        delta,
        delta_pct: delta !== null && a !== 0 ? deltaRound(delta / Math.abs(a)) : null,
      });
    }
  }

  // Feed order: newest first; parse failures sink to the bottom (stable
  // sort keeps input order within equal timestamps).
  const time = (r) => {
    const d = parseReportDate(r.occurred_at);
    return d ? d.getTime() : -Infinity;
  };
  return out.sort((x, y) => time(y) - time(x));
}

// --- overridesBySalesperson ---------------------------------------------------
//
// Group normalized rows by actor →
//   [{ actor, count, total_delta_abs, total_delta, biggest_abs, rows[] }]
// sorted by count desc (actor alpha tiebreak) — the "Overrides by
// Salesperson" leaderboard. total_delta is the signed net (up-moves minus
// down-moves); total_delta_abs sums |delta| (activity volume regardless of
// direction); biggest_abs is the single largest |delta|. Rows with no
// numeric delta count toward `count` but not the money totals.
export function overridesBySalesperson(rows = []) {
  const groups = new Map();
  for (const row of rows || []) {
    const actor = clean(row?.actor) || "system";
    let g = groups.get(actor);
    if (!g) {
      g = { actor, count: 0, total_delta_abs: 0, total_delta: 0, biggest_abs: 0, rows: [] };
      groups.set(actor, g);
    }
    g.count += 1;
    if (Number.isFinite(row?.delta)) {
      g.total_delta = deltaRound(g.total_delta + row.delta);
      const abs = Math.abs(row.delta);
      g.total_delta_abs = deltaRound(g.total_delta_abs + abs);
      if (abs > g.biggest_abs) g.biggest_abs = deltaRound(abs);
    }
    g.rows.push(row);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.actor.localeCompare(b.actor),
  );
}

// --- overrideSummary ------------------------------------------------------------
//
// Headline numbers for the feed:
//   { total, unique_actors, unique_orders, total_delta, avg_abs_delta,
//     period: { first, last } }
// total_delta sums signed deltas across rows (numeric-delta rows only);
// avg_abs_delta averages |delta| over the same set (null when nothing is
// numeric); period.first/last are the min/max occurred_at as ISO strings
// (null when no row is dated).
export function overrideSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const actors = new Set();
  const orders = new Set();
  let totalDelta = 0;
  let absSum = 0;
  let absCount = 0;
  let first = null;
  let last = null;
  for (const row of list) {
    actors.add(clean(row?.actor) || "system");
    const wo = clean(row?.work_order_id);
    if (wo) orders.add(wo);
    if (Number.isFinite(row?.delta)) {
      totalDelta += row.delta;
      absSum += Math.abs(row.delta);
      absCount += 1;
    }
    const d = parseReportDate(row?.occurred_at);
    if (d) {
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
    }
  }
  return {
    total: list.length,
    unique_actors: actors.size,
    unique_orders: orders.size,
    total_delta: deltaRound(totalDelta),
    avg_abs_delta: absCount ? deltaRound(absSum / absCount) : null,
    period: {
      first: first ? first.toISOString() : null,
      last: last ? last.toISOString() : null,
    },
  };
}

// --- reasonBreakdown ------------------------------------------------------------
//
// { reason: count } over normalized rows — blank reasons bucket under
// "unspecified". Sorted by count desc then label so a view can render the
// object entries directly.
export function reasonBreakdown(rows = []) {
  const counts = new Map();
  for (const row of rows || []) {
    const reason = clean(row?.reason) || UNSPECIFIED_REASON;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

// --- overrideReportRows ---------------------------------------------------------
//
// Flat display rows for the detail table — raw values so the view's column
// formats (datetime/money/percent) render them:
//   { date, actor, order_label, order_href, product, field, from, to,
//     delta, delta_pct, reason, work_order_id }
// order_label/order_href deep-link to the job workspace (same convention as
// opsReportModel rowLinks → /JobWorkspace?wo=<id>).
export function overrideReportRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const wo = clean(row?.work_order_id);
    return {
      date: clean(row?.occurred_at),
      actor: clean(row?.actor) || "system",
      order_label: wo ? `WO ${wo}` : "—",
      order_href: wo ? `/JobWorkspace?wo=${encodeURIComponent(wo)}` : "",
      product: clean(row?.product_label) || clean(row?.product_id) || "—",
      field: clean(row?.field),
      from: row?.from_value ?? "",
      to: row?.to_value ?? "",
      delta: Number.isFinite(row?.delta) ? row.delta : null,
      delta_pct: Number.isFinite(row?.delta_pct) ? row.delta_pct : null,
      reason: clean(row?.reason) || UNSPECIFIED_REASON,
      work_order_id: wo,
    };
  });
}
