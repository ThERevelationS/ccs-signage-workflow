// O-040 (CMP-C09) model verification — stroke-level undo.
// Covers: sceneLayoutAnchor CAS semantics, scene-edit primitives, recordEdit
// coalescing (nudge burst = ONE command), multi-commit strokes, undo/redo
// round-trips with apply-gated commits, external-write invalidation, capacity
// bounds, subscription/versioning, and full drag-lifecycle integration
// against the O-039 input primitives. Runs on the STAGING bundle only.
// Usage: node verify-o040-model.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { history as H, input as I, model as M } from "./scene-history-bundle.mjs";

let pass = 0;
const failures = [];
const ok = (name, fn) => {
  try { fn(); pass += 1; }
  catch (e) { failures.push({ name, message: String(e.stack || e.message || e).slice(0, 700) }); }
};

// --- fixtures ---------------------------------------------------------------
const item = (id, x, z, extra = {}) =>
  ({ component_id: id, x_inches: x, z_inches: z, length_inches: 24, width_inches: 24, foundation_type: "spread", ...extra });
const scene = (items) => ({ items, poles: [], walls: [] });
const anchorOf = (items) => H.sceneLayoutAnchor(items);
const patchAnchor = (items, i, patch) => H.sceneLayoutAnchor(H.rowsWithPatch(items, i, patch));
const pos = (x, z) => ({ x_inches: x, z_inches: z });

// Mirrors the canvas's record calls (drag + nudge paths).
const recordDrag = (h, items, i, before, after, opts = {}) => h.recordEdit({
  kind: I.SCENE_EDIT_ITEM_MOVE, method: "drag", label: `Move Foundation ${i + 1}`,
  target: { key: `component:${items[i].component_id}`, index: i },
  coalesceKey: null, before, after,
  beforeAnchor: patchAnchor(items, i, before),
  afterAnchor: patchAnchor(items, i, after),
  at: opts.at,
});
const recordNudge = (h, items, i, before, after, at) => {
  const edit = { kind: I.SCENE_EDIT_ITEM_MOVE, method: "nudge", key: `component:${items[i].component_id}` };
  return h.recordEdit({
    ...edit, label: `Move Foundation ${i + 1}`,
    target: { key: edit.key, index: i },
    coalesceKey: `nudge:${edit.key}`,
    before, after,
    beforeAnchor: patchAnchor(items, i, before),
    afterAnchor: patchAnchor(items, i, after),
    at,
  });
};

// ===========================================================================
// 1. sceneLayoutAnchor — the geometry CAS token
// ===========================================================================
ok("anchor: deterministic + covers x/z/dims/rotation/type/validity", () => {
  const base = [item("a", 10, 20), item("b", 100, 50)];
  const a0 = anchorOf(base);
  assert.equal(anchorOf([item("a", 10, 20), item("b", 100, 50)]), a0, "same scene same anchor");
  assert.notEqual(anchorOf([item("a", 11, 20), item("b", 100, 50)]), a0, "x move");
  assert.notEqual(anchorOf([item("a", 10, 21), item("b", 100, 50)]), a0, "z move");
  assert.notEqual(anchorOf([item("a", 10, 20, { width_inches: 36 }), item("b", 100, 50)]), a0, "resize");
  assert.notEqual(anchorOf([item("a", 10, 20, { rotation_degrees: 45 }), item("b", 100, 50)]), a0, "rotate");
  assert.notEqual(anchorOf([item("a", 10, 20, { foundation_type: "pillar", diameter: 24 }), item("b", 100, 50)]), a0, "type");
  assert.notEqual(anchorOf([item("a", 10, 20), item("b", 100, 50), item("c", 0, 0)]), a0, "insert");
  assert.notEqual(anchorOf([item("a", 10, 20)]), a0, "delete");
});

ok("anchor: geometry-only — ids, labels, prices, materials excluded", () => {
  const a0 = anchorOf([item("a", 10, 20)]);
  assert.equal(anchorOf([item("DIFFERENT", 10, 20)]), a0, "component_id mint/rename is not a geometric event");
  assert.equal(anchorOf([item("a", 10, 20, { description: "new label", customer_price: 999, material_id: "m7" })]), a0, "non-geometry fields excluded");
});

