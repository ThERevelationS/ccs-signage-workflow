// O-094 (CMP-H03) — start-from-assembly presets. A preset is named DESIGN
// data: foundation items/walls/poles/caps/cabinets authored in the same shape
// a saved template's project_data carries (the template snapshot record).
// Presets never carry catalog material ids, prices, rates, customer fields,
// notes, or AI data — material selection fields are left blank so applying a
// preset can never invent stock or pricing.
//
// Two consumption paths, both patch-shaped (prepareFoundationTemplatePatch
// semantics — supplied arrays replace, absent keys preserve):
//   * foundationAssemblyPresetTemplateData(preset) returns a snapshot-shaped
//     record for the dialog's existing onApply(data) lane — the page runs it
//     through prepareFoundationTemplatePatch, which validates it, mints fresh
//     component ids, and remaps every reference (the same gate stored
//     templates pass through).
//   * applyFoundationAssemblyPreset(project, preset, {createId, mode}) is the
//     direct model transform: mode "replace" (default) runs the same prepare
//     gate (full start-from semantics — every supplied array replaces the
//     target's); mode "append" clones the preset rows onto the existing
//     assembly via appendClonedFoundationAssemblies (collision-guarded ids,
//     references remapped inside the clone set, index fields rebuilt against
//     the merged arrays) and supplies only non-empty appended arrays.
import { foundationWallSegments } from "./wallCalculator.js";
import { prepareFoundationTemplatePatch } from "./foundationTemplateModel.js";
import { appendClonedFoundationAssemblies } from "./foundationDuplicateMirror.js";

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deepClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// Wall segments carry canonical lengths from foundationWallSegments (the same
// function wallCalculator's outline-basis check compares against — hand-typed
// lengths would trip wall_outline_geometry_mismatch) plus an authored
// component_id so preset caps can reference them.
const wallSegments = (prefix, points, closed) =>
  (foundationWallSegments(points, closed) || []).map((s, i) => ({
    component_id: `${prefix}_seg_${i + 1}`,
    ...s,
  }));

const monumentPoints = [
  { x: 132, z: 148 },
  { x: 348, z: 148 },
  { x: 348, z: 172 },
  { x: 132, z: 172 },
];
const monumentSegments = wallSegments("preset_monument_wall_1", monumentPoints, true);

const lWallPoints = [
  { x: 156, z: 156 },
  { x: 336, z: 156 },
  { x: 336, z: 232 },
];
const lWallSegments = wallSegments("preset_lwall_wall_1", lWallPoints, false);

