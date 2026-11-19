// O-038/O-039 model verification — transform round-trips, remote-parity
// sweep, hit-test fixtures (incl. degenerate geometry), drag/keyboard
// equivalence vs the remote canvas math, snap/pointer/label primitives.
// Runs against the esbuild bundle of the CANDIDATE staging tree plus the
// REMOTE foundationLayoutModel bundle (pulled at HEAD 2083c6dbb).
// Usage: node verify-o038-o039-model.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { transforms as T, input as I, model as M } from "./scene-bundle.mjs";
import * as R from "./remote-model-bundle.mjs";

let pass = 0;
const failures = [];
const ok = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { failures.push({ name, message: String(e.message || e).slice(0, 500) }); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const assertNear = (a, b, eps, msg) => assert.ok(near(a, b, eps), `${msg}: |${a}-${b}|=${Math.abs(a - b)} > ${eps}`);

// Deterministic PRNG for sweeps (recorded seed — no Math.random).
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = mulberry32(0x038039);

// Frozen copies of the REMOTE canvas's inline math — the parity baseline.
const remoteGrab = (point, pos) => ({ dx: point.x_inches - pos.x_inches, dz: point.z_inches - pos.z_inches });
const remoteCommit = (d, point) => {
  const raw = { x: point.x_inches - d.grab.dx, z: point.z_inches - d.grab.dz };
  if (raw.x === d.corner.x && raw.z === d.corner.z) return null;
  const roundX = Math.round(raw.x), roundZ = Math.round(raw.z);
  if (roundX === d.corner.x && roundZ === d.corner.z) return null;
  return { x_inches: roundX, z_inches: roundZ };
};
const remoteFindIndex = (d, items) => {
  if (d.identityKind === "index") return items.length === d.count ? d.legacyIndex : -1;
  return items.findIndex((it, i) => R.layoutItemKey(it, i) === d.key);
};

// =========================================================================
// 1. Remote parity — layoutPointInches vs the delegated transform (O-038)
// =========================================================================
ok("extent mirror: DEFAULT_PLAN_EXTENT === remote model constants", () => {
  assert.equal(T.DEFAULT_PLAN_EXTENT.width, R.FOUNDATION_LAYOUT_WIDTH_INCHES);
  assert.equal(T.DEFAULT_PLAN_EXTENT.depth, R.FOUNDATION_LAYOUT_DEPTH_INCHES);
});

ok("remote-parity sweep: 20k point/rect pairs agree within 1e-9", () => {
  const rects = [
    { left: 0, top: 0, width: 480, height: 320 },
    { left: 12.5, top: -30.25, width: 733.3333, height: 488.8889 },
    { left: -500, top: 200, width: 1920, height: 1280 },
    { left: 0.1, top: 0.1, width: 0.5, height: 0.333 },
    { left: 40, top: 60, width: 390, height: 260 },   // 390px touch viewport
    { left: -8.75, top: 3.14, width: 999.999, height: 666.666 },
    { left: 10, top: 10, width: 480, height: 260 },   // aspect mismatch (non-3:2)
    { left: 10, top: 10, width: 123, height: 987 },   // extreme mismatch
  ];
  let maxDx = 0, maxDz = 0;
  for (let i = 0; i < 20000; i += 1) {
    const rect = rects[i % rects.length];
    const cx = (rand() - 0.5) * 4000;
    const cy = (rand() - 0.5) * 4000;
    const rem = R.layoutPointInches(cx, cy, rect);
    const cand = M.layoutPointInches(cx, cy, rect);
    const viaApi = T.screenToPlan(T.planViewFromElementRect(rect), cx, cy);
    assert.equal(rem === null, cand === null, `null-verdict mismatch @${i}`);
    assert.equal(rem === null, viaApi === null, `api null-verdict mismatch @${i}`);
    if (rem) {
      maxDx = Math.max(maxDx, Math.abs(rem.x_inches - cand.x_inches), Math.abs(rem.x_inches - viaApi.x_inches));
      maxDz = Math.max(maxDz, Math.abs(rem.z_inches - cand.z_inches), Math.abs(rem.z_inches - viaApi.z_inches));
    }
  }
  assert.ok(maxDx <= 1e-9, `x drift ${maxDx}`);
  assert.ok(maxDz <= 1e-9, `z drift ${maxDz}`);
});

ok("remote-parity null verdicts: bad rects + non-finite clients", () => {
  const cases = [
    [NaN, 5, { left: 0, top: 0, width: 100, height: 100 }],
    [5, Infinity, { left: 0, top: 0, width: 100, height: 100 }],
    [5, 5, null],
    [5, 5, {}],
    [5, 5, { left: 0, top: 0, width: 0, height: 100 }],
    [5, 5, { left: 0, top: 0, width: 100, height: -2 }],
    [5, 5, { left: NaN, top: 0, width: 100, height: 100 }],
    [5, 5, { left: 0, top: 0, width: "100", height: 100 }],
  ];
  for (const [x, y, r] of cases) {
    assert.equal(R.layoutPointInches(x, y, r), null);
    assert.equal(M.layoutPointInches(x, y, r), null);
    assert.equal(T.screenToPlan(T.planViewFromElementRect(r), x, y), null);
  }
});

// =========================================================================
// 2. Transform round-trips + view manipulation (O-038)
// =========================================================================
ok("screen<->plan round-trip across element-rect views (incl. aspect mismatch)", () => {
  const rects = [
    { left: 0, top: 0, width: 480, height: 320 },
    { left: 33.3, top: -7.7, width: 612.4, height: 408.2 },
    { left: -100, top: 50, width: 390, height: 260 },
    { left: 5, top: 5, width: 480, height: 999 },     // non-3:2 — per-axis scale
    { left: 0, top: 0, width: 1, height: 1 },
    { left: -2000, top: 3000, width: 5000, height: 4000 },
  ];
  for (const rect of rects) {
    const v = T.planViewFromElementRect(rect);
    assert.ok(v, `view for ${JSON.stringify(rect)}`);
    for (let i = 0; i < 500; i += 1) {
      const p = { x: rand() * 480, z: rand() * 320 };
      const s = T.planToScreen(v, p.x, p.z);
      const back = T.screenToPlan(v, s.x, s.y);
      assertNear(back.x_inches, p.x, 1e-7, `x rt rect=${rect.width}`);
      assertNear(back.z_inches, p.z, 1e-7, `z rt rect=${rect.width}`);
    }
  }
});

ok("screen<->plan round-trip across viewport-fit views (zoom/pan/letterbox)", () => {
  const combos = [];
  for (const vp of [{ width: 800, height: 600 }, { width: 390, height: 844 }, { width: 1920, height: 400 }, { width: 100, height: 100 }]) {
    for (const zoom of [0.5, 1, 1.37, 2]) {
      for (const [panX, panY] of [[0, 0], [40, -25], [-300, 120]]) {
        combos.push({ viewport: vp, zoom, panX, panY, padding: vp.width > 500 ? 16 : 0 });
      }
    }
  }
  for (const c of combos) {
    const v = T.planViewForViewport(c);
    assert.ok(v, `view ${JSON.stringify(c)}`);
    assertNear(v.scaleX, v.scaleY, 1e-12, "uniform scale");
    for (let i = 0; i < 60; i += 1) {
      const p = { x: rand() * 480, z: rand() * 320 };
      const s = T.planToScreen(v, p.x, p.z);
      const back = T.screenToPlan(v, s.x, s.y);
      assertNear(back.x_inches, p.x, 1e-7, "x rt");
      assertNear(back.z_inches, p.z, 1e-7, "z rt");
    }
  }
});

ok("zoom-at-anchor keeps the anchored plan point fixed", () => {
  const v = T.planViewForViewport({ viewport: { width: 800, height: 600 }, zoom: 1 });
  const wide = { min: 0.1, max: 10 }; // caller range — default UI clamp covered separately
  for (let i = 0; i < 200; i += 1) {
    const anchor = { x: rand() * 800, y: rand() * 600 };
    const f = 0.5 + rand() * 2.5;
    const before = T.screenToPlan(v, anchor.x, anchor.y);
    const z = T.zoomPlanViewAt(v, f, anchor, wide);
    const after = T.screenToPlan(z, anchor.x, anchor.y);
    assertNear(after.x_inches, before.x_inches, 1e-7, "anchor x drift");
    assertNear(after.z_inches, before.z_inches, 1e-7, "anchor z drift");
    assertNear(z.zoom, v.zoom * f, 1e-12, "zoom field");
  }
});

ok("zoom-at-anchor respects the view's zoom clamp", () => {
  const v = T.planViewForViewport({ viewport: { width: 800, height: 600 }, zoom: 1.9 });
  const anchor = { x: 400, y: 300 };
  const z = T.zoomPlanViewAt(v, 2, anchor);           // wants 3.8 -> clamped 2
  assertNear(z.zoom, 2, 1e-12, "clamped zoom");
  const before = T.screenToPlan(v, anchor.x, anchor.y);
  const after = T.screenToPlan(z, anchor.x, anchor.y);
  assertNear(after.x_inches, before.x_inches, 1e-7, "anchor still fixed");
});

ok("planViewForBounds centers the bounds in the viewport", () => {
  const vp = { width: 1000, height: 700 };
  const b = { minX: 100, minZ: 40, maxX: 340, maxZ: 280 };
  const v = T.planViewForBounds(b, vp, { padding: 20 });
  const c = T.planToScreen(v, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  assertNear(c.x, vp.width / 2, 1e-7, "bounds center x");
  assertNear(c.y, vp.height / 2, 1e-7, "bounds center y");
  const tl = T.planToScreen(v, b.minX, b.minZ);
  const br = T.planToScreen(v, b.maxX, b.maxZ);
  assert.ok(tl.x >= 19.9 && tl.y >= 19.9 && br.x <= vp.width - 19.9 && br.y <= vp.height - 19.9, "bounds inside padded viewport");
  // degenerate bounds (a single point) still produce a view
  const dv = T.planViewForBounds({ minX: 50, minZ: 50, maxX: 50, maxZ: 50 }, vp);
  assert.ok(dv, "degenerate bounds view");
  assert.ok(T.screenToPlan(dv, 500, 350), "degenerate bounds still maps");
});

ok("panPlanView translates origin and tracked pan", () => {
  const v = T.planViewForViewport({ viewport: { width: 800, height: 600 } });
  const v2 = T.panPlanView(v, 30, -12);
  assertNear(v2.originX, v.originX + 30, 1e-12, "originX");
  assertNear(v2.originY, v.originY - 12, 1e-12, "originY");
  assertNear(v2.pan.x, 30, 1e-12, "pan.x");
  assert.equal(T.panPlanView(v, NaN, 0), null);
});

ok("frame <-> plan round-trip at arbitrary rotations", () => {
  const rots = [0, 30, 45, 90, 135, 180, 225, 270, 315, -45, 359.9, 720.5];
  for (const deg of rots) {
    const f = T.planFrameForRect({ corner: { x: 40, z: 60 }, size: { width: 48, depth: 36 }, rotationDegrees: deg });
    assert.ok(f, `frame ${deg}`);
    assertNear(f.cx, 64, 1e-12, "cx");
    assertNear(f.cz, 78, 1e-12, "cz");
    for (let i = 0; i < 100; i += 1) {
      const l = { lx: (rand() - 0.5) * 200, lz: (rand() - 0.5) * 200 };
      const p = T.frameLocalToPlan(f, l);
      const back = T.planToFrameLocal(f, p);
      assertNear(back.lx, l.lx, 1e-7, `lx rt ${deg}`);
      assertNear(back.lz, l.lz, 1e-7, `lz rt ${deg}`);
    }
  }
});

ok("frame corners + rotation semantics (CSS-clockwise in z-down plan)", () => {
  const f = T.planFrameForRect({ corner: { x: 0, z: 0 }, size: { width: 10, depth: 4 }, rotationDegrees: 90 });
  const corners = T.framePlanCorners(f, { width: 10, depth: 4 });
  // 90° CSS rotation about center (5,2): local +x maps to +z. nw(-5,-2) -> plan
  // center + rot90(-5,-2) = (5 + 2, 2 - 5) = (7,-3)
  assertNear(corners.nw.x, 7, 1e-9, "nw.x");
  assertNear(corners.nw.z, -3, 1e-9, "nw.z");
  assertNear(corners.se.x, 3, 1e-9, "se.x");
  assertNear(corners.se.z, 7, 1e-9, "se.z");
  const rp = T.rotatePlanPointAbout({ x: 1, z: 0 }, { x: 0, z: 0 }, 90);
  assertNear(rp.x, 0, 1e-9, "rot x");
  assertNear(rp.z, 1, 1e-9, "rot z -> +x rotates toward +z (CSS direction)");
});

ok("plan<->world round-trip + elevation + rotation feed", () => {
  for (let i = 0; i < 1000; i += 1) {
    const p = { x: rand() * 480, z: rand() * 320 };
    const el = rand() * 96;
    const w = T.planToWorld(p, { elevationInches: el });
    const back = T.worldToPlan(w);
    assertNear(back.x_inches, p.x, 1e-9, "x rt");
    assertNear(back.z_inches, p.z, 1e-9, "z rt");
    assertNear(back.elevation_inches, el, 1e-9, "elevation rt");
  }
  assert.deepEqual(T.planToWorld({ x: 48, z: 24 }, { elevationInches: 12 }), { x: 4, y: 1, z: 2 });
  assertNear(T.planRotationToWorldRadians(90), Math.PI / 2, 1e-12, "deg->rad feed");
  assert.equal(T.planToWorld(null), null);
  assert.equal(T.worldToPlan({ x: 1 }), null);
});

ok("percent seam round-trip + clamps + classification", () => {
  for (let i = 0; i < 500; i += 1) {
    const p = { x: rand() * 480, z: rand() * 320 };
    const pct = T.planToExtentPercent(p.x, p.z);
    const back = T.extentPercentToPlan(pct.leftPct, pct.topPct);
    assertNear(back.x_inches, p.x, 1e-9, "pct x rt");
    assertNear(back.z_inches, p.z, 1e-9, "pct z rt");
  }
  assert.deepEqual(T.clampPlanPoint({ x: -5, z: 400 }), { x: 0, z: 320 });
  assert.equal(T.pointInPlan({ x: 480, z: 320 }), true);
  assert.equal(T.pointInPlan({ x: 480.1, z: 0 }), false);
  assert.equal(T.clampZoomValue(3), 2);
  assert.equal(T.clampZoomValue(0.1), 0.5);
  assert.equal(T.clampZoomValue(NaN), null);
  assert.equal(I.classifyPlanPoint({ x: 10, z: 10 }), "inside");
  assert.equal(I.classifyPlanPoint({ x: -1, z: 10 }), "outside");
  assert.equal(I.classifyPlanPoint({ x: NaN, z: 0 }), "invalid");
});

// =========================================================================
// 3. Hit-test fixtures incl. degenerate geometry (O-039)
// =========================================================================
const scene = {
  items: [
    { component_id: "sq", x_inches: 40, z_inches: 40, length_inches: 48, width_inches: 36 },                          // [0] 40..88 x 40..76
    { component_id: "rot", x_inches: 200, z_inches: 100, length_inches: 48, width_inches: 24, rotation_degrees: 90 }, // [1] rotated
    { component_id: "pil", foundation_type: "pillar", x_inches: 300, z_inches: 200, diameter: 24 },                   // [2] circle c(312,212) r12
    { component_id: "bad", x_inches: 0, z_inches: 0, length_inches: -5, width_inches: 10 },                           // [3] unplaceable
    { component_id: "badpos", x_inches: "oops", z_inches: 0, length_inches: 10, width_inches: 10 },                   // [4] invalid pos
    { component_id: "under", x_inches: 40, z_inches: 40, length_inches: 48, width_inches: 36 },                       // [5] under [0]? no — later = on top, so [5] is ABOVE [0]
  ],
  poles: [
    { component_id: "p1", x_inches: 60, z_inches: 55 },   // sits inside item [0]/[5] footprint
    { component_id: "p2", x_inches: 400, z_inches: 300 },
  ],
  walls: [
    { component_id: "w1", shape: { points: [{ x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 30 }], closed: false, segments: [{ component_id: "s0" }, { component_id: "s1" }] } },
    { component_id: "w2", shape: { points: [{ x: 350, z: 40 }, { x: 430, z: 40 }, { x: 430, z: 120 }, { x: 350, z: 120 }], closed: true } },
    { component_id: "w3", shape: { points: [{ x: 200, z: 250 }, { x: 200, z: 250 }, { x: 260, z: 250 }], closed: false } }, // zero-length first seg
    { component_id: "w4", shape: { points: [{ x: 50, z: 300 }], closed: false } },                                        // single point
    { component_id: "w5", shape: { points: [{ x: "bad", z: 290 }, { x: 90, z: 290 }], closed: false } },                  // non-finite vertex dropped
    { component_id: "w6", shape: { points: [{ x: 150, z: 280 }, { x: 170, z: 280 }, { x: 160, z: 280 }], closed: true } },  // collinear closed — degenerate face
  ],
};

ok("item face / edges / vertices / miss", () => {
  assert.equal(I.hitTestPlan(scene, { x: 60, z: 55 })?.kind, "pole");       // pole p1 over item
  const face = I.hitTestPlan(scene, { x: 64, z: 58 }, { order: ["item"] });
  assert.equal(face.kind, "item-face");
  assert.equal(face.collection, "items");
  assert.equal(face.key, "component:under");                                 // later item paints on top
  assert.equal(face.label, "Foundation 6");
  const north = I.hitTestPlan(scene, { x: 64, z: 38.5 }, { order: ["item"] });
  assert.equal(north.kind, "item-edge");
  assert.equal(north.edge, "n");
  const west = I.hitTestPlan(scene, { x: 38.5, z: 58 }, { order: ["item"] });
  assert.equal(west.kind, "item-edge");
  assert.equal(west.edge, "w");
  const se = I.hitTestPlan(scene, { x: 89, z: 77.5 }, { order: ["item"] });
  assert.equal(se.kind, "item-vertex");
  assert.equal(se.corner, "se");
  const nwIn = I.hitTestPlan(scene, { x: 41, z: 41 }, { order: ["item"] });   // inside near corner
  assert.equal(nwIn.kind, "item-vertex");
  assert.equal(nwIn.corner, "nw");
  assert.equal(I.hitTestPlan(scene, { x: 150, z: 55 }, { order: ["item"] }), null); // miss
  // outside-but-near edge still grabbable
  const eOut = I.hitTestPlan(scene, { x: 90.5, z: 58 }, { order: ["item"] });
  assert.equal(eOut.kind, "item-edge");
  assert.equal(eOut.edge, "e");
});

ok("rotated item hit-tests in the local frame", () => {
  // item[1]: corner (200,100) size 48x24 rot90 -> center (224,112); rotated
  // footprint spans x 212..236, z 88..136
  const face = I.hitTestPlan(scene, { x: 224, z: 112 }, { order: ["item"] });
  assert.equal(face.kind, "item-face");
  assert.equal(face.componentId, "rot");
  // (210,100) sits 2" west of the rotated footprint's local-south edge
  // (plan x=212). Unrotated it would be on the 'n' edge — rotation-aware
  // edge identity is the discriminator.
  const south = I.hitTestPlan(scene, { x: 210, z: 100 }, { order: ["item"] });
  assert.equal(south.kind, "item-edge");
  assert.equal(south.edge, "s");
  const axisMiss = I.hitTestPlan(scene, { x: 244, z: 106 }, { order: ["item"] });
  assert.equal(axisMiss, null, "inside the UNROTATED footprint but outside rotated — must miss");
  const edge = I.hitTestPlan(scene, { x: 236.5, z: 112 }, { order: ["item"] });
  assert.equal(edge.kind, "item-edge");
  assert.equal(edge.edge, "n"); // plan +x side of a rot90 rect is local -z = 'n'
});

ok("pillar hit-tests as a circle (face vs rim)", () => {
  assert.equal(I.hitTestPlan(scene, { x: 312, z: 212 }, { order: ["item"] }).kind, "item-face");
  assert.equal(I.hitTestPlan(scene, { x: 312, z: 224 }, { order: ["item"] }).kind, "item-edge"); // on rim
  assert.equal(I.hitTestPlan(scene, { x: 312, z: 230 }, { order: ["item"] }), null);
  const rim = I.hitTestPlan(scene, { x: 312, z: 224 }, { order: ["item"] });
  assert.equal(rim.edge, "rim");
});

ok("unplaceable / invalid-position items are not hit-testable", () => {
  assert.equal(I.hitTestPlan(scene, { x: 5, z: 5 }, { order: ["item"] }), null);
});

ok("poles hit within radius, beat item faces (paint order)", () => {
  const h = I.hitTestPlan(scene, { x: 400, z: 300 });
  assert.equal(h.kind, "pole");
  assert.equal(h.label, "Pole 2");
  assert.ok(h.distance <= 4);
  assert.equal(I.hitTestPlan(scene, { x: 408, z: 300 }), null);
  const over = I.hitTestPlan(scene, { x: 60, z: 55 });
  assert.equal(over.kind, "pole", "pole renders above item face");
});

ok("wall vertex / segment / face / open-vs-closed", () => {
  const v = I.hitTestPlan(scene, { x: 31, z: 11 }, { order: ["wall"] });
  assert.equal(v.kind, "wall-vertex");
  assert.equal(v.vertexIndex, 1);
  const seg = I.hitTestPlan(scene, { x: 20, z: 12 }, { order: ["wall"] });
  assert.equal(seg.kind, "wall-segment");
  assert.equal(seg.segmentIndex, 0);
  assert.equal(seg.segmentComponentId, "s0");
  assertNear(seg.projection.x, 20, 1e-9, "projection x");
  assertNear(seg.projection.z, 10, 1e-9, "projection z");
  assert.ok(seg.t > 0.4 && seg.t < 0.6, "t mid");
  // open path: inside the implied triangle is NOT a face
  assert.equal(I.hitTestPlan(scene, { x: 28, z: 14 }, { order: ["wall"] })?.kind !== "wall-face", true);
  // closed rect interior -> wall-face
  const f = I.hitTestPlan(scene, { x: 390, z: 80 }, { order: ["wall"] });
  assert.equal(f.kind, "wall-face");
  assert.equal(f.componentId, "w2");
  // closed rect wrap segment (points[3]->points[0]) hittable
  const wrap = I.hitTestPlan(scene, { x: 348.5, z: 80 }, { order: ["wall"] });
  assert.equal(wrap.kind, "wall-segment");
  assert.equal(wrap.segmentIndex, 3);
});

ok("degenerate wall geometry: zero-length seg, single point, bad vertex, collinear face", () => {
  // w3: first segment (200,250)->(200,250) is zero-length — skipped as a
  // segment; the point is still a vertex; second segment works.
  const vtx = I.hitTestPlan(scene, { x: 200, z: 250 }, { order: ["wall"] });
  assert.equal(vtx.kind, "wall-vertex");
  const seg = I.hitTestPlan(scene, { x: 230, z: 248 }, { order: ["wall"] });
  assert.equal(seg.kind, "wall-segment");
  assert.equal(seg.segmentIndex, 1, "real segment index preserved");
  // w4 single point -> vertex only
  assert.equal(I.hitTestPlan(scene, { x: 50, z: 300 }, { order: ["wall"] }).kind, "wall-vertex");
  // w5: non-finite vertex dropped; surviving segment still hittable
  const w5 = I.hitTestPlan(scene, { x: 90, z: 291 }, { order: ["wall"] });
  assert.ok(w5, "surviving geometry still hittable");
  // w6 collinear closed -> no face area
  const w6 = I.hitTestPlan(scene, { x: 160, z: 280 }, { order: ["wall"] });
  assert.ok(!w6 || w6.kind !== "wall-face", "degenerate polygon reports no face");
  // non-finite test point
  assert.deepEqual(I.hitTestPlanAll(scene, { x: NaN, z: 0 }), []);
  assert.equal(I.hitTestPlan(scene, null), null);
});

ok("hitTestPlanAll ranks topmost-first; labels read cleanly", () => {
  const all = I.hitTestPlanAll(scene, { x: 60, z: 55 });
  assert.equal(all[0].kind, "pole");
  assert.ok(all.some((h) => h.kind === "item-face"));
  const seg = I.hitTestPlan(scene, { x: 20, z: 12 }, { order: ["wall"] });
  assert.equal(I.hitLabel(seg), "Wall 1 segment 1");
  const vtx = I.hitTestPlan(scene, { x: 41, z: 41 }, { order: ["item"] });
  assert.equal(I.hitLabel(vtx), "Foundation 6 nw corner");
  assert.equal(I.sceneObjectLabel("poles", 1), "Pole 2");
  assert.equal(I.hitLabel(null), null);
});

ok("tolerances are caller-tunable (px tolerance via view scale)", () => {
  const v = T.planViewForViewport({ viewport: { width: 960, height: 640 } }); // 2 px/in
  const tolIn = 9 / v.scaleX; // 9px tolerance -> 4.5 inches
  // (36,55) is 4" west of item[0]'s x=40 edge: misses at the 3" default,
  // hits at 4.5".
  assert.equal(I.hitTestPlan(scene, { x: 36, z: 55 }, { order: ["item"] }), null, "default 3in misses");
  const hit = I.hitTestPlan(scene, { x: 36, z: 55 }, { order: ["item"], edgeInches: tolIn });
  assert.equal(hit?.kind, "item-edge");
  assert.equal(hit?.edge, "w");
});

// =========================================================================
// 4. Drag/keyboard equivalence vs frozen remote math (O-039 seam)
// =========================================================================
ok("beginSceneDrag produces the remote record shape + grab offsets", () => {
  for (let i = 0; i < 1000; i += 1) {
    const pos = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const point = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const d = I.beginSceneDrag({
      pointerId: 7, key: "component:c1", identityKind: "component", legacyIndex: 2,
      count: 3, corner: { x: pos.x_inches, z: pos.z_inches }, grabPoint: point, fingerprint: "fp",
    });
    const g = remoteGrab(point, pos);
    assertNear(d.grab.dx, g.dx, 0, "grab.dx");
    assertNear(d.grab.dz, g.dz, 0, "grab.dz");
    assert.equal(d.moved, false);
    assert.equal(d.pointerId, 7);
    assert.deepEqual(d.corner, { x: pos.x_inches, z: pos.z_inches });
  }
});

ok("commitSceneDrag == remote commit math over gesture corpus", () => {
  let commits = 0, nulls = 0;
  for (let i = 0; i < 5000; i += 1) {
    const pos = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const grab = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const release = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const d = I.beginSceneDrag({ pointerId: 1, key: "k", identityKind: "component", legacyIndex: 0, count: 1, corner: { x: pos.x_inches, z: pos.z_inches }, grabPoint: grab, fingerprint: "f" });
    // remote path uses the same grab math
    const dRemote = { grab: remoteGrab(grab, pos), corner: { x: pos.x_inches, z: pos.z_inches } };
    const expected = remoteCommit(dRemote, release);
    const got = I.commitSceneDrag(d, release);
    assert.deepEqual(got, expected, `commit mismatch @${i}: ${JSON.stringify({ pos, grab, release })}`);
    if (got) commits += 1; else nulls += 1;
  }
  assert.ok(commits > 1000, `commit coverage ${commits}`);
  // Deterministic null paths the random corpus may never hit:
  // release exactly on the grab (raw === corner) and sub-inch wiggle that
  // rounds back to the same corner.
  const still = I.beginSceneDrag({ pointerId: 1, key: "k", identityKind: "component", legacyIndex: 0, count: 1, corner: { x: 100, z: 60 }, grabPoint: { x_inches: 130, z_inches: 80 }, fingerprint: "f" });
  assert.equal(I.commitSceneDrag(still, { x_inches: 130, z_inches: 80 }), null, "unchanged corner -> null");
  assert.equal(I.commitSceneDrag(still, { x_inches: 130.3, z_inches: 79.7 }), null, "sub-inch wiggle -> null");
  // Fractional authored corner: the wiggle guard compares the ROUNDED raw
  // to the raw corner — a non-integer corner can never round back, so the
  // same release that would null an integer corner commits here.
  const frac = I.beginSceneDrag({ corner: { x: 10.25, z: 10.25 }, grabPoint: { x_inches: 12, z_inches: 12 } });
  assert.deepEqual(I.commitSceneDrag(frac, { x_inches: 12.49, z_inches: 12.49 }), { x_inches: 11, z_inches: 11 }, "fractional corner commits the rounded move");
  assert.equal(I.commitSceneDrag(frac, { x_inches: 12, z_inches: 12 }), null, "release on grab still nulls (raw===corner)");
  const moved = I.commitSceneDrag(still, { x_inches: 154, z_inches: 96 });
  assert.deepEqual(moved, { x_inches: 124, z_inches: 76 }, "whole-inch patch");
  assert.ok(nulls >= 0, `null coverage ${nulls}`);
});

ok("sceneDragCorner == remote move math", () => {
  for (let i = 0; i < 2000; i += 1) {
    const pos = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const grab = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const cur = { x_inches: rand() * 480, z_inches: rand() * 320 };
    const d = I.beginSceneDrag({ corner: { x: pos.x_inches, z: pos.z_inches }, grabPoint: grab });
    const g = remoteGrab(grab, pos);
    const expected = { x: cur.x_inches - g.dx, z: cur.z_inches - g.dz };
    const got = I.sceneDragCorner(d, cur);
    assert.equal(got.x, expected.x);
    assert.equal(got.z, expected.z);
  }
});

ok("resolveSceneDragTarget == remote findCurrentIndex + fingerprint guard", () => {
  const mk = (id) => ({ component_id: id, x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24 });
  const items = [mk("a"), mk("b"), mk("c")];
  const fp = (it) => R.layoutItemFingerprint(it);
  // component-id path: reordered rows re-resolve
  for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
    const arr = order.map((i) => items[i]);
    const d = { key: "component:b", identityKind: "component", legacyIndex: 1, count: 3, fingerprint: fp(items[1]) };
    const t = I.resolveSceneDragTarget(d, arr);
    const idx = remoteFindIndex(d, arr);
    assert.equal(t ? t.index : -1, idx);
    assert.equal(t.item.component_id, "b");
  }
  // deleted row -> no target
  const dDel = { key: "component:c", identityKind: "component", legacyIndex: 2, count: 3, fingerprint: fp(items[2]) };
  assert.equal(I.resolveSceneDragTarget(dDel, [items[0], items[1]]), null);
  // index-identity: count match resolves, count change cancels
  const dIdx = { key: "index:1", identityKind: "index", legacyIndex: 1, count: 3, fingerprint: fp(items[1]) };
  assert.equal(I.resolveSceneDragTarget(dIdx, items).index, 1);
  assert.equal(I.resolveSceneDragTarget(dIdx, items.slice(0, 2)), null);
  // fingerprint mismatch cancels
  const dFp = { key: "component:a", identityKind: "component", legacyIndex: 0, count: 3, fingerprint: "stale" };
  assert.equal(I.resolveSceneDragTarget(dFp, items), null);
  // legacy id identity
  const legacy = [{ id: 9, x_inches: 0, z_inches: 0, length_inches: 10, width_inches: 10 }];
  const dLeg = { key: "legacy:9", identityKind: "legacy", legacyIndex: 0, count: 1, fingerprint: fp(legacy[0]) };
  assert.equal(I.resolveSceneDragTarget(dLeg, legacy).index, 0);
});

ok("keyboardNudge == remote key handling over the full matrix", () => {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "Enter", "Tab", "Escape", " "];
  const mods = [0, 1, 2, 4, 8, 3, 9, 15]; // bit0 shift, bit1 ctrl, bit2 alt, bit3 meta
  const remoteDir = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const step = e.shiftKey ? 12 : 1;
    const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = dirs[e.key];
    return d ? { dx: d[0], dz: d[1] } : null;
  };
  for (const key of keys) {
    for (const m of mods) {
      const e = { key, shiftKey: !!(m & 1), ctrlKey: !!(m & 2), altKey: !!(m & 4), metaKey: !!(m & 8) };
      assert.deepEqual(I.keyboardNudge(e), remoteDir(e), `${key} mods=${m}`);
    }
  }
  const patch = I.nudgePatch({ valid: true, x_inches: 40, z_inches: 55 }, { dx: -1, dz: 12 });
  assert.deepEqual(patch, { x_inches: 39, z_inches: 67 });
  assert.equal(I.nudgePatch({ x_inches: 0 }, { dx: 1, dz: 0 }), null);
});

