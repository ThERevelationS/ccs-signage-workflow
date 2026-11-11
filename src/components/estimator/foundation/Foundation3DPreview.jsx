import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Maximize2, RotateCcw, Eye, EyeOff, Box } from "lucide-react";
import { buildFoundationReinforcementPreview3D } from "./foundationReinforcementPreview3D.js";
import { createFoundationReinforcement3DGroup } from "./foundationReinforcementThreePreview.js";
import { materialByKey, visualObjectByKey, countObjectByKey } from "./landscapeMaterials.js";

const IN = 1 / 12; // inches -> feet units
// O-041 bounded complexity — quantity/pole loops cap mesh count; a pathological
// quantity can never exhaust the GL budget (clipping never changes modeled data).
const MAX_ITEM_MESHES = 128;
const MAX_POLE_MESHES = 64;
const MAX_WALL_SEGMENTS = 96;
const MAX_MOUNTED_MESHES = 64;

export function buildScene(scene, project, solid, showGround, highlight, exploded, showRebar = true) {
  const group = new THREE.Group();

  const concreteMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 })
    : new THREE.MeshBasicMaterial({ color: 0x374151, wireframe: true });
  const poleMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.4, roughness: 0.5 })
    : new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true });

  // O-034 highlight sync — meshes carry their component_id; ids in the
  // `highlight` set swap to the selection material. Shared per-build
  // highlight mats keep this cheap and dispose with the build cycle.
  const hlMat = highlight?.size
    ? (solid
      ? new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.35, roughness: 0.6 })
      : new THREE.MeshBasicMaterial({ color: 0x2563eb, wireframe: true }))
    : null;
  const tag = (mesh, componentId, kind) => {
    mesh.userData.componentId = componentId ?? null;
    mesh.userData.kind = kind;
    if (hlMat && componentId && highlight.has(componentId)) mesh.material = hlMat;
    return mesh;
  };

  let cursorX = 0;
  const items = project.items || [];
  // Rendered positions of each item's first mesh copy — mount children
  // (foundation-mounted cabinets) follow the drawn copy, not authored coords.
  const itemFirstPos = new Map();
  // O-033 reinforcement steel — the preview3d model emits concrete-local steel
  // primitives for v2 items; each instance's group parents to that item's
  // concrete mesh so position/rotation/quantity copies stay exact. The model
  // caps steel at 2048 primitives and refuses unsupported roles itself.
  let rebarByKey = null;
  if (items.some((it) => it?.reinforcement_calculation_version === 2)) {
    const rebarPreview = buildFoundationReinforcementPreview3D(project, {
      placementMode: "inspection",
      view: exploded ? "exploded" : "assembled",
      explodeDepthFactor: 1,
    });
    const errs = (rebarPreview?.issues || []).filter((i) => i.severity === "error");
    if (errs.length) console.warn("Foundation3DPreview reinforcement:", errs.map((i) => i.message).join(" | "));
    rebarByKey = new Map();
    for (const inst of rebarPreview?.instances || []) {
      const prims = [...(inst?.steel || []), ...(inst?.supports || [])];
      if (prims.length) rebarByKey.set(`${inst.index}:${inst.instanceIndex}`, { ...inst, prims });
    }
  }
  items.forEach((item, itemIndex) => {
    const qty = Math.min(MAX_ITEM_MESHES, Math.max(1, Number(item.quantity) || 1));
    const depth = (Number(item.depth_inches) || 0) * IN;
    for (let i = 0; i < qty; i++) {
      let mesh;
      let footprint;
      if (item.foundation_type === "pillar") {
        const r = ((Number(item.diameter) || 0) / 2) * IN;
        footprint = r * 2;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 24), concreteMat);
      } else {
        const l = (Number(item.length_inches) || 0) * IN;
        const w = (Number(item.width_inches) || 0) * IN;
        footprint = Math.max(l, w);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(l, depth, w), concreteMat);
      }
      const offset = (Number(item.grade_offset_inches) || 0) * IN;
      // O-032 (CMP-C01): an authored plan anchor wins over sequential packing —
      // `x_inches`/`z_inches` is the item's top-left corner in plan inches
      // (canvas contract), so the mesh center lands at corner + half-footprint
      // in the SAME measured space the poles/walls/elevations already use.
      // Quantity copies spread right from the anchor; the packing cursor only
      // serves items with no recorded position at all.
      const anchorX = Number(item.x_inches), anchorZ = Number(item.z_inches);
      if (Number.isFinite(anchorX) && Number.isFinite(anchorZ)) {
        const halfL = item.foundation_type === "pillar" ? footprint / 2 : ((Number(item.length_inches) || 0) / 2) * IN;
        const halfW = item.foundation_type === "pillar" ? footprint / 2 : ((Number(item.width_inches) || 0) / 2) * IN;
        mesh.position.set(anchorX * IN + halfL + i * (footprint + 2), -depth / 2 + offset, anchorZ * IN + halfW);
        cursorX = Math.max(cursorX, mesh.position.x + footprint / 2);
      } else {
        mesh.position.set(cursorX + footprint / 2, -depth / 2 + offset, 0);
      }
      mesh.rotation.y = ((Number(item.rotation_degrees) || 0) * Math.PI) / 180;
      if (!itemFirstPos.has(itemIndex)) itemFirstPos.set(itemIndex, { x: mesh.position.x, z: mesh.position.z });
      tag(mesh, item.component_id, "item");
      group.add(mesh);

      const rebar = rebarByKey?.get(`${itemIndex}:${i}`);
      if (rebar && showRebar) {
        try { mesh.add(createFoundationReinforcement3DGroup(rebar.prims)); }
        catch { /* unsupported roles refuse to draw; the concrete still renders. */ }
      }

      if (item.selected_pole_id || item.pole_total_height_inches) {
        const h = (Number(item.pole_total_height_inches) || 96) * IN;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 16), poleMat);
        pole.position.set(mesh.position.x, offset + h / 2, 0);
        tag(pole, item.selected_pole_id || null, "pole");
        group.add(pole);
      }

      cursorX += footprint + 2;
    }
  });

  (project.poles || []).slice(0, MAX_POLE_MESHES).forEach((p) => {
    // CMP-E02: distinct quantities â€” the pole top sits at base offset plus
    // height above grade; embedment extends BELOW grade (canonical
    // embedment_inches; the legacy y_offset_inches spelling carries the same
    // authored "depth in ground" quantity and is no longer read as an upward
    // elevation â€” CMP-AUD07). Cross-section follows the authored/resolved
    // pole_shape; unspecified stays the round default.
    const height = (Number(p.height_inches) || 96) * IN;
    const embed = (Number(p.embedment_inches ?? p.y_offset_inches) || 0) * IN;
    const base = (Number(p.base_offset_inches) || 0) * IN;
    const len = height + embed;
    const shape = typeof p.pole_shape === "string" ? p.pole_shape.toLowerCase() : "round";
    let pole;
    if (shape === "square" || shape === "rectangular") {
      pole = new THREE.Mesh(new THREE.BoxGeometry(0.7, len, shape === "rectangular" ? 0.45 : 0.7), poleMat);
    } else {
      pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 16), poleMat);
      if (shape === "elliptical") pole.scale.z = 0.55;
    }
    pole.position.set(
      (Number(p.x_inches) || 0) * IN,
      base + (height - embed) / 2,
      (Number(p.z_inches) || 0) * IN
    );
    tag(pole, p.component_id, "pole");
    group.add(pole);
    // O-060 — authored pole.signs render as mounted boxes at the pole's plan
    // position, risen to mount_height_inches (to the sign's mounting point;
    // box centers half its height above). face_count rotates duplicates
    // around the pole axis for multi-face signs.
    (p.signs || []).forEach((s) => {
      const sw = (Number(s?.width_inches) || 0) * IN;
      const sh = (Number(s?.height_inches) || 0) * IN;
      const sd = (Number(s?.depth_inches) || 0) * IN;
      if (!(sw > 0 && sh > 0 && sd > 0)) return;
      const faces = Math.min(4, Math.max(1, Number(s?.face_count) || 1));
      for (let fi = 0; fi < faces; fi += 1) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), cabMat);
        const ang = (Math.PI * 2 * fi) / faces;
        box.position.set(
          (Number(p.x_inches) || 0) * IN,
          (Number(s.mount_height_inches) || 0) * IN + sh / 2,
          (Number(p.z_inches) || 0) * IN
        );
        if (fi) {
          box.rotation.y = ang;
          box.position.x += Math.sin(ang) * sd * 0.6;
          box.position.z += Math.cos(ang) * sd * 0.6;
        }
        tag(box, s.component_id, "pole_sign");
        group.add(box);
        // O-067 (CMP-E12) -- sign-face panel: a thin face on the sign's front
        // face in the authored body/trim color (blank = the box's default
        // cabMat; never an invented color).
        const bodyColor = typeof s?.body_color === "string" && s.body_color !== "" ? s.body_color : null;
        if (bodyColor) {
          const faceMat = new THREE.MeshLambertMaterial({ color: bodyColor });
          const face = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), faceMat);
          face.position.set(box.position.x, box.position.y, box.position.z + sd / 2 + 0.5);
          if (fi) face.rotation.y = ang;
          tag(face, s.component_id, "pole_sign_face");
          group.add(face);
          // O-033 (CMP-C02) -- back-face panel on a 2-face sign: a
          // `face_count >= 2` sign carries a face on the box's back (-z) too —
          // the face count surfaces on both faces, not just the front.
          if (faces >= 2) {
            const backFace = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), faceMat.clone());
            backFace.position.set(box.position.x, box.position.y, box.position.z - sd / 2 - 0.5);
            backFace.rotation.y = Math.PI + (fi ? ang : 0);
            tag(backFace, s.component_id, "pole_sign_face_back");
            group.add(backFace);
          }
        }
      }
    });
  });

  // O-033 walls/caps/cabinets — walls extrude their authored shape.points
  // polyline (inches, same plan convention as poles); caps render along the
  // wall segment they mount to; cabinets mount at their pole or the item's
  // drawn copy. Unresolved mounts draw nothing — the scene stays honest.
  const wallMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x9a5b3f, roughness: 0.85 })
    : new THREE.MeshBasicMaterial({ color: 0x7c2d12, wireframe: true });
  const capMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.8 })
    : new THREE.MeshBasicMaterial({ color: 0x57534e, wireframe: true });
  const cabMat = solid
    ? new THREE.MeshStandardMaterial({ color: 0x3f4a5a, roughness: 0.5, metalness: 0.3 })
    : new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true });

  const walls = project.walls || [];
  let segCount = 0, mountCount = 0;
  const segSpan = (wall, si) => {
    const pts = wall?.shape?.points;
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const closed = wall.shape.closed === true && pts.length >= 3;
    if (si >= pts.length || (!closed && si >= pts.length - 1)) return null;
    const a = pts[si], b = pts[(si + 1) % pts.length];
    const ax = Number(a?.x), az = Number(a?.z), bx = Number(b?.x), bz = Number(b?.z);
    if (![ax, az, bx, bz].every(Number.isFinite)) return null;
    return { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az) };
  };
  walls.forEach((wall) => {
    const segs = wall?.shape?.segments || [];
    const height = (Number(wall?.heightInches) || 24) * IN;
    const thick = (Number(wall?.thicknessInches) || 8) * IN;
    segs.forEach((_, si) => {
      if (segCount >= MAX_WALL_SEGMENTS) return;
      const s = segSpan(wall, si);
      if (!s || s.len <= 0) return;
      segCount++;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.len * IN, height, thick), wallMat);
      m.position.set(((s.ax + s.bx) / 2) * IN, height / 2, ((s.az + s.bz) / 2) * IN);
      m.rotation.y = -Math.atan2(s.bz - s.az, s.bx - s.ax);
      tag(m, wall?.shape?.segments?.[si]?.component_id ?? wall?.component_id, "wall");
      group.add(m);
      // O-033 (CMP-C02) -- brick-course detail: horizontal course lines on the
      // wall's front/back faces (authored `course_height_inches`, default a
      // ~4" masonry course; the lines are a visual detail, never a quantity).
      const courseH = (Number(wall?.course_height_inches) || 4) * IN;
      if (courseH > 0 && height / courseH > 1) {
        const lineMat = new THREE.LineBasicMaterial({ color: 0x44403c });
        const pts2 = [];
        const half = (s.len * IN) / 2;
        for (let y = courseH; y < height - 0.01; y += courseH) {
          pts2.push(new THREE.Vector3(-half, y - height / 2, thick / 2 + 0.01));
          pts2.push(new THREE.Vector3(half, y - height / 2, thick / 2 + 0.01));
          pts2.push(new THREE.Vector3(-half, y - height / 2, -thick / 2 - 0.01));
          pts2.push(new THREE.Vector3(half, y - height / 2, -thick / 2 - 0.01));
        }
        const geo2 = new THREE.BufferGeometry().setFromPoints(pts2);
        const lines = new THREE.LineSegments(geo2, lineMat);
        lines.position.copy(m.position);
        lines.rotation.y = m.rotation.y;
        tag(lines, wall?.shape?.segments?.[si]?.component_id ?? wall?.component_id, "wall_course");
        group.add(lines);
      }
    });
  });
  (project.wall_caps || []).forEach((cap) => {
    if (mountCount >= MAX_MOUNTED_MESHES) return;
    const wall = walls.find((w) => w?.component_id === cap?.wall_component_id);
    if (!wall) return;
    const segs = wall?.shape?.segments || [];
    let si = segs.findIndex((s) => s?.component_id === cap?.segment_component_id);
    if (si < 0) si = Number.isInteger(cap?.segment_index) ? cap.segment_index : -1;
    const s = si >= 0 ? segSpan(wall, si) : null;
    if (!s || s.len <= 0) return;
    mountCount++;
    const height = (Number(wall?.heightInches) || 24) * IN;
    const capH = (Number(cap?.height_inches) || 3) * IN;
    const capLen = (Number(cap?.length_inches ?? cap?.cut_length_inches) || s.len) * IN;
    const thick = ((Number(wall?.thicknessInches) || 8) + 2 * (Number(cap?.overhang_inches) ?? 1)) * IN;
    const m = new THREE.Mesh(new THREE.BoxGeometry(capLen, capH, thick), capMat);
    m.position.set(((s.ax + s.bx) / 2) * IN, height + capH / 2, ((s.az + s.bz) / 2) * IN);
    m.rotation.y = -Math.atan2(s.bz - s.az, s.bx - s.ax);
    tag(m, cap?.component_id, "wall-cap");
    group.add(m);
  });
  (project.signage_cabinets || []).forEach((cab) => {
    if (mountCount >= MAX_MOUNTED_MESHES) return;
    const w = (Number(cab?.width_inches) || 0) * IN;
    const h = (Number(cab?.height_inches) || 0) * IN;
    const d = (Number(cab?.depth_inches) || 0) * IN;
    if (!(w > 0 && h > 0 && d > 0)) return;
    let px = null, pz = null;
    if (cab?.mount === "pole") {
      const pole = (project.poles || []).find((p) => p?.component_id === cab?.pole_component_id);
      if (!pole) return;
      px = (Number(pole.x_inches) || 0) * IN; pz = (Number(pole.z_inches) || 0) * IN;
    } else if (cab?.mount === "foundation") {
      const fi = (items || []).findIndex((it) => it?.component_id === cab?.foundation_component_id);
      const pos = fi >= 0 ? itemFirstPos.get(fi) : null;
      if (!pos) return;
      px = pos.x; pz = pos.z;
    } else return;
    mountCount++;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cabMat);
    const mh = (Number(cab?.mount_height_inches) || 0) * IN;
    m.position.set(px, mh + h / 2, pz);
    tag(m, cab?.component_id, "cabinet");
    group.add(m);
    // O-033 (CMP-C02) -- cabinet face panel: a thin face on the cabinet's
    // front face in the authored `panel_color`/`body_color` (blank = the
    // box's default cabMat; never an invented color).
    const cabColor = (typeof cab?.panel_color === "string" && cab.panel_color !== "" ? cab.panel_color
      : typeof cab?.body_color === "string" && cab.body_color !== "" ? cab.body_color : null);
    if (cabColor) {
      const faceMat = new THREE.MeshLambertMaterial({ color: cabColor });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
      face.position.set(px, mh + h / 2, pz + d / 2 + 0.5);
      tag(face, cab?.component_id, "cabinet_face");
      group.add(face);
    }
  });

  // O-033 landscape — painted cells render as thin tiles just above grade.
  // "dirt" is the designer's eraser (bare ground): it draws nothing. Malformed
  // cell keys/materials are skipped rather than guessed; the 24x16 designer
  // grid already bounds the cell count.
  const landscape = project.landscape || {};
  const cellIn = Number(landscape.cell_size_inches) || 12;
  const cells = landscape.cells || {};
  Object.entries(cells).slice(0, 512).forEach(([key, matKey]) => {
    // O-073 visual objects render as small shapes; billable materials as
    // flat tiles. "dirt" draws nothing; malformed cell keys are skipped.
    const obj = visualObjectByKey(matKey);
    const mat = materialByKey(matKey);
    if (!mat && !obj) return;
    if (matKey === "dirt") return;
    const [cx, cy] = key.split(",").map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const px = (cx + 0.5) * cellIn * IN, pz = (cy + 0.5) * cellIn * IN;
    const material = solid
      ? new THREE.MeshStandardMaterial({ color: (obj || mat).color, roughness: 0.95 })
      : new THREE.MeshBasicMaterial({ color: (obj || mat).color, wireframe: true });
    if (obj) {
      const s = cellIn * IN;
      let geo;
      // O-068 -- each object carries an authored size (height_inches /
      // radius_inches in landscapeMaterials), so the marker scale is
      // object-typed, not a cell-size fraction.
      const oh = (obj.height_inches || cellIn) * IN, orad = (obj.radius_inches || cellIn * 0.4) * IN;
      if (obj.key === "tree") geo = new THREE.ConeGeometry(orad, oh, 6);
      else if (obj.key === "shrub") geo = new THREE.SphereGeometry(orad, 8, 6);
      else if (obj.key === "light") geo = new THREE.CylinderGeometry(orad, orad * 1.2, oh, 6);
      else geo = new THREE.BoxGeometry(orad * 2, oh, orad * 2); // boulder
      const marker = new THREE.Mesh(geo, material);
      marker.position.set(px, oh / 2, pz);
      group.add(marker);
      return;
    }
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(cellIn * IN, 0.6 * IN, cellIn * IN),
      material
    );
    tile.position.set(px, 0.3 * IN, pz);
    group.add(tile);
  });

  // O-070 (CMP-F03) -- placed count-objects: `landscape.objects[]` rows draw
  // at authored x/z + rotation/elevation. Blank position/rotation/elevation
  // draws nothing (never an invented placement).
  (Array.isArray(landscape?.objects) ? landscape.objects : []).forEach((o) => {
    const obj = countObjectByKey(o?.type);
    const ox = Number(o?.x_inches), oz = Number(o?.z_inches);
    if (!obj || !Number.isFinite(ox) || !Number.isFinite(oz)) return;
    const oh = (obj.height_inches || 24) * IN, orad = (obj.radius_inches || 12) * IN;
    let geo;
    if (obj.key === "tree") geo = new THREE.ConeGeometry(orad, oh, 6);
    else if (obj.key === "shrub") geo = new THREE.SphereGeometry(orad, 8, 6);
    else if (obj.key === "light") geo = new THREE.CylinderGeometry(orad, orad * 1.2, oh, 6);
    else geo = new THREE.BoxGeometry(orad * 2, oh, orad * 2);
    const marker = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: obj.color || 0x78716c, roughness: 0.95 }));
    const rot = Number(o?.rotation_degrees) || 0;
    marker.rotation.y = (rot * Math.PI) / 180;
    const elev = Number(o?.elevation_inches) || 0;
    marker.position.set(ox * IN, (oh / 2) + elev * IN, oz * IN);
    group.add(marker);
  });

  if (showGround) {
    const grid = new THREE.GridHelper(60, 60, 0xd1d5db, 0xe5e7eb);
    grid.position.y = 0.01;
    group.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
  }

  // center the model horizontally
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;

  scene.add(group);
  return group;
}

