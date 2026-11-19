// Equipment-pricing browser proof fixture — candidate FoundationEquipmentTab +
// foundationCalc, real calcProject consumers, real FoundationBOM (equipment has
// no BOM rows — the banner flip and row absence are the BOM assertions).
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationEquipmentTab from "./src/components/estimator/foundation/FoundationEquipmentTab.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-equipment-project", updated_date: "synthetic-v1", project_name: "P",
  items: clone(seed.project.items), walls: [], poles: [], wall_caps: [],
  selected_equipment: clone(seed.project.selected_equipment), signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
  excavation_method: seed.project.excavation_method,
  total_equipment_cost: seed.project.total_equipment_cost,
  concrete_delivery_snapshot: clone(seed.project.concrete_delivery_snapshot) };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
const savedProject = clone(base);

if (mode === "held-bad-duration") {
  project.selected_equipment[0].rental_duration = "abc";
}
if (mode === "held-missing-price") {
  delete inventory.find((i) => i.id === "synthetic-excavator").cost_per_day;
}
if (mode === "held-bad-custom-qty") {
  project.selected_equipment[0].custom_qty = "abc";
}
if (mode === "held-unsaved-row") {
  project.selected_equipment.push({
    _id: "eq-draft-1", equipment_id: "synthetic-compactor",
    rental_period: "day", rental_duration: "abc",
    attachment_counts: {}, sub_attachment_counts: {},
  });
}
if (mode === "free-rate-zero") {
  project.selected_equipment[0].custom_rate = 0;
}

const App = () => {
  const [proj, setProj] = React.useState(project);
  const [dirty, setDirty] = React.useState(false);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
  window.__M = { mode, project: proj, savedProject, inventory, settings, dirty,
    equipment: calc.equipment, totals: calc.totals, catalogIssues: calc.catalogIssues,
    inputIssues: calc.inputIssues, equipmentPricing: calc.equipmentPricing,
    pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="equipment-panel">
        <FoundationEquipmentTab
          foundationItems={proj.items || []}
          inventory={inventory}
          selectedEquipmentList={proj.selected_equipment || []}
          onUpdate={(rows) => setProj((p) => ({ ...p, selected_equipment: rows }))}
          markDirty={() => setDirty(true)}
        />
      </div>
      <div data-testid="bom">
        <FoundationBOM items={calc.items} poles={calc.poles} walls={calc.walls} delivery={calc.delivery}
          totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} polePricing={calc.polePricing} wallPricing={calc.wallPricing}
          pricingUnavailable={pricingUnavailable} />
      </div>
      <div data-testid="totals" className="text-sm text-gray-700">
        <div data-total="grand">{calc.totals.grand_total == null ? "null" : String(calc.totals.grand_total)}</div>
        <div data-total="equipment">{calc.totals.total_equipment_cost == null ? "null" : String(calc.totals.total_equipment_cost)}</div>
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
