// O-035 (CMP-C04) model verification — scene edit operations.
// Covers: target resolution + bounds (rotated AABB, pillar, pole, wall),
// locked/read-only/sub-object/unresolved rejection, move (single + multi +
// wall shape + snap-assist + grid), resize through all 8 handles (unrotated
// anchor math, rotated frames, pillar diameter, min clamp, snap), rotate
// (handle pointer math, snap, keyboard step, normalization), align
// (plan + primary, all six edges), distribute (equal gaps, anchors fixed),
// typed coordinates/dimensions (atomic validation, inapplicable fields),
// delete/duplicate descriptors, and UNDO ROUND-TRIPS through the real
// O-040 history store — single-channel edits apply/revert exactly, and
// multi payloads prove both the honest 'stale' quarantine under the
// items-only observe domain AND real undo under the documented
// full-scene mount contract. Runs on the STAGING bundle only.
// Usage: node verify-o035-model.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ops as O, selection as S, input as I, model as M, transforms as T, history as H } from "./scene-editops-bundle.mjs";

let pass = 0;
const failures = [];
const ok = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { failures.push({ name, message: String(e.stack || e.message || e).slice(0, 900) }); }
};

// --- fixtures ---------------------------------------------------------------
const item = (id, x, z, extra = {}) =>
  ({ component_id: id, x_inches: x, z_inches: z, length_inches: 24, width_inches: 24, foundation_type: "spread_foot", ...extra });
const pillar = (id, x, z, d = 24, extra = {}) =>
  ({ component_id: id, x_inches: x, z_inches: z, diameter: d, foundation_type: "pillar", ...extra });
const pole = (id, x, z, extra = {}) => ({ component_id: id, x_inches: x, z_inches: z, ...extra });
const wall = (id, points, { closed = false, segments } = {}) =>
  ({ component_id: id, shape: { points: points.map(([x, z]) => ({ x, z })), closed, ...(segments ? { segments } : {}) } });
const seg = (id, extra = {}) => ({ component_id: id, ...extra });
const cap = (id, wallId, segId, extra = {}) => ({ component_id: id, wall_component_id: wallId, segment_component_id: segId, ...extra });
const cabinet = (id, mount, ref, extra = {}) => ({
  component_id: id, mount,
  ...(mount === "pole" ? { pole_component_id: ref } : { foundation_component_id: ref }),
  ...extra,
});
const scene = (o = {}) => ({
  items: o.items || [], walls: o.walls || [], poles: o.poles || [],
  wall_caps: o.wall_caps || [], signage_cabinets: o.signage_cabinets || [],
});
const iid = (id) => `item:component:${id}`;
const pid = (id) => `pole:component:${id}`;
const wid = (id) => `wall:component:${id}`;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const assertApprox = (a, b, msg, eps = 1e-9) => assert.ok(approx(a, b, eps), `${msg}: ${a} !~ ${b}`);

// ===========================================================================
// 1. Bounds + target resolution
// ===========================================================================
ok("bounds: unrotated item AABB = footprint box", () => {
  const b = O.planBoundsOfItem(item("i0", 100, 50, { length_inches: 48, width_inches: 36 }));
  assert.deepEqual({ minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ, cx: b.cx, cz: b.cz },
    { minX: 100, minZ: 50, maxX: 148, maxZ: 86, cx: 124, cz: 68 });
});

ok("bounds: rotated item AABB covers the rotated footprint (90°)", () => {
  const b = O.planBoundsOfItem(item("i0", 100, 50, { length_inches: 48, width_inches: 24, rotation_degrees: 90 }));
  // center (124,62); rotated 48x24 → 24 wide x 48 deep
  assertApprox(b.minX, 124 - 12, "minX"); assertApprox(b.maxX, 124 + 12, "maxX");
  assertApprox(b.minZ, 62 - 24, "minZ"); assertApprox(b.maxZ, 62 + 24, "maxZ");
  assertApprox(b.cx, 124, "cx"); assertApprox(b.cz, 62, "cz");
});

ok("bounds: 45° rotated square AABB = diagonal span", () => {
  const b = O.planBoundsOfItem(item("i0", 100, 100, { length_inches: 48, width_inches: 48, rotation_degrees: 45 }));
  const half = 24 * Math.SQRT2;
  assertApprox(b.width, 2 * half, "width", 1e-6);
  assertApprox(b.cx, 124, "cx"); assertApprox(b.cz, 124, "cz");
});

ok("bounds: pillar = bounding square, pole = point, wall = outline box", () => {
  const pb = O.planBoundsOfItem(pillar("p0", 100, 100, 30));
  assert.deepEqual({ w: pb.width, d: pb.depth, cx: pb.cx, cz: pb.cz }, { w: 30, d: 30, cx: 115, cz: 115 });
  const pp = O.planBoundsOfPole(pole("q0", 40, 60));
  assert.deepEqual({ minX: pp.minX, maxX: pp.maxX, cx: pp.cx }, { minX: 40, maxX: 40, cx: 40 });
  const wb = O.planBoundsOfWall(wall("w0", [[10, 20], [90, 10], [80, 70]]));
  assert.deepEqual({ minX: wb.minX, minZ: wb.minZ, maxX: wb.maxX, maxZ: wb.maxZ },
    { minX: 10, minZ: 10, maxX: 90, maxZ: 70 });
});