ok("anchor: reorder rules + invalid-position rows stay anchored", () => {
  const A = item("a", 10, 20), B = item("b", 100, 50, { width_inches: 48 });
  assert.equal(anchorOf([A, B]), anchorOf([item("x", 10, 20), item("y", 100, 50, { width_inches: 48 })]), "identity-free");
  assert.notEqual(anchorOf([A, B]), anchorOf([B, A]), "reorder of different geometry detected");
  const twin1 = item("t1", 10, 20), twin2 = item("t2", 10, 20);
  assert.equal(anchorOf([twin1, twin2]), anchorOf([twin2, twin1]), "identical-geometry swap is equivalent");
  const bad = anchorOf([item("a", "bad", 20)]);
  const bad2 = anchorOf([item("a", "worse", 20)]);
  assert.equal(bad, bad2, "invalid positions anchor by shape of invalidity, not raw value");
  assert.notEqual(anchorOf([item("a", "bad", 20)]), anchorOf([item("a", 0, 20)]), "invalid vs valid differs");
});

ok("anchor: poles + walls covered when scene-object passed", () => {
  const s1 = { items: [item("a", 10, 20)], poles: [{ component_id: "p", x_inches: 5, z_inches: 6 }], walls: [{ component_id: "w", shape: { points: [{ x: 1, z: 1 }, { x: 9, z: 1 }, { x: 9, z: 9 }], closed: true } }] };
  const a1 = H.sceneLayoutAnchor(s1);
  assert.notEqual(H.sceneLayoutAnchor({ ...s1, poles: [{ component_id: "p", x_inches: 7, z_inches: 6 }] }), a1, "pole move");
  assert.notEqual(H.sceneLayoutAnchor({ ...s1, walls: [{ component_id: "w", shape: { points: [{ x: 2, z: 1 }, { x: 9, z: 1 }, { x: 9, z: 9 }], closed: true } }] }), a1, "wall vertex move");
  assert.equal(H.sceneLayoutAnchor({ ...s1, poles: [{ component_id: "q", x_inches: 5, z_inches: 6 }] }), a1, "pole id excluded");
  assert.equal(H.sceneLayoutAnchor([]), H.sceneLayoutAnchor({ items: [], poles: [], walls: [] }), "array form = items-only");
});

ok("rowsWithPatch: single-row patch, bounds-guarded", () => {
  const rows = [item("a", 1, 2), item("b", 3, 4)];
  const p = H.rowsWithPatch(rows, 0, { x_inches: 50 });
  assert.equal(p[0].x_inches, 50);
  assert.equal(p[0].z_inches, 2);
  assert.equal(p[1].x_inches, 3);
  assert.equal(rows[0].x_inches, 1, "original untouched");
  assert.equal(H.rowsWithPatch(rows, 9, { x_inches: 1 }), rows, "out of range passthrough");
  assert.equal(H.rowsWithPatch(null, 0, { x: 1 }), null, "non-array passthrough");
});

// ===========================================================================
// 2. Scene-edit primitives (the input seam)
// ===========================================================================
ok("sceneEditFromDrag: packages gesture record + patch", () => {
  const d = I.beginSceneDrag({ pointerId: 1, key: "component:a", identityKind: "component", legacyIndex: 0, count: 2, corner: { x: 10, z: 20 }, grabPoint: { x: 15, z: 25 }, fingerprint: "f" });
  const patch = I.commitSceneDrag(d, { x: 40, z: 50 });
  assert.deepEqual(patch, pos(35, 45), "release minus grab offset");
  const e = I.sceneEditFromDrag(d, patch);
  assert.equal(e.kind, "item-move");
  assert.equal(e.method, "drag");
  assert.equal(e.key, "component:a");
  assert.deepEqual(e.before, pos(10, 20), "pre-stroke corner captured at begin");
  assert.deepEqual(e.after, pos(35, 45), "commit patch");
  assert.equal(I.sceneEditFromDrag(null, patch), null);
  assert.equal(I.sceneEditFromDrag(d, null), null);
  assert.equal(I.sceneEditCoalesceKey(e), null, "drags never coalesce");
});

