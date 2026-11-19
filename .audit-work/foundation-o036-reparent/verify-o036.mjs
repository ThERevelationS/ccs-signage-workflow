import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const OUT = ".audit-work/foundation-o036-reparent/verify";
fs.mkdirSync(OUT, { recursive: true });

buildSync({
  entryPoints: ["src/components/estimator/foundation/foundationReparentModel.js"],
  bundle: true, platform: "node", format: "esm",
  outfile: `${OUT}/reparent.bundle.mjs`,
});
const M = await import(pathToFileURL(path.resolve(`${OUT}/reparent.bundle.mjs`)).href);
const {
  planReparent, planReparentSelection, reparentParentOf, reparentTargetsFor,
  mountLinkDescriptors, reparentEditRecord, ancestorComponentIds,
  resolveReparentTargetNode, reparentChildSpec,
  REPARENT_CHILD_KINDS, REPARENT_PARENT_KINDS,
} = M;

const results = [];
const pending = [];
const check = (name, fn) => {
  const record = { name };
  results.push(record);
  try {
    const out = fn();
    if (out instanceof Promise) {
      pending.push(out.then(() => { record.ok = true; console.log("ok", name); })
        .catch(e => { record.ok = false; record.error = String(e.stack || e); console.error("FAIL", name, e.message); }));
      return;
    }
    record.ok = true; console.log("ok", name);
  } catch (e) { record.ok = false; record.error = String(e.stack || e); console.error("FAIL", name, e.message); }
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Scene fixtures ────────────────────────────────────────────────────────
const itemA = { component_id: "item-a", foundation_type: "spread_foot", x_inches: 0, z_inches: 0, length_inches: 48, width_inches: 24, rotation_degrees: 0 };
const itemB = { component_id: "item-b", foundation_type: "spread_foot", x_inches: 120, z_inches: 0, length_inches: 24, width_inches: 24, rotation_degrees: 90 };
const itemNoGeo = { component_id: "item-nogeo", foundation_type: "spread_foot", x_inches: 0, z_inches: 400 };
const itemNoId = { foundation_type: "spread_foot", x_inches: 500, z_inches: 0, length_inches: 24, width_inches: 24 };
const wallA = { component_id: "wall-a", shape: { closed: false, points: [{ x: 0, z: 100 }, { x: 100, z: 100 }, { x: 100, z: 150 }], segments: [{ component_id: "seg-1" }, { component_id: "seg-2" }] } };
const wallB = { component_id: "wall-b", shape: { closed: true, points: [{ x: 300, z: 0 }, { x: 400, z: 0 }, { x: 350, z: 50 }], segments: [{ component_id: "seg-b1" }] } };
const wallC = { component_id: "wall-c", shape: { closed: false, points: [{ x: 600, z: 0 }, { x: 700, z: 0 }], segments: [{ component_id: "cap-1" }] } };
const pole1 = { component_id: "pole-1", x_inches: 10, z_inches: 5, foundation_component_id: "item-a", foundation_idx: 0 };
const pole2 = { component_id: "pole-2", x_inches: 200, z_inches: 5 };
const poleLegacy = { component_id: "pole-3", x_inches: 30, z_inches: 5, foundation_idx: 0 };
const poleDangling = { component_id: "pole-4", x_inches: 40, z_inches: 5, foundation_component_id: "item-missing" };
const poleLocked = { component_id: "pole-5", x_inches: 50, z_inches: 5, foundation_component_id: "item-a", locked: true };
const poleUnresolved = { component_id: "pole-6", x_inches: 60, z_inches: 5, foundation_component_id: "unresolved:xyz" };
const poleNoPoint = { component_id: "pole-7" };
const poleOnNoGeo = { component_id: "pole-8", x_inches: 5, z_inches: 5, foundation_component_id: "item-nogeo" };
const cap1 = { component_id: "cap-1", wall_component_id: "wall-a", wall_index: 0, segment_component_id: "seg-1", segment_index: 0 };
const capNoSeg = { component_id: "cap-2", wall_component_id: "wall-a", wall_index: 0 };
const capLegacy = { component_id: "cap-3", wall_index: 0 };
const cab1 = { component_id: "cab-1", mount: "pole", pole_component_id: "pole-1", pole_index: 0 };
const cab2 = { component_id: "cab-2", mount: "foundation", foundation_component_id: "item-a", foundation_index: 0 };

const scene = () => ({
  items: [itemA, itemB, itemNoGeo, itemNoId],
  walls: [wallA, wallB, wallC],
  poles: [pole1, pole2, poleLegacy, poleDangling, poleLocked, poleUnresolved, poleNoPoint, poleOnNoGeo],
  wall_caps: [cap1, capNoSeg, capLegacy],
  signage_cabinets: [cab1, cab2],
});

const P1 = "pole:component:pole-1";
const P2 = "pole:component:pole-2";
const CAP1 = "wall-cap:component:cap-1";
const CAB1 = "cabinet:component:cab-1";
const SEG1 = "wall-segment:component:wall-a|component:seg-1";
const SEG2 = "wall-segment:component:wall-a|component:seg-2";

// ══════════ Pole reparent — the only child with plan geometry ═════════════
check("pole→new item (world): canon patch, mirror sync, geometry untouched", () => {
  const r = planReparent(scene(), P1, { kind: "item", componentId: "item-b" });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1);
  const p = r.patches[0];
  assert.equal(p.collection, "poles");
  assert.equal(p.index, 0);
  assert.equal(p.key, "component:pole-1");
  assert.deepEqual(p.patch, { foundation_component_id: "item-b", foundation_idx: 1 });
  assert.deepEqual(p.before, { foundation_component_id: "item-a", foundation_idx: 0 });
  assert.equal(r.keep, "world");
  assert.equal(r.keepRequested, "world");
  assert.deepEqual(r.preserveIds, [P1]);
});

