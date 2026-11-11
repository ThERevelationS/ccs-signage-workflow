// O-047 (CMP-D04) corner/return adjustment verifier — the return run loses
// ~one unit width of linear length per corner joint on BOTH bases; closed
// shapes keep their per-corner deduction and open polylines gain one per
// interior vertex. A single straight run deducts nothing.
import assert from 'node:assert/strict';
import { calcWallCosts } from './bundle.mjs';

const mat = { wall_material_subtype: 'brick', wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, cost_per_unit: 0.5 };
const concrete = { wall_material_subtype: 'concrete', wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25, cost_per_unit: 100 };
const args = { wall: {}, wallMaterial: mat, wallHeightInches: 24, mortarGapInches: 0.375, settings: {} };
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok', name); };

// unit masonry, 24" wall: pitch=8.375, courses=ceil(24/2.625)=10
check('single straight run deducts nothing', () => {
  const r = calcWallCosts({ ...args, wallShape: { closed: false, segments: [{ length: 96 }] } });
  assert.equal(r.totalBricks, 120); // ceil(96/8.375)=12 x 10 courses
});
check('closed rectangle deducts ~unitW per corner', () => {
  const r = calcWallCosts({ ...args, wallShape: { closed: true, segments: [{ length: 96 }, { length: 48 }, { length: 96 }, { length: 48 }] } });
  assert.equal(r.totalBricks, 340); // (11+6+11+6)x10 — each seg loses 4"
});
check('open L-shape deducts at its interior corner', () => {
  const r = calcWallCosts({ ...args, wallShape: { closed: false, segments: [{ length: 96 }, { length: 48 }] } });
  // (unitW*1)/2 = 2" per seg → ceil(94/8.375)=12 + ceil(46/8.375)=6 → 18 x10
  assert.equal(r.totalBricks, 180);
});
check('concrete basis uses reduced linear volume', () => {
  const r = calcWallCosts({ ...args, wallMaterial: concrete, wallShape: { closed: true, segments: [{ length: 96 }, { length: 48 }, { length: 96 }, { length: 48 }] } });
  // reduced total linear = 96+48+96+48 - 4*4 = 272" → 272*24*4/46656 CY ≈ 0.5599
  assert.ok(Math.abs(r.totalBricks - (272 * 24 * 4) / 46656) < 1e-9);
});
check('deduction clamps at zero on tiny segments', () => {
  const r = calcWallCosts({ ...args, wallShape: { closed: true, segments: [{ length: 3 }, { length: 3 }, { length: 3 }, { length: 3 }] } });
  assert.equal(r.totalBricks, 0);
  assert.ok(Number.isFinite(r.totalCost));
});
console.log('PASS o047-corner', passed, 'checks');