ok("sceneEditFromNudge: same shape + burst coalesce key", () => {
  const e = I.sceneEditFromNudge("component:a", { x_inches: 10, z_inches: 20, valid: true }, pos(11, 20));
  assert.equal(e.method, "nudge");
  assert.deepEqual(e.before, pos(10, 20));
  assert.deepEqual(e.after, pos(11, 20));
  assert.equal(I.sceneEditCoalesceKey(e), "nudge:component:a");
  assert.equal(I.sceneEditFromNudge("k", { x_inches: "bad" }, pos(1, 1)), null);
  assert.equal(I.sceneEditCoalesceKey({ method: "nudge", key: "" }), null);
  assert.equal(I.sceneEditCoalesceKey({ method: "drag", key: "x" }), null);
});

// ===========================================================================
// 3. recordEdit — one atomic edit = one command
// ===========================================================================
ok("record: drag commit → single undoable entry, anchors chained", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  const r = recordDrag(h, items, 0, pos(10, 20), pos(40, 60), { at: 1000 });
  assert.equal(r.status, "recorded");
  const st = h.getState();
  assert.equal(st.undoDepth, 1);
  assert.equal(st.canUndo, true);
  assert.equal(st.canRedo, false);
  assert.equal(st.undoLabel, "Move Foundation 1");
  assert.equal(h.currentAnchor, patchAnchor(items, 0, pos(40, 60)), "head anchor = post-stroke scene");
});

ok("record: nudge burst on one row coalesces to ONE entry (moves counted)", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  for (let i = 0; i < 5; i += 1) {
    const r = recordNudge(h, items, 0, pos(10 + i, 20), pos(11 + i, 20), 1000 + i * 200);
    items = H.rowsWithPatch(items, 0, pos(11 + i, 20));
    assert.equal(r.status, i === 0 ? "recorded" : "merged", `sub-edit ${i}`);
  }
  const e = h.entries().past;
  assert.equal(e.length, 1, "five nudges → one command");
  assert.equal(e[0].moves, 5);
  assert.equal(h.getState().undoDepth, 1);
  // undo restores the burst's starting corner
  const u = h.undo(anchorOf(items), (rev) => { assert.deepEqual(rev.patch, pos(10, 20)); return true; });
  assert.equal(u.status, "applied");
  assert.equal(h.currentAnchor, patchAnchor(items, 0, pos(10, 20)), "head anchor returns to the pre-burst scene");
});

ok("record: burst boundary — gap over window starts a new command", () => {
  const h = H.createSceneHistory({ coalesceWindowMs: 500 });
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordNudge(h, items, 0, pos(10, 20), pos(11, 20), 0);
  items = H.rowsWithPatch(items, 0, pos(11, 20));
  recordNudge(h, items, 0, pos(11, 20), pos(12, 20), 400); // inside window → merge
  items = H.rowsWithPatch(items, 0, pos(12, 20));
  recordNudge(h, items, 0, pos(12, 20), pos(13, 20), 400 + 501); // outside → new
  items = H.rowsWithPatch(items, 0, pos(13, 20));
  const e = h.entries().past;
  assert.equal(e.length, 2);
  assert.equal(e[0].moves, 2);
  assert.equal(e[1].moves, 1);
});

ok("record: a burst returning to its start cancels itself out", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordNudge(h, items, 0, pos(10, 20), pos(11, 20), 0);   // right
  items = H.rowsWithPatch(items, 0, pos(11, 20));
  const r = recordNudge(h, items, 0, pos(11, 20), pos(10, 20), 100); // back
  assert.equal(r.status, "merged-noop", "net-zero burst drops its own entry");
  items = H.rowsWithPatch(items, 0, pos(10, 20));
  assert.equal(h.entries().past.length, 0, "nothing left to undo");
  assert.equal(h.getState().canUndo, false);
  assert.equal(h.currentAnchor, anchorOf(items), "anchor back at base");
});

ok("record: different rows / different kinds never merge", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  recordNudge(h, items, 0, pos(10, 20), pos(11, 20), 0);
  items = H.rowsWithPatch(items, 0, pos(11, 20));
  const r = recordNudge(h, items, 1, pos(100, 50), pos(101, 50), 100);
  assert.equal(r.status, "recorded", "different coalesceKey = own command");
  assert.equal(h.entries().past.length, 2);
});

