// Settings+catalog browser proof fixture — candidate legacyFoundationCalc +
// foundationInputValidation + foundationCalc + foundationEquipmentBindings,
// real calcProject consumers: ConcreteDeliveryPanel (acknowledged delivery
// banner), FoundationItemCard (per-item held banner + issue messages),
// FoundationBOM (delivery row + pricing banner). Modes mirror the page
// harness mutations; the item inherits the project hand_dig method.
import React from "react";
import { createRoot } from "react-dom/client";
import ConcreteDeliveryPanel from "./src/components/estimator/foundation/ConcreteDeliveryPanel.jsx";
import FoundationItemCard from "./src/components/estimator/foundation/FoundationItemCard.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-settings-project", updated_date: "synthetic-v1", project_name: "P",
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

if (mode === "held-malformed-setting") {
  settings.foundation_pouring_cost_per_cy = "abc";
}
if (mode === "held-partial-setting") {
  settings.foundation_hand_dig_time_per_cy = "12abc";
}
if (mode === "held-import-nan-setting") {
  settings.foundation_main_labor_rate = "NaN";
}
if (mode === "free-zero-setting") {
  settings.foundation_hand_dig_time_per_cy = "0";
}
if (mode === "invalid-item-method") {
  project.items[0].excavation_method = "bulldozer";
}

const catalog = {
  concrete: inventory.filter((i) => ["concrete_service", "bagged_concrete"].includes(i.material_type) && i.show_in_foundation !== false),
  poles: inventory.filter((i) => i.material_type === "pole"),
  walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
  fill: inventory.filter((i) => i.material_type === "fill_material"),
  forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
  caps: inventory.filter((i) => i.material_type === "wall_cap"),
  equipment: inventory.filter((i) => i.material_type === "excavation_equipment"),
};

const App = () => {
  const [proj, setProj] = React.useState(project);
  const [items, setItems] = React.useState(proj.items);
  const calc = calcProject({ ...proj, items }, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
  window.__M = { mode, project: { ...proj, items }, savedProject, inventory, settings,
    delivery: calc.delivery, totals: calc.totals, catalogIssues: calc.catalogIssues,
    inputIssues: calc.inputIssues, itemPricing: calc.itemPricing,
    landscapePricing: calc.landscapePricing, pricingUnavailable, writes: 0 };
  const patchItem = (index, patch) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="delivery-panel">
        <ConcreteDeliveryPanel project={proj} delivery={calc.delivery}
          onChange={(patch) => setProj((p) => ({ ...p, ...patch }))} />
      </div>
      {calc.items.map((item, index) => (
        <div key={item.component_id || index} data-testid={`item-card-${index}`}>
          <FoundationItemCard item={item} index={index} catalog={catalog}
            pricing={calc.itemPricing[index]}
            onChange={patchItem} onRemove={() => {}} onDuplicate={() => {}} />
        </div>
      ))}
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