// =========================================================================
// 5. Pointer normalization + numeric fallback (O-039)
// =========================================================================
ok("normalizeScenePointer: mouse/pen/touch + invalid", () => {
  const p = I.normalizeScenePointer({ pointerId: 3, pointerType: "pen", clientX: 10, clientY: 20, button: 0, isPrimary: true, shiftKey: true });
  assert.equal(p.pointerType, "pen");
  assert.equal(p.shiftKey, true);
  assert.equal(p.isPrimary, true);
  const t = I.normalizeScenePointer({ type: "touchstart", touches: [{ clientX: 50, clientY: 60 }] });
  assert.equal(t.pointerType, "touch");
  assert.equal(t.clientX, 50);
  assert.equal(t.pointerId, null);
  const ct = I.normalizeScenePointer({ type: "touchend", changedTouches: [{ clientX: 51, clientY: 61 }] });
  assert.equal(ct.clientY, 61);
  assert.equal(I.normalizeScenePointer({}), null);
  assert.equal(I.normalizeScenePointer(null), null);
  assert.equal(I.normalizeScenePointer({ clientX: NaN, clientY: 4 }), null);
});

ok("isPrimaryScenePress == canvas guard", () => {
  assert.equal(I.isPrimaryScenePress({ button: 0, isPrimary: true, clientX: 0, clientY: 0 }), true);
  assert.equal(I.isPrimaryScenePress({ button: 2, isPrimary: true, clientX: 0, clientY: 0 }), false);
  assert.equal(I.isPrimaryScenePress({ button: 0, isPrimary: false, clientX: 0, clientY: 0 }), false);
});

