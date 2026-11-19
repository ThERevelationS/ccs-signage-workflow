// O-012 harness stub: apply a field mutation against the in-memory store.
export async function mutateWorkOrderArrayField({ entity, id, field, mutate } = {}) {
  const row = await entity.get(id);
  const next = { ...row, [field]: typeof mutate === "function" ? mutate(row[field] || [], row) : mutate };
  return entity.update(id, next);
}