export default function Foundation3DPreview({ project, highlightComponentIds = [] }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [solid, setSolid] = useState(true);
  const [showGround, setShowGround] = useState(true);
  // O-076 (CMP-F09) -- lazy 3D: default `visible` false so the WebGL scene +
  // geometry build defers until the operator clicks "Show 3D View" (the heavy
  // payload stays out of the initial render).
  const [visible, setVisible] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [glFailed, setGlFailed] = useState(false);
  const [exploded, setExploded] = useState(false);
  // O-029 section view — inches of elevation at which a horizontal clip plane
  // cuts the scene (negative = below grade). null disables sectioning.
  const [section, setSection] = useState(null);
  // O-037 below-grade cutaway — flips the clip to keep only the buried
  // portion (y <= 0), independent of the elevation-section height.
  const [sectionBelow, setSectionBelow] = useState(false);
  // O-037 reinforcement-inspection — gates the concrete-local steel/supports
  // group without touching the concrete render.
  const [showRebar, setShowRebar] = useState(true);
  // O-043 (CMP-C12) -- presentation render: a concept-only view hiding the
  // construction details (rebar/supports/grid) -- an attractive concept
  // render separate from the construction doc.
  const [presentation, setPresentation] = useState(false);
  // O-037 vertical cutaway — a side clip in plan-X inches (null = off); it
  // composes with the elevation section rather than replacing it.
  const [cutawayX, setCutawayX] = useState(null);
  const highlightKey = Array.isArray(highlightComponentIds) ? highlightComponentIds.join(",") : "";

  const disposeObject = (root) => {
    const geometries = new Set(), materials = new Set();
    root.traverse?.((o) => {
      if (o.geometry) geometries.add(o.geometry);
      const m = o.material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) materials.add(mat);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };

  // O-041 — ONE renderer/camera/scene for the mount's whole lifetime. The
  // old code rebuilt the WebGL context on every edit. Rendering is
  // demand-driven (invalidate() coalesces a rAF — no continuous loop), the
  // WebGL-creation failure surfaces honestly, and context loss is
  // prevented/re-rendered on restore.
  useEffect(() => {
    if (!visible || !mountRef.current) return;
    const mount = mountRef.current;
    const st = stateRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf9fafb);
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setGlFailed(true);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(20, 30, 20);
    scene.add(dir);

    st.theta = st.theta ?? Math.PI / 4;
    st.phi = st.phi ?? Math.PI / 3.2;
    st.radius = st.radius ?? 30;
    st.target = st.target || new THREE.Vector3(0, 0, 0);
    st.scene = scene;
    st.camera = camera;
    st.renderer = renderer;
    st.modelGroup = null;

    let frame = null;
    const invalidate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        renderer.render(scene, camera);
      });
    };
    st.invalidate = invalidate;

    const applyCamera = () => {
      const r = st.radius;
      camera.position.set(
        st.target.x + r * Math.sin(st.phi) * Math.cos(st.theta),
        st.target.y + r * Math.cos(st.phi),
        st.target.z + r * Math.sin(st.phi) * Math.sin(st.theta)
      );
      camera.lookAt(st.target);
    };
    applyCamera();
    invalidate();

    // --- controls ---
    let dragging = null;
    let last = { x: 0, y: 0 };
    const onDown = (e) => {
      dragging = e.button === 2 ? "pan" : "orbit";
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (dragging === "orbit") {
        st.theta += dx * 0.008;
        st.phi = Math.min(Math.PI / 2.02, Math.max(0.15, st.phi - dy * 0.006));
      } else {
        const panScale = st.radius * 0.0015;
        st.target.x -= dx * panScale * Math.cos(st.theta + Math.PI / 2);
        st.target.z -= dx * panScale * Math.sin(st.theta + Math.PI / 2);
        st.target.y += dy * panScale;
      }
      applyCamera();
      invalidate();
    };
    const onUp = () => (dragging = null);
    const onWheel = (e) => {
      e.preventDefault();
      st.radius = Math.min(200, Math.max(3, st.radius * (1 + e.deltaY * 0.001)));
      setZoom(Math.round((30 / st.radius) * 100));
      applyCamera();
      invalidate();
    };
    const onContext = (e) => e.preventDefault();
    const onContextLost = (e) => e.preventDefault();
    const onContextRestored = () => invalidate();

    const el = renderer.domElement;
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("webglcontextlost", onContextLost);
    el.addEventListener("webglcontextrestored", onContextRestored);

    const onResize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      invalidate();
    };
    window.addEventListener("resize", onResize);

    stateRef.current.setView = (view) => {
      if (view === "front") { st.theta = -Math.PI / 2; st.phi = Math.PI / 2.05; }
      if (view === "side") { st.theta = 0; st.phi = Math.PI / 2.05; }
      if (view === "top") { st.theta = -Math.PI / 2; st.phi = 0.16; }
      if (view === "reset") {
        st.theta = Math.PI / 4;
        st.phi = Math.PI / 3.2;
        st.radius = 30;
        st.target.set(0, 0, 0);
        setZoom(100);
      }
      applyCamera();
      invalidate();
    };

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("webglcontextlost", onContextLost);
      el.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
      st.scene = st.camera = st.renderer = st.modelGroup = null;
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Model rebuild — swaps only the model group inside the live scene and
  // disposes the outgoing group's geometries/materials. Effect order keeps
  // this after the init effect so st.scene exists on first mount.
  useEffect(() => {
    const st = stateRef.current;
    if (!visible || !st.scene || !st.renderer) return;
    if (st.modelGroup) {
      st.scene.remove(st.modelGroup);
      disposeObject(st.modelGroup);
    }
    // O-043 (CMP-C12) -- presentation render: a concept-only view hiding the
    // construction details (rebar/supports/grid); `showRebar`/`showGround`
    // gate on `!presentation` so the render stays a concept render, never a
    // construction doc.
    st.modelGroup = buildScene(st.scene, project, solid, showGround && !presentation, new Set(highlightComponentIds), exploded, showRebar && !presentation);
    st.invalidate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highlightKey serializes the id set for the rebuild
  }, [project, solid, showGround, visible, highlightKey, exploded, showRebar, presentation]);

  // Section clip plane — a global renderer plane keeps everything below the
  // chosen elevation (negative inches = below grade); no geometry is edited.
  useEffect(() => {
    const st = stateRef.current;
    if (!st.renderer) return;
    const planes = [];
    if (section !== null) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), section * IN));
    else if (sectionBelow) planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    if (cutawayX !== null) planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -cutawayX * IN));
    st.renderer.clippingPlanes = planes;
    st.invalidate?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, sectionBelow, cutawayX]);

  const setView = (v) => stateRef.current.setView?.(v);

  const ToolBtn = ({ children, onClick, active }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-[24px] px-2 rounded-sm border text-[11px] font-medium flex items-center gap-1 ${
        active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-sm p-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-[12px] font-bold text-gray-800">3D Preview</span>
          <span className="text-[11px] text-gray-500 ml-2">Updates live as you edit</span>
        </div>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-[11px] font-medium text-gray-600 hover:text-red-600 flex items-center gap-1"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
          {visible ? "Hide 3D View" : "Show 3D View"}
        </button>
      </div>

      {visible && (
        <>
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <ToolBtn onClick={() => setView("front")}>Front</ToolBtn>
            <ToolBtn onClick={() => setView("side")}>Side</ToolBtn>
            <ToolBtn onClick={() => setView("top")}>Top</ToolBtn>
            <ToolBtn onClick={() => setView("reset")}>
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Reset
            </ToolBtn>
            <span className="text-[11px] text-gray-500 px-1">{zoom}%</span>
            <ToolBtn onClick={() => setShowGround((v) => !v)} active={!showGround}>
              {showGround ? "Hide Ground" : "Show Ground"}
            </ToolBtn>
            <ToolBtn onClick={() => setSolid((v) => !v)} active={solid}>
              <Box className="w-3 h-3" aria-hidden="true" /> {solid ? "Solid Mode" : "Wireframe"}
            </ToolBtn>
            <ToolBtn onClick={() => setExploded((v) => !v)} active={exploded}>Exploded</ToolBtn>
            <ToolBtn onClick={() => setSection((v) => (v === null ? -6 : null))} active={section !== null}>Section</ToolBtn>
            <ToolBtn onClick={() => setSectionBelow((v) => !v)} active={sectionBelow} title="Show only below-grade geometry">Below</ToolBtn>
            <ToolBtn onClick={() => setShowRebar((v) => !v)} active={!showRebar} title="Toggle reinforcement steel/supports">Rebar</ToolBtn>
            {/* O-043 (CMP-C12) -- presentation render toggle: a concept-only
                view hiding the construction details (rebar/supports/grid) --
                an attractive concept render separate from the construction doc. */}
            <ToolBtn onClick={() => setPresentation((v) => !v)} active={presentation} title="Concept-only render (hides rebar, supports, and the grid)">Presentation</ToolBtn>
            <ToolBtn onClick={() => setCutawayX((v) => (v === null ? 120 : null))} active={cutawayX !== null} title="Cut away everything right of the X position">Cutaway</ToolBtn>
            {cutawayX !== null && (
              <span className="flex items-center gap-1 text-[11px] text-gray-600">
                <input
                  type="range" min="0" max="480" step="6" value={cutawayX}
                  onChange={(e) => setCutawayX(Number(e.target.value))}
                  className="w-24 h-1 accent-blue-600" aria-label="Cutaway X position (inches)"
                />
                <span>{cutawayX}&quot;x</span>
              </span>
            )}
            {section !== null && (
              <span className="flex items-center gap-1 text-[11px] text-gray-600">
                <input
                  type="range" min="-60" max="12" step="1" value={section}
                  onChange={(e) => setSection(Number(e.target.value))}
                  className="w-24 h-1 accent-blue-600" aria-label="Section elevation (inches)"
                />
                {section}&quot;
              </span>
            )}
            <ToolBtn onClick={() => mountRef.current?.requestFullscreen?.()}>
              <Maximize2 className="w-3 h-3" aria-hidden="true" /> Full Screen
            </ToolBtn>
          </div>

          {glFailed
            ? <div data-gl-failed="true" className="w-full h-[420px] rounded-sm bg-amber-50 border border-amber-200 flex items-center justify-center text-[11px] text-amber-800">3D preview is unavailable in this browser — WebGL could not be initialized.</div>
            : <div ref={mountRef} className="w-full h-[420px] rounded-sm overflow-hidden bg-gray-50" />}

          <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1 px-1">
            <span>Left Click + Drag: Orbit/Rotate</span>
            <span>Right Click + Drag: Pan/Move</span>
            <span>Scroll Wheel: Zoom in/out</span>
          </div>
        </>
      )}
    </div>
  );
}