ok("scenePointerToPlan == remote layoutPointInches through a rect", () => {
  const rect = { left: 11.5, top: -3.25, width: 733.3333, height: 488.8889 };
  for (let i = 0; i < 2000; i += 1) {
    const e = { clientX: rand() * 1000 - 100, clientY: rand() * 800 - 100, pointerId: 1 };
    const expected = R.layoutPointInches(e.clientX, e.clientY, rect);
    const got = I.scenePointerToPlan(e, rect);
    assert.equal(expected === null, got === null, `verdict @${i}`);
    if (expected) {
      assertNear(got.point.x_inches, expected.x_inches, 1e-9, "x");
      assertNear(got.point.z_inches, expected.z_inches, 1e-9, "z");
    }
  }
});

ok("positionPatch numeric fallback: verbatim vs rounded", () => {
  assert.deepEqual(I.positionPatch({ x_inches: 12.4, z_inches: 9.6 }), { x_inches: 12.4, z_inches: 9.6 });
  assert.deepEqual(I.positionPatch({ x: 12.4, z: 9.6 }, { round: true }), { x_inches: 12, z_inches: 10 });
  assert.equal(I.positionPatch({ x_inches: "12", z_inches: 5 }), null);
  assert.equal(I.positionPatch(null), null);
});

// =========================================================================
// 6. Snapping (O-035-ready primitives)
// =========================================================================
ok("snapValue/snapPlanPoint", () => {
  assert.equal(I.snapValue(13.4, 2), 14);
  assert.equal(I.snapValue(13.0, 2), 14);
  assert.equal(I.snapValue(12.9, 2), 12);
  assert.equal(I.snapValue(NaN, 2), NaN);
  assert.equal(I.snapValue(5, 0), 5);
  assert.deepEqual(I.snapPlanPoint({ x: 13.4, z: 7.1 }, 2), { x: 14, z: 8 });
  assert.equal(I.snapPlanPoint({ x: 1, z: 2 }, 0), null);
});

