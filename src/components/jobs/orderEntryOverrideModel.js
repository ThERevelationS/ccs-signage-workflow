// D-11 "Overridden during order entry" provenance model.
//
// When a line price/qty on a converted WorkOrder.products[] row is manually
// edited after estimate conversion, the product is stamped `overridden` +
// actor + timestamp so every downstream surface (workspace products table,
// queues, invoice preview, print) can badge it, and a `price_override`
// ProductActivity-shaped history row records the field-level from → to.
//
// Pure and IO-free — esbuild-bundled + unit-tested under Node by
// scripts/test-order-entry-override.mjs. Event rows are built THROUGH
// productAuditModel.makeProductAuditEvent so the shape can never drift from
// the B-12 ProductActivity contract (base44/entities/ProductActivity.jsonc).
//
// Relationship to the ops audit trail: productAuditModel's FIELD_RULES
// deliberately skip money/qty fields ("quantity/price edits are money
// history, not ops history — D-11/F-26 own those trails"). This model is that
// money trail. `price_override` is not yet in the ProductActivity event_type
// enum, so rows default to the literal D-11 type for the money-history feed
// and expose `asEntityEvent: true` for callers that must write the entity
// today (emits the enum-valid `override` type with the same details payload).

import {
  PRODUCT_AUDIT_ACTOR_TYPES,
  makeProductAuditEvent,
  renderAuditValue,
} from "./productAuditModel.js";

const clean = (v) => String(v ?? "").trim();
const asObject = (v) => (v && typeof v === "object" ? v : {});

// ---------------------------------------------------------------------------
// Price-field vocabulary
// ---------------------------------------------------------------------------

// The product fields whose manual edit constitutes an order-entry override.
// `unit_price` is the canonical line price (invoice/order-entry line shape);
// `price` covers products stored under the shorter alias; `quantity` is
// integer-compared; `discount_pct` is a percent so it uses the money path.
export const PRICE_FIELDS = ["unit_price", "price", "quantity", "discount_pct"];

// Converted WorkOrder.products[] rows store money under the seeded names
// (workOrderConversion.js buildEstimateWorkOrderProducts): quoted_unit_price
// / quoted_total. Order-entry surfaces editing THOSE rows should detect +
// stamp with this extended list — pass it as opts.fields to
// detectOrderEntryEdits / overrideStamp. `quantity` covers both shapes.
export const WO_PRODUCT_PRICE_FIELDS = [
  ...PRICE_FIELDS,
  "quoted_unit_price",
  "quoted_total",
];

// Float-repr noise tolerance — 0.1 + 0.2 vs 0.3 differs by ~5e-17; a real
// cent (0.01) or even fractional-cent (0.0001, e.g. $/sqft pricing) change is
// far above this, so epsilon misses noise and catches every meaningful edit.
export const FLOAT_EPSILON = 1e-9;

// Quantity edits compare as whole units: 3 vs "3" equal, 3 vs 4 differs. A
// fractional quantity entry truncates for the compare (spec: integer compare).
const QTY_FIELD = "quantity";

export function isPriceField(field) {
  return PRICE_FIELDS.includes(clean(field).toLowerCase());
}

// Resolve a caller's field allowlist: blank/absent → PRICE_FIELDS; entries
// lowercased + deduped. All detection/stamping paths share it so the same
// field names flow from detect through to the stored edits.
const fieldSet = (fields) => {
  const list = Array.isArray(fields) && fields.length ? fields : PRICE_FIELDS;
  return [...new Set(list.map((f) => clean(f).toLowerCase()).filter(Boolean))];
};

// Product fields that prove the row already converted from an estimate (the
// seeded markers buildEstimateWorkOrderProducts stamps — WorkOrder.jsonc
// documents estimate_line_id/source_estimate_id). `converted_at` covers
// callers that stamp an explicit conversion timestamp, and
// `source_estimate_line_id` covers the alternate naming some payloads use.
export const CONVERSION_MARKER_FIELDS = [
  "converted_at",
  "source_estimate_line_id",
  "estimate_line_id",
  "source_estimate_id",
  "source_estimate_number",
];

