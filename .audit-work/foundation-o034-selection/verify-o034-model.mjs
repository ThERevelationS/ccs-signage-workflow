// O-034 (CMP-C03) model verification — scene tree + selection model.
// Covers: object tree over all five arrays (+ wall segments, pole signs),
// node-id round-trips, hit→select→resolve matrix (face/edge/vertex/segment/
// rim/point), multi-select toggle semantics, marquee region select
// (intersect/contain incl. rotated items, pillars, open/closed walls),
// keyboard cycle/clear/delete-hook, click-vs-drag slop, paint-order
// z-top-wins, reconcile (reorder/delete/minted-id remap/part downgrade),
// and degenerate scenes. Runs on the STAGING bundle only.
// Usage: node verify-o034-model.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { selection as S, input as I, model as M } from "./scene-selection-bundle.mjs";

let pass = 0;
const failures = [];
const ok = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { failures.push({ name, message: String(e.stack || e.message || e).slice(0, 800) }); }
};

// --- fixtures ---------------------------------------------------------------
const item = (id, x, z, extra = {}) =>
  ({ component_id: id, x_inches: x, z_inches: z, length_inches: 24, width_inches: 24, foundation_type: "spread", ...extra });
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

// ===========================================================================
// 1. Object tree — all five arrays + sub-objects, deterministic, DFS order
// ===========================================================================
ok("tree: nodes for every row + sub-object across all 5 arrays", () => {
  const sc = scene({
    items: [item("i0", 10, 10), item("i1", 200, 10)],
    walls: [wall("w0", [[300, 40], [420, 40], [420, 120], [300, 120]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2"), seg("s3")] })],
    poles: [pole("p0", 60, 60, { foundation_component_id: "i0", signs: [seg("g0"), seg("g1")] })],
    wall_caps: [cap("c0", "w0", "s1")],
    signage_cabinets: [cabinet("b0", "pole", "p0")],
  });
  const t = S.buildSceneTree(sc);
  assert.equal(t.nodes.size, 2 + 1 + 4 + 1 + 2 + 1 + 1, "2 items + wall + 4 segs + pole + 2 signs + cap + cabinet");
  // DFS: item0 → pole0(+signs) → cabinet → item1 → wall(+segs+cap).
  const expect = [
    "item:component:i0", "pole:component:p0", "pole-sign:component:p0|component:g0",
    "pole-sign:component:p0|component:g1", "cabinet:component:b0",
    "item:component:i1",
    "wall:component:w0", "wall-segment:component:w0|component:s0",
    "wall-segment:component:w0|component:s1", "wall-cap:component:c0",
    "wall-segment:component:w0|component:s2", "wall-segment:component:w0|component:s3",
  ];
  assert.deepEqual(t.order, expect, "DFS nests mounted rows under parents in collection order");
  assert.deepEqual(S.buildSceneTree(sc).order, expect, "deterministic rebuild");
});

ok("tree: parent + breadcrumb resolution", () => {
  const sc = scene({
    items: [item("i0", 10, 10)],
    walls: [wall("w0", [[300, 40], [420, 40], [420, 120]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2")] })],
    poles: [pole("p0", 60, 60, { foundation_component_id: "i0" })],
    wall_caps: [cap("c0", "w0", "s1"), cap("c1", "w0", "missing-seg"), cap("c2", "nowall", null)],
    signage_cabinets: [cabinet("b0", "pole", "p0"), cabinet("b1", "foundation", "ghost"), cabinet("b2", "wall-mount", "w0")],
  });
  const t = S.buildSceneTree(sc);
  assert.equal(t.nodes.get("pole:component:p0").parentId, "item:component:i0");
  assert.equal(t.nodes.get("cabinet:component:b0").parentId, "pole:component:p0");
  assert.equal(t.nodes.get("cabinet:component:b1").parentId, null, "dangling cabinet ref → root");
  assert.equal(t.nodes.get("cabinet:component:b2").parentId, null, "unsupported mount → root");
  assert.equal(t.nodes.get("wall-cap:component:c0").parentId, "wall-segment:component:w0|component:s1", "cap on resolved segment nests under it");
  assert.equal(t.nodes.get("wall-cap:component:c1").parentId, "wall:component:w0", "cap with dangling segment → wall");
  assert.equal(t.nodes.get("wall-cap:component:c2").parentId, null, "cap with dangling wall → root");
  const trail = S.nodeBreadcrumb(sc, "wall-cap:component:c0");
  assert.deepEqual(trail.map((n) => n.label), ["Wall 1", "Segment 2", "Cap 1"]);
  const trail2 = S.nodeBreadcrumb(sc, "cabinet:component:b0");
  assert.deepEqual(trail2.map((n) => n.label), ["Foundation 1", "Pole 1", "Cabinet 1"]);
});

ok("tree: unresolved tokens and empty mounts stay at root; legacy index fallback", () => {
  const sc = scene({
    items: [item("i0", 10, 10)],
    poles: [
      pole("p0", 1, 1, { foundation_component_id: "unresolved:legacy-foundation" }),
      pole("p1", 2, 2, { foundation_component_id: "" }),
      pole("p2", 3, 3, { foundation_idx: 0 }),       // legacy index fallback
      pole("p3", 4, 4, {}),
    ],
  });
  const t = S.buildSceneTree(sc);
  assert.equal(t.nodes.get("pole:component:p0").parentId, null, "unresolved token → root");
  assert.equal(t.nodes.get("pole:component:p1").parentId, null, "explicit empty → root");
  assert.equal(t.nodes.get("pole:component:p2").parentId, "item:component:i0", "foundation_idx resolves");
  assert.equal(t.nodes.get("pole:component:p3").parentId, null, "absent → root");
});

// ===========================================================================
// 2. Node ids — round-trip + resolution
// ===========================================================================
ok("ids: parse round-trips every kind incl. sub-object refs", () => {
  const cases = [
    ["item:component:i0", { kind: "item", key: "component:i0" }],
    ["item:index:2", { kind: "item", key: "index:2" }],
    ["wall:legacy:9", { kind: "wall", key: "legacy:9" }],
    ["wall-segment:component:w0|component:s3", { kind: "wall-segment", key: "component:w0", ref: "component:s3" }],
    ["wall-segment:component:w0|index:1", { kind: "wall-segment", key: "component:w0", ref: "index:1" }],
    ["pole-sign:component:p0|index:0", { kind: "pole-sign", key: "component:p0", ref: "index:0" }],
    ["wall-cap:component:c0", { kind: "wall-cap", key: "component:c0" }],
    ["cabinet:component:b0", { kind: "cabinet", key: "component:b0" }],
  ];
  for (const [id, want] of cases) {
    const p = S.parseSceneNodeId(id);
    assert.equal(p.kind, want.kind, id);
    assert.equal(p.key, want.key, id);
    if (want.ref !== undefined) assert.equal(p.ref, want.ref, id);
  }
  assert.equal(S.parseSceneNodeId("garbage"), null);
  assert.equal(S.parseSceneNodeId(""), null);
  assert.equal(S.parseSceneNodeId(42), null);
});

ok("resolve: every kind resolves to its live row; stale ids → null", () => {
  const sc = scene({
    items: [item("i0", 10, 10)],
    walls: [wall("w0", [[0, 0], [100, 0], [100, 100]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2")] })],
    poles: [pole("p0", 5, 5, { signs: [{ component_id: "g0" }, {}] })],
    wall_caps: [cap("c0", "w0", "s0")],
    signage_cabinets: [cabinet("b0", "foundation", "i0")],
  });
  assert.equal(S.resolveSceneNode(sc, "item:component:i0").row.component_id, "i0");
  assert.equal(S.resolveSceneNode(sc, "wall:component:w0").index, 0);
  const sg = S.resolveSceneNode(sc, "wall-segment:component:w0|component:s1");
  assert.equal(sg.segmentIndex, 1);
  assert.equal(sg.segment.component_id, "s1");
  const sgIdx = S.resolveSceneNode(sc, "wall-segment:component:w0|index:2");
  assert.equal(sgIdx.segmentIndex, 2, "index ref resolves geometric segment");
  assert.equal(sgIdx.segment.component_id, "s2");
  const sign = S.resolveSceneNode(sc, "pole-sign:component:p0|index:1");
  assert.equal(sign.signIndex, 1);
  assert.equal(S.resolveSceneNode(sc, "wall-cap:component:c0").row.component_id, "c0");
  assert.equal(S.resolveSceneNode(sc, "cabinet:component:b0").row.mount, "foundation");
  assert.equal(S.resolveSceneNode(sc, "item:component:gone"), null);
  assert.equal(S.resolveSceneNode(sc, "wall-segment:component:w0|component:gone"), null);
  assert.equal(S.resolveSceneNode(sc, "wall-segment:component:w0|index:9"), null);
  assert.equal(S.resolveSceneNode(sc, "pole-sign:component:p0|index:9"), null);
  assert.equal(S.resolveSceneNode(sc, "wall-segment:nonsense"), null);
});

// ===========================================================================
// 3. Hit → select → resolve matrix (face/edge/vertex/segment/rim/point)
// ===========================================================================
ok("hit→node matrix: every hit kind maps to the right node + part", () => {
  const sc = scene({
    items: [item("i0", 100, 100), item("i1", 300, 200, { foundation_type: "pillar", diameter: 40 })],
    poles: [pole("p0", 50, 50)],
    walls: [wall("w0", [[10, 250], [120, 250], [120, 300], [10, 300]], { closed: true, segments: [seg("s0"), seg("s1"), seg("s2"), seg("s3")] })],
  });
  const t = (x, z) => ({ x, z });
  // item face (center of i0 rect)
  let pick = S.createSceneSelection().pickAtPoint(sc, t(112, 112));
  assert.equal(pick.hit.kind, "item-face");
  assert.equal(pick.target.id, "item:component:i0");
  assert.equal(pick.target.part.type, "face");
  // item edge (near n edge of i0)
  pick = S.createSceneSelection().pickAtPoint(sc, t(112, 101));
  assert.equal(pick.hit.kind, "item-edge");
  assert.equal(pick.target.part.type, "edge");
  assert.equal(pick.target.part.edge, "n");
  // item vertex (nw corner of i0 = 100,100)
  pick = S.createSceneSelection().pickAtPoint(sc, t(100.5, 100.5));
  assert.equal(pick.hit.kind, "item-vertex");
  assert.equal(pick.target.part.type, "vertex");
  assert.equal(pick.target.part.corner, "nw");
  // pillar rim → edge 'rim' (center of pillar is 320,220; rim is center+r)
  pick = S.createSceneSelection().pickAtPoint(sc, t(320 + 20, 220));
  assert.equal(pick.hit.kind, "item-edge");
  assert.equal(pick.target.part.edge, "rim");
  // pole
  pick = S.createSceneSelection().pickAtPoint(sc, t(50, 50));
  assert.equal(pick.hit.kind, "pole");
  assert.equal(pick.target.id, "pole:component:p0");
  assert.equal(pick.target.part.type, "point");
  // wall vertex (first point)
  pick = S.createSceneSelection().pickAtPoint(sc, t(10, 250));
  assert.equal(pick.hit.kind, "wall-vertex");
  assert.equal(pick.target.id, "wall:component:w0");
  assert.equal(pick.target.part.type, "vertex");
  assert.equal(pick.target.part.vertexIndex, 0);
  // wall segment (on segment 0 edge, away from vertices) → SEGMENT node
  pick = S.createSceneSelection().pickAtPoint(sc, t(60, 250));
  assert.equal(pick.hit.kind, "wall-segment");
  assert.equal(pick.target.id, "wall-segment:component:w0|component:s0");
  assert.equal(pick.target.part.type, "segment");
  assert.equal(pick.target.part.segmentComponentId, "s0");
  // wall face (closed interior)
  pick = S.createSceneSelection().pickAtPoint(sc, t(60, 275));
  assert.equal(pick.hit.kind, "wall-face");
  assert.equal(pick.target.id, "wall:component:w0");
  assert.equal(pick.target.part.type, "face");
});

ok("hit→select→resolve: selected entry resolves back to the live row", () => {
  const sc = scene({
    items: [item("i0", 100, 100)],
    walls: [wall("w0", [[10, 250], [120, 250], [120, 300]], { segments: [seg("s0"), seg("s1")] })],
  });
  const sel = S.createSceneSelection();
  const r = sel.selectAtPoint(sc, { x: 60, z: 250 });
  assert.equal(r.status, "selected");
  assert.equal(r.id, "wall-segment:component:w0|component:s0");
  const res = S.resolveSceneNode(sc, r.id);
  assert.equal(res.segmentIndex, 0);
  assert.equal(res.segment.component_id, "s0");
  const e = sel.entries()[0];
  assert.equal(e.kind, "wall-segment");
  assert.equal(e.label, "Wall 1 segment 1", "hitLabel-derived descriptor");
  assert.equal(e.part.type, "segment");
  assert.equal(e.primary, true);
});

ok("z-top-wins: paint order decides (poles > items > walls, reverse index)", () => {
  const sc = scene({
    items: [item("i0", 40, 40), item("i1", 44, 44)],  // i1 overlaps i0, paints on top
    poles: [pole("p0", 52, 52)],                       // pole over both items
    walls: [wall("w0", [[30, 30], [70, 30], [70, 70], [30, 70]], { closed: true })], // wall under all
  });
  const sel = S.createSceneSelection();
  // point 52,52: pole wins over both items + wall face.
  let pick = sel.pickAtPoint(sc, { x: 52, z: 52 });
  assert.equal(pick.hit.kind, "pole");
  // point 46,60: i1 face (later index) over i0 + wall
  pick = sel.pickAtPoint(sc, { x: 46, z: 60 });
  assert.equal(pick.hit.collection, "items");
  assert.equal(pick.target.id, "item:component:i1", "later index paints on top");
  // point 36,50: wall interior only (clear of wall edges + outside items)
  pick = sel.pickAtPoint(sc, { x: 36, z: 50 });
  assert.equal(pick.hit.kind, "wall-face");
  assert.equal(pick.target.id, "wall:component:w0");
});

// ===========================================================================
// 4. Click-vs-drag slop
// ===========================================================================
ok("click slop: release < 5px = click; travel beyond = drag", () => {
  const c = S.beginClickCandidate({ pointerId: 1, clientX: 100, clientY: 100, hit: { kind: "pole" }, additive: false });
  assert.equal(S.isClickRelease(c, { clientX: 103, clientY: 102 }), true, "2.2px = click");
  assert.equal(S.isClickRelease(c, { clientX: 104.9, clientY: 100 }), true, "just under");
  assert.equal(S.isClickRelease(c, { clientX: 105, clientY: 100 }), false, "at threshold = drag");
  assert.equal(S.isClickRelease(c, { clientX: 160, clientY: 100 }), false, "travelled");
  assert.equal(S.isClickRelease(c, { clientX: 100.2, clientY: 100.1 }), true, "returns near start = click");
  assert.equal(S.clickTravelPx(c, { clientX: 100, clientY: 103 }), 3);
  assert.equal(S.beginClickCandidate({ clientX: NaN, clientY: 0 }), null);
  assert.equal(S.isClickRelease(null, { clientX: 0, clientY: 0 }), false);
});

// ===========================================================================
// 5. Select semantics — replace / additive toggle / primary / parts
// ===========================================================================
ok("select: plain replaces, additive toggles, primary tracks last-touched", () => {
  const sel = S.createSceneSelection();
  sel.select({ id: "item:component:i0", part: { type: "face" } });
  assert.deepEqual(sel.getState().ids, ["item:component:i0"]);
  assert.equal(sel.getState().primaryId, "item:component:i0");
  sel.select({ id: "item:component:i1" });
  assert.deepEqual(sel.getState().ids, ["item:component:i1"], "plain replaces");
  sel.select({ id: "item:component:i0" }, { additive: true });
  assert.deepEqual(sel.getState().ids, ["item:component:i1", "item:component:i0"], "additive appends");
  assert.equal(sel.getState().primaryId, "item:component:i0");
  sel.select({ id: "item:component:i1" }, { additive: true });
  assert.deepEqual(sel.getState().ids, ["item:component:i0"], "additive on selected toggles off");
  assert.equal(sel.getState().primaryId, "item:component:i0", "primary falls to last remaining");
  sel.select({ id: "item:component:i0" }, { additive: true });
  assert.equal(sel.getState().count, 0);
  assert.equal(sel.getState().primaryId, null);
  // null target = empty-space click: plain clears, additive keeps
  sel.select({ id: "item:component:i0" });
  sel.select(null, { additive: true });
  assert.equal(sel.getState().count, 1, "additive empty-click keeps");
  sel.select(null);
  assert.equal(sel.getState().count, 0, "plain empty-click clears");
});

ok("select: hit part rides the entry; entries() is a panel-ready snapshot", () => {
  const sc = scene({ items: [item("i0", 100, 100, { rotation_degrees: 30 })] });
  const sel = S.createSceneSelection();
  sel.selectAtPoint(sc, { x: 112, z: 112 });
  const e = sel.entries()[0];
  assert.equal(e.id, "item:component:i0");
  assert.equal(e.collection, "items");
  assert.equal(e.index, 0);
  assert.equal(e.componentId, "i0");
  assert.equal(e.label, "Foundation 1");
  assert.equal(e.part.type, "face");
  assert.equal(e.primary, true);
});

// ===========================================================================
// 6. Marquee — region geometry across object types
// ===========================================================================
ok("marquee: intersect vs contain for rect/pillar/pole/wall", () => {
  const sc = scene({
    items: [
      item("i0", 100, 100),                                        // 24x24 rect at 100-124
      item("i1", 300, 100, { rotation_degrees: 45 }),              // rotated
      item("i2", 200, 200, { foundation_type: "pillar", diameter: 40 }), // circle r20 at 200,200 (center 220,220)
    ],
    poles: [pole("p0", 150, 60), pole("p1", 460, 300)],
    walls: [wall("w0", [[10, 250], [60, 250], [60, 300], [10, 300]], { closed: true }),
             wall("w1", [[400, 20], [460, 20]])],                    // open 2-point
  });
  // Region grazing i0's edge: intersect picks, contain does not.
  let ids = S.sceneObjectsInRegion(sc, { minX: 96, minZ: 96, maxX: 110, maxZ: 110 });
  assert.deepEqual(ids, ["item:component:i0"], "intersect catches edge graze");
  ids = S.sceneObjectsInRegion(sc, { minX: 96, minZ: 96, maxX: 110, maxZ: 110 }, { mode: "contain" });
  assert.deepEqual(ids, [], "contain requires full enclosure");
  ids = S.sceneObjectsInRegion(sc, { minX: 90, minZ: 90, maxX: 130, maxZ: 130 }, { mode: "contain" });
  assert.deepEqual(ids, ["item:component:i0"], "contain encloses fully");
  // Pole: point-based — inside picks, outside misses (both modes same for a point).
  ids = S.sceneObjectsInRegion(sc, { minX: 140, minZ: 50, maxX: 160, maxZ: 70 });
  assert.deepEqual(ids, ["pole:component:p0"]);
  // Pillar circle: region touching rim only.
  ids = S.sceneObjectsInRegion(sc, { minX: 240, minZ: 215, maxX: 250, maxZ: 225 });
  assert.deepEqual(ids, ["item:component:i2"], "circle-rect intersect");
  ids = S.sceneObjectsInRegion(sc, { minX: 199, minZ: 199, maxX: 241, maxZ: 241 }, { mode: "contain" });
  assert.deepEqual(ids, ["item:component:i2"], "circle fully inside");
  ids = S.sceneObjectsInRegion(sc, { minX: 205, minZ: 205, maxX: 235, maxZ: 235 }, { mode: "contain" });
  assert.deepEqual(ids, [], "circle pokes out → not contained");
  // Rotated item: bounding corners inside → contain picks.
  ids = S.sceneObjectsInRegion(sc, { minX: 270, minZ: 70, maxX: 330, maxZ: 130 }, { mode: "contain" });
  assert.deepEqual(ids, ["item:component:i1"], "rotated corners all inside");
  ids = S.sceneObjectsInRegion(sc, { minX: 295, minZ: 95, maxX: 305, maxZ: 105 }, { mode: "contain" });
  assert.deepEqual(ids, [], "rotated corners outside region → not contained");
  // Closed wall: region inside its face (no vertex in, no edge cross) still intersects.
  ids = S.sceneObjectsInRegion(sc, { minX: 25, minZ: 265, maxX: 45, maxZ: 285 });
  assert.deepEqual(ids, ["wall:component:w0"], "region inside closed wall face");
  // Open wall: region crossing the line.
  ids = S.sceneObjectsInRegion(sc, { minX: 420, minZ: 10, maxX: 440, maxZ: 30 });
  assert.deepEqual(ids, ["wall:component:w1"], "segment crosses region");
  // Empty region everywhere.
  ids = S.sceneObjectsInRegion(sc, { minX: 0, minZ: 400, maxX: 5, maxZ: 410 });
  assert.deepEqual(ids, []);
  // Degenerate inputs never throw.
  assert.deepEqual(S.sceneObjectsInRegion(sc, null), []);
  assert.deepEqual(S.sceneObjectsInRegion(null, { minX: 0, minZ: 0, maxX: 1, maxZ: 1 }), []);
  assert.deepEqual(S.sceneObjectsInRegion(sc, { minX: 9, minZ: 9, maxX: 3, maxZ: 3 }, { mode: "bogus" }), []);
});

ok("marquee: store lifecycle — open/update/commit/replace+union/empty-click", () => {
  const sc = scene({ items: [item("i0", 100, 100), item("i1", 200, 100)], poles: [pole("p0", 150, 60)] });
  const sel = S.createSceneSelection();
  assert.equal(sel.beginMarquee({ point: { x: 90, z: 40 } }).status, "open");
  assert.equal(sel.updateMarquee({ x: 170, z: 140 }).status, "updated");
  let m = sel.getState().marquee;
  assert.deepEqual([m.start.x, m.current.x], [90, 170]);
  let r = sel.commitMarquee(sc);
  assert.equal(r.status, "marquee");
  assert.deepEqual(r.picked, ["item:component:i0", "pole:component:p0"], "tree order (item before pole? DFS order)");
  assert.equal(sel.getState().marquee, null);
  // Union: marquee a different region additive → existing kept.
  sel.beginMarquee({ point: { x: 190, z: 90 }, additive: true });
  sel.updateMarquee({ x: 230, z: 130 });
  r = sel.commitMarquee(sc);
  assert.deepEqual(sel.getState().ids, ["item:component:i0", "pole:component:p0", "item:component:i1"], "additive unions");
  // Replace marquee wipes prior.
  sel.beginMarquee({ point: { x: 190, z: 90 } });
  sel.updateMarquee({ x: 230, z: 130 });
  r = sel.commitMarquee(sc);
  assert.deepEqual(sel.getState().ids, ["item:component:i1"], "plain replaces");
  // Empty-click semantics.
  sel.beginMarquee({ point: { x: 400, z: 300 } });
  r = sel.commitMarquee(sc, { empty: true });
  assert.equal(sel.getState().count, 0, "plain empty click clears");
  sel.select({ id: "item:component:i0" });
  sel.beginMarquee({ point: { x: 400, z: 300 }, additive: true });
  r = sel.commitMarquee(sc, { empty: true });
  assert.equal(sel.getState().count, 1, "additive empty click keeps");
  assert.equal(sel.cancelMarquee().status, "no-marquee");
  assert.equal(sel.updateMarquee({ x: 0, z: 0 }).status, "no-marquee");
});

// ===========================================================================
// 7. Keyboard — action map + store.applyKey
// ===========================================================================
ok("keyboard: action map covers cycle/clear/delete-hook + modifier guards", () => {
  assert.deepEqual(S.selectionKeyAction({ key: "Tab" }), { action: "cycle", direction: 1 });
  assert.deepEqual(S.selectionKeyAction({ key: "Tab", shiftKey: true }), { action: "cycle", direction: -1 });
  assert.deepEqual(S.selectionKeyAction({ key: "ArrowRight" }), { action: "cycle", direction: 1 });
  assert.deepEqual(S.selectionKeyAction({ key: "ArrowDown" }), { action: "cycle", direction: 1 });
  assert.deepEqual(S.selectionKeyAction({ key: "ArrowLeft" }), { action: "cycle", direction: -1 });
  assert.deepEqual(S.selectionKeyAction({ key: "ArrowUp", shiftKey: true }), { action: "cycle", direction: -1 });
  assert.deepEqual(S.selectionKeyAction({ key: "Escape" }), { action: "clear" });
  assert.deepEqual(S.selectionKeyAction({ key: "Delete" }), { action: "delete-request" });
  assert.deepEqual(S.selectionKeyAction({ key: "Backspace" }), { action: "delete-request" });
  assert.equal(S.selectionKeyAction({ key: "Tab", ctrlKey: true }), null, "browser shortcut passes");
  assert.equal(S.selectionKeyAction({ key: "ArrowRight", metaKey: true }), null);
  assert.equal(S.selectionKeyAction({ key: "Delete", altKey: true }), null);
  assert.equal(S.selectionKeyAction({ key: "a" }), null);
  assert.equal(S.selectionKeyAction(null), null);
});

ok("keyboard: applyKey cycles tree order, wraps, clears, delete hook reports", () => {
  const sc = scene({ items: [item("i0", 10, 10), item("i1", 100, 10)], poles: [pole("p0", 50, 50)] });
  const sel = S.createSceneSelection();
  let r = sel.applyKey({ key: "Tab" }, sc);
  assert.equal(r.id, "item:component:i0", "first cycle picks first node");
  r = sel.applyKey({ key: "ArrowRight" }, sc);
  assert.equal(r.id, "item:component:i1");
  r = sel.applyKey({ key: "ArrowRight" }, sc);
  assert.equal(r.id, "pole:component:p0");
  r = sel.applyKey({ key: "ArrowRight" }, sc);
  assert.equal(r.id, "item:component:i0", "wraps");
  r = sel.applyKey({ key: "Tab", shiftKey: true }, sc);
  assert.equal(r.id, "pole:component:p0", "shift+tab reverses");
  r = sel.applyKey({ key: "Delete" }, sc);
  assert.equal(r.status, "delete-request");
  assert.equal(r.entries.length, 1, "hook reports the selection for the consumer's commit path");
  assert.equal(sel.getState().count, 1, "store NEVER deletes — the hook only reports");
  r = sel.applyKey({ key: "Escape" }, sc);
  assert.equal(r.status, "cleared");
  assert.equal(sel.getState().count, 0);
  assert.equal(sel.applyKey({ key: "x" }, sc), null);
  // cycle on empty scene
  assert.equal(S.createSceneSelection().applyKey({ key: "Tab" }, scene()).status, "empty");
});

// ===========================================================================
// 8. Reconcile — reorder/delete/minted-id remap/part downgrade
// ===========================================================================
ok("reconcile: component ids survive reorder; positional index ids follow row", () => {
  const sc1 = scene({ items: [item("i0", 10, 10), item("i1", 100, 10), { x_inches: 5, z_inches: 5, length_inches: 10, width_inches: 10 }] });
  const sel = S.createSceneSelection();
  sel.select({ id: "item:component:i1" });
  sel.select({ id: "item:index:2" }, { additive: true });
  const sc2 = scene({ items: [sc1.items[1], sc1.items[0], sc1.items[2]] }); // reorder, same length
  let r = sel.reconcile(sc2);
  assert.deepEqual(r.kept, ["item:component:i1", "item:index:2"], "both survive reorder");
  assert.equal(r.status, "reconciled", "descriptor index/label refresh counts as change");
  const desc = sel.entries().find((e) => e.id === "item:component:i1");
  assert.equal(desc.index, 0, "descriptor tracks new index");
  const sc3 = scene({ items: [sc1.items[0], sc1.items[1]] }); // index:2 row gone
  r = sel.reconcile(sc3);
  assert.deepEqual(r.dropped, ["item:index:2"], "vanished positional id drops — never re-points");
  assert.deepEqual(r.kept, ["item:component:i1"]);
});

ok("reconcile: deleted component rows drop; minted sub-ids remap in place", () => {
  const sc1 = scene({
    items: [item("i0", 10, 10)],
    walls: [wall("w0", [[0, 0], [100, 0], [100, 100]], { segments: [{}, {}] })], // no component ids yet
    poles: [pole("p0", 5, 5, { signs: [{}] })],
  });
  const sel = S.createSceneSelection();
  sel.select({ id: "item:component:i0" });
  sel.select({ id: "wall-segment:component:w0|index:1" }, { additive: true });
  sel.select({ id: "pole-sign:component:p0|index:0" }, { additive: true });
  // normalization mints ids — same rows, new component refs.
  const sc2 = scene({
    items: [item("i0", 10, 10)],
    walls: [wall("w0", [[0, 0], [100, 0], [100, 100]], { segments: [seg("s0"), seg("s1")] })],
    poles: [pole("p0", 5, 5, { signs: [seg("g0")] })],
  });
  const r = sel.reconcile(sc2);
  assert.deepEqual(r.kept.length, 3);
  assert.equal(r.remapped["wall-segment:component:w0|index:1"], "wall-segment:component:w0|component:s1", "segment index ref upgrades to minted id");
  assert.equal(r.remapped["pole-sign:component:p0|index:0"], "pole-sign:component:p0|component:g0", "sign index ref upgrades");
  assert.equal(sel.getState().primaryId, "pole-sign:component:p0|component:g0", "primary follows the remap");
  // delete the pole → its sign drops.
  const r2 = sel.reconcile(scene({ items: sc2.items, walls: sc2.walls, poles: [] }));
  assert.ok(r2.dropped.includes("pole-sign:component:p0|component:g0"));
});

ok("reconcile: stale parts downgrade to row, never resurrected", () => {
  const sc1 = scene({ walls: [wall("w0", [[0, 0], [100, 0], [100, 100]])] });
  const sel = S.createSceneSelection();
  // emulate a vertex-part selection on vertex 2
  sel.setSelection([{ id: "wall:component:w0", part: { type: "vertex", vertexIndex: 2 } }]);
  const sc2 = scene({ walls: [wall("w0", [[0, 0], [100, 0]])] }); // outline shrank
  const r = sel.reconcile(sc2);
  assert.deepEqual(r.downgraded, ["wall:component:w0"]);
  assert.deepEqual(sel.entries()[0].part, { type: "row" }, "object stays selected; stale sub-part claim dropped");
});

// ===========================================================================
// 9. Store plumbing + degenerate scenes
// ===========================================================================
ok("store: subscribe + stateVersion; getState marquee is a defensive copy", () => {
  const sel = S.createSceneSelection();
  let calls = 0;
  const un = sel.subscribe(() => { calls += 1; });
  const v0 = sel.stateVersion;
  sel.select({ id: "item:component:i0" });
  sel.clear();
  assert.ok(sel.stateVersion > v0);
  assert.equal(calls, 2);
  un();
  sel.select({ id: "item:component:i1" });
  assert.equal(calls, 2, "unsubscribed");
  sel.beginMarquee({ point: { x: 1, z: 1 } });
  const m1 = sel.getState().marquee;
  m1.start.x = 999;
  assert.equal(sel.getState().marquee.start.x, 1, "marquee snapshot is a copy");
});

ok("degenerate: malformed scenes/rows never throw, never select ghosts", () => {
  const weird = {
    items: [null, { component_id: "x" }, item("i0", "bad", 10), 42],
    walls: [{}, wall("w", [["bad"], [1, 2]])],
    poles: [null, { signs: "not-an-array" }],
    wall_caps: [null, {}],
    signage_cabinets: "nope",
  };
  const t = S.buildSceneTree(weird);
  assert.ok(t.nodes.size > 0);
  const sel = S.createSceneSelection();
  assert.doesNotThrow(() => sel.selectAtPoint(weird, { x: 1, z: 1 }));
  assert.doesNotThrow(() => sel.reconcile(weird));
  assert.doesNotThrow(() => S.sceneObjectsInRegion(weird, { minX: 0, minZ: 0, maxX: 500, maxZ: 500 }));
  assert.doesNotThrow(() => S.nodeBreadcrumb(weird, "item:index:3"));
  assert.equal(S.resolveSceneNode(weird, "item:index:3")?.row, 42, "positional rows resolve");
  assert.doesNotThrow(() => sel.cycle(weird));
});

ok("selectAtPoint on empty plan → plain clears / additive keeps", () => {
  const sc = scene({ items: [item("i0", 400, 250)] });
  const sel = S.createSceneSelection();
  sel.select({ id: "item:component:i0" });
  let r = sel.selectAtPoint(sc, { x: 10, z: 10 }, { additive: true });
  assert.equal(r.status, "kept");
  assert.equal(sel.getState().count, 1);
  r = sel.selectAtPoint(sc, { x: 10, z: 10 });
  assert.equal(r.status, "cleared");
  assert.equal(sel.getState().count, 0);
});

// ===========================================================================
const report = {
  suite: "verify-o034-model",
  groups: pass,
  failures,
  status: failures.length ? "FAIL" : "PASS",
};
fs.writeFileSync(".audit-work/foundation-o034-selection/o034-model-verification.json", JSON.stringify(report, null, 2));
if (failures.length) {
  console.log(`FAIL ${failures.length}/${pass + failures.length}`);
  failures.forEach((f) => console.log(" -", f.name, "::", f.message));
  process.exit(1);
}
console.log(`PASS ${report.suite}: ${pass} assertion groups`);
