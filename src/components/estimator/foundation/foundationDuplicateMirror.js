// O-094 (CMP-H03) — duplicate + mirror transforms over the foundation assembly
// arrays. Pure: the source project is never mutated, catalog ids and prices
// are never invented, and every transform returns a template-patch-shaped
// delta compatible with prepareFoundationTemplatePatch semantics — the page
// merges it as {...prev, ...patch}, so absent array keys preserve the
// target's rows and supplied arrays replace them wholesale.
//
// Geometry contract (foundationLayoutModel.js / foundationAssemblyModel.js —
// READ-only imports, the models that own these fields):
//   * items carry a TOP-LEFT plan corner in inches (x_inches/z_inches), an
//     unrotated footprint from foundationLayoutFootprint() (length_inches x
//     width_inches, or diameter x diameter for pillars), and a visual
//     rotation_degrees applied about the footprint center (CSS clockwise).
//   * poles carry a plan POINT in inches (x_inches/z_inches) — rendered as a
//     marker, no footprint, so they reflect/translate as points.
//   * walls carry shape.points [{x, z}] in plan inches. Segment lengths are
//     derived from consecutive points, so translation and reflection preserve
//     them exactly — no segment rewrite is needed or attempted.
//   * wall_caps and signage_cabinets carry NO plan coordinates — they are
//     positioned by component-id reference (wall + segment / pole +
//     foundation). They ride with their parents and are handled only through
//     reference remapping, never through geometry writes.
import { cloneFoundationComponents } from "./foundationAssemblyModel.js";
import {
  foundationLayoutFootprint,
  FOUNDATION_LAYOUT_WIDTH_INCHES,
  FOUNDATION_LAYOUT_DEPTH_INCHES,
} from "./foundationLayoutModel.js";

// Mirrors the template-model allowlist's assembly arrays — kept local so this
// module stays a pure geometry/assembly helper with no template dependency.
const ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];
const ID_RETRY_MAX = 8; // mirrors MAX_COLLISIONS in foundationAssemblyModel
const DEFAULT_OFFSET_INCHES = { x: 12, z: 12 };

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isId = (v) => typeof v === "string" && v.length > 0;
const deepClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const cloneRow = (r) => {
  try {
    return deepClone(r);
  } catch {
    return isRecord(r) ? { ...r } : r;
  }
};
const normDeg = (v) => ((v % 360) + 360) % 360;
const rebuildIndex = (id, parents) => {
  if (!isId(id)) return undefined;
  const i = (parents || []).findIndex((p) => p?.component_id === id);
  return i >= 0 ? i : undefined;
};

// Every component id + component reference already live on the project — a
// fresh clone id must never collide with one of them (cloneFoundationComponents
// only dedupes against the subset it sees).
const collectUsedComponentIds = (project) => {
  const ids = new Set();
  const push = (v) => { if (isId(v)) ids.add(v); };
  for (const k of ASSEMBLY_ARRAYS) {
    for (const r of project?.[k] || []) {
      if (!isRecord(r)) continue;
      push(r.component_id);
      push(r.foundation_component_id);
      push(r.pole_component_id);
      push(r.wall_component_id);
      push(r.segment_component_id);
      push(r.source_item_component_id);
    }
  }
  for (const w of project?.walls || []) for (const s of w?.shape?.segments || []) push(s?.component_id);
  for (const p of project?.poles || []) for (const s of p?.signs || []) push(s?.component_id);
  return ids;
};

const collisionFreeId = (createId, used, kind) => {
  for (let i = 0; i < ID_RETRY_MAX; i += 1) {
    const id = createId(kind);
    if (isId(id) && !used.has(id)) { used.add(id); return id; }
  }
  throw new Error(`foundation duplicate/mirror: could not mint a collision-free ${kind} id`);
};

