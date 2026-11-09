// O-042 -- pure scene conflict/clearance diagnostics over the normalized
// scene ({items,poles,walls,wall_caps,signage_cabinets}). Findings carry
// stable node ids so a consumer can click-to-select/focus the objects.
// Every check reports what it can prove; unresolved rows and unmountable
// references surface as findings rather than being guessed at.
import {
  foundationLayoutFootprint,
  layoutPositionInches,
  layoutItemKey,
} from "./foundationLayoutModel";
import {
  sceneNodeId,
  parseSceneNodeId,
  resolveSceneNode,
} from "./foundationSceneSelection";
import { reparentParentOf } from "./foundationReparentModel";

const PLAN_W = 480, PLAN_D = 320;
const KIND_LABEL = {
  item: "Foundation", pole: "Pole", wall: "Wall",
  "wall-segment": "Wall segment", "wall-cap": "Wall cap", cabinet: "Cabinet",
};
const itemRowName = (item, index) =>
  (typeof item?.description === "string" && item.description.trim()) || `Foundation ${index + 1}`;

// Rotated-rect overlap (separating axis on both rects' axes). Cheap 2D SAT --
// both rects share center-space coordinates, so each contributes its two axes.
const rectOverlap = (a, b) => {
  const verts = (r) => {
    const c = Math.cos((r.rot * Math.PI) / 180), s = Math.sin((r.rot * Math.PI) / 180);
    const hw = r.w / 2, hd = r.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      .map(([x, z]) => [r.cx + x * c - z * s, r.cz + x * s + z * c]);
  };
  const va = verts(a), vb = verts(b);
  const axes = [
    [Math.cos((a.rot * Math.PI) / 180), Math.sin((a.rot * Math.PI) / 180)],
    [-Math.sin((a.rot * Math.PI) / 180), Math.cos((a.rot * Math.PI) / 180)],
    [Math.cos((b.rot * Math.PI) / 180), Math.sin((b.rot * Math.PI) / 180)],
    [-Math.sin((b.rot * Math.PI) / 180), Math.cos((b.rot * Math.PI) / 180)],
  ];
  for (const [ax, az] of axes) {
    const pr = (vs) => vs.map(([x, z]) => x * ax + z * az);
    const pa = pr(va), pb = pr(vb);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
};

const itemRect = (item, index) => {
  const fp = foundationLayoutFootprint(item);
  const pos = layoutPositionInches(item);
  if (!fp || !pos.valid) return null;
  return {
    cx: pos.x_inches + fp.width / 2, cz: pos.z_inches + fp.depth / 2,
    w: fp.width, d: fp.depth,
    rot: Number(item.rotation_degrees) || 0,
  };
};
const pointInRect = (px, pz, r) => {
  const c = Math.cos((r.rot * Math.PI) / 180), s = Math.sin((r.rot * Math.PI) / 180);
  const dx = px - r.cx, dz = pz - r.cz;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.d / 2;
};

// Main entry -- returns findings sorted error -> warning -> info.
export function foundationSceneDiagnostics(scene) {
  const findings = [];
  const push = (severity, kind, message, nodeIds) =>
    findings.push({ severity, kind, message, nodeIds: nodeIds.filter(Boolean) });
  const items = scene?.items || [], poles = scene?.poles || [];
  const walls = scene?.walls || [], caps = scene?.wall_caps || [], cabinets = scene?.signage_cabinets || [];

  // -- item bounds + pairwise clash -------------------------------------
  const rects = items.map((item, i) => ({ item, index: i, rect: itemRect(item, i) }));
  rects.forEach(({ item, index, rect }) => {
    const id = sceneNodeId.item(layoutItemKey(item, index));
    if (!rect) {
      push("warning", "unplaced", `${itemRowName(item, index)} has no valid plan placement -- fix its dimensions or position.`, [id]);
      return;
    }
    const out =
      rect.cx - rect.w / 2 < -0.5 || rect.cx + rect.w / 2 > PLAN_W + 0.5 ||
      rect.cz - rect.d / 2 < -0.5 || rect.cz + rect.d / 2 > PLAN_D + 0.5;
    if (out) push("warning", "out-of-bounds", `${itemRowName(item, index)} sits partly outside the plan area.`, [id]);
  });
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i], b = rects[j];
      if (!a.rect || !b.rect) continue;
      if (rectOverlap(a.rect, b.rect)) {
        push("error", "clash",
          `${itemRowName(a.item, a.index)} and ${itemRowName(b.item, b.index)} footprints overlap.`,
          [sceneNodeId.item(layoutItemKey(a.item, a.index)), sceneNodeId.item(layoutItemKey(b.item, b.index))]);
      }
    }
  }

  // -- poles: mount target exists? inside an item but unmounted? --------
  poles.forEach((pole, i) => {
    const poleId = sceneNodeId.pole(layoutItemKey(pole, i));
    const parent = reparentParentOf(scene, "pole", pole);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Pole ${i + 1} is mounted to a foundation that no longer exists -- remount or detach it.`, [poleId]);
      return;
    }
    if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Pole ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [poleId]);
    }
    const px = Number(pole.x_inches), pz = Number(pole.z_inches);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    const inside = rects.filter(({ rect }) => rect && pointInRect(px, pz, rect));
    if (!parent?.componentId && inside.length > 0) {
      push("info", "mount-candidate",
        `Pole ${i + 1} stands unmounted inside ${itemRowName(inside[0].item, inside[0].index)} -- select it and Mount to attach.`,
        [poleId, sceneNodeId.item(layoutItemKey(inside[0].item, inside[0].index))]);
    }
    if (inside.length > 1 && !parent?.componentId) {
      push("warning", "ambiguous-footprint",
        `Pole ${i + 1} sits inside ${inside.length} overlapping foundations -- mount it to pick one.`,
        [poleId, ...inside.map((r) => sceneNodeId.item(layoutItemKey(r.item, r.index)))]);
    }
  });

  // -- caps + cabinets: mount references must resolve -------------------
  caps.forEach((cap, i) => {
    const capId = sceneNodeId.wallCap(layoutItemKey(cap, i));
    const parent = reparentParentOf(scene, "wall-cap", cap);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Wall cap ${i + 1} is bound to a wall that no longer exists -- remount it.`, [capId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Wall cap ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [capId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cap", `Wall cap ${i + 1} isn't bound to a wall or wall segment -- it won't be billed to any wall.`, [capId]);
    }
  });
  cabinets.forEach((cab, i) => {
    const cabId = sceneNodeId.cabinet(layoutItemKey(cab, i));
    const parent = reparentParentOf(scene, "cabinet", cab);
    if (parent?.kind === "dangling") {
      push("error", "unresolvable-mount", `Cabinet ${i + 1} is mounted to an object that no longer exists -- remount it.`, [cabId]);
    } else if (parent?.kind === "unresolved") {
      push("warning", "legacy-mount", `Cabinet ${i + 1}'s mount is stored in legacy form -- save once to normalize it.`, [cabId]);
    } else if (!parent?.componentId) {
      push("error", "unmounted-cabinet", `Cabinet ${i + 1} isn't mounted to a pole or foundation -- remount it.`, [cabId]);
    }
  });

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

// Click handler helper -- resolves a finding's first node id for
// select+focus. Returns null when no node resolves (stale finding).
export function diagnosticTarget(scene, finding) {
  const id = finding?.nodeIds?.[0];
  if (!id || !parseSceneNodeId(id)) return null;
  return resolveSceneNode(scene, id) ? id : null;
}
