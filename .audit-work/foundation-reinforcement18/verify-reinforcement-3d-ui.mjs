import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import * as THREE from "three";

const DIR = ".audit-work/foundation-reinforcement18/";
const output = DIR + "reinforcement-3d-ui-test.mjs";
const rendererStub = `
export * from "three";
export class WebGLRenderer {
  constructor(){
    const env=globalThis.__foundation3DUI;env.attempts++;
    if(env.failRenderer)throw Error("Synthetic unavailable WebGL");
    this.domElement={parentNode:null,listeners:new Map(),
      addEventListener(name,fn){this.listeners.set(name,fn);},
      removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name);}
    };env.renderers.push(this);this.disposed=false;
  }
  setPixelRatio(value){this.pixelRatio=value;}
  setSize(width,height){this.width=width;this.height=height;}
  render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.scene=scene;this.camera=camera;globalThis.__foundation3DUI.current=this;}
  dispose(){this.disposed=true;}
}`;
const built = await build({
  entryPoints: ["src/components/estimator/foundation/Foundation3DPreview.jsx"], outfile: output, bundle: true,
  platform: "node", format: "esm", jsx: "automatic", metafile: true, external: ["react", "react-dom", "react-test-renderer"],
  plugins: [{ name: "capture-renderer-only", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, args => args.namespace === "renderer-capture"
      ? { path: "three", external: true } : { path: "three", namespace: "renderer-capture" });
    builder.onLoad({ filter: /.*/, namespace: "renderer-capture" }, () => ({ contents: rendererStub, loader: "js" }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["Foundation3DPreview.jsx", "foundationReinforcementPreview3D.js", "foundationReinforcementModel.js", "foundationReinforcementThreePreview.js"])
  assert.ok(inputs.some(input => input.endsWith("/" + file)), "Actual source required: " + file);
assert.ok(!inputs.some(input => /base44Client|staffEntities|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "reinforcement-3d-ui-test-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const { default: Preview } = await import(pathToFileURL(path.resolve(output)));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const design = freeze({ version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
  supports: { mode: "off", reason: "Synthetic exclusion only; no structural advice." },
  spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] } });
const baseline = freeze({ id: "synthetic-3d", items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1,
  length_inches: 36, width_inches: 36, depth_inches: 36, include_rebar: true, reinforcement_calculation_version: 2,
  reinforcement_design: design, custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0, rebar_cost: 48,
  reinforcement_proposal: { design: { deliberately_unapplied: true } } }], poles: [] });
