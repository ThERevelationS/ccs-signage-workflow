import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import Panel from "@/components/estimator/foundation/FoundationReinforcementProposalPanel";

const deepFreeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};
window.__held = [];
window.__calls = [];
const hold = value => {
  deepFreeze(value);
  window.__held.push({ value, before: JSON.stringify(value) });
  return value;
};
window.__blank = () => ({
  schema_version: 1,
  design: { version: 2, bar_diameter_inches: "", cover_inches: { side: "", top: "", bottom: "" },
    supports: { mode: "unconfigured", reason: "" }, spread: { mats: [], inter_mat_ties: [] },
    pillar: { hoops: [], longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" } } },
  material: { kind: "manual", unit: "ft", name: "", reason: "", bar_diameter_inches: "", weight_lb_per_ft: "", cost_per_ft: "" },
  overrides: { quantity_ft: null, cost_per_ft: null },
});
window.__preview = () => ({ id: "preview-exact", canAccept: true, stale: false,
  costs: [{ label: "Current steel", value: "$252.80", provenance: "Saved acknowledged amount with a deliberately long provenance that must wrap without losing its meaning" },
    { label: "Proposed steel", value: "$112.00", provenance: "Fresh internal steel projection" }],
  quantities: [{ label: "Steel length", before: "64 ft", after: "20 ft" }],
  issues: [{ code: "engineering_review", severity: "warning", message: "Engineering review remains separate; this preview is not approval." }],
});
function App() {
  const [draft, setDraft] = useState(null), [preview, setPreview] = useState(null);
  const [flags, setFlags] = useState({}), [type, setType] = useState("spread_foot"), [version, setVersion] = useState(2);
  const [catalog, setCatalog] = useState([{ id: "missing-meta", material_name: "#9 without verified metadata" }]);
  const item = useMemo(() => hold({ component_id: "fixture-component", foundation_type: type,
    reinforcement_calculation_version: version, custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0 }), [type, version]);
  const adopt = value => setDraft(hold(value));
  window.__adopt = adopt; window.__setPreview = setPreview; window.__setFlags = setFlags;
  window.__setType = setType; window.__setVersion = setVersion; window.__setCatalog = setCatalog;
  window.__draft = draft; window.__item = item;
  window.__renderedPreview = preview; window.__renderedFlags = flags;
  const log = (...args) => window.__calls.push(args);
  return <Panel item={item} draft={draft} preview={preview} catalog={catalog} {...flags}
    onStart={() => { log("start"); adopt(window.__blank()); }}
    onDraftChange={value => { log("change", structuredClone(value)); adopt(value); }}
    onPreview={() => log("preview")} onAccept={id => log("accept", id)}
    onDiscard={() => log("discard")} />;
}
createRoot(document.getElementById("root")).render(<App />);