check("pole→same item is a noop", () => {
  const r = planReparent(scene(), P1, { kind: "item", componentId: "item-a" });
  assert.equal(r.status, "noop");
});

check("pole→standalone detaches via null/'standalone'/{detach} targets", () => {
  for (const target of [null, "standalone", { detach: true }, { kind: "standalone" }]) {
    const r = planReparent(scene(), P1, target);
    assert.equal(r.status, "ok", JSON.stringify(target));
    assert.deepEqual(r.patches[0].patch, { foundation_component_id: "", foundation_idx: undefined });
    assert.equal(r.from.kind, "item");
    assert.equal(r.to.kind, "standalone");
  }
});

check("keep:local preserves the pole's offset inside the new rotated frame", () => {
  // itemA frame: center (24,12) rot 0 → local of (10,5) = (-14,-7)
  // itemB frame: center (132,12) rot 90 → plan = (132 + 7, 12 - 14) = (139,-2)
  const r = planReparent(scene(), P1, { kind: "item", componentId: "item-b" }, { keep: "local" });
  assert.equal(r.status, "ok");
  assert.equal(r.keep, "local");
  assert.ok(close(r.patches[0].patch.x_inches, 139), JSON.stringify(r.patches[0].patch));
  assert.ok(close(r.patches[0].patch.z_inches, -2));
  assert.ok(close(r.patches[0].before.x_inches, 10));
});

check("keep:local on detach resolves world, echoes keepRequested honestly", () => {
  const r = planReparent(scene(), P1, "standalone", { keep: "local" });
  assert.equal(r.status, "ok");
  assert.equal(r.keep, "world");
  assert.equal(r.keepRequested, "local");
});