ok("record: drags on the same row never merge (null coalesceKey)", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(30, 40), { at: 0 });
  items = H.rowsWithPatch(items, 0, pos(30, 40));
  const r = recordDrag(h, items, 0, pos(30, 40), pos(50, 60), { at: 100 });
  assert.equal(r.status, "recorded");
  assert.equal(h.entries().past.length, 2, "two gestures, two commands");
});

ok("record: no-op and unanchored edits are refused", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  const noop = recordDrag(h, items, 0, pos(10, 20), pos(10, 20), { at: 0 });
  assert.equal(noop.status, "ignored-noop");
  const unanchored = h.recordEdit({ kind: "x", before: pos(1, 1), after: pos(2, 2) });
  assert.equal(unanchored.status, "ignored-unanchored", "anchored store fails closed on unverifiable edit");
  assert.equal(h.entries().past.length, 0);
});

ok("record: unanchored store (never observed) works as a plain stack", () => {
  const h = H.createSceneHistory();
  h.recordEdit({ kind: "k", before: 1, after: 2, at: 0 });
  h.recordEdit({ kind: "k", before: 2, after: 3, at: 1 });
  assert.equal(h.entries().past.length, 2);
  const u = h.undo();
  assert.equal(u.status, "applied");
  assert.equal(u.patch, 2);
  assert.equal(h.entries().future.length, 1);
});

// ===========================================================================
// 4. Undo/redo traversal — CAS + apply-gated commit
// ===========================================================================
ok("undo/redo: multi-level round-trip restores anchors in order", () => {
  const h = H.createSceneHistory();
  const items0 = [item("a", 10, 20)];
  h.observe(anchorOf(items0));
  const states = [items0];
  for (const [i, to] of [[40, 60], [70, 80], [90, 100]].entries()) {
    const cur = states[states.length - 1];
    const before = { x_inches: cur[0].x_inches, z_inches: cur[0].z_inches };
    recordDrag(h, cur, 0, before, pos(to[0], to[1]), { at: i * 100 });
    states.push(H.rowsWithPatch(cur, 0, pos(to[0], to[1])));
  }
  const applied = [];
  const apply = (rev) => { applied.push(rev.patch); return true; };
  assert.equal(h.undo(anchorOf(states[3]), apply).status, "applied");
  assert.equal(h.undo(anchorOf(states[2]), apply).status, "applied");
  assert.equal(h.undo(anchorOf(states[1]), apply).status, "applied");
  assert.deepEqual(applied, [pos(70, 80), pos(40, 60), pos(10, 20)], "inverse patches in LIFO order");
  assert.equal(h.undo(anchorOf(states[0]), apply).status, "empty");
  // redo replays forward
  assert.equal(h.redo(anchorOf(states[0]), apply).status, "applied");
  assert.equal(h.redo(anchorOf(states[1]), apply).status, "applied");
  assert.equal(h.redo(anchorOf(states[2]), apply).status, "applied");
  assert.equal(applied.length, 6);
  assert.deepEqual(applied[3], pos(40, 60));
  assert.deepEqual(applied[4], pos(70, 80));
  assert.deepEqual(applied[5], pos(90, 100));
  assert.equal(h.getState().canRedo, false);
  assert.equal(h.currentAnchor, anchorOf(states[3]));
});

ok("undo: caller-anchor CAS — wrong live anchor refuses without mutation", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  const before = h.stateVersion;
  const r = h.undo(anchorOf([item("a", 99, 99), item("b", 1, 1)]), () => { throw new Error("must not be called"); });
  assert.equal(r.status, "anchor-mismatch");
  assert.equal(h.stateVersion, before, "no state change on refused undo");
  assert.equal(h.getState().canUndo, true, "entry still live");
});

