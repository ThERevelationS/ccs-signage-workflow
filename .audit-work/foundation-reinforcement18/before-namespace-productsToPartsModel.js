// D-10 — expandable products → parts detail model.
//
// Pure and IO-free: no React, no base44 client — esbuild-bundled and
// unit-tested under plain Node (scripts/test-products-to-parts.mjs).
//
// Where a product's constituent parts come from, in precedence order:
//   1. EMBEDDED SNAPSHOT — part rows stored on the product itself. WO
//      products[] rows are schemaless (additionalProperties) and several
//      pipelines embed a parts list: product.parts (canonical; array OR the
//      id-keyed map proofPipelineModel tolerates), part_list, builder_parts,
//      line_items, materials, components, and the builder_snapshot sub-lists
//      — the same candidate set workOrderConversion.resolveEstimateLineParts
//      scans for estimate lines. First non-empty list wins.
//   2. CATALOG — the caller-supplied partsCatalog (BuilderPart records,
//      the WO-level materials[] manifest from
//      estimateConversionService.buildEstimateMaterialsManifest, or a master
//      part catalog list). Rows are linked to the product by
//      builder_product_id / product_id / estimate_line_id / line_id.
//      Catalog also ENRICHES snapshot rows that lack a name or cost —
//      the row stays source:'snapshot' (that's where the quantity/identity
//      came from) and is flagged enriched:true.
//
// Money: storage fields are dollars (unit_cost / extended_cost /
// frozen_unit_cost / part_price...). Output rows are integer CENTS
// (unit_cost_cents / extended_cents) so expanded headers can sum without
// float drift. A genuinely absent cost stays null — the UI renders "—",
// never a fake $0.00; partsSummary.uncosted_parts counts them.
//
// Nothing in this module mutates its inputs — every returned row is a fresh
// object; productParts/expandableRows never write back into products[].

const clean = (v) => String(v ?? "").trim();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
// First value that is actually present — 0 is a real cost, "" is not.
const firstPresent = (...vals) =>
  vals.find((v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === ""));

// ---------------------------------------------------------------------------
// Part-type buckets — the expanded header's materials/labor/equipment/other
// rollup. part_type is an open string by schema design (BuilderPart.jsonc
// documents it that way); every value lands in exactly one bucket. Types
// observed from estimator partSync.makePart + the QuickProduct enum:
//   material · labor · equipment · service · fabrication · design_production ·
//   installation · permit · other (+ module subtypes in part_subtype).
// ---------------------------------------------------------------------------

export const PART_TYPE_BUCKETS = Object.freeze(["materials", "labor", "equipment", "other"]);

const BUCKET_BY_TYPE = {
  material: "materials",
  materials: "materials",
  fabrication: "materials", // fabricated subassembly = a produced physical part
  substrate: "materials",
  hardware: "materials",
  vinyl: "materials",
  lighting: "materials",
  supply: "materials",
  supplies: "materials",
  component: "materials",
  inventory: "materials",
  part: "materials",
  product: "materials",
  labor: "labor",
  design: "labor",
  design_production: "labor",
  artwork: "labor",
  service: "labor", // service lines (delivery, install services) are work, not stock
  installation: "labor",
  install: "labor",
  equipment: "equipment",
  machine: "equipment",
  rental: "equipment",
  crane: "equipment",
  permit: "other",
  other: "other",
};

export function bucketForPartType(partType) {
  return BUCKET_BY_TYPE[clean(partType).toLowerCase()] || "other";
}

// ---------------------------------------------------------------------------
// Embedded snapshot discovery
// ---------------------------------------------------------------------------

// Ordered candidate keys on the product itself; builder_snapshot is searched
// last (it's a whole-builder dump, least direct). First non-empty wins —
// mixed lists never merge, matching resolveEstimateLineParts semantics.
const TOP_LEVEL_LIST_KEYS = ["parts", "part_list", "builder_parts", "line_items", "materials", "components"];
const SNAPSHOT_LIST_KEYS = ["parts", "part_list", "builder_parts", "materials", "line_items"];

