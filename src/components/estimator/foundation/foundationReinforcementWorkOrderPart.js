import { foundationReinforcementPartDescriptors } from "./foundationReinforcementPartDescriptors";
import {
  captureFoundationReinforcementFrozenPricing,
  preserveFoundationReinforcementFrozenPricing,
} from "./foundationReinforcementFrozenPricing";

const MODE = "foundation_reinforcement_v2";
const KEY = "foundation_reinforcement_handoff";
const plain = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const ordered = value => {
  if (Array.isArray(value)) return value.map(ordered);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
};
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const fail = message => {
  const error = new Error(`Reinforcement Work Order handoff is invalid: ${message}`);
  error.code = "FOUNDATION_REINFORCEMENT_HANDOFF_INVALID";
  throw error;
};
const assertMoney = value => {
  if (!nonnegative(value) || !Number.isSafeInteger(Math.round(value * 100))) {
    fail("a saved amount cannot be represented safely in integer cents.");
  }
};

// Descriptor part_keys are `foundation:item:<index>:<role>`; the saved Part may
// carry a different item index, so the role suffix is what identifies it.
const roleSuffix = partKey => (typeof partKey === "string" && partKey.startsWith("foundation:item:")
  ? partKey.split(":").slice(3).join(":") : null);

function validateCurrent(part) {
  const basis = part.pricing_basis_snapshot;
  if (basis?.pricing_mode !== MODE || basis.reinforcement?.version !== 1 ||
      basis.reinforcement?.calculation_version !== 2) fail("unsupported source calculation version.");
  if (part.builder_data?.__builder_pending_removal === true) {
    fail("reinforcement removal is pending. Complete the estimate price review before conversion.");
  }
  const descriptors = foundationReinforcementPartDescriptors({ item: part.builder_data, itemIndex: 0 });
  const suffix = roleSuffix(part.part_key);
  let descriptor = suffix !== null
    ? descriptors.find(row => roleSuffix(row.part_key) === suffix)
    : null;
  if (!descriptor) {
    descriptor = descriptors.find(row => row.part_type === part.part_type
      && row.part_subtype === part.part_subtype && row.part_name === part.part_name);
  }
  if (!descriptor) fail("the live reinforcement role is missing from the saved definition.");
  const fields = ["part_type", "part_subtype", "quantity", "unit", "inventory_entity", "inventory_item_id"];
  for (const field of fields) {
    if (part[field] !== descriptor[field]) fail(`the saved definition and Part disagree on ${field}.`);
  }
  if (part.current_unit_cost !== descriptor.unit_cost || part.current_extended_cost !== descriptor.extended_cost ||
      !same(part.calculation_snapshot, descriptor.calculation_snapshot) ||
      !same(basis.reinforcement, descriptor.pricing_basis_snapshot.reinforcement)) {
    fail("the last-calculated Part does not match the saved definition. Recalculate and save Foundation.");
  }
  return captureFoundationReinforcementFrozenPricing(part);
}

function financialFields(frozen, amount, role, partSubtype = null, selectionIndex = null) {
  assertMoney(amount);
  const recorded = frozen.state === "recorded";
  if (recorded) assertMoney(frozen.unit_cost);
  const material = recorded && role === "material" ? frozen.reinforcement_snapshot.material : null;
  let inventoryId = material?.kind === "catalog" ? material.inventory_id : "";
  let inventoryName = material?.name || "";
  if (recorded && partSubtype === "rebar_support") {
    const sel = frozen.reinforcement_snapshot.supports?.selections?.[selectionIndex];
    inventoryId = sel?.inventory_id || "";
    inventoryName = sel?.name || "";
  }
  return {
    quantity: recorded ? frozen.quantity : undefined,
    unit: recorded ? frozen.unit : "",
    unit_cost: recorded ? frozen.unit_cost : undefined,
    extended_cost: amount,
    inventory_item_id: inventoryId,
    inventory_item_name: inventoryName,
  };
}

// Pure projection of saved snapshots, not a calculator or a stock-ordering plan.
// Financial columns use only the recorded frozen basis; the separate namespace
// retains last-calculated geometry and explicitly does not authorize procurement.
export function projectFoundationReinforcementWorkOrderPart(part) {
  if (part?.pricing_basis_snapshot?.pricing_mode !== MODE) return null;
  if (["independent", "manual", "manual_addon", "detached_override"].includes(part.builder_sync_state)) return null;
  if (part.builder_sync_state !== "linked") fail("the source Part has no verified linked-Builder state.");
  const current = validateCurrent(part);
  const frozen = preserveFoundationReinforcementFrozenPricing(part);
  if (frozen.state === "recorded" &&
      frozen.reinforcement_snapshot.component_id !== current.reinforcement_snapshot.component_id) {
    fail("the frozen and last-calculated snapshots refer to different components.");
  }
  const definition = structuredClone(part.builder_data);
  delete definition.reinforcement_proposal;
  const proof = part.pricing_basis_snapshot.reinforcement_catalog_basis_current;
  if (proof !== undefined && typeof proof !== "boolean") fail("catalog verification metadata is malformed.");
  return {
    ...financialFields(frozen, part.frozen_extended_cost, part.part_type,
      part.part_subtype, frozen.support_selection_index ?? null),
    [KEY]: {
      version: 1,
      authority: "linked_builder_snapshot",
      part_type: part.part_type,
      frozen_pricing: frozen,
      last_calculated: current,
      definition_reference: definition,
      catalog_basis_current: current.reinforcement_snapshot.material.kind === "catalog" ? proof ?? false : null,
      engineering_approved: false,
      procurement_ready: false,
      purchasing: { state: "unplanned" },
    },
  };
}

