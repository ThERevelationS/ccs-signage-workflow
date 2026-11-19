// Masonry height browser proof fixture — actual height-candidate WallsPanel +
// applied BOM, real calcProject, real styled primitives.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallsPanel from "./src/components/estimator/foundation/FoundationWallsPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const innerFixture = window.__INNER;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-masonry-project", updated_date: "synthetic-v1", project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls: clone(seed.project.walls), landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false } };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
let savedProject = clone(base);

if (mode === "blank") project.walls[0].heightInches = "";
if (mode === "zero") project.walls[0].heightInches = 0;
if (mode === "inner-blank") {
  project.walls = [clone(innerFixture.project.walls[0])];
  savedProject = { ...clone(base), walls: [clone(innerFixture.project.walls[0])] };
  inventory.splice(0, inventory.length, ...clone(innerFixture.inventory));
  Object.keys(settings).forEach((k) => delete settings[k]);
  Object.assign(settings, innerFixture.settings);
  project.walls[0].internalWallHeightInches = "";
}
if (mode === "new") {
  savedProject = { ...clone(base), walls: [] };
  project.walls = [{ ...clone(seed.project.walls[0]), component_id: "masonry-new-height", heightInches: "",
    calculatedCosts: { totalBricks: 6, materialCost: 12, mortarCost: 0, laborCost: 45, totalCost: 57 } }];
}

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
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
