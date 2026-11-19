// Masonry rates browser proof fixture — actual applied WallsPanel + BOM +
// RatesPanel, real calcProject driven by the rate-zero wallCalculator candidate.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallsPanel from "./src/components/estimator/foundation/FoundationWallsPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import FoundationRatesPanel from "./src/components/estimator/foundation/FoundationRatesPanel.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const cases = window.__CASES;
const clone = (o) => JSON.parse(JSON.stringify(o));
const caseId = new URLSearchParams(location.search).get("case") || cases[0].id;
const tc = cases.find((c) => c.id === caseId) || cases[0];

const project = { id: "synthetic-masonry-project", updated_date: "synthetic-v1", project_name: "P",
  items: [], poles: [], wall_caps: [], selected_equipment: [], signage_cabinets: [],
  walls: clone(seed.project.walls), landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false } };
if (tc.wallPatch) Object.assign(project.walls[0], tc.wallPatch);
const inventory = clone(seed.inventory);
if (tc.outerMaterialPatch) Object.assign(inventory[0], tc.outerMaterialPatch);
if (tc.additionalInventory) inventory.push(...clone(tc.additionalInventory));
const settings = clone(tc.settings);
const savedProject = clone(project);

const calc = calcProject(project, inventory, settings, { savedProject });
const pricingUnavailable = Boolean(calc.catalogIssues.length);
const options = inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type));
window.__M = { caseId, project, savedProject, inventory, settings, walls: calc.walls,
  totals: calc.totals, catalogIssues: calc.catalogIssues, itemPricing: calc.itemPricing,
  pricingUnavailable, writes: 0 };

const App = () => (
  <div className="p-3 space-y-4 max-w-5xl">
    <div data-testid="rates-panel">
      <FoundationRatesPanel settings={settings} project={project} onChange={() => {}} />
    </div>
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
