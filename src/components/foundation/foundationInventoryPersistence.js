import { expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";

const version = (row) => String(row?.updated_date || "");
const idSet = (rows = []) => [...rows].map((row) => String(row?.id || "")).filter(Boolean).sort();
const sameIds = (a = [], b = []) => {
  const left = idSet(a);
  const right = idSet(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
};

export async function reorderFoundationItemsSafely({ entity, loadedItems = [], reorderedItems = [], readCurrentItems, label = "Foundation inventory order" } = {}) {
  if (!entity || typeof readCurrentItems !== "function") throw new Error(`${label} cannot run without the inventory entity and complete-list reader.`);
  if (!sameIds(loadedItems, reorderedItems)) throw new Error(`${label} changed item membership before saving. Reload before retrying.`);
  if (loadedItems.some((row) => !row?.id || !row?.updated_date)) throw new Error(`${label} requires complete loaded item versions before saving.`);

  const currentItems = await readCurrentItems();
  if (!sameIds(loadedItems, currentItems)) throw new Error(`${label} changed in another session. No order changes were saved; reload before retrying.`);
  const loadedById = new Map(loadedItems.map((row) => [row.id, row]));
  const currentById = new Map(currentItems.map((row) => [row.id, row]));
  for (const [id, loaded] of loadedById) {
    const current = currentById.get(id);
    if (!current || version(current) !== version(loaded)) throw new Error(`${label} changed in another session. No order changes were saved; reload before retrying.`);
  }

  const plan = reorderedItems.map((row, index) => ({ id: row.id, desired: index, current: currentById.get(row.id) })).filter((step) => Number(step.current?.sort_order ?? 0) !== step.desired);
  let confirmed = 0;
  for (const step of plan) {
    try {
      await replaceEntityFieldsIfUnchanged({
        entity,
        id: step.id,
        expectedUpdatedAt: step.current.updated_date || "",
        expectedFields: expectedEntityFields(step.current, { sort_order: step.desired }),
        nextFields: { sort_order: step.desired },
        label: `${label} item`,
      });
      confirmed += 1;
    } catch (error) {
      throw new Error(`${label} stopped after ${confirmed} of ${plan.length} required order changes were confirmed. Reload before retrying; remaining rows were not skipped automatically. ${error?.message || ""}`.trim());
    }
  }

  const finalItems = await readCurrentItems();
  if (!sameIds(reorderedItems, finalItems)) throw new Error(`${label} changed membership during final verification. Reload before retrying.`);
  const finalById = new Map(finalItems.map((row) => [row.id, row]));
  for (let index = 0; index < reorderedItems.length; index += 1) {
    const current = finalById.get(reorderedItems[index].id);
    if (!current || Number(current.sort_order ?? 0) !== index) throw new Error(`${label} final verification failed. Reload before retrying.`);
  }
  return { items: finalItems, confirmed, planned: plan.length };
}
