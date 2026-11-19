// Masonry outline browser proof fixture — outline candidates Panel + Editor,
// outline-candidate wallCalculator, real BOM + calcProject.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallsPanel from "./src/components/estimator/foundation/FoundationWallsPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid-string";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-masonry-project", updated_date: "synthetic-v1", project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls: clone(seed.project.walls), landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false } };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
let savedProject = clone(base);

if (mode === "valid-string") {
  project.walls[0].shape = { ...project.walls[0].shape,
    segments: project.walls[0].shape.segments.map((s) => ({ ...s, length: String(s.length) })) };
}
if (mode === "empty-acknowledged") {
  project.walls[0].shape = { points: [], closed: false, segments: [] };
}
if (mode === "points-mismatch") {
  project.walls[0].shape = { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }], closed: true,
    segments: [{ length: 8 }, { length: 8 }, { length: 8 }, { length: 8 }, { length: 9 }] };
}
if (mode === "malformed-points") {
  project.walls[0].shape = { points: [{ x: 0, z: 0 }, { x: null, z: "bad" }], closed: false,
    segments: [{ length: 16 }] };
}
if (mode === "new-unknown") {
  savedProject = { ...clone(base), walls: [] };
  project.walls = [{ ...clone(seed.project.walls[0]), component_id: "masonry-new-outline",
    shape: { points: [], closed: false, segments: [] },
    calculatedCosts: { totalBricks: 6, materialCost: 12, mortarCost: 0, laborCost: 45, totalCost: 57 } }];
}
// legacy-lengths-only: seed shape already {closed:false, segments:[{length:16}]} (no points)

const options = inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type));
const App = () => {
  const [proj, setProj] = React.useState(project);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length);
  window.__M = { mode, project: proj, savedProject, inventory, settings, walls: calc.walls,
    totals: calc.totals, catalogIssues: calc.catalogIssues, itemPricing: calc.itemPricing,
    pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="walls-panel">
        <FoundationWallsPanel walls={calc.walls} options={options}
          onChange={(walls) => setProj((p) => ({ ...p, walls }))} />
      </div>
      <div data-testid="bom">
        <FoundationBOM walls={calc.walls} totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} pricingUnavailable={pricingUnavailable} />
      </div>
      <div data-testid="totals" className="text-sm text-gray-700">
        <div data-total="grand">{calc.totals.grand_total == null ? "null" : String(calc.totals.grand_total)}</div>
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
