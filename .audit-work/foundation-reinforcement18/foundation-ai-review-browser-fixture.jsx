import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AiEngineeringAssistant from "../../src/components/estimator/foundation/AiEngineeringAssistant";

const mode = new URLSearchParams(location.search).get("mode") || "success";
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const initial = freeze({
  id: "synthetic-ai-native", updated_date: "synthetic-loaded",
  items: [{ foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36, depth_inches: 36,
    include_rebar: false, rebar_cost: 0, custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0, item_total_cost: 288.25 }],
  poles: [], project_concrete_type: "Synthetic mix", engineering_approved: false, procurement_ready: false,
  ...(mode === "legacy" ? { ai_engineering_recommendation: "Saved historical note. Engineering has not been verified.",
    ai_engineering_data: { adequate: true, assumed_wind_speed_mph: 115 } } : {}),
});
const response = freeze({
  recommendation_markdown: "# Preliminary\nVerify site criteria with a qualified engineer.\n\n<script>window.__aiExecuted=true</script>\n\n[Unsafe](javascript:alert(1))",
  information_gaps: ["Verify site-specific wind and soil criteria."],
});
let resolve;
const pending = new Promise(done => { resolve = done; });
const capture = window.__foundationAiNative = {
  calls: [], patches: [], setups: 0, cleanups: 0, current: initial,
  async invoke(request) {
    capture.calls.push(structuredClone(request));
    if (mode === "stale" || mode === "unmount") return pending;
    return mode === "invalid" ? { ...response, adequate: true, rebar_cost: 999 } : response;
  },
  resolve: () => resolve(response),
};
const financial = project => JSON.stringify(project.items.map(item => ({
  quantity: item.quantity, rebar_cost: item.rebar_cost, custom_rebar_qty: item.custom_rebar_qty,
  custom_rebar_cost_per_ft: item.custom_rebar_cost_per_ft, item_total_cost: item.item_total_cost,
})));
const original = financial(initial);
window.__foundationAiNativeInspect = () => ({
  calls: capture.calls, patches: capture.patches, setups: capture.setups, cleanups: capture.cleanups,
  financialUnchanged: financial(capture.current) === original,
  engineeringApproved: capture.current.engineering_approved, procurementReady: capture.current.procurement_ready,
  aiMetadata: capture.current.ai_engineering_data, scriptExecuted: !!window.__aiExecuted,
});
function App() {
  const [project, setProject] = useState(initial), [visible, setVisible] = useState(true);
  useEffect(() => { capture.setups += 1; return () => { capture.cleanups += 1; }; }, []);
  capture.current = project;
  return <main className="mx-auto max-w-4xl p-4">
    <h1 className="mb-3 text-lg font-semibold">Offline synthetic preliminary AI review</h1>
    <div className="flex flex-wrap gap-2 mb-3">
      <button type="button" className="border px-2 py-1 text-xs" onClick={() => setProject(current =>
        freeze({ ...current, items: current.items.map(item => ({ ...item, depth_inches: 48 })) }))}>Change Foundation Depth</button>
      <button type="button" className="border px-2 py-1 text-xs" onClick={() => setVisible(false)}>Unmount Assistant</button>
    </div>
    {visible && <AiEngineeringAssistant project={project} onResult={patch => {
      capture.patches.push(structuredClone(patch));
      setProject(current => freeze({ ...current, ...patch }));
      return true;
    }} />}
    <p className="text-xs text-gray-600">All requests and records are synthetic. No Base44 API or paid model call is available.</p>
  </main>;
}
createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