const listFrom = (value) => {
  if (Array.isArray(value)) return value.filter(isObj);
  // proofPipelineModel documents product.parts as also landing as an id-keyed
  // map; treat object values as the row list, keyed order preserved.
  if (isObj(value)) return Object.values(value).filter(isObj);
  return [];
};

// The product's embedded part rows + which field supplied them ("" = none).
export function embeddedPartList(product) {
  const p = isObj(product) ? product : {};
  for (const key of TOP_LEVEL_LIST_KEYS) {
    const rows = listFrom(p[key]);
    if (rows.length) return { rows, field: key };
  }
  const snap = isObj(p.builder_snapshot) ? p.builder_snapshot : {};
  for (const key of SNAPSHOT_LIST_KEYS) {
    const rows = listFrom(snap[key]);
    if (rows.length) return { rows, field: `builder_snapshot.${key}` };
  }
  return { rows: [], field: "" };
}

// ---------------------------------------------------------------------------
// Catalog — BuilderPart records, WO materials[] manifest rows, or master part
// catalog items. Accepts an array, a Map(id→row), or an id-keyed object.
// ---------------------------------------------------------------------------

// Every identity a part-ish row can carry, strongest first. The same keys are
// used to INDEX catalog rows and to LOOK UP snapshot refs, so matching works
// whichever spelling each side uses.
const REF_KEYS = ["part_id", "builder_part_id", "id", "part_key", "inventory_item_id", "line_id"];

const rowRefs = (row = {}) => REF_KEYS.map((k) => clean(row?.[k])).filter(Boolean);

export function catalogRows(catalog) {
  if (!catalog) return [];
  if (catalog instanceof Map) return [...catalog.values()].filter(isObj);
  if (Array.isArray(catalog)) return catalog.filter(isObj);
  if (isObj(catalog)) return Object.values(catalog).filter(isObj);
  return [];
}

// key → catalog row. First writer wins so duplicate-keyed catalogs stay stable.
function catalogIndex(catalog) {
  const index = new Map();
  for (const row of catalogRows(catalog)) {
    for (const ref of rowRefs(row)) {
      if (!index.has(ref)) index.set(ref, row);
    }
  }
  return index;
}