ok("undo: refused commit (apply→false) leaves stacks untouched", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  const live = patchAnchor(items, 0, pos(40, 60)); // scene after the landed stroke
  const r = h.undo(live, () => false); // consumer's commit refused
  assert.equal(r.status, "rejected");
  assert.equal(h.entries().past.length, 1);
  assert.equal(h.entries().future.length, 0);
  // throwing consumer counts as refusal too
  const r2 = h.undo(live, () => { throw new Error("commit exploded"); });
  assert.equal(r2.status, "rejected");
  assert.equal(h.entries().past.length, 1);
});

ok("undo: external write detaches — stale geometry is never resurrected", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  items = H.rowsWithPatch(items, 0, pos(40, 60));
  // concurrent write lands outside the stroke channel (Builder sync etc.)
  items = H.rowsWithPatch(items, 1, pos(150, 90));
  const o = h.observe(anchorOf(items));
  assert.equal(o.status, "detached");
  assert.equal(h.getState().canUndo, false, "recorded move can no longer apply");
  assert.equal(h.getState().detached, 1);
  const r = h.undo(anchorOf(items), () => { throw new Error("must not resurrect"); });
  assert.equal(r.status, "stale");
  assert.equal(h.entries().past.length, 0, "dead tail pruned on contact");
  // history keeps working on the new base
  let items2 = items;
  recordDrag(h, items2, 1, pos(150, 90), pos(160, 95));
  items2 = H.rowsWithPatch(items2, 1, pos(160, 95));
  const u = h.undo(anchorOf(items2), (rev) => { assert.deepEqual(rev.patch, pos(150, 90)); return true; });
  assert.equal(u.status, "applied");
});

ok("external write mid-gesture: entry anchors preserve the interleaved edit", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  // simulate: drag on row 0 committed while row 1 had already moved —
  // beforeAnchor/afterAnchor are computed against CURRENT rows (canvas formula)
  items = H.rowsWithPatch(items, 1, pos(150, 90)); // row 1 moves "under" the gesture
  const r = h.recordEdit({
    kind: "item-move", method: "drag", target: { key: "component:a", index: 0 },
    before: pos(10, 20), after: pos(40, 60),
    beforeAnchor: patchAnchor(items, 0, pos(10, 20)),
    afterAnchor: patchAnchor(items, 0, pos(40, 60)),
  });
  assert.equal(r.status, "recorded");
  items = H.rowsWithPatch(items, 0, pos(40, 60));
  const u = h.undo(anchorOf(items), (rev) => { assert.deepEqual(rev.patch, pos(10, 20)); return true; });
  assert.equal(u.status, "applied");
  assert.equal(h.currentAnchor, patchAnchor(items, 0, pos(10, 20)), "undo lands on the interleaved base — row 1 edit kept");
});

ok("redo: cleared on any new recorded edit", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  items = H.rowsWithPatch(items, 0, pos(40, 60));
  h.undo(anchorOf(items), () => true);
  items = H.rowsWithPatch(items, 0, pos(10, 20));
  assert.equal(h.getState().canRedo, true);
  recordDrag(h, items, 0, pos(10, 20), pos(30, 30));
  assert.equal(h.getState().canRedo, false, "new edit kills the redo branch");
  assert.equal(h.redo(anchorOf(H.rowsWithPatch(items, 0, pos(30, 30)))).status, "empty");
});

// ===========================================================================
// 5. Multi-commit strokes (paint/drag-with-landing-sub-edits)
// ===========================================================================
ok("stroke: begin→extends→commit = ONE entry regardless of sub-edit count", () => {
  const h = H.createSceneHistory();
  let cells = { a: 0, b: 0, c: 0 };
  const a0 = `cells:${JSON.stringify(cells)}`;
  h.observe(a0);
  h.beginStroke({ kind: "paint", method: "paint", label: "Paint cells", before: { ...cells }, beforeAnchor: a0, at: 0 });
  for (const [k, t] of [["a", 100], ["b", 200], ["c", 300]]) {
    cells = { ...cells, [k]: t };
    h.extendStroke({ after: { ...cells }, afterAnchor: `cells:${JSON.stringify(cells)}`, at: t });
  }
  const c = h.commitStroke({ at: 400 });
  assert.equal(c.status, "recorded");
  assert.equal(h.entries().past.length, 1, "3 landed sub-edits → one command");
  assert.equal(h.entries().past[0].moves, 3);
  const u = h.undo(`cells:${JSON.stringify(cells)}`, (rev) => { assert.deepEqual(rev.patch, { a: 0, b: 0, c: 0 }); return true; });
  assert.equal(u.status, "applied");
});

