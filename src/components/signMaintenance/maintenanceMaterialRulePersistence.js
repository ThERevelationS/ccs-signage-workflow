import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

function normalizeList(value) {
  return Array.isArray(value) ? [...value].map(String).sort() : [];
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sameRuleIdentity(row = {}, data = {}) {
  return String(row.inventory_entity || "") === String(data.inventory_entity || "")
    && String(row.inventory_item_id || "") === String(data.inventory_item_id || "")
    && String(row.usage_basis || "per_service_item") === String(data.usage_basis || "per_service_item")
    && Math.abs(numeric(row.usage_multiplier ?? 1) - numeric(data.usage_multiplier ?? 1)) <= 0.000001
    && String(row.usage_rounding || "none") === String(data.usage_rounding || "none")
    && JSON.stringify(normalizeList(row.applies_to_item_types)) === JSON.stringify(normalizeList(data.applies_to_item_types))
    && JSON.stringify(normalizeList(row.applies_to_sizes)) === JSON.stringify(normalizeList(data.applies_to_sizes))
    && JSON.stringify(normalizeList(row.applies_to_actions)) === JSON.stringify(normalizeList(data.applies_to_actions));
}

function canonical(rows = []) {
  return [...rows].sort((a, b) => {
    const dateCompare = String(a?.created_date || "").localeCompare(String(b?.created_date || ""));
    return dateCompare || String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function createMaintenanceMaterialRuleIfAbsent({
  entity,
  data,
  label = "Maintenance material rule",
} = {}) {
  const itemId = String(data?.inventory_item_id || "").trim();
  const entityName = String(data?.inventory_entity || "").trim();
  if (!itemId || !entityName || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe create.`);
  }

  const readMatches = async () => {
    const rows = await entity.filter({ inventory_item_id: itemId });
    if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
    return rows.filter((row) => sameRuleIdentity(row, data));
  };

  const before = await readMatches();
  if (before.length === 1) return { record: before[0], status: "existing" };
  if (before.length > 1) {
    throw new Error(`${label} already has multiple rules with the same Master Inventory resource, usage, and applicability. No row was changed.`);
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }

  const after = await readMatches();
  if (after.length === 1) {
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered",
    };
  }

  if (after.length > 1) {
    const keep = canonical(after);
    const ours = created?.id ? after.find((row) => row.id === created.id) : null;
    if (ours && ours.id !== keep?.id) {
      await deleteEntityIfUnchanged({
        entity,
        record: ours,
        guardFields: {
          inventory_entity: ours.inventory_entity,
          inventory_item_id: ours.inventory_item_id,
        },
        label: `${label} concurrent duplicate cleanup`,
      });
      const finalRows = await readMatches();
      if (finalRows.length === 1) {
        return { record: finalRows[0], status: "concurrent_duplicate_discarded" };
      }
    }
    throw new Error(`${label} was created concurrently more than once. No uncertain duplicate was deleted; reload and review the matching Maintenance rules.`);
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether it was created. Reload before retrying.`);
}