ok("resolve: planar rows resolve, sub-object/mounted/unknown skip with reasons", () => {
  const sc = scene({
    items: [item("i0", 10, 10), { component_id: "bad", x_inches: "oops", z_inches: 5, length_inches: 24, width_inches: 24, foundation_type: "spread_foot" }, item("lk", 5, 5, { locked: true })],
    walls: [wall("w0", [[0, 0], [50, 0], [50, 30]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2")] })],
    poles: [pole("p0", 70, 70)],
    wall_caps: [cap("c0", "w0", "s0")],
    signage_cabinets: [cabinet("b0", "pole", "p0")],
  });
  const { targets, skipped } = O.resolveOpTargets(sc, [
    iid("i0"), iid("bad"), iid("lk"), wid("w0"), pid("p0"),
    "wall-segment:component:w0|component:s0", "wall-cap:component:c0",
    "cabinet:component:b0", "item:component:ghost", "garbage", null,
  ]);
  assert.deepEqual(targets.map((t) => t.id), [iid("i0"), wid("w0"), pid("p0")]);
  const reason = (id) => skipped.find((s) => s.id === id)?.reason;
  assert.equal(reason(iid("bad")), "no-geometry");
  assert.equal(reason(iid("lk")), "locked");
  assert.equal(reason("wall-segment:component:w0|component:s0"), "non-planar");
  assert.equal(reason("wall-cap:component:c0"), "non-planar");
  assert.equal(reason("cabinet:component:b0"), "non-planar");
  assert.equal(reason("item:component:ghost"), "unresolved");
  assert.equal(reason("garbage"), "unparseable");
  // custom isLocked override unlocks
  const r2 = O.resolveOpTargets(sc, [iid("lk")], { isLocked: () => false });
  assert.equal(r2.targets.length, 1);
  assert.equal(r2.skipped.length, 0);
});

// ===========================================================================
// 2. Move — single, multi, wall shape, snap, grid, guards
// ===========================================================================
ok("move: single item patch is patchItem-shaped with complete before", () => {
  const sc = scene({ items: [item("i0", 100, 50)] });
  const r = O.moveSelectionPatch(sc, [iid("i0")], { dx: 12, dz: -8 });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1);
  const p = r.patches[0];
  assert.equal(p.collection, "items"); assert.equal(p.index, 0);
  assert.deepEqual(p.patch, { x_inches: 112, z_inches: 42 });
  assert.deepEqual(p.before, { x_inches: 100, z_inches: 50 });
  assert.ok(O.patchesFitSingleItemChannel(r.patches));
});

ok("move: multi selection patches items + pole + wall in one op", () => {
  const w = wall("w0", [[10, 10], [60, 10], [60, 40]], { closed: true, segments: [seg("s0")] });
  const sc = scene({ items: [item("i0", 10, 10)], poles: [pole("p0", 30, 30)], walls: [w] });
  const r = O.moveSelectionPatch(sc, [iid("i0"), pid("p0"), wid("w0")], { dx: 5, dz: 5 });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 3);
  assert.equal(r.patches[2].collection, "walls");
  assert.deepEqual(r.patches[2].patch.shape.points, [{ x: 15, z: 15 }, { x: 65, z: 15 }, { x: 65, z: 45 }]);
  assert.equal(r.patches[2].patch.shape.closed, true, "closed preserved");
  assert.deepEqual(r.patches[2].patch.shape.segments, [{ component_id: "s0" }], "segments preserved verbatim");
  assert.deepEqual(r.patches[2].before.shape.points, w.shape.points, "wall before = authored shape");
  assert.ok(!O.patchesFitSingleItemChannel(r.patches), "multi needs the multi channel");
});

ok("move: malformed authored wall vertices ride verbatim; NaN never emitted", () => {
  const w = wall("w0", [[10, 10], ["bad", 10], [60, 40]]);
  const sc = scene({ walls: [w] });
  const r = O.moveSelectionPatch(sc, [wid("w0")], { dx: 5, dz: 5 });
  assert.equal(r.status, "ok");
  const pts = r.patches[0].patch.shape.points;
  assert.deepEqual(pts[1], { x: "bad", z: 10 }, "invalid authored point preserved verbatim");
});

ok("move: zero delta / rounded-back delta is a noop, not a patch", () => {
  const sc = scene({ items: [item("i0", 100, 50)] });
  assert.equal(O.moveSelectionPatch(sc, [iid("i0")], { dx: 0, dz: 0 }).status, "noop");
  assert.equal(O.moveSelectionPatch(sc, [iid("i0")], { dx: 0.4, dz: -0.3 }, { round: true }).status, "noop");
});

ok("move: invalid delta, empty selection, read-only all reject cleanly", () => {
  const sc = scene({ items: [item("i0", 100, 50)] });
  assert.equal(O.moveSelectionPatch(sc, [iid("i0")], { dx: NaN, dz: 2 }).reason, "invalid-delta");
  assert.equal(O.moveSelectionPatch(sc, [iid("i0")], { dx: "fast", dz: 2 }).reason, "invalid-delta");
  assert.equal(O.moveSelectionPatch(sc, [iid("ghost")], { dx: 1, dz: 1 }).reason, "empty-selection");
  assert.equal(O.moveSelectionPatch(sc, [iid("i0")], { dx: 1, dz: 1 }, { readOnly: true }).reason, "read-only");
});

ok("move + snap: bounds snap adjusts the delta onto an object edge + guides", () => {
  // i1's left edge sits at x=200; moving i0 right 190 puts its right edge at
  // 224 — within tol of i1's left edge at 200? probe right edge: 200-224=-24
  // too far; probe left edge: 200-100-190=-90 no. Try center: i1 center 224;
  // i0 center after move = 112+24+190 → too far. Instead: move i0 right by
  // 88 → right edge 212, within tol 3 of i1 left 200? adj = -12 no.
  // Choose: i0 at (10,10) 24x24; i1 at (200,10) 48x48. dx=163 → right edge
  // 197, adj=+3 within tol → snaps to 200.
  const sc = scene({ items: [item("i0", 10, 10), item("i1", 200, 10, { length_inches: 48, width_inches: 48 })] });
  const r = O.moveSelectionPatch(sc, [iid("i0")], { dx: 163, dz: 0 }, {
    snap: { candidates: O.snapCandidatesOutside(sc, [iid("i0")]), tolInches: 4 },
  });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, { x_inches: 176, z_inches: 10 }, "delta adjusted +3 → right edge lands on 200");
  const xg = r.guides.find((g) => g.axis === "x");
  assert.ok(xg, "x guide reported"); assert.equal(xg.value, 200);
  assert.equal(r.delta.dx, 166, "delta carries the +3 snap");
});

