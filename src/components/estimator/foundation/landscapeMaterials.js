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

export const landscapeSummary = (landscape) => {
  const cells = landscape?.cells || {};
  const sqftPerCell = Math.pow((landscape?.cell_size_inches || 12) / 12, 2);
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(rows).map(([key, sqft]) => {
    const mat = materialByKey(key);
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      sqft,
      cost: sqft * (mat?.cost_per_sqft || 0),
    };
  });
  return { lines, total: lines.reduce((s, l) => s + l.cost, 0) };
};