// Is this product already converted? Checks `before`/opts only — never
// `after`: a patch that carries a marker is the conversion write itself,
// which establishes the baseline rather than overriding it.
export function productConverted(product, { converted_at } = {}) {
  if (clean(converted_at)) return true;
  const p = asObject(product);
  return CONVERSION_MARKER_FIELDS.some((field) => clean(p[field]));
}

// ---------------------------------------------------------------------------
// Edit detection
// ---------------------------------------------------------------------------

const numOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const qtyOrNull = (v) => {
  const n = numOrNull(v);
  return n === null ? null : Math.trunc(n);
};

// Same price value? quantity → integer compare; other fields → numeric
// float-epsilon compare. Both sides unparseable/blank count as "no value"
// (equal); one side valued and the other blank/invalid is a real change.
const samePriceValue = (field, a, b) => {
  if (field === QTY_FIELD) return qtyOrNull(a) === qtyOrNull(b);
  const na = numOrNull(a);
  const nb = numOrNull(b);
  if (na === null || nb === null) return na === nb;
  return Math.abs(na - nb) <= FLOAT_EPSILON;
};

// Normalize one detected edit for storage: raw from/to preserved (callers and
// the history row render via renderAuditValue), field forced to its canonical
// lower-case name and gated against `fields` (default PRICE_FIELDS — pass
// WO_PRODUCT_PRICE_FIELDS for embedded WO-product money fields).
export function normalizeOverrideEdit(edit, fields) {
  const e = asObject(edit);
  const field = clean(e.field).toLowerCase();
  if (!fieldSet(fields).includes(field)) return null;
  return { field, from: e.from ?? "", to: e.to ?? "" };
}

// Allowlist-gated normalize — detection and stamping both run through this so
// a hand-built edits list can't smuggle non-price fields into the stamp.
const normalizeEdits = (edits, fields) =>
  (Array.isArray(edits) ? edits : []).map((e) => normalizeOverrideEdit(e, fields)).filter(Boolean);

// Render-side normalize — NO allowlist. History rows and badge tooltips
// mirror whatever edits detection emitted (including extended fields); their
// only job is a well-formed {field, from, to} entry.
const renderableEdit = (edit) => {
  const e = asObject(edit);
  const field = clean(e.field).toLowerCase();
  return field ? { field, from: e.from ?? "", to: e.to ?? "" } : null;
};
const renderableEdits = (edits) =>
  (Array.isArray(edits) ? edits : []).map(renderableEdit).filter(Boolean);

// Diff a product's price fields before → after.
//
//   before — the loaded product (or baseline snapshot). Conversion markers
//     are read HERE; pass opts.converted_at when `before` is a reduced
//     snapshot that may not carry marker fields.
//   after  — the incoming values. May be a patch (only edited keys) or a
//     fully merged product; only allowlisted keys present on `after` are
//     compared, so a patch never diffs untouched fields.
//   opts.converted_at — explicit conversion timestamp; callers that stamp
//     one pass it straight through. A blank before{} plus this flag still
//     detects overrides (marker authority is the caller's).
//   opts.fields — field allowlist + compare order, default PRICE_FIELDS.
//     Order-entry surfaces on embedded WO products pass
//     WO_PRODUCT_PRICE_FIELDS so quoted_unit_price/quoted_total edits count.
//     Pass the SAME list to overrideStamp so nothing detected gets filtered.
//
// Returns { overridden, converted, edits }:
//   converted — product carried a conversion marker (or opts.converted_at).
//   edits     — [{field, from, to}] in field-list order, regardless of
//               conversion, so callers can inspect what changed either way.
//   overridden — converted && edits.length > 0. ONLY then should a caller
//               merge overrideStamp() into the product update.
export function detectOrderEntryEdits(before, after, { converted_at, fields } = {}) {
  const b = asObject(before);
  const a = asObject(after);
  const converted = productConverted(b, { converted_at });

  const edits = [];
  for (const field of fieldSet(fields)) {
    if (!(field in a)) continue;
    if (samePriceValue(field, b[field], a[field])) continue;
    edits.push({ field, from: b[field] ?? "", to: a[field] ?? "" });
  }
  return { overridden: converted && edits.length > 0, converted, edits };
}

