// Supplier-defaults browser proof fixture — candidate legacyFoundationCalc +
// foundationCalc + ConcreteDeliveryPanel, real calcProject consumers, real
// FoundationBOM (delivery row + pricing banner are the BOM assertions).
import React from "react";
import { createRoot } from "react-dom/client";
import ConcreteDeliveryPanel from "./src/components/estimator/foundation/ConcreteDeliveryPanel.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-supplier-project", updated_date: "synthetic-v1", project_name: "P",
  project_concrete_type: seed.project.project_concrete_type,
  project_concrete_admixtures: [...seed.project.project_concrete_admixtures],
  items: clone(seed.project.items), walls: [], poles: [], wall_caps: [],
  selected_equipment: [], signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
  excavation_method: seed.project.excavation_method,
  total_concrete_cost: seed.project.total_concrete_cost,
  concrete_delivery_snapshot: clone(seed.project.concrete_delivery_snapshot) };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
const savedProject = clone(base);
const SUP = "synthetic-readymix";

if (mode === "held-missing-mix") {
  delete inventory.find((i) => i.id === SUP).mix_4000_price;
}
if (mode === "held-missing-fee") {
  delete inventory.find((i) => i.id === SUP).small_load_fee_1_1_75;
}
if (mode === "held-unsaved") {
  delete inventory.find((i) => i.id === SUP).mix_4000_price;
  delete project.concrete_delivery_snapshot;
  delete project.total_concrete_cost;
  delete savedProject.concrete_delivery_snapshot;
  delete savedProject.total_concrete_cost;
}
if (mode === "free-fuel-zero") {
  inventory.find((i) => i.id === SUP).fuel_surcharge = 0;
}
if (mode === "no-supplier") {
  project.items[0].selected_concrete_id = "";
}
if (mode === "partial-catalog") {
  delete inventory.find((i) => i.id === SUP).mix_5000_price;
  delete inventory.find((i) => i.id === SUP).admix_fibers_price;
}

const App = () => {
  const [proj, setProj] = React.useState(project);
  const [dirty, setDirty] = React.useState(false);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
  window.__M = { mode, project: proj, savedProject, inventory, settings, dirty,
    delivery: calc.delivery, totals: calc.totals, catalogIssues: calc.catalogIssues,
    inputIssues: calc.inputIssues, itemPricing: calc.itemPricing,
    pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="delivery-panel">
        <ConcreteDeliveryPanel project={proj} delivery={calc.delivery}
          onChange={(patch) => { setProj((p) => ({ ...p, ...patch })); setDirty(true); }} />
      </div>
      <div data-testid="bom">
        <FoundationBOM items={calc.items} poles={calc.poles} walls={calc.walls} delivery={calc.delivery}
          totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} polePricing={calc.polePricing} wallPricing={calc.wallPricing}
          pricingUnavailable={pricingUnavailable} />
      </div>
      <div data-testid="totals" className="text-sm text-gray-700">
        <div data-total="grand">{calc.totals.grand_total == null ? "null" : String(calc.totals.grand_total)}</div>
        <div data-total="concrete">{calc.totals.total_concrete_cost == null ? "null" : String(calc.totals.total_concrete_cost)}</div>
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