// Layout canvas is 480 x 320 plan inches (foundationLayoutModel). Positions
// below center footprints on (240, 160). Preset component ids are ordinary id
// strings — the clone path remaps every one of them on apply, so they never
// reach the saved project.
const PRESET_ROWS = [
  {
    preset_key: "single-spread-footing",
    name: "Single spread footing",
    summary: "One 8' x 5'4\" spread footing, centered on the plan.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_ssf_item_1",
          foundation_type: "spread_foot",
          description: "Spread footing",
          quantity: 1,
          length_inches: 96,
          width_inches: 64,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 192,
          z_inches: 128,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: [],
    },
  },
  {
    preset_key: "single-pillar-pier",
    name: "Single pillar pier",
    summary: "One 24\" diameter drilled pier, centered on the plan.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pier_item_1",
          foundation_type: "pillar",
          description: "Pier footing",
          quantity: 1,
          diameter: 24,
          depth_inches: 36,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 228,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [],
      poles: [],
      wall_caps: [],
      signage_cabinets: [],
    },
  },
  {
    preset_key: "pylon-pole-on-pier",
    name: "Pylon pole on pier",
    summary: "30\" pier footing with a 20' pole anchored to it.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_pylon_item_1",
          foundation_type: "pillar",
          description: "Pylon pier",
          quantity: 1,
          diameter: 30,
          depth_inches: 42,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 225,
          z_inches: 145,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_pylon_pole_1",
          pole_id: "",
          height_inches: 240,
          embedment_inches: 48,
          include_pole_painting: false,
          foundation_component_id: "preset_pylon_item_1",
          foundation_idx: 0,
          x_inches: 240,
          z_inches: 160,
          signs: [],
        },
      ],
      wall_caps: [],
      signage_cabinets: [],
    },
  },
  {
    preset_key: "twin-pole-monument",
    name: "Twin pole monument",
    summary: "Two 4' spread footings, two 15' poles, and a mounted cabinet on each pole.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_tpm_item_1",
          foundation_type: "spread_foot",
          description: "Left footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 144,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
        {
          component_id: "preset_tpm_item_2",
          foundation_type: "spread_foot",
          description: "Right footing",
          quantity: 1,
          length_inches: 48,
          width_inches: 48,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 288,
          z_inches: 136,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [],
      poles: [
        {
          component_id: "preset_tpm_pole_1",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_1",
          foundation_idx: 0,
          x_inches: 168,
          z_inches: 160,
          signs: [],
        },
        {
          component_id: "preset_tpm_pole_2",
          pole_id: "",
          height_inches: 180,
          embedment_inches: 36,
          include_pole_painting: false,
          foundation_component_id: "preset_tpm_item_2",
          foundation_idx: 1,
          x_inches: 312,
          z_inches: 160,
          signs: [],
        },
      ],
      wall_caps: [],
      signage_cabinets: [
        {
          component_id: "preset_tpm_cabinet_1",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_1",
          pole_index: 0,
          foundation_component_id: "",
          foundation_index: undefined,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0,
        },
        {
          component_id: "preset_tpm_cabinet_2",
          description: "",
          mount: "pole",
          pole_component_id: "preset_tpm_pole_2",
          pole_index: 1,
          foundation_component_id: "",
          foundation_index: undefined,
          width_inches: 72,
          height_inches: 48,
          depth_inches: 10,
          mount_height_inches: 84,
          quantity: 1,
          unit_cost: 0,
        },
      ],
    },
  },
  {
    preset_key: "monument-base-wall-cap",
    name: "Monument base with wall cap",
    summary: "20' x 3' footing with a closed perimeter base wall and a cap on every segment.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_monument_item_1",
          foundation_type: "spread_foot",
          description: "Monument footing",
          quantity: 1,
          length_inches: 240,
          width_inches: 36,
          depth_inches: 24,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 120,
          z_inches: 142,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [
        {
          component_id: "preset_monument_wall_1",
          name: "Base wall",
          heightInches: 18,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: monumentPoints, closed: true, segments: monumentSegments },
        },
      ],
      poles: [],
      wall_caps: monumentSegments.map((s, i) => ({
        component_id: `preset_monument_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_monument_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i,
      })),
      signage_cabinets: [],
    },
  },
  {
    preset_key: "open-l-wall-run",
    name: "Open L wall on footing",
    summary: "15' x 8' footing with an open two-segment L wall and caps.",
    project_data: {
      assembly_schema_version: 1,
      items: [
        {
          component_id: "preset_lwall_item_1",
          foundation_type: "spread_foot",
          description: "Wall footing",
          quantity: 1,
          length_inches: 180,
          width_inches: 96,
          depth_inches: 18,
          grade_offset_inches: 0,
          rotation_degrees: 0,
          x_inches: 150,
          z_inches: 148,
          include_forming: true,
          include_rebar: true,
          include_finishing: true,
          excavation_method: "",
          selected_concrete_id: "",
          selected_forming_id: "",
        },
      ],
      walls: [
        {
          component_id: "preset_lwall_wall_1",
          name: "L wall",
          heightInches: 24,
          mortarGapInches: 0.375,
          materialId: "",
          internalMaterialId: "",
          shape: { points: lWallPoints, closed: false, segments: lWallSegments },
        },
      ],
      poles: [],
      wall_caps: lWallSegments.map((s, i) => ({
        component_id: `preset_lwall_cap_${i + 1}`,
        cap_inventory_id: "",
        wall_component_id: "preset_lwall_wall_1",
        wall_index: 0,
        segment_component_id: s.component_id,
        segment_index: i,
      })),
      signage_cabinets: [],
    },
  },
];

// The catalog is read-only data: freeze every level a caller could mutate so
// a templateData() consumer can never edit the shared definitions.
const freezeDeep = (v) => {
  if (isRecord(v) || Array.isArray(v)) {
    for (const k of Object.keys(v)) freezeDeep(v[k]);
    Object.freeze(v);
  }
  return v;
};
export const FOUNDATION_ASSEMBLY_PRESETS = freezeDeep(PRESET_ROWS.map((p) => ({ ...p })));

const findPreset = (presetOrKey) => {
  const key = typeof presetOrKey === "string" ? presetOrKey : presetOrKey?.preset_key;
  const hit = FOUNDATION_ASSEMBLY_PRESETS.find((p) => p.preset_key === key);
  if (!hit) throw new Error(`foundation assembly preset: unknown preset ${JSON.stringify(key)}`);
  return hit;
};

// Snapshot-shaped record for the dialog's existing onApply(data) lane — the
// page's prepareFoundationTemplatePatch gate validates it, mints fresh ids,
// and remaps references exactly like a stored template. Always deep-cloned:
// the catalog is frozen and shared.
export function foundationAssemblyPresetTemplateData(presetOrKey) {
  const preset = findPreset(presetOrKey);
  return deepClone({ ...preset.project_data, assembly_schema_version: 1 });
}

const COUNT_LABELS = [
  ["items", "foundation", "foundations"],
  ["walls", "wall", "walls"],
  ["poles", "pole", "poles"],
  ["wall_caps", "cap", "caps"],
  ["signage_cabinets", "cabinet", "cabinets"],
];

// Row metadata for the dialog's preset pick list.
export function describeFoundationAssemblyPreset(presetOrKey) {
  const preset = findPreset(presetOrKey);
  const data = preset.project_data || {};
  const counts = {};
  const parts = [];
  for (const [k, one, many] of COUNT_LABELS) {
    const n = Array.isArray(data[k]) ? data[k].length : 0;
    counts[k] = n;
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return {
    preset_key: preset.preset_key,
    name: preset.name,
    summary: preset.summary,
    counts,
    counts_label: parts.length ? parts.join(" · ") : "empty preset",
    total_components: Object.values(counts).reduce((a, n) => a + n, 0),
  };
}

// Direct model transform -> { patch, summary }. merge patch as
// {...prev, ...patch}.
//   mode "replace" (default): the preset runs through the template patch gate
//     — every supplied array replaces the target's (start-from semantics);
//     the project argument is validated but not otherwise needed.
//   mode "append": the preset's rows are cloned onto the existing assembly
//     (fresh collision-guarded ids, references remapped inside the clone set,
//     dependent index fields rebuilt against the merged arrays); only arrays
//     that gained rows appear in the patch.
export function applyFoundationAssemblyPreset(project, presetOrKey, {
  createId,
  appliedAt,
  mode = "replace",
} = {}) {
  if (!isRecord(project)) throw new Error("foundation assembly preset: project must be a record");
  const preset = findPreset(presetOrKey);
  const data = foundationAssemblyPresetTemplateData(preset);
  if (mode === "append") {
    const { patch, idMap, clonedCounts } = appendClonedFoundationAssemblies(project, data, { createId });
    return {
      patch,
      summary: {
        operation: "preset",
        mode: "append",
        preset_key: preset.preset_key,
        appended: clonedCounts,
        rows_added: Object.values(clonedCounts).reduce((a, n) => a + n, 0),
        id_map: Object.fromEntries(idMap),
      },
    };
  }
  if (mode !== "replace") throw new Error('foundation assembly preset: mode must be "replace" or "append"');
  return {
    patch: prepareFoundationTemplatePatch(data, { createId, appliedAt }),
    summary: { operation: "preset", mode: "replace", preset_key: preset.preset_key },
  };
}
