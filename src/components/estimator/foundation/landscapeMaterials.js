// Landscape materials for the Signage & Landscape designer.
// Each cell on the grid is one square foot by default.
export const LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 },
  // O-069 (CMP-F02) -- additional sqft-priced site materials. These bill by
  // coverage like the base set; per-count objects (trees, lights, boulders)
  // need a count-priced model -- they are intentionally absent rather than
  // billed per square foot.
  { key: "pavers", label: "Pavers", color: "#a8a29e", cost_per_sqft: 12 },
  { key: "flagstone", label: "Flagstone", color: "#b45309", cost_per_sqft: 16 },
  { key: "river_rock", label: "River Rock", color: "#78716c", cost_per_sqft: 3.5 },
  { key: "sod", label: "Sod (installed)", color: "#16a34a", cost_per_sqft: 1.5 },
  { key: "artificial_turf", label: "Artificial Turf", color: "#059669", cost_per_sqft: 11 },
  { key: "ground_cover", label: "Ground Cover", color: "#65a30d", cost_per_sqft: 4 },
  { key: "planting_bed", label: "Planting Bed", color: "#7c3f00", cost_per_sqft: 6 },
];

export const materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);

// O-073 (CMP-F06) -- catalog-configured material: `landscape.material_overrides`
// map {key: {catalog_id, unit_price}} records a per-key catalog/configured
// price -- the override's `unit_price` governs the billing when present
// (blank/invalid = the material's own `cost_per_sqft` stays the rate).
export const configuredMaterialPrice = (key, overrides) => {
  const ov = isRecord(overrides) ? overrides[key] : null;
  const up = ov ? Number(ov.unit_price) : null;
  if (Number.isFinite(up) && up >= 0) return { rate: up, catalog_id: typeof ov.catalog_id === "string" && ov.catalog_id !== "" ? ov.catalog_id : null, configured: true };
  return { rate: null, catalog_id: null, configured: false };
};

// O-077 (CMP-F10) -- the manifest's `verification` map by material/object key;
// a UI consumer surfaces the verification state without re-deriving it.
export const verificationForKey = (key) => {
  const m = LANDSCAPE_ASSET_MANIFEST?.materials?.find((e) => e.key === key)
    || LANDSCAPE_ASSET_MANIFEST?.visual_objects?.find((e) => e.key === key);
  return m?.verification ?? null;
};

