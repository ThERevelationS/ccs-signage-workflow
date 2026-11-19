// O-030 browser proof fixture — candidate foundationConstructionChecks +
// foundationCalc, real calcProject consumers: the page's diagnostics region
// markup (catalog alert / input alert / construction-checks status — copied
// byte-for-byte from the candidate FoundationEstimator.jsx render branch),
// ConcreteDeliveryPanel, FoundationItemCard, FoundationBOM. Modes mirror the
// model/page harness mutations.
import React from "react";
import { createRoot } from "react-dom/client";
import ConcreteDeliveryPanel from "./src/components/estimator/foundation/ConcreteDeliveryPanel.jsx";
import FoundationItemCard from "./src/components/estimator/foundation/FoundationItemCard.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject } from "./src/components/estimator/foundation/foundationCalc.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "advisory-spoil";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = { id: "synthetic-o030-project", updated_date: "synthetic-v1", project_name: "P",
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

if (mode === "advisory-set") {
  project.items[0] = { ...project.items[0],
    excavation_method: "equipment_excavation",
    include_finishing: false,
    include_rebar: true, rebar_size: "#4",
    rebar_spacing_length: 12, rebar_spacing_width: 12, rebar_layers: 1 };
  project.excavation_method = "equipment_excavation";
  project.project_concrete_type = "fast_set";
  project.project_concrete_admixtures = ["calcium_chloride", "set_retarding"];
}
if (mode === "advisory-bagged") {
  project.items[0] = { ...project.items[0], selected_concrete_id: "synthetic-bagged" };
  project.project_concrete_admixtures = ["fibers", "winter_service"];
}
if (mode === "blocked-advisory") {
  project.items[0] = { ...project.items[0], length_inches: 0, include_finishing: false };
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
  const catalogBlocked = Boolean(calc.catalogIssues?.length);
  const inputIssues = calc.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingUnavailable = catalogBlocked || inputBlocked;
  const constructionWarnings = calc.constructionWarnings || [];
  window.__M = { mode, project: { ...proj, items }, savedProject, inventory, settings,
    delivery: calc.delivery, totals: calc.totals, catalogIssues: calc.catalogIssues,
    inputIssues: calc.inputIssues, constructionWarnings: calc.constructionWarnings,
    itemPricing: calc.itemPricing, pricingUnavailable, writes: 0 };
  const patchItem = (index, patch) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      {catalogBlocked && (
        <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <div className="font-semibold">Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused.</div>
          <ul className="mt-1 list-disc pl-5">
            {calc.catalogIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
          </ul>
        </div>
      )}

      {inputBlocked && (
        <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <div className="font-semibold">Design input required: fix highlighted design inputs below. Save and estimate handoff are paused.</div>
          <ul className="mt-1 list-disc pl-5">
            {inputIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
          </ul>
        </div>
      )}

      {constructionWarnings.length > 0 && (
        <div data-testid="construction-warnings" role="status" className="mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
          <span className="font-semibold">Construction checks — verify before build</span>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {constructionWarnings.map((warning, i) => (
              <li key={`${warning.code}-${warning.kind}-${warning.index ?? ""}-${i}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}

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
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