ok("move + grid: unsnapped axes fall back to the grid step", () => {
  const sc = scene({ items: [item("i0", 13, 27)] });
  const r = O.moveSelectionPatch(sc, [iid("i0")], { dx: 5, dz: 5 }, { gridStepInches: 12 });
  assert.equal(r.status, "ok");
  // bounds.minX after delta = 18 → nearest 12-grid = 24 → dx += 6
  // bounds.minZ after delta = 32 → nearest 12-grid = 36 → dz += 4
  assert.deepEqual(r.patches[0].patch, { x_inches: 24, z_inches: 36 });
  assert.equal(r.guides.filter((g) => g.source?.kind === "grid").length, 2);
});

ok("snap: candidatesOutside excludes every moving row", () => {
  const sc = scene({ items: [item("i0", 10, 10), item("i1", 200, 10)], poles: [pole("p0", 60, 60)] });
  const c = O.snapCandidatesOutside(sc, [iid("i0"), iid("i1")]);
  assert.ok(!c.x.some((x) => x.value === 200 || x.value === 10), "moving item edges absent");
  assert.ok(c.x.some((x) => x.value === 60), "pole candidate kept");
  const c1 = O.snapCandidatesOutside(sc, []);
  assert.ok(c1.x.some((x) => x.value === 200), "nothing excluded with empty movers");
});

ok("snapDraggedItem: probes edges + center, smallest adjustment wins", () => {
  const it = item("i0", 0, 0, { length_inches: 24, width_inches: 24 });
  const cands = { x: [{ value: 100, source: { kind: "item-edge" } }], z: [] };
  // corner 95 → right edge 119; left edge probe: 100-95=+5; right edge: 100-119=-19; center: 100-107=-7
  // smallest |adj| = +5 (left edge to 100)
  const a = O.snapDraggedItem(it, { x: 95, z: 40 }, cands, { tolInches: 6 });
  assert.equal(a.dx, 5); assert.equal(a.dz, 0);
  assert.equal(a.guides[0].value, 100);
  // outside tolerance → null
  assert.equal(O.snapDraggedItem(it, { x: 50, z: 40 }, cands, { tolInches: 6 }), null);
});

// ===========================================================================
// 3. Resize — unrotated anchors, all handles, rotated, pillar, clamps, snap
// ===========================================================================
ok("resize: se corner drag grows toward the pointer, nw corner anchored", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const s = O.beginItemResize(it, "se", { x: 148, z: 124 });
  assert.ok(s, "session opens");
  const r = O.resizeItemFromHandle(s, { x: 168, z: 134 });
  assert.deepEqual(r.patch, { x_inches: 100, z_inches: 100, length_inches: 68, width_inches: 34 });
});

ok("resize: nw corner drag keeps the se corner fixed", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const s = O.beginItemResize(it, "nw", { x: 100, z: 100 });
  const r = O.resizeItemFromHandle(s, { x: 80, z: 90 });
  // corner moved to 80,90; far corner still 148,124 → 68x34
  assert.deepEqual(r.patch, { x_inches: 80, z_inches: 90, length_inches: 68, width_inches: 34 });
});

ok("resize: edge handles change one axis only", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const e = O.beginItemResize(it, "e", { x: 148, z: 112 });
  const r = O.resizeItemFromHandle(e, { x: 160, z: 200 });
  assert.deepEqual(r.patch, { x_inches: 100, z_inches: 100, length_inches: 60, width_inches: 24 }, "z pointer ignored on e handle");
  const n = O.beginItemResize(it, "n", { x: 124, z: 100 });
  const r2 = O.resizeItemFromHandle(n, { x: 400, z: 92 });
  assert.deepEqual(r2.patch, { x_inches: 100, z_inches: 92, length_inches: 48, width_inches: 32 }, "x pointer ignored on n handle");
});

ok("resize: handle flip grows the rect; min clamp keeps the anchor edge", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const e = O.beginItemResize(it, "e", { x: 148, z: 112 });
  // pointer well left of the w anchor (lx=-104 vs anchor -24): the e edge
  // follows the pointer — the rect flips and grows to 80 wide, w edge still
  // anchored at plan x=100.
  const flip = O.resizeItemFromHandle(e, { x: 20, z: 112 }, { minInches: 4 });
  assert.deepEqual(flip.patch, { x_inches: 20, z_inches: 100, length_inches: 80, width_inches: 24 });
  // pointer just past the anchor (lx=-25): raw width 1 < min 4 → clamp, and
  // the dragged side stays on the pointer's side of the anchor → corner 96.
  const clamp = O.resizeItemFromHandle(e, { x: 99, z: 112 }, { minInches: 4 });
  assert.deepEqual(clamp.patch, { x_inches: 96, z_inches: 100, length_inches: 4, width_inches: 24 });
});

ok("resize: rotated 45° — drag keeps the opposite corner plan-pinned", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 48, rotation_degrees: 45 });
  const g = I.itemPlanGeometry(it);
  const corners = T.framePlanCorners(g.frame, g.size);
  const s = O.beginItemResize(it, "se", corners.se);
  assert.ok(s);
  // grow toward the plan-se direction
  const r = O.resizeItemFromHandle(s, { x: corners.se.x + 10, z: corners.se.z + 10 });
  assert.ok(r.patch.length_inches > 48, "grew");
  // nw corner must be plan-pinned: center moved half the growth along the
  // rotated se direction; the nw plan corner stays at corners.nw.
  const g2 = I.itemPlanGeometry({ ...it, ...r.patch });
  const c2 = T.framePlanCorners(g2.frame, g2.size);
  assertApprox(c2.nw.x, corners.nw.x, "nw x pinned", 1e-6);
  assertApprox(c2.nw.z, corners.nw.z, "nw z pinned", 1e-6);
});

