// O-032 (CMP-C01) 3D-positioned parity proof — a foundation item's authored
// plan anchor (x_inches/z_inches = top-left corner, canvas contract) drives
// its 3D mesh center in the same measured space poles/walls use; only items
// with no recorded position keep sequential cursor packing.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from './bundle.mjs';

const IN = 1 / 12;
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok', name); };
const scene = { add() {} };
const findItem = (group, id) => {
  let hit = null;
  group.traverse((o) => { if (o.userData?.kind === 'item' && o.userData?.componentId === id && !hit) hit = o; });
  return hit;
};

check('anchored rect item renders at anchor center', () => {
  const g = buildScene(scene, { items: [{ component_id: 'it-1', foundation_type: 'spread_foot', length_inches: 48, width_inches: 24, depth_inches: 12, x_inches: 100, z_inches: 60 }] }, false, false, null, false, false);
  const m = findItem(g, 'it-1');
  assert.ok(m, 'mesh exists');
  assert.ok(Math.abs(m.position.x - (100 + 24) * IN) < 1e-9, `x=${m.position.x} expected ${(124 * IN)}`);
  assert.ok(Math.abs(m.position.z - (60 + 12) * IN) < 1e-9, `z=${m.position.z} expected ${(72 * IN)}`);
});

check('anchored pillar centers on corner + radius', () => {
  const g = buildScene(scene, { items: [{ component_id: 'it-2', foundation_type: 'pillar', diameter: 24, depth_inches: 12, x_inches: 40, z_inches: 40 }] }, false, false, null, false, false);
  const m = findItem(g, 'it-2');
  assert.ok(Math.abs(m.position.x - (40 + 12) * IN) < 1e-9);
  assert.ok(Math.abs(m.position.z - (40 + 12) * IN) < 1e-9);
});

check('un-anchored item keeps cursor packing at origin', () => {
  const g = buildScene(scene, { items: [{ component_id: 'it-3', foundation_type: 'spread_foot', length_inches: 48, width_inches: 24, depth_inches: 12 }] }, false, false, null, false, false);
  const m = findItem(g, 'it-3');
  assert.ok(Math.abs(m.position.x - (48 * IN / 2)) < 1e-9, `x=${m.position.x}`);
  assert.equal(m.position.z, 0);
});

check('anchored + un-anchored mix does not collide', () => {
  const g = buildScene(scene, { items: [
    { component_id: 'it-a', foundation_type: 'spread_foot', length_inches: 48, width_inches: 24, depth_inches: 12, x_inches: 200, z_inches: 10 },
    { component_id: 'it-b', foundation_type: 'spread_foot', length_inches: 48, width_inches: 24, depth_inches: 12 },
  ] }, false, false, null, false, false);
  const a = findItem(g, 'it-a'), b = findItem(g, 'it-b');
  assert.ok(a.position.x !== b.position.x, 'distinct x');
  assert.ok(b.position.x >= a.position.x + (48 * IN), 'packing cursor advanced past anchor');
});

check('qty copies spread from the authored anchor', () => {
  const g = buildScene(scene, { items: [{ component_id: 'it-q', foundation_type: 'spread_foot', length_inches: 48, width_inches: 24, depth_inches: 12, quantity: 2, x_inches: 0, z_inches: 0 }] }, false, false, null, false, false);
  const meshes = [];
  g.traverse((o) => { if (o.userData?.kind === 'item' && o.userData?.componentId === 'it-q') meshes.push(o); });
  assert.equal(meshes.length, 2);
  const xs = meshes.map(m => m.position.x).sort((a, b) => a - b);
  assert.ok(Math.abs(xs[1] - xs[0] - (4 + 2)) < 1e-9, `spread ${xs[1] - xs[0]} expected 6ft (4ft footprint + 2ft gap)`);
});
console.log('PASS o032-parity', passed, 'checks');