// O-073 (CMP-F06) -- decorative, UNPRICED objects painted with a "visual:"
// prefix. They render on the designer but are excluded from the billed
// summary and never fabricate a cost; an unknown visual key is flagged like
// an unknown material.
export const LANDSCAPE_VISUAL_OBJECTS = [
  { key: "tree", label: "Tree", color: "#166534", height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", color: "#15803d", height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", color: "#f59e0b", height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", color: "#57534e", height_inches: 30, radius_inches: 18 },
];
export const VISUAL_PREFIX = "visual:";
export const isVisualCellKey = (key) => typeof key === "string" && key.startsWith(VISUAL_PREFIX);
export const visualObjectByKey = (key) =>
  isVisualCellKey(key) ? LANDSCAPE_VISUAL_OBJECTS.find((o) => o.key === key.slice(VISUAL_PREFIX.length)) : undefined;

// O-069 (CMP-F02) -- count-priced objects: tree/shrub/light/boulder bill by
// authored `unit_cost` per placed object, NOT by cell sqft. A `landscape.objects[]`
// row {type, qty} prices qty x the object's unit_cost; a `unit_cost: null`
// object holds its line (never a silent $0 count).
export const LANDSCAPE_COUNT_OBJECTS = [
  { key: "tree", label: "Tree", unit_cost: 350, height_inches: 96, radius_inches: 24 },
  { key: "shrub", label: "Shrub", unit_cost: 45, height_inches: 18, radius_inches: 12 },
  { key: "light", label: "Light", unit_cost: 120, height_inches: 72, radius_inches: 2 },
  { key: "boulder", label: "Boulder", unit_cost: 180, height_inches: 30, radius_inches: 18 },
];
export const countObjectByKey = (key) => LANDSCAPE_COUNT_OBJECTS.find((o) => o.key === key);

// O-069 (CMP-F02) -- linear-entry borders: edge/border types priced by linear
// feet (`cost_per_ft`) — a discrete linear entry, not a cell coverage. Blank
// `linear_feet` = "not recorded" (the line holds, never a silent $0).
export const LANDSCAPE_BORDER_TYPES = [
  { key: "steel_edging", label: "Steel edging", cost_per_ft: 4.50 },
  { key: "plastic_edging", label: "Plastic edging", cost_per_ft: 1.75 },
  { key: "brick_border", label: "Brick border", cost_per_ft: 8.00 },
  { key: "concrete_curb", label: "Concrete curb", cost_per_ft: 12.00 },
];
export const borderTypeByKey = (key) => LANDSCAPE_BORDER_TYPES.find((b) => b.key === key);

export const GRID_COLS = 24;
export const GRID_ROWS = 16;

// O-074 (CMP-F07) -- curated-asset manifest. Every billable material and
// decorative object is a shop-authored primitive (procedural color/geometry,
// not a downloaded pack) -- no third-party assets ship inside the estimator.
// `license` is the contract for any future real-asset replacement: a source
// must be CC0/public-domain or shop-licensed and individually curated per
// section-17 object type, never a blanket pack.
export const LANDSCAPE_ASSET_MANIFEST = Object.freeze({
  license_policy: "CC0 or shop-licensed, individually curated per object type -- no blanket packs",
  source_kind: "procedural shop-authored primitives",
  materials: LANDSCAPE_MATERIALS.map((m) => ({
    key: m.key, label: m.label, kind: "billable material", source: "shop-authored color tile", license: "shop-authored",
    // O-075 (CMP-F08) -- manifest metadata: author/provenance, original scale,
    // preview, optimized-file hash, bounds/pivot, and a fallback representation.
    // Shop-authored primitives carry the primitive itself as the fallback.
    author: "shop", original_scale_inches: null, preview: null, file_hash: null,
    bounds_inches: null, pivot: "center-bottom", fallback: "color tile",
    // O-077 (CMP-F10) -- asset-verification checklist: procedural primitives
    // have no textures/CORS/foliage (not_applicable) but scale comes from the
    // authored material coverage (verified). Re-check when real assets land.
    verification: {
      transparent_foliage: "not_applicable", shadows: "procedural", scale: "verified",
      thumbnail: "procedural", cors: "not_applicable", unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback",
    },
  })),
  visual_objects: LANDSCAPE_VISUAL_OBJECTS.map((o) => ({
    key: o.key, label: o.label, kind: "decorative object", source: "shop-authored primitive shape", license: "shop-authored",
    author: "shop", original_scale_inches: o.height_inches ?? null, preview: null, file_hash: null,
    bounds_inches: o.height_inches != null && o.radius_inches != null ? { h: o.height_inches, r: o.radius_inches } : null,
    pivot: "center-bottom", fallback: "primitive shape",
    verification: {
      transparent_foliage: "not_applicable", shadows: "procedural", scale: "verified",
      thumbnail: "procedural", cors: "not_applicable", unavailable_asset: "not_applicable",
      low_power_fallback: "procedural-fallback",
    },
  })),
});

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Inventory normalization boundary (CMP-A08): landscapePriceNumber is the
// canonical catalog price basis (finite, nonnegative  -  -  -  -  -  -  - ? an explicit 0 is a
// legitimate free material); landscapeCellSizeNumber is the positive
// dimension basis  -  -  -  -  -  -  - ? a missing cell size is not a guessable 12", it is
// unavailable so the recorded total is held rather than repriced on a guess.
import {
  inventoryNonnegativeNumber as landscapePriceNumber,
  inventoryPositiveNumber as landscapeCellSizeNumber,
} from "@/components/masterInventory/inventoryNormalization";

// Availability issues for the recorded site-materials grid. Only values the
// summary math actually consumes are flagged: with no priced cells the grid
// bills nothing, so a missing/malformed cell size or a stray "dirt" cell is
// ignored. Non-string or unknown material keys, a material without a
// nonnegative price, and an absent/invalid cell size are all unavailable.
export function landscapeInputIssues(landscape) {
  const issues = [];
  if (landscape === undefined || landscape === null) return issues;
  const add = (field, code, message) => issues.push({
    kind: "landscape", index: null, componentId: null, field, code,
    message: `Landscape: ${message}`,
  });
  const rawCells = landscape.cells;
  const cells = isRecord(rawCells) ? rawCells : null;
  if (rawCells !== undefined && rawCells !== null && cells === null) {
    add("cells", "landscape_cells_unavailable",
      "the recorded site grid is malformed  -  -  -  -  -  -  - ? repair or clear it before repricing");
    return issues;
  }
  const painted = Object.entries(cells || {}).filter(([, key]) => key && key !== "dirt");
  if (!painted.length) return issues;
  if (landscapeCellSizeNumber(landscape.cell_size_inches) === null) {
    add("cell_size_inches", "landscape_cell_size_unavailable",
      "record a finite, positive cell size in inches before repricing site materials");
  }
  const reported = new Set();
  for (const [, key] of painted) {
    if (reported.has(key)) continue;
    reported.add(key);
    if (isVisualCellKey(key)) {
      if (!visualObjectByKey(key)) {
        add("cells", "landscape_visual_unavailable",
          `decorative object ${JSON.stringify(key)} is not in the visual catalog -- pick a listed object or erase it before repricing`);
      }
      continue;
    }
    const mat = materialByKey(key);
    if (!mat) {
      add("cells", "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog  -  -  -  -  -  -  - ? pick a catalog material or erase it before repricing`);
    } else if (landscapePriceNumber(mat.cost_per_sqft) === null) {
      add("cost_per_sqft", "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`);
    }
  }
  return issues;
}

// Area/cost rollup for the recorded grid. The ported accumulation is kept
// verbatim for a fully priced grid  -  -  -  -  -  -  - ? every line sqft and cost, and the total,
// are identical. An unpriceable line reports null amounts instead of the
// ported $0, and a null total propagates "unavailable" to the section totals.
export const landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = landscapeCellSizeNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  // O-073 (CMP-F06) -- authored bed-depth / waste / labor fields: blank =
  // "not recorded" (depth/volume + labor hold, waste scales to 0), never a
  // silent zero on the design's money.
  const waste = Number.isFinite(landscape?.waste_fraction) && landscape.waste_fraction >= 0 ? landscape.waste_fraction : 0;
  const labor = landscape?.labor_cost == null ? null : Number.isFinite(Number(landscape.labor_cost)) && Number(landscape.labor_cost) >= 0 ? Number(landscape.labor_cost) : null;
  const laborInvalid = landscape?.labor_cost != null && labor === null;
  const bedDepth = Number.isFinite(landscape?.bed_depth_inches) && landscape.bed_depth_inches > 0 ? landscape.bed_depth_inches : null;
  const counts = {};
  const rows = {};
  let plantCount = 0;
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    if (isVisualCellKey(key)) { plantCount += 1; return; }
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key] * (1 + waste);
    // O-073 (CMP-F06) -- a configured material override's `unit_price` governs
    // the billing when present; the material's own `cost_per_sqft` is the
    // default rate (never a silently-zero configured rate).
    const configured = configuredMaterialPrice(key, landscape?.material_overrides);
    const rate = configured.configured ? configured.rate : mat ? landscapePriceNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      volume_cuft: sqft === null || bedDepth === null ? null : (sqft * bedDepth) / 12,
      cost_per_sqft: rate,
      configured_catalog_id: configured.catalog_id,
      cost: sqft === null || rate === null ? null : sqft * rate,
    };
  });
  const materialsTotal = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  // O-069 (CMP-F02) -- count-priced objects: `landscape.objects[]` rows
  // {type, qty} price qty x the catalog object's unit_cost. A malformed row
  // (unknown type, non-positive qty) holds its line -- never a silent $0 count.
  const objectLines = (Array.isArray(landscape?.objects) ? landscape.objects : []).map((o) => {
    const catalog = countObjectByKey(o?.type);
    const qty = Number(o?.qty);
    const validQty = Number.isFinite(qty) && qty > 0;
    const unit = catalog ? Number(catalog.unit_cost) : null;
    return {
      key: o?.type || "unknown",
      label: catalog?.label || (o?.type || "Object"),
      qty: validQty ? qty : null,
      unit_cost: unit,
      cost: validQty && unit !== null ? qty * unit : null,
      invalid: !catalog || !validQty || unit === null,
    };
  });
  const objectsTotal = objectLines.length === 0 ? 0 : objectLines.every((l) => l.cost !== null) ? objectLines.reduce((s, l) => s + l.cost, 0) : null;
  // O-069 (CMP-F02) -- linear-entry borders: `landscape.borders[]` rows
  // {type, linear_feet} price linear_feet x the border type's cost_per_ft -- a
  // discrete linear entry, not a cell coverage. A malformed row (unknown
  // type, non-positive feet) holds its line -- never a silent $0.
  const borderLines = (Array.isArray(landscape?.borders) ? landscape.borders : []).map((b) => {
    const type = borderTypeByKey(b?.type);
    const feet = Number(b?.linear_feet);
    const validFeet = Number.isFinite(feet) && feet > 0;
    const rate = type ? Number(type.cost_per_ft) : null;
    return {
      key: b?.type || "unknown",
      label: type?.label || (b?.type || "Border"),
      linear_feet: validFeet ? feet : null,
      cost_per_ft: rate,
      cost: validFeet && rate !== null ? feet * rate : null,
      invalid: !type || !validFeet || rate === null,
    };
  });
  const bordersTotal = borderLines.length === 0 ? 0 : borderLines.every((l) => l.cost !== null) ? borderLines.reduce((s, l) => s + l.cost, 0) : null;
  // O-068 (CMP-F01) -- named-bed entries: `landscape.beds[]` rows
  // {material, sqft} bill an authored coverage (a bed polygon's area the
  // operator records) vs cell paint -- a discrete bed entry, not a cell.
  // A malformed row (unknown material, non-positive sqft) holds its line.
  const bedLines = (Array.isArray(landscape?.beds) ? landscape.beds : []).map((b) => {
    const mat = materialByKey(b?.material);
    const sqft = Number(b?.sqft);
    const validSqft = Number.isFinite(sqft) && sqft > 0;
    const rate = mat ? landscapePriceNumber(mat.cost_per_sqft) : null;
    return {
      key: b?.material || "unknown",
      label: mat?.label || (b?.material || "Bed"),
      sqft: validSqft ? sqft : null,
      cost_per_sqft: rate,
      cost: validSqft && rate !== null ? sqft * rate : null,
      invalid: !mat || !validSqft || rate === null,
    };
  });
  const bedsTotal = bedLines.length === 0 ? 0 : bedLines.every((l) => l.cost !== null) ? bedLines.reduce((s, l) => s + l.cost, 0) : null;
  const total = laborInvalid || objectsTotal === null || materialsTotal === null || bordersTotal === null || bedsTotal === null
    ? null
    : materialsTotal + (labor === null ? 0 : labor) + objectsTotal + bordersTotal + bedsTotal;
  // O-071 (CMP-F04) -- grouped placement: objects sharing a `group` key
  // summarize by that group (`{count, cost}`) -- the grouped placement's
  // aggregate surface (the objects still bill individually; the group is a
  // placement/pricing cohort, not a lumped line).
  const groups = {};
  (Array.isArray(landscape?.objects) ? landscape.objects : []).forEach((o, i) => {
    const key = o?.group;
    if (!key) return;
    const l = objectLines[i];
    const g = groups[key] || (groups[key] = { count: 0, cost: 0 });
    g.count += 1;
    if (l && Number.isFinite(l.cost)) g.cost += l.cost;
  });
  return {
    lines, object_lines: objectLines, border_lines: borderLines, bed_lines: bedLines, total,
    materials_total: materialsTotal, objects_total: objectsTotal, borders_total: bordersTotal, beds_total: bedsTotal,
    labor_cost: labor, plant_count: plantCount, groups, issues: landscapeInputIssues(landscape),
  };
};