ok("resize: pillar → diameter about fixed center; degenerate/non-finite null", () => {
  const it = pillar("p0", 100, 100, 24);
  const s = O.beginItemResize(it, "se", { x: 112, z: 112 });
  const r = O.resizeItemFromHandle(s, { x: 130, z: 100 });
  // local |lx|=18,|lz|=12 → diameter 36, center (112,112) fixed
  assert.deepEqual(r.patch, { x_inches: 94, z_inches: 94, diameter: 36 });
  assert.equal(O.resizeItemFromHandle(s, { x: NaN, z: 5 }), null, "non-finite → null");
  assert.equal(O.beginItemResize(it, "bogus", { x: 1, z: 1 }), null, "bad handle → null");
  assert.equal(O.beginItemResize({ component_id: "x" }, "se", { x: 1, z: 1 }), null, "no geometry → null");
});

ok("resize: round mode emits whole inches; snap grabs the dragged point", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const s = O.beginItemResize(it, "se", { x: 148, z: 124 });
  const r = O.resizeItemFromHandle(s, { x: 151.6, z: 127.4 }, { round: true });
  assert.deepEqual(r.patch, { x_inches: 100, z_inches: 100, length_inches: 52, width_inches: 27 });
  const r2 = O.resizeItemFromHandle(s, { x: 196, z: 124 }, {
    snap: { candidates: { x: [{ value: 200, source: { kind: "bound" } }], z: [] }, tolInches: 5 },
  });
  assert.deepEqual(r2.patch, { x_inches: 100, z_inches: 100, length_inches: 100, width_inches: 24 }, "snapped x to 200");
  assert.equal(r2.guides[0].value, 200);
});

// ===========================================================================
// 4. Rotate — pointer, snap, keyboard step, normalization
// ===========================================================================
ok("rotate: pointer 90° clockwise lands +90; center is the pivot", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const center = { x: 124, z: 112 };
  const s = O.beginItemRotate(it, { x: center.x, z: center.z - 40 }); // grab above center (angle -90°)
  assert.ok(s);
  const r = O.rotateItemFromPointer(s, { x: center.x + 40, z: center.z }, { snapDegrees: 0 }); // pointer east (0°)
  assertApprox(r.patch.rotation_degrees, 90, "pointer moved +90°", 1e-6);
  assert.equal(O.rotateItemFromPointer(s, center), null, "pivot point → null");
  assert.equal(O.beginItemRotate(it, center), null, "grab on pivot → null session");
});

ok("rotate: snap to 15° by default; free mode keeps the raw angle", () => {
  const it = item("i0", 100, 100, { length_inches: 48, width_inches: 24 });
  const c = { x: 124, z: 112 };
  const s = O.beginItemRotate(it, { x: c.x, z: c.z - 40 });
  const raw = O.rotateItemFromPointer(s, { x: c.x + 40 * Math.tan((14 * Math.PI) / 180) * -1 * 0 + 40 * Math.sin(14 * Math.PI / 180), z: c.z - 40 * Math.cos(14 * Math.PI / 180) }, { snapDegrees: 0 });
  assertApprox(raw.patch.rotation_degrees, 14, "raw 14°", 1e-6);
  const snapped = O.rotateItemFromPointer(s, { x: c.x + 40 * Math.sin(14 * Math.PI / 180), z: c.z - 40 * Math.cos(14 * Math.PI / 180) });
  assert.equal(snapped.patch.rotation_degrees, 15, "default snaps 14→15");
});

ok("rotate: keyboard step + wraparound normalization", () => {
  const it = item("i0", 100, 100, { rotation_degrees: 350 });
  assert.equal(O.rotateItemBy(it, 20).patch.rotation_degrees, 10, "350+20 wraps to 10");
  assert.equal(O.rotateItemBy(it, -370).patch.rotation_degrees, 340, "350-370 wraps to 340");
  assert.equal(O.rotateItemTo(it, -30).patch.rotation_degrees, 330);
  assert.equal(O.rotateItemTo(it, 450).patch.rotation_degrees, 90);
  assert.equal(O.rotateItemBy(it, "fast"), null);
  const it2 = item("i1", 0, 0);
  assert.equal(O.rotateItemBy(it2, 15).patch.rotation_degrees, 15, "absent rotation starts at 0");
});

// ===========================================================================
// 5. Align — plan + primary anchors
// ===========================================================================
ok("align: single item to plan — left/right/center edges land exactly", () => {
  const sc = scene({ items: [item("i0", 100, 60, { length_inches: 48, width_inches: 24 })] });
  const l = O.alignSelectionPatch(sc, [iid("i0")], "left");
  assert.deepEqual(l.patches[0].patch, { x_inches: 0, z_inches: 60 });
  const r = O.alignSelectionPatch(sc, [iid("i0")], "right");
  assert.deepEqual(r.patches[0].patch, { x_inches: 480 - 48, z_inches: 60 });
  const cx = O.alignSelectionPatch(sc, [iid("i0")], "centerX");
  assert.deepEqual(cx.patches[0].patch, { x_inches: 240 - 24, z_inches: 60 });
  const b = O.alignSelectionPatch(sc, [iid("i0")], "bottom");
  assert.deepEqual(b.patches[0].patch, { x_inches: 100, z_inches: 320 - 24 });
  assert.equal(O.alignSelectionPatch(sc, [iid("i0")], "diagonal").reason, "unknown-edge");
});