// Resolve which rows an operation acts on. component_ids absent => every row
// on the five arrays; supplied ids must each resolve to exactly one top-level
// row (fail closed on unknown ids). include_dependents pulls in rows anchored
// on a selected parent — a pole on a selected footing, a cap on a selected
// wall, a cabinet on a selected pole/footing — iterating to a fixpoint so a
// cabinet on a pole on a footing all travels together. Dependents added this
// way keep references outside the selection pointing at the ORIGINAL parents.
const selectRows = (project, componentIds, includeDependents) => {
  const selected = {};
  for (const k of ASSEMBLY_ARRAYS) selected[k] = new Set();
  if (componentIds !== undefined && componentIds !== null && !Array.isArray(componentIds)) {
    throw new Error("foundation duplicate/mirror: component_ids must be an array");
  }
  if (componentIds === undefined || componentIds === null) {
    for (const k of ASSEMBLY_ARRAYS) for (const r of project?.[k] || []) selected[k].add(r);
  } else {
    const lookup = new Map();
    for (const k of ASSEMBLY_ARRAYS) {
      for (const r of project?.[k] || []) {
        if (isId(r?.component_id) && !lookup.has(r.component_id)) lookup.set(r.component_id, { kind: k, row: r });
      }
    }
    const unmatched = componentIds.filter((id) => !lookup.has(id));
    if (unmatched.length) {
      throw new Error(`foundation duplicate/mirror: unknown component id(s): ${unmatched.join(", ")}`);
    }
    for (const id of componentIds) {
      const hit = lookup.get(id);
      selected[hit.kind].add(hit.row);
    }
  }
  if (includeDependents) {
    const itemIds = () => new Set([...selected.items].map((r) => r?.component_id).filter(isId));
    const wallIds = () => new Set([...selected.walls].map((r) => r?.component_id).filter(isId));
    const poleIds = () => new Set([...selected.poles].map((r) => r?.component_id).filter(isId));
    let grew = true;
    while (grew) {
      grew = false;
      const items = itemIds();
      for (const p of project?.poles || []) {
        if (!selected.poles.has(p) && items.has(p?.foundation_component_id)) { selected.poles.add(p); grew = true; }
      }
      const walls = wallIds();
      for (const c of project?.wall_caps || []) {
        if (!selected.wall_caps.has(c) && walls.has(c?.wall_component_id)) { selected.wall_caps.add(c); grew = true; }
      }
      const poles = poleIds();
      for (const c of project?.signage_cabinets || []) {
        if (selected.signage_cabinets.has(c)) continue;
        const pool = c?.mount === "pole" ? poles : items;
        const parent = c?.mount === "pole" ? c?.pole_component_id : c?.foundation_component_id;
        if (pool.has(parent)) { selected.signage_cabinets.add(c); grew = true; }
      }
    }
  }
  return selected;
};

const subsetOf = (project, selected) => {
  const out = {};
  for (const k of ASSEMBLY_ARRAYS) out[k] = (project?.[k] || []).filter((r) => selected[k].has(r));
  return out;
};

// Clone a subset/data record into fresh-id rows and append them after the
// project's existing rows. References inside the cloned set are remapped by
// cloneFoundationComponents; references pointing OUT of the set keep their
// original ids — a duplicated cap on a kept wall stays on that wall, a
// duplicated pole on a kept footing stays anchored. Dependent index fields
// (foundation_idx / wall_index / segment_index / pole_index / foundation_index)
// are rebuilt against the FINAL arrays, matching the rebuild in
// cloneFoundationComponents but over the merged row set.
export function appendClonedFoundationAssemblies(project, assemblyData, { createId, transformClone } = {}) {
  if (!isRecord(project)) throw new Error("foundation duplicate/mirror: project must be a record");
  if (!isRecord(assemblyData)) throw new Error("foundation duplicate/mirror: assembly data must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate/mirror: createId(kind) factory is required");
  const used = collectUsedComponentIds(project);
  const guarded = (kind) => collisionFreeId(createId, used, kind);
  const { components, idMap } = cloneFoundationComponents(assemblyData, { createId: guarded });
  if (typeof transformClone === "function") {
    for (const k of ASSEMBLY_ARRAYS) for (const r of components[k] || []) transformClone(r, k);
  }
  // source_item_component_id is migrated-pole lineage the assembly model does
  // not remap (it is not a placement reference): point it at the cloned item
  // when the source travelled; leave it on the original row otherwise.
  for (const p of components.poles || []) {
    if (isId(p?.source_item_component_id) && idMap.has(p.source_item_component_id)) {
      p.source_item_component_id = idMap.get(p.source_item_component_id);
    }
  }
  const items = [...(project.items || []).map(cloneRow), ...(components.items || [])];
  const walls = [...(project.walls || []).map(cloneRow), ...(components.walls || [])];
  const poles = [...(project.poles || []).map(cloneRow), ...(components.poles || [])];
  const wallCaps = [...(project.wall_caps || []).map(cloneRow), ...(components.wall_caps || [])];
  const cabinets = [...(project.signage_cabinets || []).map(cloneRow), ...(components.signage_cabinets || [])];
  for (const p of components.poles || []) {
    p.foundation_idx = rebuildIndex(p.foundation_component_id, items);
  }
  for (const c of components.wall_caps || []) {
    c.wall_index = rebuildIndex(c.wall_component_id, walls);
    const wall = walls.find((w) => w?.component_id === c.wall_component_id);
    const segs = Array.isArray(wall?.shape?.segments) ? wall.shape.segments : [];
    c.segment_index = rebuildIndex(c.segment_component_id, segs);
  }
  for (const c of components.signage_cabinets || []) {
    if (c.mount === "pole") {
      c.pole_index = rebuildIndex(c.pole_component_id, poles);
      c.foundation_index = undefined;
    } else {
      c.foundation_index = rebuildIndex(c.foundation_component_id, items);
      c.pole_index = undefined;
    }
  }
  const patch = {};
  const clonedCounts = {};
  const pairs = [["items", items], ["walls", walls], ["poles", poles], ["wall_caps", wallCaps], ["signage_cabinets", cabinets]];
  for (const [k, arr] of pairs) {
    const n = (components[k] || []).length;
    clonedCounts[k] = n;
    if (n > 0) patch[k] = arr;
  }
  return { patch, components, idMap, clonedCounts };
}

