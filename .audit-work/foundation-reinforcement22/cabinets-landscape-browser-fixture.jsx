// Cabinets/landscape browser proof fixture — real candidate panels
// (SignageCabinetsPanel + LandscapeDesigner), real calcProject consumers, real
// FoundationBOM (cabinets/landscape have no BOM rows — the pole row + delivery
// row and the banner flip are the BOM assertions), and the page section-total
// readout mirrored verbatim (held extras, "Not saved", handoff paused).
import React from "react";
import { createRoot } from "react-dom/client";
import SignageCabinetsPanel from "./src/components/estimator/foundation/SignageCabinetsPanel.jsx";
import LandscapeDesigner from "./src/components/estimator/foundation/LandscapeDesigner.jsx";
import FoundationBOM from "./src/components/estimator/foundation/FoundationBOM.jsx";
import { calcProject, money } from "./src/components/estimator/foundation/foundationCalc.js";
import { hasFoundationCostSnapshot } from "./src/components/estimator/foundation/foundationCatalogIntegrity.js";

const seed = window.__SEED;
const mode = new URLSearchParams(location.search).get("case") || "valid";
const clone = (o) => JSON.parse(JSON.stringify(o));

const base = clone(seed.project);
const project = clone(base);
const savedProject = clone(base);
const inventory = clone(seed.inventory);
const settings = clone(seed.settings);

if (mode === "held-bad-cabinet-qty") {
  project.signage_cabinets[0].quantity = 0;
}
if (mode === "held-missing-cabinet-price") {
  delete project.signage_cabinets[0].unit_cost;
}
if (mode === "held-missing-cell-size") {
  delete project.landscape.cell_size_inches;
}
if (mode === "held-unsaved-project") {
  project.signage_cabinets[0].quantity = 0;
  delete project.total_signage_cabinet_cost;
  delete savedProject.total_signage_cabinet_cost;
}
if (mode === "free-cabinet-zero") {
  project.signage_cabinets[0].unit_cost = 0;
}

const App = () => {
  const [proj, setProj] = React.useState(project);
  const [dirty, setDirty] = React.useState(false);
  const calc = calcProject(proj, inventory, settings, { savedProject });
  const pricingUnavailable = Boolean(calc.catalogIssues.length || calc.inputIssues.length);
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null
    ? null : calc.totals.grand_total + cabinetCost + landscapeCost;
  window.__M = { mode, project: proj, savedProject, inventory, settings, dirty,
    totals: calc.totals, catalogIssues: calc.catalogIssues, inputIssues: calc.inputIssues,
    signageCabinetPricing: calc.signageCabinetPricing, landscapePricing: calc.landscapePricing,
    cabinetCost, landscapeCost, sectionTotal, pricingUnavailable, writes: 0 };
  return (
    <div className="p-3 space-y-4 max-w-5xl">
      <div data-testid="cabinets-panel">
        <SignageCabinetsPanel
          cabinets={proj.signage_cabinets || []}
          items={calc.items || []}
          poles={calc.poles || []}
          onChange={(rows) => { setDirty(true); setProj((p) => ({ ...p, signage_cabinets: rows })); }}
        />
      </div>
      <div data-testid="landscape-panel">
        <LandscapeDesigner
          landscape={proj.landscape}
          onChange={(landscape) => { setDirty(true); setProj((p) => ({ ...p, landscape })); }}
        />
      </div>
      <div data-testid="section-totals" className="text-sm text-gray-700 space-y-1">
        <div className="flex justify-between"><span>Signage cabinets</span>
          <span>{hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved"}</span></div>
        <div className="flex justify-between"><span>Site landscaping</span>
          <span>{hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved"}</span></div>
        <div>Section total flowing to estimate: {pricingUnavailable
          ? <b className="text-amber-700">Estimate handoff paused</b>
          : <b className="text-red-700">{money(sectionTotal)}</b>}</div>
      </div>
      <div data-testid="bom">
        <FoundationBOM items={calc.items} poles={calc.poles} walls={calc.walls} delivery={calc.delivery}
          totals={calc.totals} inventory={inventory}
          itemPricing={calc.itemPricing} polePricing={calc.polePricing} wallPricing={calc.wallPricing}
          pricingUnavailable={pricingUnavailable} />
      </div>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