ok("align: multi to primary — others move, primary untouched", () => {
  const sc = scene({ items: [item("i0", 100, 60, { length_inches: 48, width_inches: 24 }), item("i1", 300, 200, { length_inches: 24, width_inches: 24 })] });
  const r = O.alignSelectionPatch(sc, [iid("i0"), iid("i1")], "top", { primaryId: iid("i0") });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1, "primary excluded");
  assert.equal(r.patches[0].index, 1);
  assert.deepEqual(r.patches[0].patch, { x_inches: 300, z_inches: 60 }, "top edge aligned to primary's top (60)");
  // Rotated primary aligns on its VISUAL AABB, not the stored corner.
  const sc2 = scene({ items: [item("i0", 100, 100, { length_inches: 48, width_inches: 24, rotation_degrees: 90 }), item("i1", 300, 300)] });
  const r2 = O.alignSelectionPatch(sc2, [iid("i0"), iid("i1")], "left", { primaryId: iid("i0") });
  // i0 AABB: center (124,112), 24 wide → minX 112
  assert.deepEqual(r2.patches[0].patch, { x_inches: 112, z_inches: 300 });
});

ok("align: noop when already on the line; explicit to=plan honored", () => {
  const sc = scene({ items: [item("i0", 140, 60), item("i1", 100, 200)] });
  const r = O.alignSelectionPatch(sc, [iid("i0"), iid("i1")], "left", { primaryId: iid("i1") });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1, "only the off-line row patches");
  assert.deepEqual(r.patches[0].patch, { x_inches: 100, z_inches: 60 }, "i0 pulled to the primary's left edge");
  const scAligned = scene({ items: [item("i0", 100, 60), item("i1", 100, 200)] });
  assert.equal(O.alignSelectionPatch(scAligned, [iid("i0"), iid("i1")], "left", { primaryId: iid("i1") }).status, "noop", "all on the line → noop");
  const r2 = O.alignSelectionPatch(sc, [iid("i0"), iid("i1")], "left", { to: "plan" });
  assert.equal(r2.patches.length, 2, "to=plan patches both incl. primary");
  const sc3 = scene({ items: [item("i0", 0, 60)] });
  assert.equal(O.alignSelectionPatch(sc3, [iid("i0")], "left").status, "noop", "already left → noop");
});

// ===========================================================================
// 6. Distribute — equal gaps, outer anchors fixed
// ===========================================================================
ok("distribute: equal gaps on x; first+last anchored", () => {
  // i0 [0,24], i1 [110,134], i2 [300,324] → free = 300-24-24 = 252; gap=126
  // i1 desired minX = 24+126 = 150 → dx +40
  const sc = scene({ items: [item("i0", 0, 10), item("i1", 110, 10), item("i2", 300, 10)] });
  const r = O.distributeSelectionPatch(sc, [iid("i0"), iid("i1"), iid("i2")], "x");
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1);
  assert.deepEqual(r.patches[0].patch, { x_inches: 150, z_inches: 10 });
  const z = O.distributeSelectionPatch(sc, [iid("i0"), iid("i1"), iid("i2")], "z");
  assert.equal(z.status, "noop", "all same z → noop");
  assert.equal(O.distributeSelectionPatch(sc, [iid("i0"), iid("i1")], "x").reason, "needs-three");
  assert.equal(O.distributeSelectionPatch(sc, [iid("i0"), iid("i1"), iid("i2")], "y").reason, "unknown-axis");
});

// ===========================================================================
// 7. Typed coordinates + dimensions — atomic validation
// ===========================================================================
ok("typed: valid subsets patch exactly; rotation normalizes", () => {
  const it = item("i0", 100, 60, { rotation_degrees: 10 });
  const r = O.typedItemPatch(it, { x: "120.5", z: 70, rotation: 450 });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patch, { x_inches: 120.5, z_inches: 70, rotation_degrees: 90 });
  assert.deepEqual(r.before, { x_inches: 100, z_inches: 60, rotation_degrees: 10 });
});

ok("typed: any bad field rejects the WHOLE op (atomic)", () => {
  const it = item("i0", 100, 60);
  const r = O.typedItemPatch(it, { x: 120, length: "abc" });
  assert.equal(r.status, "rejected"); assert.equal(r.field, "length"); assert.equal(r.reason, "invalid-field");
  assert.equal(O.typedItemPatch(it, { length: 0 }).reason, "non-positive");
  assert.equal(O.typedItemPatch(it, { width: -4 }).reason, "non-positive");
  assert.equal(O.typedItemPatch(it, { bogus: 5 }).reason, "unknown-field");
  assert.equal(O.typedItemPatch(it, { diameter: 24 }).reason, "field-not-applicable", "diameter on spread rejected");
  const p = pillar("p0", 10, 10, 24);
  assert.equal(O.typedItemPatch(p, { length: 30 }).reason, "field-not-applicable", "length on pillar rejected");
  assert.equal(O.typedItemPatch(p, { diameter: "36" }).status, "ok");
  assert.equal(O.typedItemPatch(it, {}).status, "noop");
  assert.equal(O.typedItemPatch(it, { x: 10 }, { readOnly: true }).reason, "read-only");
});

ok("typed: pole x/z only", () => {
  const r = O.typedPolePatch(pole("p0", 10, 20), { x: "44", z: 8 });
  assert.deepEqual(r.patch, { x_inches: 44, z_inches: 8 });
  assert.equal(O.typedPolePatch(pole("p0", 1, 1), { length: 3 }).reason, "unknown-field");
});