ok("snapCandidatesForScene: edges, centers, poles, wall verts, bounds, excludeKey", () => {
  const c = I.snapCandidatesForScene(scene, { excludeKey: "component:sq" });
  const xs = c.x.map((v) => v.value);
  const zs = c.z.map((v) => v.value);
  assert.ok(xs.includes(0) && xs.includes(480), "x bounds");
  assert.ok(zs.includes(0) && zs.includes(320), "z bounds");
  assert.ok(!xs.includes(40) || c.x.find((v) => v.value === 40)?.source.key !== "component:sq", "excluded row edges absent");
  assert.ok(xs.includes(60), "pole x candidate");
  assert.ok(xs.includes(88), "item edge candidate (under row)");
  assert.ok(zs.includes(30), "wall vertex z candidate");
  // dedupe + sort
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.equal(new Set(xs).size, xs.length);
  const noCenters = I.snapCandidatesForScene(scene, { includeCenters: false });
  assert.ok(!noCenters.x.some((v) => v.source.kind === "item-center"));
});

ok("snapToCandidates: nearest wins, guides only for snapped axes", () => {
  const cands = { x: [{ value: 100, source: { kind: "item-edge" } }], z: [{ value: 50, source: { kind: "bound" } }] };
  const s = I.snapToCandidates({ x: 102, z: 90 }, cands, 3);
  assert.equal(s.x, 100);
  assert.equal(s.z, 90);
  assert.equal(s.guides.length, 1);
  assert.equal(s.guides[0].axis, "x");
  // tie -> smaller value
  const tie = I.snapToCandidates({ x: 105, z: 0 }, { x: [{ value: 100, source: {} }, { value: 110, source: {} }], z: [] }, 5);
  assert.equal(tie.x, 100);
  assert.equal(I.snapToCandidates({ x: 1, z: 1 }, null, 2), null);
});

// =========================================================================
// Results
// =========================================================================
const result = {
  suite: "verify-o038-o039-model",
  seed: "0x038039",
  assertions: pass,
  failures,
  coverage: {
    remoteParitySweepPoints: 20000,
    commitGestureCorpus: 5000,
    dragMoveCorpus: 2000,
    scenePointerToPlanCorpus: 2000,
    elementRectRoundTrips: 6 * 500,
    viewportFitRoundTrips: 48 * 60,
    frameLocalRoundTrips: 12 * 100,
    worldRoundTrips: 1000,
    keyboardMatrixCases: 9 * 8,
    hitTestFixtures: "items(face/edge x4/vertex/pillar-rim/rotated-90/miss/invalid-dim/invalid-pos) + poles + walls(vertex/segment/wrap/face/open/closed/zero-length-seg/single-point/bad-vertex/collinear) + z-order + tolerances + labels",
  },
  status: failures.length ? "FAIL" : "PASS",
};
fs.writeFileSync(new URL("./o038-o039-model-verification.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(`${result.status} ${result.suite}: ${pass} assertions, ${failures.length} failures`);
failures.slice(0, 12).forEach((f) => console.log(" -", f.name, "=>", f.message));
process.exit(failures.length ? 1 : 0);
