import React from "react";
import { createRoot } from "react-dom/client";
import Page from "@/pages/FoundationEstimator";
import captured from "./versioned-persistence-frozen-inputs.json";

const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const baseline = freeze({
  id: "browser-source", updated_date: "2026-11-07T12:00:00.000Z", project_name: "Synthetic reinforcement workflow", client_name: "Synthetic only",
  items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
    depth_inches: 36, include_rebar: true, include_finishing: true, rebar_size: "#4", rebar_cost: 262.8, item_total_cost: 439.05,
    reinforcement_proposal: structuredClone(captured.rawDraft) }],
  signage_cabinets: [{ unit_cost: 12, quantity: 2 }], landscape: { cell_size_inches: 12, cells: { "0,0": "grass" } },
});
const env = {
  baseline, baselineJSON: JSON.stringify(baseline), row: structuredClone(baseline),
  inventory: freeze([{ id: "catalog-rebar", material_type: "rebar", rebar_size: "#4", material_name: "Synthetic catalog bar",
    cost_per_unit: 2, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668, unit: "ft" }]),
  calls: [], version: 1, nav: [], forbidden: [],
};
window.__foundationBrowser = env;
createRoot(document.getElementById("root")).render(<Page />);
