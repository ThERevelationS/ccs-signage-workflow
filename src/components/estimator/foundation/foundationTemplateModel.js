import { normalizeFoundationAssembly, cloneFoundationComponents } from "./foundationAssemblyModel.js";

// Shared allowlist: the page's template-apply fields plus selected_concrete_id
// and notes. Identity, receipt, pricing, and creation keys are never carried.
export const FOUNDATION_TEMPLATE_FIELDS = [
  "items",
  "walls",
  "poles",
  "wall_caps",
  "signage_cabinets",
  "selected_equipment",
  "project_concrete_type",
  "project_concrete_admixtures",
  "excavation_method",
  "selected_concrete_id",
  "landscape",
  "ai_engineering_recommendation",
  "ai_engineering_data",
  "notes",
];

const ASSEMBLY_ARRAYS = ["items", "walls", "poles", "wall_caps", "signage_cabinets"];

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deepClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const checkTemplateRecord = (data, noun) => {
  if (!isRecord(data)) throw new Error(`Foundation template ${noun} must be a record.`);
  if (data.assembly_schema_version !== undefined && data.assembly_schema_version !== 1) {
    throw new Error("Template uses an unsupported assembly version and was not applied.");
  }
};

// Snapshot the allowed design fields of a project for template storage.
// Validates supplied assembly arrays; preserves values verbatim otherwise.
export function createFoundationTemplateSnapshot(project, { createId } = {}) {
  checkTemplateRecord(project, "source");
  const out = { assembly_schema_version: 1 };
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (project[k] !== undefined) out[k] = deepClone(project[k]);
  }
  const supplied = {};
  let hasAssembly = false;
  for (const k of ASSEMBLY_ARRAYS) {
    if (out[k] !== undefined) {
      supplied[k] = out[k];
      hasAssembly = true;
    }
  }
  if (hasAssembly) {
    let n = 0;
    const f = typeof createId === "function" ? createId : (kind) => `tmpl_${kind}_${n++}`;
    normalizeFoundationAssembly(supplied, { createId: f });
  }
  return out;
}

// Build the commit patch for applying a stored template: only supplied
// assembly arrays are cloned with fresh IDs; omitted keys are absent so the
// target's existing fields are preserved.
export function prepareFoundationTemplatePatch(data, { createId } = {}) {
  checkTemplateRecord(data, "data");
  if (typeof createId !== "function") throw new Error("Foundation template apply requires a createId factory.");
  const provided = {};
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (data[k] !== undefined) provided[k] = deepClone(data[k]);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS) if (provided[k] !== undefined) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length
    ? cloneFoundationComponents(arrays, { createId }).components
    : {};
  return { ...provided, ...cloned };
}