// ---------------------------------------------------------------------------
// Product stamp
// ---------------------------------------------------------------------------

// Fields this model stamps on a product — exported so clearOverrideOnReprice
// and future badge/schema work share the vocabulary.
export const OVERRIDE_STAMP_FIELDS = [
  "overridden",
  "overridden_at",
  "overridden_by",
  "overridden_by_type",
  "override_edits",
];

const isoNow = (now) => {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.toISOString();
  const s = clean(now);
  if (s) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return s; // unparsable non-empty strings pass through (already ISO-ish)
  }
  return new Date().toISOString();
};

const validActorType = (actorType) => {
  const t = clean(actorType).toLowerCase();
  return PRODUCT_AUDIT_ACTOR_TYPES.includes(t) ? t : "staff";
};

// The patch a caller merges into the product update when
// detectOrderEntryEdits reports overridden:true.
//
//   { overridden: true,
//     overridden_at:      ISO timestamp (opts.now or write time),
//     overridden_by:      actor label (name/email),
//     overridden_by_type: staff | customer | vendor | system,
//     override_edits:     [{field, from, to}] — the detected edits }
//
// Stamp fields REPLACE wholesale — a second override rewrites who/when/what
// rather than appending, because the badge answers "is this price manual?"
// not "how many times"; the append-only trail lives in the history rows.
//
// `fields` must match the allowlist detectOrderEntryEdits ran with (default
// PRICE_FIELDS) — edits naming other fields are filtered out of the stored
// trail so a hand-built edits list can't smuggle non-price keys in.
export function overrideStamp({ actor = "", actorType = "staff", now = "", edits = [], fields } = {}) {
  return {
    overridden: true,
    overridden_at: isoNow(now),
    overridden_by: clean(actor),
    overridden_by_type: validActorType(actorType),
    override_edits: normalizeEdits(edits, fields),
  };
}

// Patch removing every override flag — merge into the product update when an
// AUTHORITATIVE reprice supersedes the manual edit: the pricing engine
// recalculating the line, re-accepting estimate pricing, or a reprice action
// that recomputes price fields from source data. Do NOT call on ordinary
// edits (those stamp via overrideStamp) or on non-authoritative rewrites
// (imports/syncs that must preserve the provenance flag).
//
// Returns {} when the product isn't flagged so callers can merge the patch
// unconditionally inside a reprice writer without writing noise fields.
export function clearOverrideOnReprice(product) {
  if (!hasOrderEntryOverride(product)) return {};
  return {
    overridden: false,
    overridden_at: "",
    overridden_by: "",
    overridden_by_type: "",
    override_edits: [],
  };
}

// ---------------------------------------------------------------------------
// Badge helpers ("badge everywhere" — one canonical label/tooltip)
// ---------------------------------------------------------------------------

export const OVERRIDE_BADGE_TEXT = "Overridden during order entry";

export function hasOrderEntryOverride(product) {
  const p = asObject(product);
  return p.overridden === true || clean(p.overridden).toLowerCase() === "true";
}

// Canonical badge text — every surface renders the same string so the
// provenance reads identically on the products table, queues, and prints.
// "" when the product isn't flagged so callers can render `label && <Badge>`.
export function overrideBadgeLabel(product) {
  return hasOrderEntryOverride(product) ? OVERRIDE_BADGE_TEXT : "";
}

// Compact edit summary: "unit_price 10 → 12.5; quantity 3 → 5". Drives the
// badge tooltip and the history-row label. Render-side — mirrors whatever
// edits were detected/stored, extended field names included.
export function overrideEditSummary(edits = []) {
  return renderableEdits(edits)
    .map((e) => `${e.field} ${renderAuditValue(e.from)} → ${renderAuditValue(e.to)}`)
    .join("; ");
}

