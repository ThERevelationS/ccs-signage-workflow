import React from "react";
import { createRoot } from "react-dom/client";
import { Vector3 } from "three";
import Foundation3DPreview from "../../src/components/estimator/foundation/Foundation3DPreview";

const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const baseDesign = {
  version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: { mode: "off", reason: "Synthetic preview exclusion only, not structural advice." },
  spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] },
};
const mode = new URLSearchParams(location.search).get("mode") || "spread";
const item = {
  component_id: "synthetic-3d", foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
  depth_inches: 36, include_rebar: true, reinforcement_calculation_version: 2, reinforcement_design: baseDesign,
  custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0, rebar_feet: 0, rebar_cost: 48,
  reinforcement_proposal: { design: { deliberately_unapplied: true } },
};
if (mode === "pillar") Object.assign(item, {
  foundation_type: "pillar", diameter: 24, depth_inches: 48,
  reinforcement_design: { ...baseDesign, spread: undefined, pillar: {
    longitudinal: { count: 4, radius_inches: 6, bottom_end_inches: 3.25, top_end_inches: 44.75 },
    hoops: [{ id: "low", center_y_inches: 12, centerline_diameter_inches: 14, cut_allowance_inches: 1 },
      { id: "high", center_y_inches: 36, centerline_diameter_inches: 14, cut_allowance_inches: 0 }],
  } },
});
if (mode === "ties") item.reinforcement_design = { ...baseDesign, spread: {
  mats: [{ ...baseDesign.spread.mats[0], id: "bottom", bearing_elevation_inches: 3 }, baseDesign.spread.mats[0]],
  inter_mat_ties: [{ id: "reference", from_mat_id: "bottom", to_mat_id: "top", x_inches: 6, z_inches: 6, cut_length_inches: 36 }],
} };
if (mode === "legacy") item.reinforcement_calculation_version = 1;
if (mode === "unsupported") item.reinforcement_calculation_version = 3;
const project = freeze({ id: "synthetic-" + mode, items: [item], poles: [] });
window.__foundation3DProject = project;
window.__foundation3DInitialJSON = JSON.stringify(project);
window.__foundation3DCapture = { frames: 0, created: 0, disposed: 0, glErrors: [], wantPixels: false, pixels: null };
window.__foundation3DInspect = () => {
  const capture = window.__foundation3DCapture, scene = window.__foundation3DScene;
  const primitives = [], concrete = [], ground = [];
  scene?.updateMatrixWorld(true);
  scene?.traverse(object => {
    if (object.userData?.reinforcementId) {
      const world = object.getWorldPosition(new Vector3()), parameters = object.geometry.parameters || {};
      primitives.push({
        id: object.userData.reinforcementId, role: object.userData.role, kind: object.userData.kind,
        geometry: object.geometry.type, nominalRadius: parameters.radiusTop ?? parameters.tube ?? null,
        pathLength: parameters.height ?? object.geometry.getAttribute("lineDistance")?.array[1] ?? null,
        ringRadius: parameters.radius ?? null,
        dashed: object.material.isLineDashedMaterial === true,
        engineeringApproved: object.userData.engineeringApproved,
        parentedToConcrete: ["BoxGeometry", "CylinderGeometry"].includes(object.parent?.parent?.geometry?.type),
        world: world.toArray(),
      });
    }
    if (object.geometry?.type === "BoxGeometry" || (object.geometry?.type === "CylinderGeometry" && !object.userData?.reinforcementId))
      concrete.push({ opacity: object.material.opacity, transparent: object.material.transparent, depthWrite: object.material.depthWrite });
    if (object.geometry?.type === "PlaneGeometry")
      ground.push({ opacity: object.material.opacity, transparent: object.material.transparent, depthWrite: object.material.depthWrite });
  });
  return { frames: capture.frames, created: capture.created, disposed: capture.disposed, driver: capture.driver,
    glErrors: capture.glErrors, pixels: capture.pixels, primitives, concrete, ground,
    canvasCount: document.querySelectorAll("canvas").length,
    inputUnchanged: JSON.stringify(project) === window.__foundation3DInitialJSON };
};
createRoot(document.getElementById("root")).render(
  <main className="mx-auto max-w-4xl p-4">
    <h1 className="text-lg font-semibold mb-3">Offline synthetic Foundation 3D verification</h1>
    <Foundation3DPreview project={project} />
  </main>
);
