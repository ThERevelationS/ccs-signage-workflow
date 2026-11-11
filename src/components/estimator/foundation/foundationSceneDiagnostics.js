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
import { visualObjectByKey } from "./landscapeMaterials.js";

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
  const landscape = scene?.landscape || null;

  // O-084 (CMP-G07) -- non-vision contradiction surface: a photo's authored
  // `reported_dims` (the photo's claimed dimensions) vs the scene's authored
  // dims -- a claimed dim that conflicts with a real dim surfaces as an
  // advisory (the photo is context-only; the claim is recorded, not trusted).
  const photos = Array.isArray(scene?.reference_photos) ? scene.reference_photos : [];
  photos.forEach((p, pi) => {
    const rd = p?.reported_dims;
    if (!rd || typeof rd !== "object") return;
    items.forEach((item, i) => {
      const claimL = Number(rd.length_inches), claimW = Number(rd.width_inches);
      const realL = Number(item.length_inches), realW = Number(item.width_inches);
      if (Number.isFinite(claimL) && Number.isFinite(realL) && Math.abs(claimL - realL) > 6) {
        push("warning", "photo-contradicts-geometry",
          `Photo ${pi + 1}'s reported length (${claimL}") contradicts ${itemRowName(item, i)}'s authored length (${realL}") -- review the photo's claim.`,
          [sceneNodeId.item(layoutItemKey(item, i))]);
      }
      if (Number.isFinite(claimW) && Number.isFinite(realW) && Math.abs(claimW - realW) > 6) {
        push("warning", "photo-contradicts-geometry",
          `Photo ${pi + 1}'s reported width (${claimW}") contradicts ${itemRowName(item, i)}'s authored width (${realW}") -- review the photo's claim.`,
          [sceneNodeId.item(layoutItemKey(item, i))]);
      }
    });
  });

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
    // Mounted-off-foundation: the mount resolves to a specific item but the
    // pole's x/z sits outside that item's footprint -- the link and the
    // geometry disagree, so the pole is not really on its claimed footing.
    if (parent?.componentId) {
      const target = rects.find((r) => r.item?.component_id === parent.componentId);
      if (target?.rect && !pointInRect(px, pz, target.rect)) {
        push("warning", "mounted-off-foundation",
          `Pole ${i + 1} is mounted to ${itemRowName(target.item, target.index)} but its position lies outside that footing -- move it onto the footing or remount it.`,
          [poleId, sceneNodeId.item(layoutItemKey(target.item, target.index))]);
      }
    }
    // O-065 impossible-fit: a pole-mounted sign whose top (mount height +
    // face height) rises past the pole top can't physically fit -- flag it
    // rather than render a floating box. Pole top = base offset + height.
    const poleTop = (Number(pole.base_offset_inches) || 0) + (Number(pole.height_inches) || 0);
    if (poleTop > 0) {
      (pole.signs || []).forEach((s, si) => {
        const mh = Number(s?.mount_height_inches), sh = Number(s?.height_inches);
        if (Number.isFinite(mh) && Number.isFinite(sh) && mh + sh > poleTop + 0.5) {
          push("warning", "impossible-fit",
            `Pole ${i + 1} sign ${si + 1} rises to ${Math.round(mh + sh)}in but the pole tops out at ${Math.round(poleTop)}in -- lower the mount height or shorten the sign.`,
            [poleId]);
        }
        // O-060 (CMP-E05) -- sign-level diagnostic: a letters-panel sign mounts
        // each letter individually (a different load path than a continuous
        // cabinet/panel face). Advisory only.
        if (s?.panel_shape === "letters") {
          push("info", "sign-letter-mount",
            `Pole ${i + 1} sign ${si + 1} is a letters panel -- each letter mounts individually rather than as a continuous face.`,
            [poleId]);
        }
      });
    }
    // O-065 (CMP-E10) -- horizontal clearance: two signs on the same pole whose
    // plan x-extents (offset +/- width/2) AND vertical bands (mount_height ..
    // +height) overlap physically collide. Skips unresolved dims (their own
    // findings already fire).
    const signsArr = pole.signs || [];
    for (let a = 0; a < signsArr.length; a++) {
      const A = signsArr[a];
      const ax = Number(A?.horizontal_offset_inches) || 0, aw = Number(A?.width_inches);
      const amh = Number(A?.mount_height_inches), ash = Number(A?.height_inches);
      if (!Number.isFinite(aw) || aw <= 0 || !Number.isFinite(amh) || !Number.isFinite(ash)) continue;
      for (let b = a + 1; b < signsArr.length; b++) {
        const B = signsArr[b];
        const bx = Number(B?.horizontal_offset_inches) || 0, bw = Number(B?.width_inches);
        const bmh = Number(B?.mount_height_inches), bsh = Number(B?.height_inches);
        if (!Number.isFinite(bw) || bw <= 0 || !Number.isFinite(bmh) || !Number.isFinite(bsh)) continue;
        const xOverlap = (ax - aw / 2) < (bx + bw / 2) && (bx - bw / 2) < (ax + aw / 2);
        const yOverlap = amh < bmh + bsh && bmh < amh + ash;
        if (xOverlap && yOverlap) {
          push("warning", "sign-horizontal-overlap",
            `Pole ${i + 1} signs ${a + 1} and ${b + 1} overlap in plan + elevation -- check horizontal offset or mount height.`,
            [poleId]);
        }
      }
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
    // O-055 (CMP-D12) -- cap-to-segment fit: the cap's authored
    // position + cut_length must not overrun its bound segment's length
    // (held advisory -- a cap over-position is a cut-list error, not an
    // invented segment bound).
    const capWall = walls.find((w) => w?.component_id === parent?.componentId);
    const capSeg = capWall?.shape?.segments?.find((s) => s?.component_id === cap?.segment_component_id)
      ?? (Number.isInteger(cap?.segment_index) ? capWall?.shape?.segments?.[cap.segment_index] : null);
    const segLen = Number(capSeg?.length);
    const capPos = Number(cap?.position_along_segment_inches);
    const capLen = Number(cap?.length_inches ?? cap?.cut_length_inches);
    if (Number.isFinite(segLen) && segLen > 0 && Number.isFinite(capPos) && capPos >= 0
        && Number.isFinite(capLen) && capLen > 0 && capPos + capLen > segLen + 0.01) {
      push("warning", "wall-cap-over-position", `Wall cap ${i + 1} overruns its segment (position ${capPos}" + ${capLen}" > ${Math.round(segLen)}").`, [capId]);
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
    // O-062 engineering-review: a cabinet on a pole that is itself unmounted
    // has no modeled footing in its load path -- surface it for review
    // rather than assume the mount is supported.
    else if (parent?.componentId && cab?.mount === "pole") {
      const poleRow = (poles || []).find((p) => p?.component_id === cab?.pole_component_id);
      const poleParent = poleRow ? reparentParentOf(scene, "pole", poleRow) : null;
      if (!poleParent?.componentId) {
        push("warning", "engineering-review", `Cabinet ${i + 1} hangs on a pole with no foundation mount -- the load path needs engineering review.`, [cabId]);
      }
    }
  });

  // -- cabinets: same-mount vertical collisions (O-065) ------------------
  // Cabinets on the same parent collide when their mount-height-to-top
  // spans overlap. Positionless parents (unresolved mounts) skip the check.
  const cabSpan = (cab) => {
    const mh = Number(cab?.mount_height_inches);
    const h = Number(cab?.height_inches);
    if (!Number.isFinite(mh) || !Number.isFinite(h) || h <= 0) return null;
    return [mh, mh + h];
  };
  const byMount = new Map();
  cabinets.forEach((cab, i) => {
    const parent = reparentParentOf(scene, "cabinet", cab);
    if (!parent?.componentId) return;
    const key = parent.componentId;
    if (!byMount.has(key)) byMount.set(key, []);
    byMount.get(key).push({ cab, i });
  });
  for (const [parentId, list] of byMount) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const sa = cabSpan(list[a].cab), sb = cabSpan(list[b].cab);
        if (!sa || !sb) continue;
        if (sa[0] < sb[1] && sb[0] < sa[1]) {
          push("warning", "sign-collision",
            `Cabinets ${list[a].i + 1} and ${list[b].i + 1} on the same mount overlap vertically (${Math.round(sa[0])}-${Math.round(sa[1])} vs ${Math.round(sb[0])}-${Math.round(sb[1])} in) -- raise one or resize.`,
            [sceneNodeId.cabinet(layoutItemKey(list[a].cab, list[a].i)), sceneNodeId.cabinet(layoutItemKey(list[b].cab, list[b].i))]);
        }
      }
    }
  }

  // -- pole signs + cabinets: same-pole vertical collisions (O-042) ------
  // Signs live inside pole.signs[]; cabinets mount onto a pole's component
  // id. On one pole, any two objects whose mount-height-to-top spans
  // overlap collide physically.
  poles.forEach((pole, i) => {
    const poleId = pole?.component_id;
    const occupants = [];
    (pole.signs || []).forEach((s, si) => {
      const mh = Number(s?.mount_height_inches), h = Number(s?.height_inches);
      if (Number.isFinite(mh) && Number.isFinite(h) && h > 0) {
        occupants.push({ label: `sign ${si + 1}`, span: [mh, mh + h], id: poleId ? sceneNodeId.pole(layoutItemKey(pole, i)) : null });
      }
    });
    cabinets.forEach((cab, ci) => {
      if (cab?.mount !== "pole" || cab?.pole_component_id !== poleId) return;
      const mh = Number(cab?.mount_height_inches), h = Number(cab?.height_inches);
      if (Number.isFinite(mh) && Number.isFinite(h) && h > 0) {
        occupants.push({ label: `cabinet ${ci + 1}`, span: [mh, mh + h], id: poleId ? sceneNodeId.cabinet(layoutItemKey(cab, ci)) : null });
      }
    });
    for (let a = 0; a < occupants.length; a += 1) {
      for (let b = a + 1; b < occupants.length; b += 1) {
        const [sa, sb] = [occupants[a].span, occupants[b].span];
        if (sa[0] < sb[1] && sb[0] < sa[1]) {
          push("warning", "sign-collision",
            `Pole ${i + 1}: ${occupants[a].label} and ${occupants[b].label} overlap vertically (${Math.round(sa[0])}-${Math.round(sa[1])} vs ${Math.round(sb[0])}-${Math.round(sb[1])} in) -- raise one or resize.`,
            [occupants[a].id, occupants[b].id]);
        }
      }
    }
  });

  // -- walls: unsupported spans (O-048) ---------------------------------
  // A segment is "supported" when its midpoint lands inside an item
  // footprint. Walls bound to a foundation test only that footing;
  // freestanding walls (no binding) are informational, not errors.
  walls.forEach((wall, i) => {
    const pts = wall?.shape?.points;
    if (!Array.isArray(pts) || pts.length < 2) return;
    const closed = wall.shape?.closed === true && pts.length >= 3;
    const n = closed ? pts.length : pts.length - 1;
    const wallId = sceneNodeId.wall(layoutItemKey(wall, i));
    const wName = wall?.name || `Wall ${i + 1}`;
    const fId = wall?.foundation_component_id;
    const assigned = typeof fId === "string" && fId && !fId.startsWith("unresolved:") ? fId : null;
    if (typeof fId === "string" && fId.startsWith("unresolved:")) {
      push("warning", "unsupported-span", `${wName} keeps an unresolved foundation assignment -- reassign it to check support.`, [wallId]);
      return;
    }
    const assignedRect = assigned ? rects.find(({ item }) => item?.component_id === assigned)?.rect : null;
    let tested = 0, uncovered = 0;
    for (let si = 0; si < n; si += 1) {
      const a = pts[si], b = pts[(si + 1) % pts.length];
      const mx = (Number(a?.x) + Number(b?.x)) / 2;
      const mz = (Number(a?.z) + Number(b?.z)) / 2;
      if (!Number.isFinite(mx) || !Number.isFinite(mz)) continue;
      tested += 1;
      const covered = assignedRect
        ? pointInRect(mx, mz, assignedRect)
        : rects.some(({ rect }) => rect && pointInRect(mx, mz, rect));
      if (!covered) uncovered += 1;
    }
    if (tested === 0) return;
    if (assigned && !assignedRect) {
      push("warning", "unsupported-span", `${wName} is bound to a foundation whose placement can't be checked -- verify its footing.`, [wallId]);
      return;
    }
    if (uncovered === tested) {
      push(assigned ? "warning" : "info", "unsupported-span",
        `${wName}: no segment has a footing beneath it${assigned ? " (its bound foundation does not cover it)" : " -- assign a foundation or confirm it is freestanding"}.`, [wallId]);
    } else if (uncovered > 0) {
      push("warning", "unsupported-span", `${wName}: ${uncovered} of ${tested} segments span beyond any footing.`, [wallId]);
    }
  });

  // O-068 -- visual-object setback: a decorative landscape object (tree,
  // shrub, light, boulder) painted on a cell that overlaps a foundation
  // footprint sits on a footing -- flag the planting-vs-structure conflict.
  const lcs = Number(landscape?.cell_size_inches) || 0;
  if (landscape?.cells && lcs > 0) {
    Object.entries(landscape.cells).forEach(([key, mat]) => {
      const vobj = visualObjectByKey(mat);
      if (!vobj) return;
      const [gx, gy] = String(key).split(",").map(Number);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
      const wx = (gx + 0.5) * lcs, wz = (gy + 0.5) * lcs;
      const target = rects.find(({ rect }) => rect && pointInRect(wx, wz, rect));
      if (target) {
        push("warning", "visual-object-on-foundation",
          `${vobj.label || "Visual object"} at (${wx.toFixed(0)}, ${wz.toFixed(0)}) sits on ${itemRowName(target.item, target.index)} -- a footing can't carry plantings/decor.`,
          [sceneNodeId.item(layoutItemKey(target.item, target.index))]);
      }
    });
  }

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