ok("stroke: cancel + empty-commit + begin-while-open rules", () => {
  const h = H.createSceneHistory();
  h.observe("a0");
  assert.equal(h.cancelStroke().status, "no-stroke");
  h.beginStroke({ kind: "paint", before: 1, beforeAnchor: "a0" });
  assert.equal(h.commitStroke({}).status, "cancelled-empty", "nothing landed → nothing recorded");
  h.beginStroke({ kind: "paint", before: 1, beforeAnchor: "a0" });
  h.extendStroke({ after: 2, afterAnchor: "a1" });
  const b2 = h.beginStroke({ kind: "paint", before: 2, beforeAnchor: "a1" }); // auto-commits prior
  assert.equal(b2.status, "open");
  assert.equal(h.entries().past.length, 1, "prior landed stroke auto-committed");
  h.cancelStroke();
  assert.equal(h.entries().past.length, 1);
});

ok("stroke: anchored store requires the landed anchor at commit", () => {
  const h = H.createSceneHistory();
  h.observe("a0");
  h.beginStroke({ kind: "paint", before: 1, beforeAnchor: "a0" });
  h.extendStroke({ after: 2 }); // no anchor supplied
  const c = h.commitStroke({});   // still no afterAnchor
  assert.equal(c.status, "ignored-unanchored");
  assert.equal(h.entries().past.length, 0);
});

ok("stroke: observe-mismatch mid-gesture kills the open stroke", () => {
  const h = H.createSceneHistory();
  h.observe("a0");
  h.beginStroke({ kind: "paint", before: 1, beforeAnchor: "a0" });
  h.extendStroke({ after: 2, afterAnchor: "a1" });
  const o = h.observe("external-anchor");
  assert.equal(o.status, "detached");
  assert.equal(h.getState().busy, false, "stroke cancelled");
  assert.equal(h.extendStroke({ after: 3 }).status, "no-stroke");
});

ok("stroke: traversal refuses while a gesture is open ('busy')", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  h.beginStroke({ kind: "paint", before: 1, beforeAnchor: patchAnchor(items, 0, pos(40, 60)) });
  const r = h.undo(anchorOf(items));
  assert.equal(r.status, "busy");
  h.cancelStroke();
  assert.equal(h.undo(anchorOf(H.rowsWithPatch(items, 0, pos(40, 60))), () => true).status, "applied");
});

// ===========================================================================
// 6. Capacity bounds + subscription
// ===========================================================================
ok("capacity: oldest entries evict; detached boundary shifts with eviction", () => {
  const h = H.createSceneHistory({ capacity: 3 });
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  for (let i = 0; i < 5; i += 1) {
    recordDrag(h, items, 0, pos(10 + i, 20), pos(11 + i, 20), { at: i });
  }
  const e = h.entries();
  assert.equal(e.past.length, 3, "bounded");
  assert.equal(e.past[0].id > e.past[1].id - 2, true, "oldest two evicted");
  const h2 = H.createSceneHistory({ capacity: 2 });
  h2.observe("a0");
  h2.recordEdit({ kind: "k", before: 1, after: 2, beforeAnchor: "a0", afterAnchor: "a1" });
  h2.observe("ext");
  assert.equal(h2.getState().detached, 1);
  h2.recordEdit({ kind: "k", before: 3, after: 4, beforeAnchor: "ext", afterAnchor: "a2" });
  h2.recordEdit({ kind: "k", before: 4, after: 5, beforeAnchor: "a2", afterAnchor: "a3" });
  h2.recordEdit({ kind: "k", before: 5, after: 6, beforeAnchor: "a3", afterAnchor: "a4" });
  const st = h2.getState();
  assert.equal(h2.entries().past.length, 2);
  assert.equal(st.detached, 0, "evicted detached entry shrinks the boundary");
});