// Hover detail for the badge: "unit_price 10 → 12.5 · Brett H · 2026-11-02 07:19".
export function overrideBadgeTooltip(product) {
  const p = asObject(product);
  if (!hasOrderEntryOverride(p)) return "";
  const parts = [];
  const summary = overrideEditSummary(p.override_edits);
  if (summary) parts.push(summary);
  if (clean(p.overridden_by)) parts.push(clean(p.overridden_by));
  const at = clean(p.overridden_at);
  if (at.length >= 16) parts.push(`${at.slice(0, 10)} ${at.slice(11, 16)}`);
  else if (at) parts.push(at);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// History row
// ---------------------------------------------------------------------------

// The D-11 money-history event type. Distinct from the ops-audit `override`
// so J-report feeds ("Overrides by Salesperson", F-26) query price provenance
// without mixing in status overrides.
export const PRICE_OVERRIDE_EVENT_TYPE = "price_override";

// One ProductActivity-shaped history row for an applied order-entry override.
//
//   product       — the product being stamped (id/label/work_order_id read
//                   from it; explicit opts win for bare/partial products)
//   edits         — detectOrderEntryEdits().edits
//   actor/actorType — who edited (defaults staff)
//   workOrderId / productId / productLabel — explicit overrides
//   now           — ISO occurred_at pin (tests / retry-safe writers)
//   note          — free-form context appended to the row's note column
//   asEntityEvent — true → emit enum-valid `override` for direct ProductActivity
//                   writes until the entity enum gains `price_override`;
//                   false (default) → literal `price_override` for the
//                   money-history feed D-11/F-26 own.
//
// The base row is built by makeProductAuditEvent so schema_version,
// work_order_id, product_id, product_label, actor_*, from/to_value, note,
// occurred_at and details all match the B-12 contract exactly — then
// event_type is re-tagged (spread, not mutation). `label` duplicates the
// badge text + summary because orderHistoryModel renders row.label first
// (same convention conversion events use). Edits land verbatim
// (render-normalized) — the detection boundary already decided what counts.
export function overrideHistoryRow({
  product = {},
  edits = [],
  actor = "",
  actorType = "staff",
  workOrderId = "",
  productId = "",
  productLabel = "",
  now = "",
  note = "",
  asEntityEvent = false,
} = {}) {
  const p = asObject(product);
  const normalized = renderableEdits(edits);
  const fields = [...new Set(normalized.map((e) => e.field))];
  const single = normalized.length === 1 ? normalized[0] : null;

  // Single edit → its raw from → to; multiple → paired "field=value" lists so
  // formatAuditLine's arrow still reads left-to-right per field.
  const fromValue = single
    ? single.from
    : normalized.map((e) => `${e.field}=${renderAuditValue(e.from)}`).join("; ");
  const toValue = single
    ? single.to
    : normalized.map((e) => `${e.field}=${renderAuditValue(e.to)}`).join("; ");

  const label = `${OVERRIDE_BADGE_TEXT}${normalized.length ? ` — ${overrideEditSummary(normalized)}` : ""}`;

  const base = makeProductAuditEvent({
    work_order_id: clean(workOrderId) || clean(p.work_order_id),
    product_id: clean(productId) || clean(p.id) || clean(p.product_id),
    product_label:
      clean(productLabel) || clean(p.description) || clean(p.client_product_name) || clean(p.name),
    event_type: "override", // nearest enum-valid type — re-tagged below
    actor_type: actorType,
    actor_label: actor,
    from_value: fromValue,
    to_value: toValue,
    note,
    occurred_at: now,
    details: {
      field: single ? single.field : "multiple",
      field_label: "Price override",
      override_type: PRICE_OVERRIDE_EVENT_TYPE,
      price_fields: fields,
      edits: normalized,
    },
  });
  if (!base) return null;
  const row = { ...base, label };
  return asEntityEvent ? row : { ...row, event_type: PRICE_OVERRIDE_EVENT_TYPE };
}
