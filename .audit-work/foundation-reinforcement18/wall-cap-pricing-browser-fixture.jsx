import React from "react";
import { createRoot } from "react-dom/client";
import FoundationWallCapsPanel from "../../src/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationTotals from "../../src/components/estimator/foundation/FoundationTotals";
import FoundationBOM from "../../src/components/estimator/foundation/FoundationBOM";
import { calcProject } from "../../src/components/estimator/foundation/foundationCalc";

const mode = new URLSearchParams(location.search).get("mode") || "saved";
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cap = { component_id: "cap-one", id: "cap-one", cap_inventory_id: "inventory-one",
  length_inches: 18, cost: 21, stock_length_inches: 48, cap_name: "Acknowledged cap" };
if (mode === "unknown") delete cap.cost;
const project = freeze({ id: "synthetic-cap-browser", items: [], poles: [], walls: [],
  selected_equipment: [], wall_caps: [cap] });
const inventory = freeze([{ id: "inventory-one", material_type: "wall_cap", material_name: "Synthetic current cap",
  cap_stock_price: mode === "zero" ? 0 : mode === "current" ? 25 : null, cap_stock_length_inches: 48 }]);
const original = JSON.stringify(project);
const calc = calcProject(project, inventory);
const blocked = calc.catalogIssues.length > 0;
window.__wallCapPricingInspect = () => ({
  sourceUnchanged: JSON.stringify(project) === original,
  total: calc.totals.total_wall_cap_cost, grandTotal: calc.totals.grand_total,
  capCost: calc.wallCaps[0].cost ?? null, length: calc.wallCaps[0].length_inches,
  groups: calc.totals.wall_caps_by_material, issues: calc.catalogIssues,
});
createRoot(document.getElementById("root")).render(<main className="p-4 mx-auto max-w-5xl space-y-3">
  <h1 className="text-lg font-semibold">Offline wall-cap pricing</h1>
  <p className="text-xs">Synthetic records only. Full stock price per cut piece; no storage or external calls.</p>
  {blocked && <div role="alert" className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs">
    {calc.catalogIssues.map(issue => <p key={issue.code}>{issue.message}</p>)}
  </div>}
  <section data-testid="cap-panel"><FoundationWallCapsPanel caps={calc.wallCaps} options={inventory}
    onChange={() => { throw Error("This read-only visual fixture does not write or alter source records"); }} /></section>
  <section data-testid="totals-panel"><FoundationTotals totals={calc.totals} pricingUnavailable={blocked} /></section>
  <section data-testid="bom-panel"><FoundationBOM totals={calc.totals} inventory={inventory}
    pricingUnavailable={blocked} /></section>
</main>);
