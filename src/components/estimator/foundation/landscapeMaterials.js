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
  })),
  visual_objects: LANDSCAPE_VISUAL_OBJECTS.map((o) => ({
    key: o.key, label: o.label, kind: "decorative object", source: "shop-authored primitive shape", license: "shop-authored",
  })),
});

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Inventory normalization boundary (CMP-A08): landscapePriceNumber is the
// canonical catalog price basis (finite, nonnegative â€” an explicit 0 is a
// legitimate free material); landscapeCellSizeNumber is the positive
// dimension basis â€” a missing cell size is not a guessable 12", it is
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
      "the recorded site grid is malformed â€” repair or clear it before repricing");
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
        `site material ${JSON.stringify(key)} is not in the landscape catalog â€” pick a catalog material or erase it before repricing`);
    } else if (landscapePriceNumber(mat.cost_per_sqft) === null) {
      add("cost_per_sqft", "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`);
    }
  }
  return issues;
}

// Area/cost rollup for the recorded grid. The ported accumulation is kept
// verbatim for a fully priced grid â€” every line sqft and cost, and the total,
// are identical. An unpriceable line reports null amounts instead of the
// ported $0, and a null total propagates "unavailable" to the section totals.
export const landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = landscapeCellSizeNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt" || isVisualCellKey(key)) return;
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key];
    const rate = mat ? landscapePriceNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      cost: sqft === null || rate === null ? null : sqft * rate,
    };
  });
  const total = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  return { lines, total, issues: landscapeInputIssues(landscape) };
};