check("keep:local refuses when the new item's frame cannot resolve", () => {
  const r = planReparent(scene(), P2, { kind: "item", componentId: "item-nogeo" }, { keep: "local" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "invalid-target-geometry");
});

check("keep:local refuses when the pole has no plan point", () => {
  const r = planReparent(scene(), "pole:component:pole-7", { kind: "item", componentId: "item-a" }, { keep: "local" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "invalid-geometry");
});

check("keep:local refuses when the OLD parent's frame cannot resolve", () => {
  const r = planReparent(scene(), "pole:component:pole-8", { kind: "item", componentId: "item-a" }, { keep: "local" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "invalid-source-geometry");
});

// ══════════ Wall-cap — deepest mount wins ═════════════════════════════════
check("cap→different segment keeps the wall, retargets the segment canon", () => {
  const r = planReparent(scene(), CAP1, SEG2);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    wall_component_id: "wall-a", wall_index: 0,
    segment_component_id: "seg-2", segment_index: 1,
  });
});

check("cap segment→wall clears the segment sub-mount", () => {
  const r = planReparent(scene(), CAP1, { kind: "wall", componentId: "wall-a" });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    wall_component_id: "wall-a", wall_index: 0,
    segment_component_id: "", segment_index: undefined,
  });
});

check("cap→standalone clears wall and segment refs", () => {
  const r = planReparent(scene(), CAP1, "standalone");
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    wall_component_id: "", wall_index: undefined,
    segment_component_id: "", segment_index: undefined,
  });
});

check("cap→segment on a different wall retargets both canon fields", () => {
  const r = planReparent(scene(), CAP1, "wall-segment:component:wall-b|component:seg-b1");
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    wall_component_id: "wall-b", wall_index: 1,
    segment_component_id: "seg-b1", segment_index: 0,
  });
});

check("explicit wall bound + segment on another wall → segment-not-on-wall", () => {
  const r = planReparent(scene(), CAP1, { kind: "wall", componentId: "wall-b", segmentComponentId: "seg-1" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "segment-not-on-wall");
});

// ══════════ Cabinet — mount-flavor rewrite, unused pair cleared ════════════
check("cabinet pole→item rewrites mount flavor and clears the pole pair", () => {
  const r = planReparent(scene(), CAB1, { kind: "item", componentId: "item-b" });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    mount: "foundation", foundation_component_id: "item-b", foundation_index: 1,
    pole_component_id: "", pole_index: undefined,
  });
});

check("cabinet→standalone keeps authored mount flavor, clears both pairs", () => {
  const r = planReparent(scene(), CAB1, "standalone");
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    mount: "pole", pole_component_id: "", pole_index: undefined,
    foundation_component_id: "", foundation_index: undefined,
  });
});

check("cabinet→different pole keeps mount:'pole', clears foundation pair", () => {
  const r = planReparent(scene(), CAB1, { kind: "pole", componentId: "pole-2" });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.patches[0].patch, {
    mount: "pole", pole_component_id: "pole-2", pole_index: 1,
    foundation_component_id: "", foundation_index: undefined,
  });
});

// ══════════ Refusal contract ══════════════════════════════════════════════
check("non-reparentable kinds refuse honestly (item/wall/wall-segment)", () => {
  for (const id of ["item:component:item-a", "wall:component:wall-a", SEG1]) {
    const r = planReparent(scene(), id, { kind: "item", componentId: "item-b" });
    assert.equal(r.status, "rejected", id);
    assert.equal(r.reason, "kind-not-reparentable", id);
  }
});

