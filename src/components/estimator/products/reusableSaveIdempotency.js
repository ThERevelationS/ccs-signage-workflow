export async function ensureReusableRecord({ entity, idempotencyKey, data, label = "Reusable item" }) {
  if (!entity?.filter || !entity?.create || !idempotencyKey) {
    throw new Error(`${label} could not initialize its retry-safe save.`);
  }

  const load = async () => {
    const rows = await entity.filter({ idempotency_key: idempotencyKey });
    if (!Array.isArray(rows)) throw new Error(`${label} retry state could not be verified.`);
    return rows;
  };

  const canonical = (rows = []) => [...rows].sort((a, b) => {
    const aStamp = String(a?.created_date || "");
    const bStamp = String(b?.created_date || "");
    if (aStamp !== bStamp) return aStamp.localeCompare(bStamp);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;

  const cleanupDuplicates = async (rows, keep) => {
    if (!keep?.id || !entity.delete || rows.length < 2) return keep;
    for (const row of rows) {
      if (!row?.id || row.id === keep.id) continue;
      await entity.delete(row.id).catch(() => null);
    }
    const after = await load();
    return canonical(after) || keep;
  };

  const existing = await load();
  if (existing.length) return cleanupDuplicates(existing, canonical(existing));

  const created = await entity.create({ ...data, idempotency_key: idempotencyKey });
  const afterCreate = await load();
  if (!afterCreate.length) {
    if (created?.id) return created;
    throw new Error(`${label} was created but could not be verified. Retry the save to recover it safely.`);
  }
  return cleanupDuplicates(afterCreate, canonical(afterCreate));
}
