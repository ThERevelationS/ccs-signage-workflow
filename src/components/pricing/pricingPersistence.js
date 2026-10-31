import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

// Persistence for the pricing-admin entities. All three are backend-only under
// RLS, so — exactly like the CRM/activity layer — reads route through the
// staffDataRead gateway via the staffEntities facade and writes go through
// staffEntityWrite: `create` for new rows, `delete` for removals, and the
// single-record conditional updateMany({id, updated_date}, {$set}) contract
// for edits so two sessions can never both save over the same row.
//
// Gateway allowlists (server-side, in base44/functions) must list
//   staffDataRead  STAFF_READABLE: PricingTierMatrix, LaborLevel, MachineRate
//   staffEntityWrite WRITE_OPS:    same three entities with
//                                  ['create', 'update', 'updateMany', 'delete']
// Until those entries land, reads resolve empty (denied → []) and writes
// reject — this module surfaces that failure unchanged to the caller.

export const PricingTierMatrixEntity = staffEntities.PricingTierMatrix;
export const LaborLevelEntity = staffEntities.LaborLevel;
export const MachineRateEntity = staffEntities.MachineRate;

export const PRICING_ENTITIES = Object.freeze({
  PricingTierMatrix: PricingTierMatrixEntity,
  LaborLevel: LaborLevelEntity,
  MachineRate: MachineRateEntity,
});

const ENTITY_LABEL = {
  PricingTierMatrix: "pricing matrix row",
  LaborLevel: "labor level",
  MachineRate: "machine rate",
};

const label = (entityName) => ENTITY_LABEL[entityName] || "pricing record";

/** Load every row for one pricing entity (paged, deduped, fail-closed). */
export async function loadPricingRows(entityName, { sort = "name", query = null } = {}) {
  const entity = PRICING_ENTITIES[entityName];
  if (!entity) throw new Error(`Unknown pricing entity "${entityName}".`);
  return loadAllEntityRows({
    entity,
    query,
    sort,
    label: `Pricing admin ${entityName} catalog`,
  });
}

/**
 * Load the whole pricing-admin catalog in one mount: matrices, labor levels,
 * machine rates, plus MarkupTier/MarkupCategory for the tier×category pickers.
 */
export async function loadPricingCatalog() {
  const [matrices, laborLevels, machineRates, tiers, categories] = await Promise.all([
    loadPricingRows("PricingTierMatrix", { sort: "sort_order" }),
    loadPricingRows("LaborLevel", { sort: "level_rank" }),
    loadPricingRows("MachineRate", { sort: "machine_type" }),
    loadAllEntityRows({ entity: staffEntities.MarkupTier, sort: "tier_number", label: "Pricing admin MarkupTier catalog" }),
    loadAllEntityRows({ entity: staffEntities.MarkupCategory, sort: "sort_order", label: "Pricing admin MarkupCategory catalog" }),
  ]);
  return { matrices, laborLevels, machineRates, tiers, categories };
}

/** Create a new pricing row. `data` must already hold every editable field. */
export async function createPricingRow(entityName, data) {
  const entity = PRICING_ENTITIES[entityName];
  if (!entity) throw new Error(`Unknown pricing entity "${entityName}".`);
  return entity.create(data);
}

/**
 * Save one pricing row anchored on its loaded updated_date. If another
 * session saved first (updated === 0) the record is re-read and a conflict
 * error is thrown — the caller must reload before retrying.
 */
export async function savePricingRow(entityName, { id, updated_date: version }, patch) {
  const entity = PRICING_ENTITIES[entityName];
  if (!entity) throw new Error(`Unknown pricing entity "${entityName}".`);
  const rowId = String(id || "").trim();
  const updatedDate = String(version || "").trim();
  if (!rowId || !updatedDate) {
    throw new Error(`This ${label(entityName)} is missing its current version. Reload before saving.`);
  }
  const result = await entity.updateMany(
    { id: rowId, updated_date: updatedDate },
    { $set: patch },
  );
  if (result && typeof result.updated === "number") {
    if (result.updated === 1) {
      const saved = await entity.get(rowId).catch(() => null);
      return saved || { id: rowId, ...patch };
    }
    if (result.updated === 0) {
      throw new Error(`This ${label(entityName)} changed in another session. Reload before saving.`);
    }
    throw new Error(`Saving this ${label(entityName)} matched more than one record. Reload and review.`);
  }
  throw new Error(`The ${label(entityName)} save result could not be verified.`);
}

/** Delete one pricing row by id. */
export async function deletePricingRow(entityName, id) {
  const entity = PRICING_ENTITIES[entityName];
  if (!entity) throw new Error(`Unknown pricing entity "${entityName}".`);
  const rowId = String(id || "").trim();
  if (!rowId) throw new Error(`Cannot delete a ${label(entityName)} without an id.`);
  return entity.delete(rowId);
}

// Fields each pricing entity accepts from the editor — keeps stray client-side
// bookkeeping (_draft, _dirty...) out of the CAS payload.
export const PRICING_EDITABLE_FIELDS = {
  PricingTierMatrix: [
    "name", "status", "customer_tier", "category", "markup_pct",
    "minimum_charge", "per_unit_breaks", "effective_from", "effective_to",
    "sort_order", "updated_by", "updated_note",
    "pricing_mode", "market_retail", "market_discount_pct", "formula_modifiers",
  ],
  LaborLevel: [
    "name", "level_rank", "description", "hourly_rate",
    "applies_to_categories", "status", "updated_by",
  ],
  MachineRate: [
    "name", "machine_type", "setup_minutes", "runtime_rate_per_hour",
    "maintenance_rate_per_hour", "material_waste_pct", "status", "updated_by",
  ],
};

export function pickEditableFields(entityName, row) {
  const fields = PRICING_EDITABLE_FIELDS[entityName] || [];
  const out = {};
  for (const f of fields) {
    if (row[f] !== undefined) out[f] = row[f];
  }
  return out;
}

/**
 * Apply a batch of edits for one pricing entity — the dirty-tracking save used
 * by the admin tables. `changes` describes intent, not transport:
 *   { creates: [data...], updates: [{id, updated_date, patch}...], deletes: [id...] }
 * Each item resolves independently; the first failure throws after earlier
 * items have committed, and `result.partial` tells the caller a reload is due.
 */
export async function savePricingChanges(entityName, { creates = [], updates = [], deletes = [] } = {}) {
  const result = { created: [], updated: [], deleted: [], partial: false };
  try {
    for (const data of creates) result.created.push(await createPricingRow(entityName, data));
    for (const u of updates) result.updated.push(await savePricingRow(entityName, u, u.patch));
    for (const id of deletes) {
      await deletePricingRow(entityName, id);
      result.deleted.push(id);
    }
  } catch (err) {
    result.partial = true;
    err.saveResult = result;
    throw err;
  }
  return result;
}
