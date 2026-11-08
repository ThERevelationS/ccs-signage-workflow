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
];

export const materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);

export const GRID_COLS = 24;
export const GRID_ROWS = 16;

const isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Inventory normalization boundary (CMP-A08): landscapePriceNumber is the
// canonical catalog price basis (finite, nonnegative — an explicit 0 is a
// legitimate free material); landscapeCellSizeNumber is the positive
// dimension basis — a missing cell size is not a guessable 12", it is
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
      "the recorded site grid is malformed — repair or clear it before repricing");
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
    const mat = materialByKey(key);
    if (!mat) {
      add("cells", "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog — pick a catalog material or erase it before repricing`);
    } else if (landscapePriceNumber(mat.cost_per_sqft) === null) {
      add("cost_per_sqft", "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`);
    }
  }
  return issues;
}

// Area/cost rollup for the recorded grid. The ported accumulation is kept
// verbatim for a fully priced grid — every line sqft and cost, and the total,
// are identical. An unpriceable line reports null amounts instead of the
// ported $0, and a null total propagates "unavailable" to the section totals.
export const landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = landscapeCellSizeNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
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