const normalizeOffset = (v) => {
  if (v === undefined || v === null) return { ...DEFAULT_OFFSET_INCHES };
  if (fin(v)) return { x: v, z: v };
  if (isRecord(v)) {
    const x = v.x !== undefined ? v.x : v.x_inches;
    const z = v.z !== undefined ? v.z : v.z_inches;
    if ((x === undefined || fin(x)) && (z === undefined || fin(z))) {
      return { x: x ?? DEFAULT_OFFSET_INCHES.x, z: z ?? DEFAULT_OFFSET_INCHES.z };
    }
  }
  throw new Error("foundation duplicate: offset_inches must be a finite number or {x, z} inches");
};

const translateRow = (row, kind, off) => {
  if (kind === "items" || kind === "poles") {
    if (fin(row.x_inches)) row.x_inches += off.x;
    if (fin(row.z_inches)) row.z_inches += off.z;
  } else if (kind === "walls") {
    const pts = row?.shape?.points;
    if (Array.isArray(pts)) {
      for (const p of pts) {
        if (fin(p?.x)) p.x += off.x;
        if (fin(p?.z)) p.z += off.z;
      }
    }
  }
  // wall_caps / signage_cabinets carry no plan geometry — nothing to move.
};

// Duplicate the selected rows (or the whole assembly) with fresh component
// ids, remapped references, and a plan offset so the copy is not stacked
// invisibly on the source. Returns { patch, summary } — merge patch as
// {...prev, ...patch}; only arrays that gained rows are supplied.
export function duplicateFoundationAssembly(project, {
  component_ids,
  include_dependents = true,
  offset_inches,
  createId,
} = {}) {
  if (!isRecord(project)) throw new Error("foundation duplicate: project must be a record");
  if (typeof createId !== "function") throw new Error("foundation duplicate: createId(kind) factory is required");
  const off = normalizeOffset(offset_inches);
  const selected = selectRows(project, component_ids, include_dependents !== false);
  const subset = subsetOf(project, selected);
  const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, subset, {
    createId,
    transformClone: (row, kind) => translateRow(row, kind, off),
  });
  return {
    patch,
    summary: {
      operation: "duplicate",
      offset_inches: off,
      duplicated: clonedCounts,
      rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
      id_map: Object.fromEntries(idMap),
    },
  };
}

// Resolve the mirror line: an explicit coordinate (at), an item edge anchor
// (edge_of + edge — "mirror across a foundation edge"), or the layout canvas
// centerline when nothing is supplied.
const EDGE_ALIASES = {
  min_x: { axis: "x", at: (item, fp) => item.x_inches },
  left: { axis: "x", at: (item, fp) => item.x_inches },
  max_x: { axis: "x", at: (item, fp) => item.x_inches + fp.width },
  right: { axis: "x", at: (item, fp) => item.x_inches + fp.width },
  min_z: { axis: "z", at: (item, fp) => item.z_inches },
  top: { axis: "z", at: (item, fp) => item.z_inches },
  max_z: { axis: "z", at: (item, fp) => item.z_inches + fp.depth },
  bottom: { axis: "z", at: (item, fp) => item.z_inches + fp.depth },
};

const resolveMirrorLine = (project, { axis, at, edge_of, edge } = {}) => {
  if (edge_of !== undefined && edge_of !== null) {
    const item = (project.items || []).find((r) => r?.component_id === edge_of);
    if (!item) throw new Error("foundation mirror: edge_of must name a foundation item component_id");
    const fp = foundationLayoutFootprint(item);
    if (!fp || !fin(item.x_inches) || !fin(item.z_inches)) {
      throw new Error("foundation mirror: edge_of item needs a finite plan position and footprint");
    }
    const spec = EDGE_ALIASES[edge ?? "max_x"];
    if (!spec) throw new Error(`foundation mirror: unknown edge "${String(edge)}" (min_x|max_x|min_z|max_z or left|right|top|bottom)`);
    return { axis: spec.axis, at: spec.at(item, fp) };
  }
  const ax = axis === undefined || axis === null ? "x" : axis;
  if (ax !== "x" && ax !== "z") throw new Error('foundation mirror: axis must be "x" or "z"');
  const v = at === undefined || at === null
    ? (ax === "x" ? FOUNDATION_LAYOUT_WIDTH_INCHES / 2 : FOUNDATION_LAYOUT_DEPTH_INCHES / 2)
    : at;
  if (!fin(v)) throw new Error("foundation mirror: the mirror line (at) must be a finite inches value");
  return { axis: ax, at: v };
};