check("unresolvable child id → 'unresolved', never a fabricated patch", () => {
  const r = planReparent(scene(), "pole:component:nope", { kind: "item", componentId: "item-a" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "unresolved");
});

check("invalid target kinds refuse per child spec (pole→wall/cabinet)", () => {
  for (const t of [{ kind: "wall", componentId: "wall-a" }, { kind: "cabinet", componentId: "cab-1" }]) {
    const r = planReparent(scene(), P2, t);
    assert.equal(r.status, "rejected");
    assert.equal(r.reason, "invalid-target-type", JSON.stringify(t));
  }
});

check("missing target row → target-not-found; no-id row → target-not-addressable", () => {
  let r = planReparent(scene(), P2, { kind: "item", componentId: "item-ghost" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "target-not-found");
  r = planReparent(scene(), P2, "item:index:3");
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "target-not-addressable", JSON.stringify(r));
});

check("locked rows refuse; read-only refuses before any resolution", () => {
  let r = planReparent(scene(), "pole:component:pole-5", { kind: "item", componentId: "item-b" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "locked");
  r = planReparent(scene(), P2, { kind: "item", componentId: "item-a" }, { readOnly: true });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "read-only");
});

check("legacy-mirror-only parent refuses: undo could not restore absentness", () => {
  const r = planReparent(scene(), "pole:component:pole-3", { kind: "item", componentId: "item-b" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "legacy-parent-unresolved");
});

check("self-parenting (shared component id) closes as cycle", () => {
  // wall-c carries a segment whose component_id IS cap-1 — malformed share.
  const r = planReparent(scene(), CAP1, "wall-segment:component:wall-c|component:cap-1");
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "cycle");
});

// ══════════ Parent resolution descriptors ═════════════════════════════════
check("reparentParentOf reports item/standalone/dangling/unresolved mounts", () => {
  const s = scene();
  assert.equal(reparentParentOf(s, "pole", pole1).kind, "item");
  assert.equal(reparentParentOf(s, "pole", pole1).componentId, "item-a");
  assert.equal(reparentParentOf(s, "pole", pole2).kind, "standalone");
  assert.equal(reparentParentOf(s, "pole", poleDangling).kind, "dangling");
  assert.equal(reparentParentOf(s, "pole", poleUnresolved).kind, "unresolved");
  const cap = reparentParentOf(s, "wall-cap", cap1);
  assert.equal(cap.kind, "wall-segment");
  assert.equal(cap.componentId, "seg-1");
  assert.equal(cap.wallComponentId, "wall-a");
  assert.equal(reparentParentOf(s, "wall-cap", capNoSeg).kind, "wall");
  const cab = reparentParentOf(s, "cabinet", cab1);
  assert.equal(cab.kind, "pole");
  assert.equal(cab.mount, "pole");
});

check("ancestor walk follows canon+legacy, guarded against loops", () => {
  const s = scene();
  const anc = ancestorComponentIds(s, "cabinet", cab1);
  assert.ok(anc.has("pole-1"));
  assert.ok(anc.has("item-a"));
  assert.equal(anc.size, 2);
});

// ══════════ Multi-selection ═══════════════════════════════════════════════
check("selection: ok+skipped mix, already-mounted counts honestly", () => {
  const r = planReparentSelection(scene(), [P1, P2], { kind: "item", componentId: "item-a" });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1);
  assert.equal(r.patches[0].patch.foundation_component_id, "item-a");
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].reason, "already-mounted");
  assert.deepEqual(r.preserveIds, [P2]);
});

check("selection: mixed kinds keep kind rules (cap skips pole-only target)", () => {
  const r = planReparentSelection(scene(), ["wall-cap:component:cap-2", P2], { kind: "item", componentId: "item-a" });
  assert.equal(r.status, "ok");
  assert.equal(r.patches.length, 1);
  assert.equal(r.skipped[0].reason, "invalid-target-type");
});

check("selection: structurally missing target rejects the WHOLE op upfront", () => {
  const r = planReparentSelection(scene(), [P2, "pole:component:bad"], { kind: "item", componentId: "item-ghost" });
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "target-not-found");
  assert.ok(!r.patches);
});

check("selection: all-already-mounted → noop; empty → rejected", () => {
  const n = planReparentSelection(scene(), [P1], { kind: "item", componentId: "item-a" });
  assert.equal(n.status, "noop");
  const e = planReparentSelection(scene(), [], { kind: "item", componentId: "item-a" });
  assert.equal(e.status, "rejected");
  assert.equal(e.reason, "empty-selection");
});

