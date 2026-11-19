import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as THREE from "three";

const DIR = ".audit-work/foundation-reinforcement18/";
const output = DIR + "reinforcement-three-preview-bundle.mjs";
await build({ entryPoints: ["src/components/estimator/foundation/foundationReinforcementThreePreview.js"],
  bundle: true, format: "esm", platform: "node", external: ["three"], outfile: output });
const { createFoundationReinforcement3DGroup: create, disposeFoundationPreviewScene: dispose,
  FOUNDATION_REINFORCEMENT_3D_ROLES: roles } = await import(pathToFileURL(path.resolve(output)));
const segment = Object.freeze({ id: "synthetic-bar", role: "horizontal", kind: "segment",
  from: Object.freeze([-1.25, 1.1875, -14.75 / 12]), to: Object.freeze([1.25, 1.1875, -14.75 / 12]),
  lengthFeet: 2.5, radiusFeet: 0.5 / 24 });
const hoop = Object.freeze({ id: "synthetic-hoop", role: "hoop", kind: "hoop",
  center: Object.freeze([0, -1, 0]), centerlineRadiusFeet: 7 / 12, radiusFeet: 0.5 / 24, allowanceNotDrawn: true });
const tie = Object.freeze({ id: "synthetic-reference", role: "inter_mat_tie", kind: "tie_reference",
  from: Object.freeze([-1, -14.75 / 12, -1]), to: Object.freeze([-1, 14.25 / 12, -1]), radiusFeet: 0.5 / 24, lengthFeet: 29 / 12 });
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: String(error.stack) }); console.error("FAIL", name, error.message); }
}
check("straight steel uses the authored physical radius and path length exactly once", () => {
  const group = create([segment]), mesh = group.children[0];
  assert.ok(mesh.isMesh); near(mesh.geometry.parameters.radiusTop, 0.5 / 24);
  near(mesh.geometry.parameters.radiusBottom, 0.5 / 24); near(mesh.geometry.parameters.height, 2.5);
  near(mesh.position.x, 0); near(mesh.position.y, 1.1875); near(mesh.position.z, -14.75 / 12);
  assert.equal(mesh.material.color.getHexString(), "15803d"); assert.equal(mesh.userData.engineeringApproved, false);
  dispose(group);
});
check("oriented cylinder endpoints match the concrete-local normalized paths", () => {
  const group = create([segment]), mesh = group.children[0]; group.updateMatrixWorld(true);
  const top = mesh.localToWorld(new THREE.Vector3(0, 1.25, 0));
  const bottom = mesh.localToWorld(new THREE.Vector3(0, -1.25, 0));
  [top.x, top.y, top.z].forEach((value, index) => near(value, segment.to[index]));
  [bottom.x, bottom.y, bottom.z].forEach((value, index) => near(value, segment.from[index]));
  dispose(group);
});
check("parent concrete rotation and grade offset transform both steel and concrete together", () => {
  const parent = new THREE.Group(), group = create([segment]); parent.add(group);
  parent.position.set(1.5, -0.5, 0); parent.rotation.y = Math.PI / 2; parent.updateMatrixWorld(true);
  const point = group.children[0].localToWorld(new THREE.Vector3(0, 1.25, 0));
  near(point.x, 1.5 - 14.75 / 12); near(point.y, 0.6875); near(point.z, -1.25);
  dispose(parent);
});
check("hoop rings are centered in the XZ plane with no fabricated hook or allowance geometry", () => {
  const group = create([hoop]), mesh = group.children[0];
  assert.equal(group.children.length, 1); assert.equal(mesh.geometry.type, "TorusGeometry");
  near(mesh.geometry.parameters.radius, 7 / 12); near(mesh.geometry.parameters.tube, 0.5 / 24);
  near(mesh.rotation.x, Math.PI / 2); assert.deepEqual(mesh.position.toArray(), [0, -1, 0]);
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3());
  near(size.y, 0.5 / 12, 1e-6); near(size.x, 2 * (7 / 12 + 0.5 / 24), 1e-6);
  near(size.z, size.x, 1e-6); dispose(group);
});
check("tie references stay dashed two-point paths rather than fictitious bent or cut-length bars", () => {
  const group = create([tie]), line = group.children[0];
  assert.ok(line.isLine); assert.equal(line.isMesh, undefined); assert.ok(line.material.isLineDashedMaterial);
  assert.equal(line.geometry.getAttribute("position").count, 2);
  near(line.geometry.getAttribute("lineDistance").array[1], 29 / 12, 1e-6);
  assert.equal(line.material.color.getHexString(), "0891b2"); dispose(group);
});
check("role colors and labels cover only modeled steel; unknown roles or kinds fail closed", () => {
  assert.deepEqual(roles.map(role => role.role), ["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);
  assert.throws(() => create([{ ...segment, role: "invented_support" }]), /Unsupported/);
  assert.throws(() => create([{ ...segment, kind: "invented_hook" }]), /Unsupported/);
  assert.equal(create([]).children.length, 0); assert.equal(create([]).userData.engineeringApproved, false);
});
check("scene cleanup disposes shared materials and geometry once, including duplicated mesh references", () => {
  const group = create([segment, { ...segment, id: "second" }]);
  assert.equal(group.children[0].material, group.children[1].material);
  group.add(group.children[0].clone());
  const geometry = new Map(), material = new Map();
  group.traverse(object => {
    if (object.geometry && !geometry.has(object.geometry)) { geometry.set(object.geometry, 0); object.geometry.addEventListener("dispose", () => geometry.set(object.geometry, geometry.get(object.geometry) + 1)); }
    if (object.material && !material.has(object.material)) { material.set(object.material, 0); object.material.addEventListener("dispose", () => material.set(object.material, material.get(object.material) + 1)); }
  });
  dispose(group); assert.deepEqual([...geometry.values()], [1, 1]); assert.deepEqual([...material.values()], [1]);
});
check("rendering leaves frozen primitive inputs, physical radii and role identity unchanged", () => {
  const captured = JSON.stringify([segment, hoop, tie]), group = create([segment, hoop, tie]);
  assert.equal(JSON.stringify([segment, hoop, tie]), captured);
  assert.deepEqual(group.children.map(object => object.userData.role), ["horizontal", "hoop", "inter_mat_tie"]);
  dispose(group);
});
fs.writeFileSync(DIR + "reinforcement-three-preview-verification.json", JSON.stringify({
  synthetic: true, realBase44StorageVerified: false, webGLVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Reinforcement Three primitives: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