ok("subscribe: fires on mutation, silent on no-op observe; unsubscribe stops it", () => {
  const h = H.createSceneHistory();
  let calls = 0;
  const off = h.subscribe(() => { calls += 1; });
  h.observe("a0");            // first anchor — no emit (nothing visible changed)
  assert.equal(calls, 0);
  h.observe("a0");            // no-op
  assert.equal(calls, 0);
  h.recordEdit({ kind: "k", before: 1, after: 2, beforeAnchor: "a0", afterAnchor: "a1" });
  assert.equal(calls, 1);
  h.observe("ext");           // detach → emit
  assert.equal(calls, 2);
  h.undo("ext");              // stale prune → emit
  assert.equal(calls, 3);
  off();
  h.recordEdit({ kind: "k", before: 1, after: 2, beforeAnchor: "ext", afterAnchor: "a9" });
  assert.equal(calls, 3, "unsubscribed");
  const off2 = h.subscribe("not a function");
  assert.equal(typeof off2, "function");
});

// ===========================================================================
// 7. Full drag lifecycle integration (O-039 primitives → O-040 record)
// ===========================================================================
ok("lifecycle: begin→move→commit produces the same record the canvas wires", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  const d = I.beginSceneDrag({
    pointerId: 1, key: M.layoutItemKey(items[0], 0), identityKind: "component",
    legacyIndex: 0, count: items.length,
    corner: { x: 10, z: 20 }, grabPoint: { x: 14, z: 24 },
    fingerprint: M.layoutItemFingerprint(items[0]),
  });
  d.moved = true;
  d.last = I.sceneDragCorner(d, { x: 60, z: 80 }); // preview move — no history
  const patch = I.commitSceneDrag(d, { x: 64, z: 84 });
  assert.deepEqual(patch, pos(60, 80));
  const target = I.resolveSceneDragTarget(d, items);
  const edit = I.sceneEditFromDrag(d, patch);
  const r = h.recordEdit({
    ...edit, target: { key: d.key, index: target.index }, label: "Move Foundation 1",
    coalesceKey: I.sceneEditCoalesceKey(edit),
    beforeAnchor: patchAnchor(items, target.index, edit.before),
    afterAnchor: patchAnchor(items, target.index, patch),
  });
  assert.equal(r.status, "recorded");
  const done = H.rowsWithPatch(items, 0, patch);
  const u = h.undo(anchorOf(done), (rev) => {
    assert.deepEqual(rev.patch, pos(10, 20), "undo returns the pre-stroke corner");
    assert.equal(rev.target.index, 0);
    assert.equal(rev.label, "Move Foundation 1");
    return true;
  });
  assert.equal(u.status, "applied");
  assert.equal(h.currentAnchor, anchorOf(items), "anchor returns to pre-stroke scene");
});

ok("lifecycle: sub-inch wiggle / fingerprint-cancel produce NO entry", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  const d = I.beginSceneDrag({ pointerId: 1, key: "component:a", identityKind: "component", legacyIndex: 0, count: 1, corner: { x: 10, z: 20 }, grabPoint: { x: 14, z: 24 }, fingerprint: M.layoutItemFingerprint(items[0]) });
  assert.equal(I.commitSceneDrag(d, { x: 14.4, z: 24.3 }), null, "wiggle commits nothing — canvas never reaches recordEdit");
  const d2 = I.beginSceneDrag({ pointerId: 1, key: "component:a", identityKind: "component", legacyIndex: 0, count: 1, corner: { x: 10, z: 20 }, grabPoint: { x: 14, z: 24 }, fingerprint: "stale" });
  assert.equal(I.resolveSceneDragTarget(d2, items), null, "fingerprint guard cancels — no record");
  assert.equal(h.entries().past.length, 0);
  assert.equal(h.getState().canUndo, false);
});

