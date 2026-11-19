// Masonry residual-input browser proof fixture — wall/item candidates
// WallsPanel + ItemCard + BOM, candidate wallCalculator/foundationCalc/
// foundationInputValidation, real calcProject consumers.
import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallsPanel from "./src/components/estimator/foundation/FoundationWallsPanel.jsx";
import FoundationItemCard from "./src/components/estimator/foundation/FoundationItemCard.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-masonry-project", updated_date: "synthetic-v1", project_name: "P",
  items: clone(seed.project.items), walls: clone(seed.project.walls), poles: [], wall_caps: [],
  selected_equipment: [], signage_cabinets: [],
  landscape: { cell_size_inches: 12, cells: {} }, customer_pricing: { applied: false },
  excavation_method: seed.project.excavation_method,
  total_wall_cost: seed.project.total_wall_cost,
  total_brick_cost: seed.project.total_brick_cost,
  total_fill_cost: seed.project.total_fill_cost,
  concrete_delivery_snapshot: clone(seed.project.concrete_delivery_snapshot) };
const project = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);
const savedProject = clone(base);

if (mode === "held-bad-mortar") {
  project.walls[0].mortarGapInches = "abc";
}
if (mode === "held-bad-setting") {
  settings.wall_labor_bricks_per_hour = "0";
}
if (mode === "held-bad-override") {
  // Material-level quantity/rate overrides live on the catalog row, matching
  // the ported custom_cost_per_unit treatment.
  inventory.find((i) => i.id === "synthetic-wall-brick").custom_outer_material_qty = "abc";
}
if (mode === "free-mortar-zero") {
  project.walls[0].mortarGapInches = 0;
  project.walls[0].internalMortarGapInches = 0;
}
if (mode === "bad-item-override") {
  project.items[0].custom_concrete_cost_per_cy = "abc";
}

const wallOptions = inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type));
const catalog = {
  concrete: inventory.filter((i) => ["concrete_service", "bagged_concrete"].includes(i.material_type)),
  walls: wallOptions,
  forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
};
const App = () => {
  const [proj, setProj] = React.useState(project);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
  window.__M = { mode, project: proj, savedProject, inventory, settings, walls: calc.walls,
    items: calc.items, totals: calc.totals, catalogIssues: calc.catalogIssues,
    inputIssues: calc.inputIssues, wallPricing: calc.wallPricing, itemPricing: calc.itemPricing,
    pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="item-panel">
        {calc.items.map((item, index) => (
          <FoundationItemCard key={item.component_id || index} item={item} index={index}
            pricing={calc.itemPricing[index]} catalog={catalog}
            onChange={(i, patch) => setProj((p) => ({ ...p, items: p.items.map((x, k) => k === i ? { ...x, ...patch } : x) }))}
            onRemove={() => {}} onDuplicate={() => {}} />
        ))}
      </div>
      <div data-testid="walls-panel">
        <FoundationWallsPanel walls={calc.walls} options={wallOptions}
          wallPricing={calc.wallPricing}
          onChange={(walls) => setProj((p) => ({ ...p, walls }))} />
      </div>
      <div data-testid="bom">
        <FoundationBOM items={calc.items} poles={calc.poles} walls={calc.walls} delivery={calc.delivery}
          totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} polePricing={calc.polePricing} wallPricing={calc.wallPricing}
          pricingUnavailable={pricingUnavailable} />
      </div>
      <div data-testid="totals" className="text-sm text-gray-700">
        <div data-total="grand">{calc.totals.grand_total == null ? "null" : String(calc.totals.grand_total)}</div>
        <div data-total="wall">{calc.totals.total_wall_cost == null ? "null" : String(calc.totals.total_wall_cost)}</div>
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
