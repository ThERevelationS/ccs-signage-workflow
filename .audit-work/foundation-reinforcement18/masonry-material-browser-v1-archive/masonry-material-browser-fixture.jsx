// Masonry browser proof fixture — renders the actual candidate WallsPanel +
// BOM with real calcProject, real styled primitives, real lucide icons.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallsPanel from "./src/components/estimator/foundation/FoundationWallsPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const clone = (o) => JSON.parse(JSON.stringify(o));
const mode = new URLSearchParams(location.search).get("mode") || "valid";

const project = { id: "synthetic-masonry-project", updated_date: "synthetic-v1", project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls: clone(seed.project.walls), landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false } };
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
let savedProject = clone(project);

if (mode === "held") { delete inventory[0].cost_per_unit; }
if (mode === "new") {
  delete inventory[0].cost_per_unit;
  savedProject = { ...clone(project), walls: [] };
  project.walls = [{ ...clone(seed.project.walls[0]), component_id: "masonry-new-wall",
    calculatedCosts: { totalBricks: 6, materialCost: 12, mortarCost: 0, laborCost: 45, totalCost: 57 } }];
}
if (mode === "zero") { inventory[0].cost_per_unit = 0; }
if (mode === "inner") {
  inventory.push({ id: "inner-mat", material_type: "wall_material", material_name: "InnerMat",
    wall_material_subtype: "brick", wall_unit_length_inches: 8, wall_unit_width_inches: 4,
    wall_unit_height_inches: 4, cost_per_unit: null });
  project.walls[0].includeInternalWall = true;
  project.walls[0].internalMaterialId = "inner-mat";
}
if (mode === "both") {
  delete inventory[0].cost_per_unit;
  project.walls[0].includeInternalWall = true;
  project.walls[0].internalMaterialId = "missing-inner";
}

const calc = calcProject(project, inventory, settings, { savedProject });
const pricingUnavailable = Boolean(calc.catalogIssues.length);
const options = inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type));
window.__M = { mode, project, savedProject, inventory, settings, walls: calc.walls,
  totals: calc.totals, catalogIssues: calc.catalogIssues,
  itemPricing: calc.itemPricing, pricingUnavailable, writes: 0 };

const App = () => (
  <div className="p-3 space-y-4 max-w-5xl">
    <div data-testid="walls-panel">
      <FoundationWallsPanel walls={calc.walls} options={options} onChange={() => {}} />
    </div>
    <div data-testid="bom">
      <FoundationBOM walls={calc.walls} totals={calc.totals} inventory={inventory}
        itemPricing={calc.itemPricing} pricingUnavailable={pricingUnavailable} />
    </div>
  </div>
);
createRoot(document.getElementById("root")).render(<App />);