ok("lifecycle: held-key burst then drag = 2 commands, LIFO undo order", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  let t = 0;
  for (let i = 0; i < 3; i += 1) { // burst of 3 nudges
    const delta = I.keyboardNudge({ key: "ArrowRight", shiftKey: false });
    const before = pos(10 + i, 20);
    recordNudge(h, items, 0, before, { x_inches: before.x_inches + delta.dx, z_inches: before.z_inches }, t);
    items = H.rowsWithPatch(items, 0, pos(11 + i, 20)); t += 100;
  }
  t += 2000; // gesture gap
  recordDrag(h, items, 0, pos(13, 20), pos(60, 70), { at: t });
  items = H.rowsWithPatch(items, 0, pos(60, 70));
  assert.equal(h.entries().past.length, 2, "burst + drag = two commands");
  const patches = [];
  const apply = (rev) => { patches.push(rev.patch); return true; };
  h.undo(anchorOf(items), apply);
  h.undo(anchorOf(H.rowsWithPatch(items, 0, pos(13, 20))), apply);
  assert.deepEqual(patches, [pos(13, 20), pos(10, 20)], "drag undoes, then the whole burst");
});

// ===========================================================================
// 8. Config + inspection surface
// ===========================================================================
ok("config: coalesceWindowMs=0 disables merging; Infinity always merges chained same-key", () => {
  const h0 = H.createSceneHistory({ coalesceWindowMs: 0 });
  let items = [item("a", 10, 20)];
  h0.observe(anchorOf(items));
  recordNudge(h0, items, 0, pos(10, 20), pos(11, 20), 0);
  items = H.rowsWithPatch(items, 0, pos(11, 20));
  recordNudge(h0, items, 0, pos(11, 20), pos(12, 20), 0);
  assert.equal(h0.entries().past.length, 2, "window=0: every nudge its own command");
  const hInf = H.createSceneHistory({ coalesceWindowMs: Infinity });
  items = [item("a", 10, 20)];
  hInf.observe(anchorOf(items));
  recordNudge(hInf, items, 0, pos(10, 20), pos(11, 20), 0);
  items = H.rowsWithPatch(items, 0, pos(11, 20));
  recordNudge(hInf, items, 0, pos(11, 20), pos(12, 20), 999999999);
  assert.equal(hInf.entries().past.length, 1, "window=Infinity: always merges adjacent same-key");
});

ok("inspection: entries()/peekUndo()/getState() report honest history", () => {
  const h = H.createSceneHistory();
  let items = [item("a", 10, 20), item("b", 100, 50)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60), { at: 100 });
  items = H.rowsWithPatch(items, 0, pos(40, 60));
  recordDrag(h, items, 1, pos(100, 50), pos(120, 70), { at: 200 });
  items = H.rowsWithPatch(items, 1, pos(120, 70));
  const peek = h.peekUndo();
  assert.equal(peek.label, "Move Foundation 2");
  assert.equal(peek.detached, false);
  h.observe(anchorOf([item("a", 40, 60), item("b", 120, 70), item("c", 1, 1)]));
  const e = h.entries();
  assert.equal(e.detached, 2);
  assert.equal(e.past.every((p) => p.detached), true);
  assert.equal(h.peekUndo(), null, "no live top after detach");
  const st = h.getState();
  assert.equal(st.undoDepth, 0);
  assert.equal(st.stateVersion, h.stateVersion);
});

ok("clear: resets stacks + reseeds anchor (context switch)", () => {
  const h = H.createSceneHistory();
  const items = [item("a", 10, 20)];
  h.observe(anchorOf(items));
  recordDrag(h, items, 0, pos(10, 20), pos(40, 60));
  const r = h.clear(anchorOf([item("z", 1, 1)]));
  assert.equal(r.status, "cleared");
  const st = h.getState();
  assert.equal(st.canUndo, false);
  assert.equal(st.undoDepth, 0);
  assert.equal(st.detached, 0);
  const rr = h.recordEdit({ kind: "k", before: pos(1, 1), after: pos(2, 2), beforeAnchor: anchorOf([item("z", 1, 1)]), afterAnchor: anchorOf([item("z", 2, 2)]) });
  assert.equal(rr.status, "recorded", "fresh chain on the new context");
});

const report = { suite: "verify-o040-model", passed: pass, failed: failures.length, failures };
fs.writeFileSync(new URL("./o040-model-verification.json", import.meta.url), JSON.stringify(report, null, 2));
if (failures.length) {
  console.log(`FAIL verify-o040-model: ${pass} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(" -", f.name, "::", f.message));
  process.exit(1);
}
console.log(`PASS verify-o040-model: ${pass} assertion groups`);