// Validate persisted handoff rows without catalog reads, recomputation, or
// filling absent historical quantities/rates from their last-calculated values.
export function readFoundationReinforcementWorkOrderPart(row) {
  if (!plain(row) || !Object.hasOwn(row, KEY)) return null;
  const handoff = row[KEY];
  if (!plain(handoff) || handoff.version !== 1 || handoff.authority !== "linked_builder_snapshot" ||
      handoff.part_type !== row.part_type || handoff.engineering_approved !== false ||
      handoff.procurement_ready !== false || !same(handoff.purchasing, { state: "unplanned" })) {
    fail("unsupported handoff metadata or an asserted engineering/procurement approval.");
  }
  const current = handoff.last_calculated;
  if (!plain(current) || current.state !== "recorded" || current.part_type !== row.part_type) {
    fail("the last-calculated snapshot is missing or has the wrong role.");
  }
  const definition = handoff.definition_reference;
  if (!plain(definition) || Object.hasOwn(definition, "reinforcement_proposal")) {
    fail("the definition reference is missing or contains an unapplied proposal.");
  }
  if (!plain(handoff.frozen_pricing)) fail("the explicit frozen-price provenance is missing.");
  const material = current.reinforcement_snapshot?.material;
  const isMaterial = row.part_type === "material";
  const partSubtype = typeof row.part_subtype === "string" ? row.part_subtype : (isMaterial ? "rebar" : "rebar_labor");
  // The live inventory identity is role-specific: a support material part points
  // at its catalog pick, never at the rebar material row. Re-derive it from the
  // same descriptor set validateCurrent re-checks so this reconstruction cannot
  // drift from the validator's own identity rules.
  const descriptors = foundationReinforcementPartDescriptors({ item: definition, itemIndex: 0 });
  const suffix = typeof row.part_key === "string" ? roleSuffix(row.part_key) : null;
  const matched = (suffix !== null
    ? descriptors.find(d => roleSuffix(d.part_key) === suffix)
    : null)
    || descriptors.find(d => d.part_type === row.part_type
      && d.part_subtype === partSubtype && d.part_name === row.part_name);
  const source = {
    builder_sync_state: "linked",
    builder_data: definition,
    part_type: row.part_type,
    part_subtype: partSubtype,
    part_key: typeof row.part_key === "string" ? row.part_key : undefined,
    part_name: typeof row.part_name === "string" ? row.part_name : undefined,
    quantity: current.quantity,
    unit: current.unit,
    current_unit_cost: current.unit_cost,
    current_extended_cost: current.extended_cost,
    inventory_entity: matched?.inventory_entity ?? "",
    inventory_item_id: matched?.inventory_item_id ?? "",
    calculation_snapshot: definition.reinforcement_cost_snapshot,
    pricing_basis_snapshot: {
      pricing_mode: MODE,
      reinforcement: current.reinforcement_snapshot,
      reinforcement_frozen_pricing: handoff.frozen_pricing,
      reinforcement_catalog_basis_current: handoff.catalog_basis_current,
    },
  };
  const verifiedCurrent = validateCurrent(source);
  if (!same(current, verifiedCurrent)) fail("last-calculated provenance does not match the definition reference.");
  const proof = handoff.catalog_basis_current;
  if (material.kind === "catalog" ? typeof proof !== "boolean" : proof !== null) {
    fail("catalog verification metadata does not match the material basis.");
  }
  const frozen = preserveFoundationReinforcementFrozenPricing({
    part_type: row.part_type,
    frozen_unit_cost: row.unit_cost,
    frozen_extended_cost: row.extended_cost,
    pricing_basis_snapshot: { reinforcement_frozen_pricing: handoff.frozen_pricing },
  });
  if (frozen.state === "recorded" &&
      frozen.reinforcement_snapshot.component_id !== current.reinforcement_snapshot.component_id) {
    fail("the frozen and last-calculated snapshots refer to different components.");
  }
  const financial = financialFields(frozen, row.extended_cost, row.part_type,
    typeof row.part_subtype === "string" ? row.part_subtype : null, frozen.support_selection_index ?? null);
  for (const field of ["quantity", "unit", "unit_cost", "extended_cost", "inventory_item_id", "inventory_item_name"]) {
    if (row[field] !== financial[field]) fail(`the manifest ${field} does not match its frozen basis.`);
  }
  return {
    ...financial,
    part_type: row.part_type,
    part_subtype: partSubtype,
    frozenStatus: frozen.state,
    physical_quantity_ft: current.reinforcement_snapshot.physical_quantity_ft,
    physical_weight_lbs: current.reinforcement_snapshot.geometry_weight_lbs,
    last_priced_quantity: current.quantity,
    last_priced_unit: current.unit,
    last_calculated_material: structuredClone(material),
    catalog_basis_current: proof,
    engineering_approved: false,
    procurement_ready: false,
    purchasing: { state: "unplanned" },
  };
}
