import React from "react";
import { createRoot } from "react-dom/client";
import Dialog from "@/components/masterInventory/FoundationMaterialDialog";
import { GenericItemForm } from "@/pages/FoundationInventory";

const mode = new URLSearchParams(location.search).get("mode");
const record = Object.freeze({ id: "synthetic-catalog", updated_date: "synthetic-version",
  material_type: "rebar", material_name: "Synthetic bar", unit: "lf", rebar_size: "#4",
  cost_per_unit: 2, rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 });
window.__catalogMetaBrowser = {
  record, baseline: JSON.stringify(record), calls: [], saved: 0, forbidden: [], mockedIO: true,
  realBase44StorageVerified: false, explicitNullClearReadbackVerified: false,
};
const env = window.__catalogMetaBrowser;
createRoot(document.getElementById("root")).render(
  <main className="mx-auto max-w-3xl p-4">
    <h1 className="text-lg font-bold mb-4">Offline synthetic Foundation catalog verification</h1>
    {mode === "legacy"
      ? <GenericItemForm tabKey="rebar" item={record} onSave={data => env.calls.push(["legacy", structuredClone(data)])} onCancel={() => {}} />
      : <Dialog open record={mode === "new" ? null : record} defaultType="rebar" onClose={() => {}} onSaved={() => { env.saved += 1; }} />}
  </main>
);