// Reflect one cloned row about the mirror line. Items reflect by footprint
// CENTER (corner storage + width/depth adjust) and flip rotation (any
// reflection reverses orientation: theta -> -theta). Poles reflect as points.
// Wall points reflect coordinate-wise; segment lengths are preserved exactly
// (reflection is an isometry), and caps/cabinets need no rewrite — they ride
// their remapped references. Returns true when any geometry changed.
const reflectRow = (row, kind, { axis, at }) => {
  const rc = (v) => 2 * at - v;
  let changed = false;
  if (kind === "items") {
    const fp = foundationLayoutFootprint(row);
    if (axis === "x") {
      if (fin(row.x_inches)) { row.x_inches = fp ? rc(row.x_inches) - fp.width : rc(row.x_inches); changed = true; }
    } else {
      if (fin(row.z_inches)) { row.z_inches = fp ? rc(row.z_inches) - fp.depth : rc(row.z_inches); changed = true; }
    }
    if (fin(row.rotation_degrees)) { row.rotation_degrees = normDeg(-row.rotation_degrees); changed = true; }
  } else if (kind === "poles") {
    if (axis === "x" && fin(row.x_inches)) { row.x_inches = rc(row.x_inches); changed = true; }
    if (axis === "z" && fin(row.z_inches)) { row.z_inches = rc(row.z_inches); changed = true; }
  } else if (kind === "walls") {
    const pts = row?.shape?.points;
    if (Array.isArray(pts)) {
      for (const p of pts) {
        if (axis === "x" && fin(p?.x)) { p.x = rc(p.x); changed = true; }
        if (axis === "z" && fin(p?.z)) { p.z = rc(p.z); changed = true; }
      }
    }
  }
  return changed;
};

// Mirror the selected rows (or the whole assembly) about a centerline or a
// foundation edge. mode "copy" (default) appends reflected clones with fresh
// ids — the CAD-style mirror copy; mode "reflect"/"in_place" reflects the
// selected rows in place keeping their ids (references keep working, so caps
// and cabinets ride their parents without a row edit). Returns { patch,
// summary }; only arrays containing reflected rows are supplied in-place,
// only arrays that gained rows are supplied in copy mode.
export function mirrorFoundationAssembly(project, {
  component_ids,
  include_dependents = true,
  axis,
  at,
  edge_of,
  edge,
  mode = "copy",
  createId,
} = {}) {
  if (!isRecord(project)) throw new Error("foundation mirror: project must be a record");
  const line = resolveMirrorLine(project, { axis, at, edge_of, edge });
  if (mode === "reflect" || mode === "in_place") {
    const selected = selectRows(project, component_ids, include_dependents !== false);
    const patch = {};
    const mirrored = {};
    let total = 0;
    for (const k of ASSEMBLY_ARRAYS) {
      let changed = 0;
      const next = (project[k] || []).map((r) => {
        const copy = cloneRow(r);
        if (selected[k].has(r) && isRecord(copy) && reflectRow(copy, k, line)) changed += 1;
        return copy;
      });
      if (changed > 0) {
        patch[k] = next;
        mirrored[k] = changed;
        total += changed;
      }
    }
    return {
      patch,
      summary: { operation: "mirror", mode: "in_place", axis: line.axis, at: line.at, mirrored, rows_mirrored: total },
    };
  }
  if (mode !== "copy") throw new Error('foundation mirror: mode must be "copy" or "reflect"');
  if (typeof createId !== "function") throw new Error("foundation mirror: copy mode requires a createId(kind) factory");
  const selected = selectRows(project, component_ids, include_dependents !== false);
  const subset = subsetOf(project, selected);
  const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, subset, {
    createId,
    transformClone: (row, kind) => reflectRow(row, kind, line),
  });
  return {
    patch,
    summary: {
      operation: "mirror",
      mode: "copy",
      axis: line.axis,
      at: line.at,
      mirrored: clonedCounts,
      rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
      id_map: Object.fromEntries(idMap),
    },
  };
}
