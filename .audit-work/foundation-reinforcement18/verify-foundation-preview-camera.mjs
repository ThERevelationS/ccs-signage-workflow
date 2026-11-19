import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { Box3, PerspectiveCamera, Vector3 } from "three";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/estimator/foundation/foundationPreviewCamera.js"],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { foundationPreviewCameraFit: fit } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const results = [];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12);
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("known cube uses bounded sphere radius and narrower horizontal half-angle with10percent framing clearance", () => {
  const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
  const result = fit(bounds, 45, 0.5);
  assert.deepEqual(result.target, [0, 0, 0]);
  const halfAngle = Math.atan(Math.tan(Math.PI / 8) * 0.5);
  const radius = Math.sqrt(3) / Math.sin(halfAngle) * 1.1;
  near(result.radius, radius); near(result.near, Math.max(0.001, (radius - Math.sqrt(3)) / 4));
  near(result.far, Math.max(2000, (radius + Math.sqrt(3)) * 4));
  near(result.minRadius, Math.max(0.01, Math.sqrt(3) * 0.05));
  near(result.maxRadius, Math.max(200, radius * 8));
});
check("every actual bounding corner stays in frame at desktop phone narrow aspect and all existing view angles", () => {
  for (const bounds of [
    new Box3(new Vector3(-13.4, -2, -8.4), new Vector3(13.4, 11, 8.4)),
    new Box3(new Vector3(-101.5, -2, -1.5), new Vector3(101.5, 1, 1.5)),
    new Box3(new Vector3(-1.5, -2, -1.5), new Vector3(1.5, 9, 1.5)),
    new Box3(new Vector3(1000, -200, 1000), new Vector3(1003, -197, 1003)),
  ]) for (const aspect of [2.0142857142857142, 0.8095238095238095, 0.6428571428571429]) {
    const frozen = JSON.stringify(bounds), result = fit(bounds, 45, aspect);
    assert.ok(result.radius >= 3); assert.ok(result.maxRadius >= result.radius);
    for (const [theta, phi] of [[Math.PI / 4, Math.PI / 3.2], [-Math.PI / 2, 0.16],
      [-Math.PI / 2, Math.PI / 2.05], [0, Math.PI / 2.05]]) {
      const camera = new PerspectiveCamera(45, aspect, result.near, result.far);
      const target = new Vector3(...result.target);
      camera.position.set(
        target.x + result.radius * Math.sin(phi) * Math.cos(theta),
        target.y + result.radius * Math.cos(phi),
        target.z + result.radius * Math.sin(phi) * Math.sin(theta));
      camera.lookAt(target); camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(projected.x) <= 0.95 && Math.abs(projected.y) <= 0.95);
          assert.ok(projected.z > -1 && projected.z < 1);
        }
    }
    assert.equal(JSON.stringify(bounds), frozen, "Camera fitting never rewrites placement");
  }
});
check("invalid or empty bounds and invalid projection parameters return no fit rather than nonfinite state", () => {
  const cube = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
  for (const bounds of [null, {}, new Box3(), new Box3(new Vector3(NaN, 0, 0), new Vector3(1, 1, 1)),
    new Box3(new Vector3(0, 0, 0), new Vector3(Infinity, 1, 1))])
    assert.equal(fit(bounds, 45, 1), null);
  for (const aspect of [0, -1, NaN, Infinity, "1", null]) assert.equal(fit(cube, 45, aspect), null);
  for (const fov of [0, 180, -1, NaN, Infinity, "45", null]) assert.equal(fit(cube, fov, 1), null);
});
check("tiny and collapsed previews retain safe nonzero camera distance and near/far planes", () => {
  const result = fit(new Box3(new Vector3(1, 2, 3), new Vector3(1, 2, 3)), 45, 1);
  assert.deepEqual(result.target, [1, 2, 3]); assert.equal(result.radius, 3);
  assert.ok(result.near > 0 && result.far > result.near);
});
check("wide and very tall layouts can fit beyond old200ft wheel clamp without touching geometry", () => {
  const bounds = new Box3(new Vector3(-1e5, -1, -1), new Vector3(1e5, 1e4, 1));
  const result = fit(bounds, 45, 0.6428571428571429);
  assert.ok(result.radius > 200); assert.ok(result.maxRadius > result.radius);
  assert.ok(result.far > result.radius); assert.ok(Object.values(result).flat().every(Number.isFinite));
});
fs.writeFileSync(DIR + "foundation-preview-camera-verification.json", JSON.stringify({ results,
  syntheticOnly: true, pricingChanged: false, realRendererVerified: false }, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