const projectWith = patch => freeze({ ...baseline, items: [{ ...baseline.items[0], ...patch }] });
const text = node => typeof node === "string" ? node : node.children?.map(text).join("") || "";
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function mount(project = baseline, faults = {}) {
  const env = { attempts: 0, renderers: [], current: null, failRenderer: false, failObserve: false,
    rafs: new Map(), nextFrame: 0, listeners: new Map(), observers: new Set(), hosts: [], ...faults };
  globalThis.__foundation3DUI = env;
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(name, fn) { if (!env.listeners.has(name)) env.listeners.set(name, new Set()); env.listeners.get(name).add(fn); },
    removeEventListener(name, fn) { env.listeners.get(name)?.delete(fn); },
  };
  globalThis.requestAnimationFrame = callback => { const id = ++env.nextFrame; env.rafs.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => env.rafs.delete(id);
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.target = target; env.observers.add(this); if (env.failObserve) throw Error("Synthetic ResizeObserver failure"); }
    disconnect() { env.observers.delete(this); }
  };
  let renderer, source = project, captured = JSON.stringify(project);
  await act(async () => { renderer = TestRenderer.create(React.createElement(Preview, { project }), {
    createNodeMock(element) {
      if (element.type !== "div") return null;
      const host = { clientWidth: 640, clientHeight: 420, children: [],
        appendChild(canvas) { canvas.parentNode = this; this.children.push(canvas); },
        removeChild(canvas) { this.children = this.children.filter(child => child !== canvas); canvas.parentNode = null; },
        requestFullscreen() {},
      };
      env.hosts.push(host); return host;
    },
  }); });
  const root = () => renderer.root;
  const button = label => root().findAllByType("button").find(node => text(node).trim() === label);
  const objects = predicate => { const found = []; env.current?.scene.traverse(object => { if (predicate(object)) found.push(object); }); return found; };
  const validateSource = () => assert.equal(JSON.stringify(source), captured);
  return {
    env, root, button, objects, validateSource, allText: () => text(root()),
    async click(label) { assert.ok(button(label), label); await act(async () => { button(label).props.onClick(); }); },
    async update(project) { validateSource(); source = project; captured = JSON.stringify(project); await act(async () => { renderer.update(React.createElement(Preview, { project })); }); },
    async close() { validateSource(); await act(async () => { renderer.unmount(); }); },
  };
}
const steel = m => m.objects(object => object.userData?.reinforcementId);
const concrete = m => m.objects(object => object.geometry?.type === "BoxGeometry")[0];
const ground = m => m.objects(object => object.geometry?.type === "PlaneGeometry")[0];
const listeners = env => [...env.listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0);
const activeCanvases = env => env.renderers.filter(renderer => renderer.domElement.parentNode).length;
const results = [];
async function check(name, fn, project = baseline, faults) {
  const m = await mount(project, faults);
  try { await fn(m); m.validateSource(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
  finally {
    await m.close();
    assert.equal(listeners(m.env), 0, "Window listeners leaked after unmount");
    assert.equal(m.env.observers.size, 0, "ResizeObserver leaked after unmount");
    assert.equal(m.env.rafs.size, 0, "Animation frame leaked after unmount");
    assert.equal(activeCanvases(m.env), 0, "Canvas leaked after unmount");
    assert.ok(m.env.renderers.every(renderer => renderer.disposed));
  }
}
await check("actual overview mounts eight physical bars under their concrete and leaves all pricing/proposal inputs unchanged", async m => {
  assert.equal(steel(m).length, 8); assert.equal(concrete(m).children[0].userData.foundationReinforcement, true);
  assert.ok(m.allText().includes("8 steel primitives shown")); assert.ok(m.allText().includes("not saved 2D placement"));
  assert.equal(m.button("Reinforcement").props["aria-pressed"], true);
  assert.equal(activeCanvases(m.env), 1); assert.equal(m.env.current.width, 640);
});
await check("concrete and ground fade only around visible versioned steel with shared rotation/grade coordinates", async m => {
  assert.equal(concrete(m).material.opacity, 0.18); assert.equal(concrete(m).material.depthWrite, false);
  assert.equal(ground(m).material.opacity, 0.12); assert.equal(ground(m).material.depthWrite, false);
  const mesh = steel(m)[0], endpoint = mesh.localToWorld(new THREE.Vector3(0, 1.25, 0));
  near(endpoint.x, -14.75 / 12); near(endpoint.y, 0.6875); near(endpoint.z, -1.25);
}, projectWith({ grade_offset_inches: 12, rotation_degrees: 90 }));
await check("reinforcement visibility restores opaque concrete/ground and disposes each old renderer without writing a design", async m => {
  const first = m.env.current; await m.click("Reinforcement");
  assert.equal(first.disposed, true); assert.equal(steel(m).length, 0); assert.equal(concrete(m).material.opacity, 1);
  assert.equal(ground(m).material.opacity, 1); assert.equal(m.button("Reinforcement").props["aria-pressed"], false);
  await m.click("Reinforcement"); assert.equal(steel(m).length, 8); assert.equal(activeCanvases(m.env), 1);
  assert.ok(m.env.renderers.filter(renderer => renderer !== m.env.current).every(renderer => renderer.disposed && renderer.domElement.listeners.size === 0));
});
await check("hide/show releases and recreates canvas, listeners, observer and animation ownership", async m => {
  await m.click("Hide 3D View"); assert.equal(activeCanvases(m.env), 0); assert.equal(listeners(m.env), 0);
  assert.equal(m.env.observers.size, 0); assert.equal(m.env.rafs.size, 0);
  await m.click("Show 3D View"); assert.equal(activeCanvases(m.env), 1); assert.equal(steel(m).length, 8);
  assert.equal(listeners(m.env), 3); assert.equal(m.env.observers.size, 1); assert.equal(m.env.rafs.size, 1);
});
await check("unsupported versions remain visibly rejected while ordinary legacy foundations acquire no invented steel", async m => {
  assert.equal(steel(m).length, 0); assert.ok(m.allText().includes("unsupported"));
  assert.ok(m.root().findAll(node => typeof node.props?.className === "string" && node.props.className.includes("text-red-700")).length > 0);
  await m.update(projectWith({ reinforcement_calculation_version: 1 }));
  assert.equal(steel(m).length, 0); assert.equal(m.button("Reinforcement"), undefined); assert.equal(concrete(m).material.opacity, 1);
}, projectWith({ reinforcement_calculation_version: 3 }));
await check("unavailable WebGL retains the mount and Retry actually creates a renderer without a false shown count", async m => {
  assert.ok(m.allText().includes("rendering unavailable")); assert.ok(m.allText().includes("steel primitives prepared"));
  assert.equal(m.env.attempts, 1); assert.equal(activeCanvases(m.env), 0);
  const hostCount = m.env.hosts.length; m.env.failRenderer = false; await m.click("Retry 3D");
  assert.equal(m.env.hosts.length, hostCount); assert.equal(m.env.attempts, 2); assert.equal(activeCanvases(m.env), 1);
  assert.equal(steel(m).length, 8); assert.ok(m.allText().includes("8 steel primitives shown"));
}, baseline, { failRenderer: true });
await check("failure after listener registration is fully cleaned and can be retried without duplicate listeners", async m => {
  assert.equal(listeners(m.env), 0); assert.equal(m.env.observers.size, 0); assert.equal(m.env.rafs.size, 0);
  assert.equal(activeCanvases(m.env), 0); assert.ok(m.env.renderers[0].disposed);
  assert.equal(m.env.renderers[0].domElement.listeners.size, 0);
  m.env.failObserve = false; await m.click("Retry 3D");
  assert.equal(listeners(m.env), 3); assert.equal(m.env.observers.size, 1); assert.equal(activeCanvases(m.env), 1);
  assert.equal(steel(m).length, 8);
}, baseline, { failObserve: true });
await check("resize and existing camera/mode controls stay functional without altering the project", async m => {
  const observer = [...m.env.observers][0]; observer.target.clientWidth = 320; observer.target.clientHeight = 210;
  await act(async () => { observer.callback(); });
  assert.equal(m.env.current.width, 320); assert.equal(m.env.current.height, 210); near(m.env.current.camera.aspect, 320 / 210);
  for (const label of ["Front", "Side", "Top", "Reset"]) await m.click(label);
  await act(async () => { m.env.current.domElement.listeners.get("wheel")({ deltaY: -500, preventDefault() {} }); });
  assert.ok(m.allText().includes("200%"));
  await m.click("Solid Mode"); assert.equal(concrete(m).material.wireframe, true); assert.equal(steel(m).length, 8);
});
await check("invalid counts draw no replacement foundation; valid large quantities are explicitly preview-limited only", async m => {
  assert.equal(concrete(m), undefined); assert.equal(steel(m).length, 0);
  assert.ok(m.allText().includes("quantity"));
  await m.update(projectWith({ quantity: 1000 }));
  assert.equal(m.objects(object => object.geometry?.type === "BoxGeometry").length, 64);
  assert.equal(steel(m).length, 512); assert.ok(m.allText().includes("calculated quantities are unchanged"));
}, projectWith({ quantity: 0 }));
await check("unknown supports and fabrication omissions remain explicit instead of advertising zero supports or engineering approval", async m => {
  assert.equal(steel(m).length, 8);
  assert.ok(m.allText().includes("Supports have not been modeled or priced"));
  assert.ok(m.allText().includes("not a frozen price, stock/cut schedule, or engineering approval"));
  assert.ok(m.allText().includes("Dashed ties are reference paths only")); assert.ok(!m.allText().includes("0 supports"));
}, projectWith({ reinforcement_design: { ...design, supports: { mode: "manual" } } }));
const foundationMeshes = m => m.objects(object => object.userData?.foundationPreview);
const poleMeshes = m => m.objects(object => object.userData?.foundationPole);
const anchored = freeze({
  ...baseline,
  items: [
    { ...baseline.items[0], component_id: "anchor-a", x_inches: 120, z_inches: 240,
      grade_offset_inches: 12, rotation_degrees: 90, selected_pole_id: "synthetic-pole", pole_total_height_inches: 120 },
    { ...baseline.items[0], component_id: "anchor-b", x_inches: 360, z_inches: 120 },
  ],
  poles: [{ x_inches: 60, z_inches: 60, height_inches: 120, y_offset_inches: 12 }],
});
await check("explicit Saved2DAnchors mode applies saved poses to actual meshes and keeps recorded pole markers aligned", async m => {
  assert.equal(m.button("Inspection").props["aria-pressed"], true);
  assert.equal(m.button("Saved 2D Anchors").props["aria-pressed"], false);
  await m.click("Saved 2D Anchors");
  assert.equal(m.button("Saved 2D Anchors").props["aria-pressed"], true);
  assert.equal(m.button("Inspection").props["aria-pressed"], false);
  const meshes = foundationMeshes(m);
  assert.equal(meshes.length, 2); assert.equal(steel(m).length, 16);
  assert.deepEqual(meshes[0].position.toArray(), [11.5, -0.5, 21.5]);
  assert.deepEqual(meshes[1].position.toArray(), [31.5, -1.5, 11.5]);
  near(meshes[0].rotation.y, -Math.PI / 2);
  const worldA = meshes[0].getWorldPosition(new THREE.Vector3()), worldB = meshes[1].getWorldPosition(new THREE.Vector3());
  near(worldB.x - worldA.x, 20); near(worldB.z - worldA.z, -10);
  const attachedPole = poleMeshes(m).find(mesh => mesh.userData.foundationPole.kind === "attached");
  const independentPole = poleMeshes(m).find(mesh => mesh.userData.foundationPole.kind === "independent");
  assert.deepEqual(attachedPole.position.toArray(), [11.5, 6, 21.5]);
  assert.deepEqual(independentPole.position.toArray(), [5, 6, 5]);
  assert.equal(attachedPole.geometry.parameters.height, 10);
  // Cylinder +Y points toward the authored "to" end; -Y is the "from" end.
  const fromEndpoint = steel(m)[0].localToWorld(new THREE.Vector3(0, -1.25, 0));
  const toEndpoint = steel(m)[0].localToWorld(new THREE.Vector3(0, 1.25, 0));
  near(fromEndpoint.x - worldA.x, 14.75 / 12); near(fromEndpoint.y, 0.6875); near(fromEndpoint.z - worldA.z, -1.25);
  near(toEndpoint.x - worldA.x, 14.75 / 12); near(toEndpoint.y, 0.6875); near(toEndpoint.z - worldA.z, 1.25);
  near(fromEndpoint.distanceTo(toEndpoint), 2.5);
  assert.ok(m.allText().includes("one representative"));
  assert.ok(m.allText().includes("schematic"));
  assert.equal(activeCanvases(m.env), 1);
}, anchored);
await check("layout draws only one anchor for quantity2 and switching back restores inspection copies without edits", async m => {
  assert.equal(foundationMeshes(m).length, 2); assert.equal(steel(m).length, 16);
  await m.click("Saved 2D Anchors");
  assert.equal(foundationMeshes(m).length, 1); assert.equal(steel(m).length, 8);
  assert.ok(/additional.*locations.*not recorded/i.test(m.allText()));
  await m.click("Inspection");
  assert.equal(foundationMeshes(m).length, 2); assert.equal(steel(m).length, 16);
  assert.ok(m.allText().includes("not saved 2D placement"));
  assert.ok(!/additional.*locations.*not recorded/i.test(m.allText()));
  assert.ok(m.env.renderers.filter(renderer => renderer !== m.env.current).every(renderer =>
    renderer.disposed && renderer.domElement.listeners.size === 0));
}, projectWith({ quantity: 2, x_inches: 120, z_inches: 240 }));
await check("malformed independent poles are diagnosed without losing the valid concrete or rendering at zero", async m => {
  await m.click("Saved 2D Anchors");
  assert.equal(foundationMeshes(m).length, 1); assert.equal(steel(m).length, 8);
  assert.equal(poleMeshes(m).length, 0);
  assert.ok(/pole/i.test(m.allText())); assert.ok(/invalid|coordinate/i.test(m.allText()));
  assert.equal(m.button("Retry 3D"), undefined);
  await m.update(freeze({ ...baseline, poles: {} }));
  assert.equal(foundationMeshes(m).length, 1); assert.equal(poleMeshes(m).length, 0);
  assert.ok(/pole/i.test(m.allText()));
}, freeze({ ...baseline, poles: [{ x_inches: "broken", z_inches: 240, height_inches: 120 }] }));
await check("legacy default height is labeled unknown and explicit active zero cannot create an8ft pole", async m => {
  await m.click("Saved 2D Anchors");
  assert.equal(poleMeshes(m).length, 1);
  assert.equal(poleMeshes(m)[0].geometry.parameters.height, 8);
  assert.equal(poleMeshes(m)[0].userData.foundationPole.heightBasis, "legacy_default");
  assert.ok(/height.*not recorded/i.test(m.allText()));
  await m.update(projectWith({ selected_pole_id: "synthetic-pole", pole_total_height_inches: 0 }));
  assert.equal(poleMeshes(m).length, 0); assert.equal(foundationMeshes(m).length, 1);
  assert.ok(/height/i.test(m.allText()));
}, projectWith({ selected_pole_id: "synthetic-pole" }));
await check("independent pole quantity budgets cap render markers only and remain explicit", async m => {
  assert.equal(poleMeshes(m).length, 64); assert.equal(foundationMeshes(m).length, 1);
  assert.ok(m.allText().includes("64 pole"));
  assert.ok(m.allText().includes("calculated quantities are unchanged"));
}, freeze({ ...baseline, poles: Array.from({ length: 65 }, (_, index) => ({
  x_inches: index * 12, z_inches: 12, height_inches: 120,
})) }));
await check("broken saved Foundation coordinates do not become a zero anchor while inspection remains usable", async m => {
  assert.equal(foundationMeshes(m).length, 1);
  await m.click("Saved 2D Anchors");
  assert.equal(foundationMeshes(m).length, 0); assert.equal(steel(m).length, 0);
  assert.ok(/saved placement coordinates/i.test(m.allText()));
  assert.equal(m.button("Retry 3D"), undefined);
  await m.click("Inspection"); assert.equal(foundationMeshes(m).length, 1); assert.equal(steel(m).length, 8);
}, projectWith({ x_inches: "broken", z_inches: 240 }));
await check("saved mode survives unavailable WebGL retry and hide-show without leaking resources", async m => {
  await m.click("Saved 2D Anchors");
  assert.equal(m.button("Saved 2D Anchors").props["aria-pressed"], true);
  m.env.failRenderer = false; await m.click("Retry 3D");
  assert.equal(activeCanvases(m.env), 1);
  assert.deepEqual(foundationMeshes(m)[0].position.toArray(), [11.5, -1.5, 21.5]);
  await m.click("Hide 3D View"); assert.equal(activeCanvases(m.env), 0);
  await m.click("Show 3D View"); assert.equal(activeCanvases(m.env), 1);
  assert.equal(m.button("Saved 2D Anchors").props["aria-pressed"], true);
  assert.deepEqual(foundationMeshes(m)[0].position.toArray(), [11.5, -1.5, 21.5]);
}, projectWith({ x_inches: 120, z_inches: 240 }), { failRenderer: true });
const fitsCamera = m => {
  const group = foundationMeshes(m)[0]?.parent;
  assert.ok(group);
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(group), camera = m.env.current.camera;
  camera.updateMatrixWorld(true);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z]) {
      const projected = new THREE.Vector3(x, y, z).project(camera);
      assert.ok(Math.abs(projected.x) <= 0.95 && Math.abs(projected.y) <= 0.95 &&
        projected.z > -1 && projected.z < 1, "Resolved Foundation/pole bounds must fit the actual camera");
    }
};
await check("layout camera frames all recorded anchors and poles through views FitView resize and hideShow", async m => {
  assert.equal(m.button("Fit View"), undefined, "Inspection controls stay unchanged");
  await m.click("Saved 2D Anchors"); fitsCamera(m);
  assert.ok(m.allText().includes("100%")); assert.ok(m.button("Fit View"));
  for (const view of ["Top", "Front", "Side", "Reset"]) { await m.click(view); fitsCamera(m); }
  const observer = [...m.env.observers][0];
  observer.target.clientWidth = 270; observer.target.clientHeight = 420;
  await act(async () => { observer.callback(); }); fitsCamera(m);
  await act(async () => { m.env.current.domElement.listeners.get("wheel")({ deltaY: -500, preventDefault() {} }); });
  assert.ok(m.allText().includes("200%"));
  await m.click("Fit View"); fitsCamera(m); assert.ok(m.allText().includes("100%"));
  await m.click("Hide 3D View"); await m.click("Show 3D View"); fitsCamera(m);
  await m.click("Inspection");
  assert.equal(m.button("Fit View"), undefined);
  near(m.env.current.camera.position.length(), 30);
}, anchored);
await check("layout fits beyond the old200ft zoom limit without scaling mesh placement", async m => {
  await m.click("Saved 2D Anchors"); fitsCamera(m);
  const meshes = foundationMeshes(m);
  near(meshes[1].position.x - meshes[0].position.x, 200);
  assert.ok(m.env.current.camera.position.length() > 200);
  await m.click("Reset"); fitsCamera(m);
  near(foundationMeshes(m)[1].position.x - foundationMeshes(m)[0].position.x, 200);
}, freeze({ ...baseline, items: [
  { ...baseline.items[0], x_inches: 0, z_inches: 0 },
  { ...baseline.items[0], component_id: "far", x_inches: 2400, z_inches: 0 },
] }));
await check("losing all saved anchors clears the prior fit zoom basis and recovers to a clean default camera", async m => {
  await m.click("Saved 2D Anchors"); fitsCamera(m);
  await m.update(projectWith({ x_inches: "broken", z_inches: 240 }));
  assert.equal(foundationMeshes(m).length, 0);
  near(m.env.current.camera.position.length(), 30);
  assert.ok(m.allText().includes("100%"));
  await act(async () => { m.env.current.domElement.listeners.get("wheel")({ deltaY: -500, preventDefault() {} }); });
  near(m.env.current.camera.position.length(), 15);
  assert.ok(m.allText().includes("200%"), "Empty preview must not retain a previous layout fit's zoom basis");
  await m.update(anchored); fitsCamera(m); assert.ok(m.allText().includes("100%"));
}, anchored);
fs.writeFileSync(DIR + "reinforcement-3d-ui-verification.json", JSON.stringify({
  synthetic: true, rendererMocked: true, webGLVerified: false, realBase44StorageVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Reinforcement 3D widget: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
