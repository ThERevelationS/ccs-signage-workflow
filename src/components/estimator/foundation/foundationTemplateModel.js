import { normalizeFoundationAssembly, cloneFoundationComponents } from "./foundationAssemblyModel.js";

// Shared allowlist: the page's template-apply fields plus selected_concrete_id
// and notes. Identity, receipt, and creation keys are never carried.
//
// O-007 (CMP-A07) field semantics — a template is a reusable design whose
// snapshot deliberately matches the save-as-copy carry set:
//   * Design assemblies (items/walls/poles/wall_caps/signage_cabinets) and the
//     landscape grid travel verbatim; cloneFoundationComponents mints fresh
//     component_ids (incl. nested wall segments and pole signs) on apply.
//   * The document hyperlink and the persisted AI/beautify brief image
//     (beautify_data_url) are design-associated state and round-trip verbatim.
//     Customer/estimate identity links (client_name, customer_id,
//     estimate_number) are NOT carried — applying a template must never relink
//     the target project to another customer or quote.
//   * Customer pricing SETTINGS round-trip like save-as-copy:
//     customer_markup_percent and customer_price_override verbatim;
//     customer_pricing carries the applied-tier SELECTION only (see
//     sanitizeTemplateCustomerPricing) — never the computed sell snapshot,
//     which is derived from the source design's costs and would display a
//     stale price on a different design. The save path recomputes the
//     snapshot whenever customer_pricing.applied === true.
//   * User-authored rate inputs match the draft-recovery/payload field set so
//     an applied template reproduces the same cost math.
//   * pricing_engine is excluded: it is external per-project engine context
//     (customer-tier config opt-in), never page-authored, and must not
//     transplant one project's engine settings onto another. Totals,
//     concrete_delivery_snapshot, status, id/updated_date and sync receipts
//     are likewise excluded — they are derived or record-scoped.
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
  "hyperlink",
  "beautify_data_url",
  "customer_markup_percent",
  "customer_price_override",
  "customer_pricing",
  "concrete_cost_per_cy",
  "rebar_cost_per_ft",
  "forming_materials_cost_spread_foot",
  "forming_materials_cost_pillar",
  "min_excavation_time_hours",
  "hand_dig_excavation_cost_per_cy",
  "equipment_excavation_cost_per_cy",
  "forming_labor_rate",
  "pouring_labor_rate",
  "finishing_labor_rate",
  "hand_dig_labor_rate",
  "equipment_excavation_labor_rate",
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

// customer_pricing: carry the applied-tier SELECTION, never the computed sell
// snapshot (total/lines/subtotals/tier_name are derived from the source
// design's costs; verbatim carry would display a stale price the moment the
// template is applied to a different design). Records without applied === true
// hold no computed snapshot and travel verbatim; a malformed value fails
// closed. The save path recomputes the snapshot whenever applied === true.
const sanitizeTemplateCustomerPricing = (v) => {
  if (v === undefined) return v;
  if (v === null) return null;
  if (!isRecord(v)) throw new Error("Foundation template customer_pricing must be a record.");
  if (v.applied !== true) return deepClone(v);
  return { applied: true, tier_number: v.tier_number };
};

// Snapshot the allowed design fields of a project for template storage.
// Validates supplied assembly arrays; preserves values verbatim otherwise.
export function createFoundationTemplateSnapshot(project, { createId } = {}) {
  checkTemplateRecord(project, "source");
  const out = { assembly_schema_version: 1 };
  for (const k of FOUNDATION_TEMPLATE_FIELDS) {
    if (project[k] !== undefined) out[k] = deepClone(project[k]);
  }
  if (out.customer_pricing !== undefined) {
    out.customer_pricing = sanitizeTemplateCustomerPricing(out.customer_pricing);
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
  // Apply-time sanitization is the fail-closed gate: it also covers templates
  // stored before this normalization or authored outside the snapshot path.
  if (provided.customer_pricing !== undefined) {
    provided.customer_pricing = sanitizeTemplateCustomerPricing(provided.customer_pricing);
  }
  const arrays = {};
  for (const k of ASSEMBLY_ARRAYS) if (provided[k] !== undefined) arrays[k] = provided[k];
  const cloned = Object.keys(arrays).length
    ? cloneFoundationComponents(arrays, { createId }).components
    : {};
  return { ...provided, ...cloned };
}