// ══════════ Targets picker + handles + history ════════════════════════════
check("reparentTargetsFor lists valid parents + current mount + detach", () => {
  const s = scene();
  const t = reparentTargetsFor(s, CAP1);
  assert.equal(t.status, "ok");
  assert.equal(t.from.kind, "wall-segment");
  assert.equal(t.detach, true);
  assert.equal(t.detached, false);
  const kinds = t.targets.map(x => x.kind);
  assert.ok(kinds.includes("wall"));
  assert.ok(kinds.filter(k => k === "wall-segment").length >= 3);
  const cur = t.targets.find(x => x.current);
  assert.equal(cur.componentId, "seg-1");
  const cab = reparentTargetsFor(s, CAB1);
  assert.ok(cab.targets.some(x => x.kind === "item" && x.componentId === "item-a"));
  assert.ok(cab.targets.some(x => x.kind === "pole" && x.componentId === "pole-1" && x.current));
  const bad = reparentTargetsFor(s, "pole:component:nope");
  assert.equal(bad.status, "rejected");
});

check("mountLinkDescriptors emits live mounts only, honest anchors", () => {
  const links = mountLinkDescriptors(scene());
  const byChild = Object.fromEntries(links.map(l => [l.componentId, l]));
  assert.equal(links.length, 9, JSON.stringify(links.map(l => l.componentId)));
  assert.ok(close(byChild["pole-1"].handlePoint.x, 10) && close(byChild["pole-1"].handlePoint.z, 5));
  assert.ok(close(byChild["pole-1"].parentPoint.x, 24) && close(byChild["pole-1"].parentPoint.z, 12));
  assert.equal(byChild["cap-1"].parentKind, "wall-segment");
  assert.equal(byChild["cap-1"].segmentIndex, 0);
  assert.ok(close(byChild["cap-1"].handlePoint.x, 50) && close(byChild["cap-1"].handlePoint.z, 100));
  assert.equal(byChild["cab-1"].parentKind, "pole");
  assert.ok(close(byChild["cab-1"].handlePoint.x, 10));
  assert.ok(!byChild["pole-2"], "standalone pole must not emit a link");
  assert.ok(!byChild["pole-4"], "dangling mount must not emit a link");
  assert.ok(!byChild["pole-6"], "unresolved mount must not emit a link");
});

check("reparentEditRecord → one scene-multi command, honesty-guard target:null", () => {
  const r = planReparent(scene(), P1, { kind: "item", componentId: "item-b" });
  const rec = reparentEditRecord(r, { method: "handle" });
  assert.equal(rec.kind, "scene-multi");
  assert.equal(rec.method, "handle");
  assert.equal(rec.target, null);
  assert.equal(rec.before.multi.length, 1);
  assert.equal(rec.before.multi[0].collection, "poles");
  assert.equal(rec.before.multi[0].index, 0);
  assert.deepEqual(rec.before.multi[0].fields, { foundation_component_id: "item-a", foundation_idx: 0 });
  assert.deepEqual(rec.after.multi[0].fields, { foundation_component_id: "item-b", foundation_idx: 1 });
  assert.equal(reparentEditRecord({ status: "noop" }), null);
});

check("spec constants expose the reparent matrix", () => {
  assert.deepEqual([...REPARENT_CHILD_KINDS].sort(), ["cabinet", "pole", "wall-cap"]);
  assert.ok(REPARENT_PARENT_KINDS.includes("standalone"));
  assert.deepEqual(reparentChildSpec("pole").parents, ["item"]);
  assert.deepEqual(reparentChildSpec("cabinet").parents.sort(), ["item", "pole"]);
  assert.equal(reparentChildSpec("item"), null);
});

check("collection/index child form resolves like the node-id form", () => {
  const a = planReparent(scene(), { collection: "poles", index: 0 }, { kind: "item", componentId: "item-b" });
  const b = planReparent(scene(), P1, { kind: "item", componentId: "item-b" });
  assert.equal(a.status, "ok");
  assert.deepEqual(a.patches, b.patches);
});

await Promise.all(pending);
const failures = results.filter(r => r.ok === false);
console.log(`\n${results.length - failures.length}/${results.length} o036 checks passed`);
if (failures.length) {
  fs.writeFileSync(`${OUT}/verify-o036-failures.json`, JSON.stringify(failures, null, 2));
  process.exit(1);
}
fs.writeFileSync(`${OUT}/verify-o036-results.json`, JSON.stringify(results.map(r => r.name), null, 2));
console.log("PASS o036");