// ===========================================================================
// 8. Delete + duplicate descriptors
// ===========================================================================
ok("delete: whole rows resolve to live indexes; sub-objects skip", () => {
  const sc = scene({
    items: [item("i0", 1, 1), item("i1", 2, 2)],
    walls: [wall("w0", [[0, 0], [9, 0], [9, 9]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2")] })],
    poles: [pole("p0", 3, 3)],
    wall_caps: [cap("c0", "w0", "s1")],
  });
  const entries = [
    { id: iid("i1"), kind: "item" }, { id: wid("w0"), kind: "wall" }, { id: pid("p0"), kind: "pole" },
    { id: "wall-cap:component:c0", kind: "wall-cap" },
    { id: "wall-segment:component:w0|component:s0", kind: "wall-segment" },
    { id: iid("ghost"), kind: "item" },
  ];
  const r = O.deleteSelectionPlan(sc, entries);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.removals.map((m) => [m.collection, m.index]), [["items", 1], ["walls", 0], ["poles", 0], ["wall_caps", 0]]);
  assert.equal(r.skipped.length, 2);
  assert.equal(r.skipped[0].reason, "sub-object");
  assert.equal(r.skipped[1].reason, "unresolved");
  assert.equal(r.requiresConfirm, true);
  const r2 = O.deleteSelectionPlan(sc, [{ id: iid("i0"), kind: "item" }], { isLocked: () => true });
  assert.equal(r2.status, "empty"); assert.equal(r2.skipped[0].reason, "locked");
});

ok("duplicate: sources + default offset; sub-objects skipped", () => {
  const sc = scene({ items: [item("i0", 1, 1)], poles: [pole("p0", 2, 2)] });
  const r = O.duplicateSelectionPlan(sc, [iid("i0"), pid("p0"), "wall-segment:component:w|index:0"]);
  assert.equal(r.status, "ok");
  assert.equal(r.sources.length, 2);
  assert.deepEqual(r.offset_inches, { x: 12, z: 12 });
  assert.equal(r.skipped[0].reason, "sub-object");
  const r2 = O.duplicateSelectionPlan(sc, [iid("i0")], { offsetInches: { x: 24, z: 0 } });
  assert.deepEqual(r2.offset_inches, { x: 24, z: 0 });
  assert.equal(O.duplicateSelectionPlan(sc, []).status, "empty");
});

// ===========================================================================
// 9. Edit records + sceneWithOpPatches + undo round-trips (real store)
// ===========================================================================
ok("records: single-item shape matches the O-040 patchItem undo contract", () => {
  const patches = [{ collection: "items", index: 2, key: "component:i2", before: { x_inches: 1, z_inches: 2 }, patch: { x_inches: 9, z_inches: 8 } }];
  const e = O.editRecordForPatches("resize", "handle", patches, { label: "Resize" });
  assert.equal(e.kind, "item-resize");
  assert.deepEqual(e.before, { x_inches: 1, z_inches: 2 });
  assert.deepEqual(e.after, { x_inches: 9, z_inches: 8 });
  assert.deepEqual(e.target, { key: "component:i2", index: 2 });
  assert.equal(e.identityKind, "component");
});

ok("records: multi shape carries per-row fields, marked for the multi channel", () => {
  const patches = [
    { collection: "items", index: 0, key: "component:i0", before: { x_inches: 1 }, patch: { x_inches: 5 } },
    { collection: "walls", index: 0, key: "component:w0", before: { shape: { s: 1 } }, patch: { shape: { s: 2 } } },
  ];
  const e = O.editRecordForPatches("move", "drag", patches);
  assert.equal(e.kind, "scene-multi");
  assert.equal(e.target, null, "no single-row target — the honesty guard against fake applies");
  assert.equal(e.after.multi.length, 2);
  assert.deepEqual(e.after.multi[1], { collection: "walls", index: 0, fields: { shape: { s: 2 } } });
});

ok("sceneWithOpPatches: applies patch side and before side immutably", () => {
  const sc = scene({ items: [item("i0", 1, 1), item("i1", 2, 2)], poles: [pole("p0", 3, 3)] });
  const patches = [
    { collection: "items", index: 0, key: "k", before: { x_inches: 1, z_inches: 1 }, patch: { x_inches: 9, z_inches: 9 } },
    { collection: "poles", index: 0, key: "k", before: { x_inches: 3 }, patch: { x_inches: 7 } },
  ];
  const after = O.opSceneWithPatches(sc, patches, { side: "patch" });
  assert.equal(after.items[0].x_inches, 9); assert.equal(after.items[1].x_inches, 2); assert.equal(after.poles[0].x_inches, 7);
  const before = O.opSceneWithPatches(sc, patches, { side: "before" });
  assert.equal(before.items[0].x_inches, 1); assert.equal(before.poles[0].x_inches, 3);
  assert.equal(sc.items[0].x_inches, 1, "source untouched");
});

// Shared harness: the canvas's patchItem-equivalent commit + anchor feed.
const runHistory = (initialItems, extraScene = {}) => {
  const h = H.createSceneHistory();
  let items = initialItems;
  let walls = extraScene.walls || [];
  let poles = extraScene.poles || [];
  const patchItem = (index, patch) => {
    items = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    return true;
  };
  const patchScene = (patches) => {
    for (const p of patches) {
      if (p.collection === "items") items = items.map((r, i) => (i === p.index ? { ...r, ...p.patch } : r));
      if (p.collection === "poles") poles = poles.map((r, i) => (i === p.index ? { ...r, ...p.patch } : r));
      if (p.collection === "walls") walls = walls.map((r, i) => (i === p.index ? { ...r, ...p.patch } : r));
    }
    return true;
  };
  const observeItems = () => h.observe(H.sceneLayoutAnchor(items));
  const observeFull = () => h.observe(H.sceneLayoutAnchor({ items, poles, walls }));
  return { h, patchItem, patchScene, observeItems, observeFull, get items() { return items; }, get walls() { return walls; }, get poles() { return poles; } };
};

// The canvas-equivalent record for a single-item op (same math as the
// candidate's commitOpPatches single-channel path).
const recordSingle = (ctx, itemsBefore, index, edit) => {
  ctx.h.recordEdit({
    ...edit,
    beforeAnchor: H.sceneLayoutAnchor(H.rowsWithPatch(itemsBefore, index, edit.before)),
    afterAnchor: H.sceneLayoutAnchor(H.rowsWithPatch(itemsBefore, index, edit.after)),
  });
};

ok("undo round-trip: resize op → recordEdit → undo reverts, redo reapplies", () => {
  const ctx = runHistory([item("i0", 100, 100, { length_inches: 48, width_inches: 24 })]);
  ctx.observeItems();
  const before = [...ctx.items];
  const s = O.beginItemResize(ctx.items[0], "se", { x: 148, z: 124 });
  const r = O.resizeItemFromHandle(s, { x: 168, z: 134 }, { round: true });
  const patchRow = { collection: "items", index: 0, key: "component:i0", before: O.beforeFieldsOf(ctx.items[0], r.patch), patch: r.patch };
  ctx.patchItem(0, patchRow.patch);
  const edit = O.editRecordForPatches("resize", "handle", [patchRow], { label: "Resize" });
  recordSingle(ctx, before, 0, edit);
  ctx.observeItems();
  assert.equal(ctx.items[0].length_inches, 68);
  assert.equal(ctx.h.getState().canUndo, true);
  const u = ctx.h.undo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  assert.equal(u.status, "applied");
  assert.deepEqual({ x: ctx.items[0].x_inches, l: ctx.items[0].length_inches, w: ctx.items[0].width_inches }, { x: 100, l: 48, w: 24 }, "undo reverted corner+size");
  const re = ctx.h.redo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  assert.equal(re.status, "applied");
  assert.equal(ctx.items[0].length_inches, 68, "redo reapplied");
});

ok("undo round-trip: rotate + typed edits revert through the same channel", () => {
  const ctx = runHistory([item("i0", 100, 100, { rotation_degrees: 0 })]);
  ctx.observeItems();
  let before = [...ctx.items];
  const r1 = O.rotateItemBy(ctx.items[0], 30);
  const pr1 = { collection: "items", index: 0, key: "component:i0", before: O.beforeFieldsOf(ctx.items[0], r1.patch), patch: r1.patch };
  ctx.patchItem(0, pr1.patch);
  recordSingle(ctx, before, 0, O.editRecordForPatches("rotate", "key", [pr1]));
  ctx.observeItems();
  before = [...ctx.items];
  const r2 = O.typedItemPatch(ctx.items[0], { x: 200 });
  const pr2 = { collection: "items", index: 0, key: "component:i0", before: r2.before, patch: r2.patch };
  ctx.patchItem(0, r2.patch);
  recordSingle(ctx, before, 0, O.editRecordForPatches("geometry", "typed", [pr2]));
  ctx.observeItems();
  assert.equal(ctx.items[0].x_inches, 200); assert.equal(ctx.items[0].rotation_degrees, 30);
  ctx.h.undo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  ctx.h.undo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  assert.equal(ctx.items[0].x_inches, 100, "typed move undone");
  assert.equal(ctx.items[0].rotation_degrees, 0, "rotate undone");
});

ok("undo round-trip: keyboard rotate burst coalesces into ONE command", () => {
  const ctx = runHistory([item("i0", 100, 100, { rotation_degrees: 0 })]);
  ctx.observeItems();
  let t = 0;
  const clock = () => (t += 100);
  for (let i = 0; i < 5; i += 1) {
    const before = [...ctx.items];
    const r = O.rotateItemBy(ctx.items[0], 15);
    const pr = { collection: "items", index: 0, key: "component:i0", before: O.beforeFieldsOf(ctx.items[0], r.patch), patch: r.patch };
    ctx.patchItem(0, pr.patch);
    ctx.h.recordEdit({
      ...O.editRecordForPatches("rotate", "key", [pr]),
      coalesceKey: "editop-rotate:component:i0",
      at: clock(),
      beforeAnchor: H.sceneLayoutAnchor(H.rowsWithPatch(before, 0, pr.before)),
      afterAnchor: H.sceneLayoutAnchor(H.rowsWithPatch(before, 0, pr.patch)),
    });
  }
  assert.equal(ctx.items[0].rotation_degrees, 75);
  assert.equal(ctx.h.getState().undoDepth, 1, "five-key burst = one command");
  ctx.h.undo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  assert.equal(ctx.items[0].rotation_degrees, 0, "one undo reverts the whole burst");
});

ok("multi op under the current single-row undo apply → 'rejected', nothing faked", () => {
  const ctx = runHistory([item("i0", 10, 10), item("i1", 100, 10)]);
  ctx.observeItems();
  const sc = scene({ items: ctx.items });
  const r = O.moveSelectionPatch(sc, [iid("i0"), iid("i1")], { dx: 20, dz: 0 }, { round: true });
  assert.equal(r.status, "ok");
  // The canvas records multi ops via the stroke seam with FULL-scene anchors.
  const edit = O.editRecordForPatches("move", "drag", r.patches);
  ctx.patchScene(r.patches);
  ctx.h.beginStroke({
    kind: edit.kind, method: edit.method, target: edit.target, before: edit.before,
    beforeAnchor: H.sceneLayoutAnchor(O.opSceneWithPatches({ items: ctx.items, poles: [], walls: [] }, r.patches, { side: "before" })),
  });
  ctx.h.commitStroke({
    after: edit.after, label: "Move 2 objects",
    afterAnchor: H.sceneLayoutAnchor(O.opSceneWithPatches({ items: ctx.items, poles: [], walls: [] }, r.patches, { side: "patch" })),
  });
  // The current page's apply is single-row: patchItem(rev.target.index,
  // rev.patch). Multi records carry target:null — .index on null throws →
  // the store reports 'rejected' and leaves the stacks untouched. An
  // explicit refusal, never a silent no-op "applied".
  ctx.observeItems();
  const u = ctx.h.undo(H.sceneLayoutAnchor(ctx.items), (rev) => ctx.patchItem(rev.target.index, rev.patch) !== false);
  assert.equal(u.status, "rejected", "honest refusal — never a silent no-op 'applied'");
  assert.equal(ctx.items[0].x_inches, 30, "no phantom revert");
  assert.equal(ctx.items[1].x_inches, 120, "no phantom revert");
});

ok("multi op under the documented mount (full-domain observe + multi apply) → real undo", () => {
  const ctx = runHistory([item("i0", 10, 10), item("i1", 100, 10)], { poles: [pole("p0", 50, 50)] });
  ctx.observeFull();
  const sc = scene({ items: ctx.items, poles: ctx.poles });
  const r = O.moveSelectionPatch(sc, [iid("i0"), iid("i1"), pid("p0")], { dx: 20, dz: 10 }, { round: true });
  assert.equal(r.status, "ok");
  const cur = { items: ctx.items, poles: ctx.poles, walls: [] };
  const edit = O.editRecordForPatches("move", "drag", r.patches);
  ctx.h.beginStroke({
    kind: edit.kind, method: edit.method, target: edit.target, before: edit.before,
    beforeAnchor: H.sceneLayoutAnchor(cur),
  });
  ctx.patchScene(r.patches);
  ctx.h.commitStroke({
    after: edit.after, label: "Move 3 objects",
    afterAnchor: H.sceneLayoutAnchor({ items: ctx.items, poles: ctx.poles, walls: [] }),
  });
  ctx.observeFull();
  assert.deepEqual([ctx.items[0].x_inches, ctx.items[1].x_inches, ctx.poles[0].x_inches], [30, 120, 70]);
  // The documented mount's apply replays the multi payload through the
  // same multi channel — patch by patch.
  const applyMulti = (rev) => {
    const side = rev.direction === "undo" ? rev.patch.multi.map((m) => ({ collection: m.collection, index: m.index, patch: m.fields })) : [];
    if (!side.length) return false;
    ctx.patchScene(side);
    return true;
  };
  const u = ctx.h.undo(H.sceneLayoutAnchor({ items: ctx.items, poles: ctx.poles, walls: [] }), applyMulti);
  assert.equal(u.status, "applied");
  assert.deepEqual([ctx.items[0].x_inches, ctx.items[1].x_inches, ctx.poles[0].x_inches], [10, 100, 50], "all three rows reverted by one undo");
  assert.equal(ctx.h.getState().canRedo, true);
});

ok("history: align via multi channel = one stroke, one command", () => {
  const ctx = runHistory([item("i0", 10, 10), item("i1", 100, 40), item("i2", 200, 80)]);
  ctx.observeFull();
  const sc = scene({ items: ctx.items });
  const r = O.alignSelectionPatch(sc, [iid("i0"), iid("i1"), iid("i2")], "top", { primaryId: iid("i0"), round: true });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 2);
  const edit = O.editRecordForPatches("align", "toolbar", r.patches, { label: "Align top" });
  ctx.h.beginStroke({ kind: edit.kind, method: edit.method, target: edit.target, before: edit.before, beforeAnchor: H.sceneLayoutAnchor({ items: ctx.items, poles: [], walls: [] }) });
  ctx.patchScene(r.patches);
  ctx.h.commitStroke({ after: edit.after, afterAnchor: H.sceneLayoutAnchor({ items: ctx.items, poles: [], walls: [] }), label: "Align top" });
  ctx.observeFull();
  assert.equal(ctx.h.getState().undoDepth, 1, "one align = one command");
  const u = ctx.h.undo(H.sceneLayoutAnchor({ items: ctx.items, poles: [], walls: [] }), (rev) => {
    ctx.patchScene(rev.patch.multi.map((m) => ({ collection: m.collection, index: m.index, patch: m.fields })));
    return true;
  });
  assert.equal(u.status, "applied");
  assert.deepEqual([ctx.items[1].z_inches, ctx.items[2].z_inches], [40, 80], "both aligned rows reverted");
});

// ===========================================================================
// 10. Regression anchors — O-039/O-040 contract fields unchanged
// ===========================================================================
ok("regression: move patch + edit record reuse the O-040 item-move kind", () => {
  const sc = scene({ items: [item("i0", 1, 1)] });
  const r = O.moveSelectionPatch(sc, [iid("i0")], { dx: 4, dz: 4 });
  const e = O.editRecordForPatches("move", "drag", r.patches);
  assert.equal(e.kind, I.SCENE_EDIT_ITEM_MOVE, "move keeps the shared item-move kind");
  assert.equal(e.identityKind, "component");
});

ok("regression: invalid notes inputs stay invalid (no silent repair)", () => {
  const bad = { component_id: "x", x_inches: "nope", z_inches: 10, length_inches: 24, width_inches: 24 };
  assert.equal(M.layoutPositionInches(bad).valid, false);
  const r = O.moveSelectionPatch(scene({ items: [bad] }), ["item:component:x"], { dx: 1, dz: 1 });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "empty-selection");
  assert.equal(r.skipped[0].reason, "no-geometry");
});

// ===========================================================================
import { fileURLToPath } from "node:url";
import path from "node:path";
const report = { pass, failures };
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "o035-model-verification.json"), JSON.stringify(report, null, 1));
console.log(`\nO-035 model verification: ${pass} groups passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`FAIL ${f.name}\n  ${f.message.split("\n").slice(0, 4).join("\n  ")}`));
  process.exit(1);
}
console.log("PASS o035-model");