const matchCatalog = (index, row) => {
  for (const ref of rowRefs(row)) {
    const hit = index.get(ref);
    if (hit) return hit;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Field extraction — every spelling seen across BuilderPart, the WO materials
// manifest, embedded partSync parts, QuickProduct parts, and line-ish rows.
// ---------------------------------------------------------------------------

const nameOf = (r = {}) =>
  clean(firstPresent(
    r.part_name, r.name, r.client_label, r.item_label, r.part_label,
    r.inventory_item_name, r.material_name, r.service_name, r.description,
    r.part_key,
  ));

const typeOf = (r = {}) => clean(firstPresent(r.part_type, r.type, r.item_type, r.kind));
const subtypeOf = (r = {}) => clean(firstPresent(r.part_subtype, r.subtype));
const unitOf = (r = {}) => clean(firstPresent(r.unit, r.uom, r.pricing_mode));
const qtyOf = (r = {}) => num(firstPresent(r.quantity, r.part_qty, r.qty, r.count), 1);

// Integer cents when the row already speaks cents; null when absent.
const centsDirect = (r, keys) => {
  for (const k of keys) {
    const v = r?.[k];
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  return null;
};

// Dollars → integer cents; null when absent so "unknown" never renders as $0.
const centsFromDollars = (v) =>
  (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : null);

// A BuilderPart manual_cost is authoritative only while manual_cost_override
// is set; frozen_* is the customer-approved snapshot and outranks current_*.
const unitDollars = (r = {}) => {
  const manual = r.manual_cost_override === true ? r.manual_cost : undefined;
  return firstPresent(
    manual,
    r.unit_cost, r.unitCost, r.frozen_unit_cost, r.current_unit_cost,
    r.unit_price, r.cost_per_unit, r.default_rate, r.price, r.manual_cost,
  );
};

const extendedDollars = (r = {}) => {
  const explicit = firstPresent(
    r.price_override, // QuickProduct: replaces the whole line total
    r.extended_cost, r.ext_cost, r.extCost,
    r.frozen_extended_cost, r.current_extended_cost,
    r.total_cost, r.line_total, r.total,
  );
  if (explicit !== undefined) return explicit;
  // QuickProduct part rows: line total = part_price + modifier_price.
  if (Number.isFinite(Number(r.part_price)) || Number.isFinite(Number(r.modifier_price))) {
    return num(r.part_price) + num(r.modifier_price);
  }
  return undefined;
};

const unitCents = (r = {}) =>
  centsDirect(r, ["unit_cost_cents", "unitCostCents", "cost_cents"]) ?? centsFromDollars(unitDollars(r));

const extendedCents = (r = {}) =>
  centsDirect(r, ["extended_cents", "ext_cost_cents", "extendedCostCents", "total_cost_cents"]) ??
  centsFromDollars(extendedDollars(r));

// Normalize any part-ish storage row into the render row. `source` is set by
// the caller ('snapshot' | 'catalog'); never mutates `raw`.
function normalizePartRow(raw, source) {
  const r = isObj(raw) ? raw : {};
  const quantity = qtyOf(r);
  let unit_cost_cents = unitCents(r);
  let extended_cents = extendedCents(r);
  // Derive the missing leg arithmetically — display math, not data invention.
  if (extended_cents == null && unit_cost_cents != null) {
    extended_cents = Math.round(unit_cost_cents * quantity);
  }
  if (unit_cost_cents == null && extended_cents != null && quantity > 0) {
    unit_cost_cents = Math.round(extended_cents / quantity);
  }
  const part_type = typeOf(r);
  return {
    part_id: clean(firstPresent(r.part_id, r.builder_part_id, r.id, r.part_key, r.inventory_item_id, r.line_id)),
    part_key: clean(r.part_key),
    name: nameOf(r),
    part_type,
    part_subtype: subtypeOf(r),
    type_bucket: bucketForPartType(part_type),
    quantity,
    unit: unitOf(r),
    unit_cost_cents,
    extended_cents,
    source,
    enriched: false,
    enriched_fields: [],
  };
}

// Fill missing name/cost legs on a snapshot row from its catalog match.
// Returns the same normalized row object with enriched flags — the snapshot
// remains the source of truth for identity + quantity.
function enrichFromCatalog(row, catalogRow) {
  if (!catalogRow) return row;
  const filled = [];
  const cat = normalizePartRow(catalogRow, "catalog");
  if (!row.name && cat.name) { row.name = cat.name; filled.push("name"); }
  if (row.unit_cost_cents == null && cat.unit_cost_cents != null) {
    row.unit_cost_cents = cat.unit_cost_cents; filled.push("unit_cost_cents");
  }
  if (row.extended_cents == null && cat.extended_cents != null) {
    row.extended_cents = cat.extended_cents; filled.push("extended_cents");
  }
  // A catalog-extended fill lets the unit leg derive honestly too.
  if (row.unit_cost_cents == null && row.extended_cents != null && row.quantity > 0) {
    row.unit_cost_cents = Math.round(row.extended_cents / row.quantity);
    filled.push("unit_cost_cents");
  }
  if (row.extended_cents == null && row.unit_cost_cents != null) {
    row.extended_cents = Math.round(row.unit_cost_cents * row.quantity);
    filled.push("extended_cents");
  }
  if (filled.length) {
    row.enriched = true;
    row.enriched_fields = [...new Set(filled)];
  }
  return row;
}

// Catalog rows linked to one product — the no-embedded-snapshot fallback.
// Link keys cover BuilderPart (builder_product_id / estimate_line_id), the WO
// materials manifest (same), and ad-hoc catalogs (product_id / line_id).
function catalogRowsForProduct(product, catalog) {
  const p = isObj(product) ? product : {};
  const bp = clean(p.builder_product_id);
  const line = clean(p.estimate_line_id);
  const pid = clean(firstPresent(p.id, p.product_id));
  if (!bp && !line && !pid) return [];
  const seen = new Set();
  return catalogRows(catalog).filter((row) => {
    if (row.is_active === false || row.deleted === true) return false;
    const rowId = clean(row.id);
    // WO product.id is often itself the builder_product_id or estimate line_id
    // (buildEstimateWorkOrderProducts seeds id that way), so a catalog row's
    // product/line keys are matched against all three product identities.
    const linked =
      (bp && clean(row.builder_product_id) === bp) ||
      (line && (clean(row.estimate_line_id) === line || clean(row.line_id) === line)) ||
      (pid && (
        clean(row.product_id) === pid || clean(row.work_order_product_id) === pid ||
        clean(row.builder_product_id) === pid ||
        clean(row.estimate_line_id) === pid || clean(row.line_id) === pid
      ));
    if (!linked) return false;
    const dedupe = rowId || `${clean(row.part_key)}|${nameOf(row)}`;
    if (seen.has(dedupe)) return false;
    seen.add(dedupe);
    return true;
  });
}

// ---------------------------------------------------------------------------
// productParts — the product's constituent part rows for the expanded detail.
// ---------------------------------------------------------------------------

// productParts(product, { partsCatalog }) →
//   [{ part_id, part_key, name, part_type, part_subtype, type_bucket,
//      quantity, unit, unit_cost_cents, extended_cents,
//      source:'snapshot'|'catalog', enriched, enriched_fields }]
//
// Embedded snapshots win (source:'snapshot'); when the product carries no
// embedded list, catalog rows linked by builder_product_id / estimate_line_id
// / product id resolve with source:'catalog'. Snapshot rows missing a name or
// cost are enriched from their catalog match (enriched:true) — the row still
// reports source:'snapshot'. Inactive/deleted rows are dropped on both paths.
export function productParts(product, { partsCatalog } = {}) {
  if (!isObj(product)) return [];
  const index = catalogIndex(partsCatalog);
  const { rows: embedded } = embeddedPartList(product);

  if (embedded.length) {
    return embedded
      .filter((r) => r.is_active !== false && r.deleted !== true)
      .map((r) => {
        const row = normalizePartRow(r, "snapshot");
        const hit = index.size ? matchCatalog(index, r) : null;
        return hit ? enrichFromCatalog(row, hit) : row;
      });
  }

  return catalogRowsForProduct(product, partsCatalog)
    .map((r) => normalizePartRow(r, "catalog"));
}

// ---------------------------------------------------------------------------
// partsSummary — header rollup for the expanded row.
// ---------------------------------------------------------------------------

// partsSummary(product, parts) →
//   { total_parts, total_quantity, total_cost_cents, uncosted_parts,
//     by_type: { materials:{count,cost_cents}, labor:{…}, equipment:{…}, other:{…} } }
//
// `parts` may be productParts output (used verbatim) or raw storage rows
// (normalized on the fly); omit it to resolve from the product itself.
export function partsSummary(product, parts) {
  const list = Array.isArray(parts)
    ? parts.map((r) => ("type_bucket" in (r || {}) || "extended_cents" in (r || {}) ? r : normalizePartRow(r, "snapshot")))
    : productParts(product);
  const by_type = {
    materials: { count: 0, cost_cents: 0 },
    labor: { count: 0, cost_cents: 0 },
    equipment: { count: 0, cost_cents: 0 },
    other: { count: 0, cost_cents: 0 },
  };
  let total_cost_cents = 0;
  let total_quantity = 0;
  let uncosted_parts = 0;
  for (const part of list) {
    const bucket = PART_TYPE_BUCKETS.includes(part?.type_bucket) ? part.type_bucket : "other";
    const cost = Number.isFinite(part?.extended_cents) ? part.extended_cents : 0;
    by_type[bucket].count += 1;
    by_type[bucket].cost_cents += cost;
    total_cost_cents += cost;
    total_quantity += num(part?.quantity);
    if (!Number.isFinite(part?.extended_cents) && !Number.isFinite(part?.unit_cost_cents)) uncosted_parts += 1;
  }
  return {
    total_parts: list.length,
    total_quantity,
    total_cost_cents,
    uncosted_parts,
    by_type,
  };
}

// ---------------------------------------------------------------------------
// expandableRows — flattened render list honoring an expanded_ids set.
// ---------------------------------------------------------------------------

// Product row identity: explicit id first, then the product's stable links —
// mirrors workspaceProductRows' synthetic `${wo.id}-${idx}` tail.
export function productRowId(product, index = 0, workOrderId = "") {
  const p = isObj(product) ? product : {};
  return clean(firstPresent(p.id, p.product_id, p.builder_product_id, p.estimate_line_id)) ||
    `${clean(workOrderId) ? `${clean(workOrderId)}-` : "product-"}${index}`;
}

const expandedHas = (expandedIds, id) => {
  if (expandedIds === true || expandedIds === "*") return true;
  if (!expandedIds) return false;
  if (expandedIds instanceof Set) return expandedIds.has(id);
  if (Array.isArray(expandedIds)) return expandedIds.includes(id);
  if (isObj(expandedIds)) return expandedIds[id] === true || id in expandedIds;
  return false;
};

// expandableRows(products, { expanded_ids, partsCatalog, work_order_id }) →
//   flat list for a table/accordion render:
//     { type:'product', product_id, index, expanded, product, summary, parts }
//     { type:'part', parent_product_id, product_id, index, part_index, part }
// Part rows follow their product row only while product_id ∈ expanded_ids.
// `expanded_ids` accepts a Set, an array, an id-keyed map, or true/'*' for
// expand-all. summary is always computed — the collapsed header needs the
// parts count and cost rollup.
export function expandableRows(products, opts = {}) {
  const list = Array.isArray(products) ? products : [];
  const { expanded_ids, partsCatalog, work_order_id } = opts || {};
  const out = [];
  list.forEach((product, index) => {
    if (!isObj(product)) return;
    const product_id = productRowId(product, index, work_order_id);
    const parts = productParts(product, { partsCatalog });
    const expanded = expandedHas(expanded_ids, product_id);
    out.push({
      type: "product",
      product_id,
      index,
      expanded,
      product,
      summary: partsSummary(product, parts),
      parts,
    });
    if (!expanded) return;
    parts.forEach((part, part_index) => {
      out.push({
        type: "part",
        parent_product_id: product_id,
        product_id,
        index,
        part_index,
        part,
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// missingPartRefs — data-quality flag: part refs the product carries that the
// catalog cannot resolve.
// ---------------------------------------------------------------------------

// missingPartRefs(product, catalog) →
//   [{ ref, part_id, part_key, name, field }]
// Every identity carried by an embedded part row (or the scalar ref arrays
// part_ids / builder_part_ids / part_refs / part_list_ids) that no catalog row
// answers. Rows with no identifier can't dangle and are skipped. An empty/
// absent catalog flags every ref — the honest answer when no catalog loaded.
export function missingPartRefs(product, catalog) {
  if (!isObj(product)) return [];
  const index = catalogIndex(catalog);
  const out = [];
  const seen = new Set();
  const flag = (ref, row = {}, field = "") => {
    const key = clean(ref);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      ref: key,
      part_id: clean(firstPresent(row.part_id, row.builder_part_id, row.id)),
      part_key: clean(row.part_key),
      name: nameOf(row),
      field: field || "parts",
    });
  };

  const { rows, field } = embeddedPartList(product);
  for (const row of rows) {
    const refs = rowRefs(row);
    if (!refs.length) continue; // self-contained snapshot row, not a ref
    if (!refs.some((ref) => index.has(ref))) flag(refs[0], row, field);
  }

  for (const key of ["part_ids", "builder_part_ids", "part_refs", "part_list_ids"]) {
    const raw = product[key];
    const vals = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    for (const v of vals) {
      const ref = isObj(v) ? clean(firstPresent(v.part_id, v.builder_part_id, v.id, v.part_key)) : clean(v);
      if (ref && !index.has(ref)) flag(ref, isObj(v) ? v : {}, key);
    }
  }
  return out;
}
