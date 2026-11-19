import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Box3, Vector3 } from "three";
import Foundation3DPreview from "../../src/components/estimator/foundation/Foundation3DPreview";

const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const mode = new URLSearchParams(location.search).get("mode") || "recorded";
const design = {
  version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: { mode: "off", reason: "Synthetic preview exclusion only, not structural advice." },
  spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] },
};
const first = {
  component_id: "saved-anchor-a", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36, x_inches: 120, z_inches: 240,
  grade_offset_inches: 12, rotation_degrees: 90, include_rebar: true,
  reinforcement_calculation_version: 2, reinforcement_design: design,
  rebar_cost: 40, rebar_labor_cost: 72.00000000000001,
  custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0,
};
let items = [{ ...first, selected_pole_id: "synthetic-pole", pole_total_height_inches: 120 },
  { ...first, component_id: "saved-anchor-b", x_inches: 360, z_inches: 120, grade_offset_inches: 0, rotation_degrees: 0 }];
let poles = [{ x_inches: 60, z_inches: 60, height_inches: 120, y_offset_inches: 12 }];
if (mode === "legacy-height") {
  items = [{ ...first, selected_pole_id: "synthetic-pole" }]; poles = [];
}
if (mode === "invalid-poles") {
  items = [first];
  poles = [{ x_inches: "broken", z_inches: 60, height_inches: 120 }, { x_inches: 60, z_inches: 60, height_inches: 0 }];
}
if (mode === "quantity") { items = [{ ...first, quantity: 3 }]; poles = []; }
if (mode === "wide-layout") {
  items = [{ ...first, x_inches: 0, z_inches: 0 },
    { ...first, component_id: "saved-anchor-b", x_inches: 2400, z_inches: 0 }];
  poles = [];
}
const initial = freeze({ id: "synthetic-layout-" + mode, items, poles,
  procurement_ready: false, engineering_approved: false });
let current = initial, captured = JSON.stringify(initial);
const financialData = project => JSON.stringify(project.items.map(item => ({
  quantity: item.quantity, rebar_cost: item.rebar_cost, rebar_labor_cost: item.rebar_labor_cost,
  custom_rebar_qty: item.custom_rebar_qty, custom_rebar_cost_per_ft: item.custom_rebar_cost_per_ft,
})));
const financialCapture = financialData(initial);
window.__savedLayoutCapture = { created: 0, disposed: 0, frames: 0, glErrors: [], wantPixels: false };
window.__savedLayoutInspect = () => {
  const capture = window.__savedLayoutCapture, scene = capture.scene, camera = capture.camera;
  const foundations = [], markers = [], steel = [];
  scene?.updateMatrixWorld(true);
  scene?.traverse(object => {
    if (object.userData?.foundationPreview) foundations.push({
      ...object.userData.foundationPreview,
      position: object.position.toArray(), world: object.getWorldPosition(new Vector3()).toArray(),
      rotation: object.rotation.y,
    });
    if (object.userData?.foundationPole) markers.push({
      ...object.userData.foundationPole, position: object.position.toArray(),
      world: object.getWorldPosition(new Vector3()).toArray(), height: object.geometry.parameters.height,
    });
    if (object.userData?.reinforcementId) steel.push({
      id: object.userData.reinforcementId, engineeringApproved: object.userData.engineeringApproved,
      parentedToConcrete: !!object.parent?.parent?.userData?.foundationPreview,
    });
  });
  const group = scene?.children.find(object => object.children?.some(child => child.userData?.foundationPreview || child.userData?.foundationPole));
  const corners = [];
  if (group && camera) {
    const bounds = new Box3().setFromObject(group);
    if (!bounds.isEmpty()) {
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z).project(camera).toArray());
    }
  }
  return {
    mode, foundations, markers, steel, corners, driver: capture.driver, pixels: capture.pixels,
    created: capture.created, disposed: capture.disposed, frames: capture.frames, glErrors: capture.glErrors,
    camera: camera ? { position: camera.position.toArray(), near: camera.near, far: camera.far, aspect: camera.aspect } : null,
    canvasCount: document.querySelectorAll("canvas").length,
    inputUnchanged: JSON.stringify(current) === captured,
    financialInputsUnchanged: financialData(current) === financialCapture,
    procurementReady: current.procurement_ready, engineeringApproved: current.engineering_approved,
  };
};
function App() {
  const [project, setProject] = useState(initial);
  const update = next => { current = freeze(next); captured = JSON.stringify(current); setProject(current); };
  return <main className="mx-auto max-w-4xl p-4">
    <h1 className="text-lg font-semibold mb-3">Offline synthetic Foundation saved-anchor verification</h1>
    {mode === "recorded" && <div className="flex flex-wrap gap-2 mb-3">
      <button type="button" className="rounded-sm border bg-white px-2 py-1 text-xs"
        onClick={() => update({ ...initial, items: initial.items.map((item, index) => index === 0
          ? { ...item, x_inches: 240, z_inches: 180 } : item) })}>Move saved anchor</button>
      <button type="button" className="rounded-sm border bg-white px-2 py-1 text-xs"
        onClick={() => update(initial)}>Undo saved move</button>
    </div>}
    <Foundation3DPreview project={project} />
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
