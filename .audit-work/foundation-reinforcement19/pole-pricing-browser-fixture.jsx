// Pole-pricing browser proof fixture — pole candidates PolesPanel + BOM,
// pole-candidate poleCalculator/foundationCalc, real calcProject consumers.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationPolesPanel from "./src/components/estimator/foundation/FoundationPolesPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-pole-project", updated_date: "synthetic-v1", project_name: "P",
  items: [], poles: clone(seed.project.poles), wall_caps: [], selected_equipment: [],
  signage_cabinets: [], walls: [], landscape: { cell_size_inches: 12, cells: {} },
  customer_pricing: { applied: false },
  total_pole_cost: seed.project.total_pole_cost,
  total_pole_painting_cost: seed.project.total_pole_painting_cost };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
let savedProject = clone(base);

if (mode === "held-unavailable") {
  project.poles[0].pole_id = "gone-pole";
}
if (mode === "blank-height") {
  project.poles[0].height_inches = "";
}
if (mode === "new-unsaved") {
  // draft-only pole: the acknowledged basis (savedProject) has just the stock pole.
  savedProject = { ...clone(base), poles: [clone(base.poles[0])],
    total_pole_cost: 999, total_pole_painting_cost: 0 };
  project.poles = [clone(base.poles[0]),
    { component_id: "synthetic-pole-new", pole_id: "gone-pole", height_inches: 120,
      y_offset_inches: 36, include_pole_painting: false,
      pole_name: "rendered junk", pole_cost: 555, pole_painting_cost: 0, total_cost: 555 }];
}
if (mode === "free-price") {
  inventory[0].pole_stock_price = 0;
}
if (mode === "bad-paint") {
  settings.pole_paint_cost_per_lf = "bogus";
}

const options = inventory.filter((i) => i.material_type === "pole");
const App = () => {
  const [proj, setProj] = React.useState(project);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length);
  window.__M = { mode, project: proj, savedProject, inventory, settings, poles: calc.poles,
    totals: calc.totals, catalogIssues: calc.catalogIssues, polePricing: calc.polePricing,
    itemPricing: calc.itemPricing, pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="poles-panel">
        <FoundationPolesPanel poles={calc.poles} options={options} items={calc.items}
          polePricing={calc.polePricing}
          onChange={(poles) => setProj((p) => ({ ...p, poles }))} />
      </div>
      <div data-testid="bom">
        <FoundationBOM poles={calc.poles} walls={calc.walls} totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} polePricing={calc.polePricing}
          pricingUnavailable={pricingUnavailable} />
      </div>
      <div data-testid="totals" className="text-sm text-gray-700">
        <div data-total="grand">{calc.totals.grand_total == null ? "null" : String(calc.totals.grand_total)}</div>
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
